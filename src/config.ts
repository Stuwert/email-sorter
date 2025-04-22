import sdk from "@1password/sdk";
const CLAUDE_PATH = "op://Stuart Software Development/ClaudeAI/password";
const FASTMAIL_PATH =
  "op://Stuart Software Development/Fastmail API token/credential";

let claudeKey: string | undefined;
let fastmailToken: string | undefined;

export const getVariables = () => {
  return {
    claudeKey,
    fastmailToken,
  };
};

export const loadConfig = async () => {
  const client = await sdk.createClient({
    auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
    // Set the following to your own integration name and version.
    integrationName: "My 1Password Integration",
    integrationVersion: "v1.0.0",
  });

  const claudeSecret = await client.secrets.resolve(CLAUDE_PATH);
  const fastmailSecret = await client.secrets.resolve(FASTMAIL_PATH);

  claudeKey = claudeSecret;
  fastmailToken = fastmailSecret;
};
