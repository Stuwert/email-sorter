// import sdk from "@1password/sdk";
import "dotenv/config";
import { MailClient } from "./mail-client";
import { loadConfig } from "./config";
import { runAgent, runBatchedAgent } from "./agent";
import configuration from "./configuration.json";

const screener_id = configuration.InboxIds.Screener;

function logArrayItems(items: any[], prefix: string = ""): void {
  items.forEach((item, index) => {
    if (typeof item === "object" && item !== null) {
      console.log(`${prefix}[${index}] Object:`, JSON.stringify(item, null, 2));
    } else {
      console.log(`${prefix}[${index}]`, item);
    }
  });
}

async function run() {
  await loadConfig();
  const mailClient = await MailClient.create();

  // Search for unread emails in the screener mailbox
  const emails = await mailClient.searchEmails(screener_id, 100);

  const emailContents = await mailClient.getEmail(emails.ids);
  console.log("Found emails:", emailContents.list.length);
  if (emailContents.list.length === 0) {
    console.log("No emails found");
    return;
  }

  const mappedEmails = emailContents.list.map((email) => {
    return {
      emailText: email.textBody
        .map((part) => email.bodyValues?.[part.partId]?.value)
        .join("\n"),
      emailSubject: email.subject,
      emailAddress: email.from[0].email,
      emailId: email.id,
      emailPreview: email.preview,
    };
  });

  await runBatchedAgent(mappedEmails, mailClient);
}

run();
