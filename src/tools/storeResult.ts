import { Low } from "lowdb";
import { EmailDB } from "./types";

export async function storeResult(
  emailAddress: string,
  classification: string,
  db: Low<EmailDB>
): Promise<string> {
  console.log(`[Tool] Storing result for email address: ${emailAddress}`);
  console.log(`[Tool] Classification: ${classification}`);

  // Update existing record or create new one
  db.data[emailAddress] = {
    last_processed: new Date().toISOString(),
    classification: classification,
  };

  return "Result stored successfully";
}
