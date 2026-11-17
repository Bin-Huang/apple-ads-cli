// The only place the API base URL and version appear.
export const VERSION = "2.0.0";
export const API_BASE = "https://api.ads.apple.com/v1";
export const API_NAME = "Apple Ads Platform API v1";
export const TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token";
export const AUDIENCE = "https://appleid.apple.com";
export const SCOPE = "searchadsorg";
export const CLIENT_SECRET_TTL_S = 600;
export const TOKEN_EXPIRY_BUFFER_S = 60;

export const PAGE_MAX_ENTITY = 1000;
export const PAGE_MAX_REPORT = 5000;
export const DEFAULT_LIMIT_ENTITY = 1000;
export const DEFAULT_LIMIT_REPORT = 5000;
export const DEFAULT_MAX_ITEMS = 100_000;
// Apple does not document the bulk maximum; 100 per request is a conservative choice.
export const BULK_CHUNK = 100;

export const RETRY_MAX_ATTEMPTS = 5;
export const RETRY_MAX_WAIT_S = 16;
export const PACING_REMAINING_THRESHOLD = 5;
export const PACING_MAX_WAIT_S = 60;

// Large-step thresholds (fractions) used by the spend assessment.
export const LARGE_BID_STEP = 0.15;
export const LARGE_BUDGET_STEP = 0.2;
export const MONTHLY_BUDGET_FACTOR = 30.4;

/** Paths that are called without the X-AP-Context header. */
export function isNoContextPath(method: string, path: string): boolean {
  const p = path.replace(/^\/+/, "/").split("?")[0]!;
  if (p === "/me" || p === "/acls" || p.startsWith("/orgs/") || p === "/advertiser-resources") return true;
  if (method === "POST" && p === "/ad-accounts") return true;
  if (p === "/shared-budgets" || p.startsWith("/shared-budgets/")) {
    // Budget-order writes must omit the header; reads keep it.
    return !(method === "GET" || p === "/shared-budgets/query");
  }
  return false;
}

// Sanity ceilings in the account currency; writes above them need --allow-large.
// Set maxBid / maxDailyBudget in the profile for currencies with larger units (for example JPY).
export const DEFAULT_MAX_BID = "10.00";
export const DEFAULT_MAX_DAILY_BUDGET = "1000.00";
