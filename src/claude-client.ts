import { MessageBatch, ToolChoice } from "@anthropic-ai/sdk/resources/messages";
import { getVariables } from "./config";
import prompts from "./configuration.json";
import { tools } from "./tools/index";
import Anthropic from "@anthropic-ai/sdk";
import {
  MessageParam,
  Message,
} from "@anthropic-ai/sdk/resources/messages/messages";

interface BatchedMessage {
  messages: MessageParam[];
  custom_id: string;
}

export class ClaudeClient {
  private anthropic: Anthropic;

  constructor() {
    const { claudeKey } = getVariables();
    if (!claudeKey) {
      throw new Error("Claude API key not found");
    }

    this.anthropic = new Anthropic({
      apiKey: claudeKey,
    });
  }

  async makeRequest(messages: MessageParam[]): Promise<Message> {
    try {
      const response = await this.anthropic.messages.create({
        system: prompts["systemPrompt"],
        model: "claude-3-5-haiku-20241022",
        max_tokens: prompts["maxTokens"],
        messages,
        tool_choice: {
          type: "auto",
          disable_parallel_tool_use: true,
        },
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema,
        })),
      });

      return response;
    } catch (error) {
      console.error(error);
      throw new Error("failed");
    }
  }

  async makeBatchedRequest(
    batchedMessages: BatchedMessage[]
  ): Promise<MessageBatch> {
    try {
      const batchRequest = batchedMessages.map(({ messages, custom_id }) => ({
        params: {
          system: prompts["systemPrompt"],
          model: "claude-3-5-haiku-20241022",
          max_tokens: prompts["maxTokens"],
          messages,
          tool_choice: {
            type: "auto",
            disable_parallel_tool_use: true,
          } as ToolChoice,
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
          })),
        },
        custom_id,
      }));

      const response = await this.anthropic.messages.batches.create({
        requests: batchRequest,
      });

      return response;
    } catch (error) {
      console.error(error);
      throw new Error("failed");
    }
  }

  async isBatchFinished(batchId: string): Promise<boolean> {
    const batchStatus = await this.anthropic.beta.messages.batches.retrieve(
      batchId
    );
    console.log(
      `[ClaudeClient] Batch ${batchId} status: ${batchStatus.processing_status}`
    );
    return batchStatus.processing_status === "ended";
  }

  async waitForBatchCompletion(
    batchId: string,
    intervalMs = 5000
  ): Promise<void> {
    let isFinished = false;

    while (!isFinished) {
      isFinished = await this.isBatchFinished(batchId);

      if (!isFinished) {
        console.log(
          `Batch ${batchId} still processing, checking again in ${
            intervalMs / 1000
          } seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    console.log(`Batch ${batchId} processing completed!`);
  }

  async downloadBatchResults(
    batchId: string
  ): Promise<{ custom_id: string; message: Message }[]> {
    const results: { custom_id: string; message: Message }[] = [];

    // Get results stream
    const resultStream = await this.anthropic.beta.messages.batches.results(
      batchId
    );

    // Process each entry in the stream
    for await (const entry of resultStream) {
      if (entry.result.type === "succeeded") {
        // Store successful results
        results.push({
          custom_id: entry.custom_id,
          message: entry.result.message,
        });
      } else {
        // Handle errors
        console.error(`Request ${entry.custom_id} failed:`, entry.result);
      }
    }

    return results;
  }
}
