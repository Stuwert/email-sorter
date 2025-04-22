import { Message, MessageParam } from "@anthropic-ai/sdk/resources";

export interface EmailRecord {
  last_processed: string;
  classification: string;
}

export interface EmailDB {
  [email: string]: EmailRecord;
}

export interface MessageDB {
  [subjectLine: string]: Array<Message | MessageParam>;
}
