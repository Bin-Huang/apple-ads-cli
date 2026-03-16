import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AppleAdsCredentials {
  access_token: string;
  org_id: string;
}

const DEFAULT_PATH = join(
  homedir(),
  ".config",
  "apple-search-ads-cli",
  "credentials.json"
);

export function loadCredentials(
  credentialsPath?: string
): AppleAdsCredentials {
  // 1. --credentials flag
  if (credentialsPath) {
    return readJSON(credentialsPath);
  }

  // 2. Environment variables
  if (process.env.APPLE_ADS_ACCESS_TOKEN && process.env.APPLE_ADS_ORG_ID) {
    return {
      access_token: process.env.APPLE_ADS_ACCESS_TOKEN,
      org_id: process.env.APPLE_ADS_ORG_ID,
    };
  }

  // 3. Default credentials file
  if (existsSync(DEFAULT_PATH)) {
    return readJSON(DEFAULT_PATH);
  }

  throw new Error(
    `No credentials found. Provide one of:\n` +
      `  1. --credentials <path> flag\n` +
      `  2. APPLE_ADS_ACCESS_TOKEN and APPLE_ADS_ORG_ID env vars\n` +
      `  3. ${DEFAULT_PATH}`
  );
}

function readJSON(path: string): AppleAdsCredentials {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);
  if (!data.access_token) {
    throw new Error(`credentials file missing "access_token": ${path}`);
  }
  if (!data.org_id) {
    throw new Error(`credentials file missing "org_id": ${path}`);
  }
  return data;
}
