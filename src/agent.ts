import { v4 as uuidv4 } from "uuid";
import { JSONFile } from "lowdb/node";
import { ClaudeClient } from "./claude-client";
import configuration from "./configuration.json";
import { MessageDB, EmailDB } from "./tools/types";
import {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { MessageParam } from "@anthropic-ai/sdk/resources";
import { executeTool } from "./tools/index";
import { Low } from "lowdb";
import { MailClient } from "./mail-client";
import { getPreviouslyClassifiedDetails } from "./tools/getPreviousClassification";
import { moveEmail } from "./tools/moveEmail";

const stringifyRules = (): string => {
  return configuration.rules
    .map(
      (rule) =>
        `${rule.name}: Action to take ${rule.action}. Classification: ${rule.classification}\n`
    )
    .join("\n");
};

const constructSortMessage = (
  emailSubject: string,
  emailPreview: string,
  emailAddress: string,
  emailId: string,
  previousClassification: string | undefined
): MessageParam => {
  return {
    role: "user",
    content: `This email has been sent from email address ${emailAddress} with the id ${emailId}.

      Please take appropriate steps to put the email in the correct mailbox.

      Here are the potential rules and classifications:
      ${stringifyRules()}

      ${
        previousClassification
          ? `The previous classification of this email was ${previousClassification}.`
          : ""
      }
      Here is the subject line: ${emailSubject}
      Here is the preview: ${emailPreview}
     `,
  };
};

const constructClassificationMessage = (): MessageParam => {
  return {
    role: "user",
    content: `
      Please summarize the email in 2 sentences or less.

      
    `,
  };
};

interface EmailContent {
  emailText: string;
  emailSubject: string;
  emailAddress: string;
  emailId: string;
  emailPreview: string;
}

function getMailboxFromClassification(
  classification: string
): string | undefined {
  return configuration.rules
    .find((rule) => rule.classification === classification)
    ?.action.filter((action) => {
      return action.startsWith("move:");
    })
    .map((action) => {
      return action.split(":")[1];
    })[0];
}

function hasRemainingActions(batchObject: BatchObject): boolean {
  return Object.values(batchObject).some(({ actions }) => {
    return actions.length > 0;
  });
}

type BatchObject = Record<
  string,
  {
    actions: Array<string | ToolUseBlock>;
    emailContent: EmailContent;
    custom_id: string;
    messages: MessageParam[];
  }
>;

export async function runBatchedAgent(
  emailContents: EmailContent[],
  mailClient: MailClient
): Promise<void> {
  const claudeClient = new ClaudeClient();

  // Initialize databases
  const emailAdapter = new JSONFile<EmailDB>("src/db/email.json");
  const emailDb = new Low<EmailDB>(emailAdapter, {});
  await emailDb.read();

  const batchObject = emailContents.reduce((acc, emailContent) => {
    const id = uuidv4();
    acc[id] = {
      actions: [
        "summarizeMessage",
        // "classifyMessage",
      ],
      emailContent,
      custom_id: id,
      messages: [],
    };
    return acc;
  }, {} as BatchObject);
  while (hasRemainingActions(batchObject)) {
    const requestBody = await Object.keys(batchObject).reduce(
      async (acc, key) => {
        const resultArray = await acc;
        const { actions, emailContent, custom_id, messages } = batchObject[key];
        const classificationDetails = await getPreviouslyClassifiedDetails(
          emailContent.emailAddress,
          emailDb
        );
        const { emailSubject, emailPreview, emailAddress, emailId } =
          emailContent;
        if (actions.length > 0) {
          const action = actions[0];
          batchObject[key].actions = actions.slice(1);

          let nextMessage: MessageParam;
          let parsedResponse: Message | undefined;
          if (
            typeof action === "string" &&
            parsedResponse?.stop_reason !== "tool_use"
          ) {
            console.log(`[Agent] Processing action: ${action}`);
            switch (action) {
              case "summarizeMessage":
                nextMessage = constructSortMessage(
                  emailSubject,
                  emailPreview,
                  emailAddress,
                  emailId,
                  classificationDetails?.classification
                );
                break;
              case "classifyMessage":
                nextMessage = constructClassificationMessage();
                break;
              default:
                console.error(`[Agent] Unknown action encountered: ${action}`);
                throw new Error(`Unknown action: ${action}`);
            }
            messages.push(nextMessage);
          } else if (typeof action !== "string") {
            if (!action) {
              console.error("[Agent] Action is undefined");
              throw new Error("Action is undefined");
            }

            console.log(`[Agent] Executing tool: ${action.name}`);
            const toolResult = await executeTool(
              action.name,
              action,
              mailClient,
              emailDb
            );
            console.log(`[Agent] Tool execution completed: ${action.name}`);

            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: action.id,
                  content: toolResult,
                },
              ],
            });
          }
        }
        resultArray.push({
          messages,
          custom_id,
        });
        return resultArray;
      },
      Promise.resolve([] as { messages: MessageParam[]; custom_id: string }[])
    );

    const filteredRequestBody = requestBody.filter(({ messages }) => {
      return messages[messages.length - 1].role === "user";
    });

    if (filteredRequestBody.length === 0) {
      console.log("[Agent] No requests to make");
      break;
    }

    console.log("[Agent] Making Claude requests");
    const response = await claudeClient.makeBatchedRequest(filteredRequestBody);

    await claudeClient.waitForBatchCompletion(response.id);

    const results = await claudeClient.downloadBatchResults(response.id);

    results.forEach((response) => {
      const { custom_id, message } = response;

      batchObject[custom_id].messages.push({
        role: "assistant",
        content: message.content,
      });

      if (response.message.stop_reason === "tool_use") {
        const toolCall = response.message.content.find(
          (message) => message.type === "tool_use"
        );
        if (!toolCall) {
          console.error("[Agent] Tool call not found in response");
          throw new Error("Tool call not found");
        }

        console.log(`[Agent] Adding new tool call to queue: ${toolCall.name}`);
        batchObject[custom_id].actions.push(toolCall);
      }
    });
  }

  // Write all changes to the email database at the end
  await emailDb.write();

  const today = new Date().toISOString().split("T")[0];
  const dbPath = `src/db/${today}.json`;
  console.log(`[Agent] Storing results in database: ${dbPath}`);

  const adapter = new JSONFile<MessageDB>(dbPath);
  const db = new Low<MessageDB>(adapter, {});
  await db.read();
  Object.values(batchObject).map(async ({ emailContent, messages }) => {
    db.data[JSON.stringify(emailContent.emailSubject)] = messages;
  });
  await db.write();
  console.log("[Agent] Processing completed successfully");
}

