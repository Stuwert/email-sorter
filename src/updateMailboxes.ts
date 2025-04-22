import "dotenv/config";
import { MailClient } from "./mail-client";
import { loadConfig } from "./config";
const { Low } = await import("lowdb");
const { JSONFile } = await import("lowdb/node");

async function run() {
  await loadConfig();
  const mailClient = await MailClient.create();
  const mailboxes = await mailClient.getMailboxes();

  // Log the original and parsed mailbox names
  const mailboxesNamesAndIds = Object.entries(mailboxes).reduce(
    (accumulator, [id, content]) => {
      let name = content.name;

      if (content.name.startsWith(":") && content.parentId) {
        name = content.name.replace(
          ":",
          `${mailboxes[content.parentId].name}/`
        );
      }
      return {
        ...accumulator,
        [name]: id,
      };
    },
    {}
  );

  const adapter = new JSONFile("src/configuration.json");
  const db = new Low<Record<string, any>>(adapter, {});

  await db.read();

  // Update the InboxIds in the configuration
  db.data.InboxIds = mailboxesNamesAndIds;

  await db.write();

  console.log("Updated configuration.json with new mailbox IDs");
}

run();
