import { MailClient } from "../mail-client";
import configuration from "../configuration.json";

function getMailboxIdFromName(mailboxName: string): string | undefined {
  if (!mailboxName.includes("AI/")) {
    console.error("Mailbox name must include AI/");
    return;
  }

  if (!(mailboxName in configuration.InboxIds)) {
    console.error("Mailbox name must be in configuration.json");
    return;
  }

  return configuration.InboxIds[
    mailboxName as keyof typeof configuration.InboxIds
  ] as string;
}

export async function moveEmail(
  mailClient: MailClient,
  emailId: string,
  targetMailbox: string
): Promise<string> {
  const targetMailboxId = getMailboxIdFromName(targetMailbox);

  if (!targetMailboxId) {
    console.error("Invalid mailbox name");
    return "Invalid mailbox name";
  }

  await mailClient.moveEmail(emailId, targetMailboxId);

  return "Email moved successfully";
}