export async function runAgent(
  {
    emailText,
    emailSubject,
    emailAddress,
    emailId,
    emailPreview,
  }: EmailContent,
  mailClient: MailClient
): Promise<void> {
  console.log("[Agent] Starting email processing");
  let actions: Array<string | ToolUseBlock> = [
    "summarizeMessage",
    // "classifyMessage",
  ];

  // Initialize email database
  const emailAdapter = new JSONFile<EmailDB>("src/db/email.json");
  const emailDb = new Low<EmailDB>(emailAdapter, {});
  await emailDb.read();

  // Check if we have a previous classification
  const classificationDetails = await getPreviouslyClassifiedDetails(
    emailAddress,
    emailDb
  );

  const claudeClient = new ClaudeClient();
  const messages: MessageParam[] = [];

  while (actions.length > 0) {
    const action = actions[0];
    actions = actions.slice(1);

    let nextMessage: MessageParam;
    let parsedResponse: Message | undefined;
    if (
      typeof action === "string" &&
      parsedResponse?.stop_reason !== "tool_use"
    ) {
      console.log(`[Agent] Processing action: ${action}`);
      switch (action) {
        case "summarizeMessage":
          nextMessage = constructSortMessage(
            emailSubject,
            emailPreview,
            emailAddress,
            emailId,
            classificationDetails?.classification
          );
          break;
        case "classifyMessage":
          nextMessage = constructClassificationMessage();
          break;
        default:
          console.error(`[Agent] Unknown action encountered: ${action}`);
          throw new Error(`Unknown action: ${action}`);
      }
      messages.push(nextMessage);
    } else if (typeof action !== "string") {
      if (!action) {
        console.error("[Agent] Action is undefined");
        throw new Error("Action is undefined");
      }

      console.log(`[Agent] Executing tool: ${action.name}`);
      const toolResult = await executeTool(
        action.name,
        action,
        mailClient,
        emailDb
      );
      console.log(`[Agent] Tool execution completed: ${action.name}`);

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: action.id,
            content: toolResult,
          },
        ],
      });
    }

    console.log("[Agent] Making Claude request");
    parsedResponse = await claudeClient.makeRequest(messages);
    messages.push({
      role: "assistant",
      content: parsedResponse!.content,
    });

    if (parsedResponse && parsedResponse.stop_reason === "tool_use") {
      const toolCall = parsedResponse.content.find(
        (message) => message.type === "tool_use"
      );
      if (!toolCall) {
        console.error("[Agent] Tool call not found in response");
        throw new Error("Tool call not found");
      }

      console.log(`[Agent] Adding new tool call to queue: ${toolCall.name}`);
      actions.push(toolCall);
    }
  }

  // Write all changes to the email database at the end
  await emailDb.write();

  // Store the final classification result in today's database
  const today = new Date().toISOString().split("T")[0];
  const dbPath = `src/db/${today}.json`;
  console.log(`[Agent] Storing results in database: ${dbPath}`);

  const adapter = new JSONFile<MessageDB>(dbPath);
  const db = new Low<MessageDB>(adapter, {});

  await db.read();

  // Store the result
  db.data[JSON.stringify(emailSubject)] = messages;

  await db.write();
  console.log("[Agent] Processing completed successfully");
}
