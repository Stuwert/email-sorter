import { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources";
import { MailClient } from "../mail-client";
import { getPreviousClassification } from "./getPreviousClassification";
import { moveEmail } from "./moveEmail";
import { storeResult } from "./storeResult";
import { Low } from "lowdb";
import { EmailDB } from "./types";

export const tools: Tool[] = [
  // {
  //   name: "getPreviousClassification",
  //   description: "Get the previous classification of an email",
  //   input_schema: {
  //     type: "object",
  //     properties: {
  //       emailAddress: {
  //         type: "string",
  //         description:
  //           "The address of the email to get the previous classification of",
  //       },
  //     },
  //     required: ["emailAddress"],
  //   },
  // },
  // {
  //   name: "storeResult",
  //   description: "Store the result of a classification",
  //   input_schema: {
  //     type: "object",
  //     properties: {
  //       emailAddress: {
  //         type: "string",
  //         description: "The address of the email to store the result of",
  //       },
  //       classification: {
  //         type: "string",
  //         description:
  //           "The classification of the email described in the initial prompt",
  //       },
  //     },
  //     required: ["emailAddress", "classification"],
  //   },
  // },
  {
    name: "moveEmail",
    description: "Move an email to a different mailbox",
    input_schema: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "The ID of the email to move",
        },
        targetMailbox: {
          type: "string",
          description: "The mailbox to move the email to",
        },
        emailAddress: {
          type: "string",
          description: "The address of the email to move",
        },
        classification: {
          type: "string",
          description: "The classification of the email",
        },
      },
      required: ["emailId", "targetMailbox", "emailAddress", "classification"],
    },
  },
];

interface ToolInputs {
  getPreviousClassification: { emailId: string };
  storeResult: { emailAddress: string; classification: string };
  moveEmail: {
    emailId: string;
    targetMailbox: string;
    classification: string;
    emailAddress: string;
  };
}

function getToolInput<T extends keyof ToolInputs>(
  toolName: T,
  args: ToolUseBlock
): ToolInputs[T] {
  if (!args.input) {
    throw new Error(`No input provided for tool ${toolName}`);
  }
  return args.input as ToolInputs[T];
}

export async function executeTool(
  toolName: string | undefined,
  args: ToolUseBlock,
  mailClient: MailClient,
  db: Low<EmailDB>
): Promise<string> {
  console.log(`[Tool] Executing tool: ${toolName}`);
  console.log(`[Tool] Arguments:`, args);

  try {
    switch (toolName) {
      case "getPreviousClassification": {
        const { emailId } = getToolInput(toolName, args);
        return getPreviousClassification(emailId, db);
      }
      case "moveEmail": {
        const { emailId, emailAddress, targetMailbox, classification } =
          getToolInput(toolName, args);
        storeResult(emailAddress, classification, db);
        return moveEmail(mailClient, emailId, targetMailbox);
      }
      default:
        throw new Error(`Tool ${toolName} not found`);
    }
  } catch (error) {
    console.error(`[Tool] Error executing tool: ${toolName}`);
    console.error(error);
    throw error;
  }
}
