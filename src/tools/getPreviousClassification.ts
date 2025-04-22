import { Low } from "lowdb";
import { EmailDB, EmailRecord } from "./types";

export async function getPreviousClassification(
  email: string,
  db: Low<EmailDB>
): Promise<string> {
  // Check if we have a record for this email
  const record = db.data[email];

  if (!record) {
    return "No classification found";
  }

  return record.classification;
}

export async function getPreviouslyClassifiedDetails(
  email: string,
  db: Low<EmailDB>
): Promise<EmailRecord | undefined> {
  // Check if we have a record for this email
  const record = db.data[email];

  if (!record) {
    return undefined;
  }

  return record;
}
