import axios from "axios";
import { Client } from "jmap-client-ts";
import { AxiosTransport } from "jmap-client-ts/lib/utils/axios-transport";
import { getVariables } from "./config";

interface EmailAddress {
  email: string;
  name?: string;
}

interface EmailBody {
  partId: string;
  type: string;
  charset?: string;
  size: number;
  content?: string;
}

interface EmailKeywords {
  $seen?: boolean;
  $flagged?: boolean;
  $draft?: boolean;
  $answered?: boolean;
  $forwarded?: boolean;
  [key: string]: boolean | undefined;
}

interface EmailMailboxIds {
  [key: string]: boolean;
}

interface Email {
  id: string;
  blobId: string;
  threadId: string;
  messageId: string[];
  inReplyTo: string | null;
  references: string[] | null;
  sender: EmailAddress | null;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  subject: string;
  sentAt: string;
  receivedAt: string;
  size: number;
  preview: string;
  hasAttachment: boolean;
  attachments: any[];
  textBody: EmailBody[];
  htmlBody: EmailBody[];
  bodyValues: Record<string, { value: string }>;
  keywords: EmailKeywords;
  mailboxIds: EmailMailboxIds;
}

interface EmailResponse {
  accountId: string;
  state: string;
  list: Email[];
  notFound: string[];
}

export class MailClient {
  private client: Client;
  private accountId: string;

  private constructor(client: Client, accountId: string) {
    this.client = client;
    this.accountId = accountId;
  }

  public static async create(): Promise<MailClient> {
    const fastmailToken = getVariables().fastmailToken;
    if (!fastmailToken) {
      throw new Error("MAIL_ACCESS_TOKEN environment variable is not set");
    }

    const client = new Client({
      accessToken: fastmailToken,
      sessionUrl: "https://api.fastmail.com/jmap/session",
      transport: new AxiosTransport(axios),
    });

    await client.fetchSession();
    const accountId = client.getFirstAccountId();

    return new MailClient(client, accountId);
  }

  public async searchEmails(mailbox: string, limit: number = 10): Promise<any> {
    const emails = await this.client.email_query({
      accountId: this.accountId,
      filter: {
        inMailbox: mailbox,
        notKeyword: "$seen",
      },
      limit,
    });

    return emails;
  }

  public async getEmail(emailId: string | string[]): Promise<EmailResponse> {
    const ids = Array.isArray(emailId) ? emailId : [emailId];
    const email = await this.client.email_get({
      accountId: this.accountId,
      ids,
      fetchAllBodyValues: true,
    });

    // Type assertion to handle the JMAP client's internal types
    return email as unknown as EmailResponse;
  }

  public async moveEmail(
    emailId: string | string[],
    targetMailbox: string
  ): Promise<void> {
    const ids = Array.isArray(emailId) ? emailId : [emailId];

    await this.client.email_set({
      accountId: this.accountId,
      update: ids.reduce(
        (acc, id) => ({
          ...acc,
          [id]: {
            mailboxIds: {
              [targetMailbox]: true,
            },
            // $seen: true,
          },
        }),
        {}
      ),
    });
  }

  public async getMailboxes(): Promise<Record<string, any>> {
    const mailboxes = await this.client.mailbox_get({
      accountId: this.accountId,
      ids: null,
    });

    const mailboxMap = Object.entries(mailboxes.list).reduce(
      (acc, [id, mailbox]) => {
        return {
          ...acc,
          [mailbox.id]: {
            ...mailbox,
          },
        };
      },
      {}
    );

    console.log("Mailbox mapping:", mailboxMap);
    return mailboxMap;
  }
}
