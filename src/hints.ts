// Maps known Apple error messages to a next step.
const TABLE: Array<[RegExp, string]> = [
  [/adGroupId or campaignId condition is required/i, "add --campaign-id or --ad-group-id"],
  [/adGroupId condition is required/i, "negative keywords need --ad-group-id, or --campaign-id with --campaign-level"],
  [/Filters contain unsupported fields campaignId/i, "campaign reports filter on id; use `reports campaigns --campaign-id <id>`"],
  [/campaignId filter is required/i, "this report needs --campaign-id"],
  [/Time range cannot be null/i, "send a time range, for example --last 7d"],
  [/not valid for granularity/i, "HOURLY needs a span of 7 days or less, DAILY 90 days or less, WEEKLY 14 days or more, MONTHLY 90 days or more"],
  [/Hourly granularity not allowed/i, "ads and search-terms reports do not support HOURLY; use DAILY or omit --granularity"],
  [/Timezone 'UTC' is not supported/i, "use --time-zone ORTZ"],
  [/EMPTY_METRICS cannot be set when groupBy/i, "drop --include-empty or --group-by"],
  [/Operator .* is not supported/i, "see `apple-ads-cli schema filters <resource>` for the operators each field accepts"],
  [/exceeds maximum allowed page size/i, "use --limit 1000 or lower for entities (5000 for reports)"],
  [/Unrecognized field/i, "the body has a field this endpoint does not accept; check `--data`/`--file`"],
  [/Invalid token/i, "the access token is invalid or expired; run `apple-ads-cli auth doctor`"],
  [/User does not have required permissions/i, "check --ad-account-id and the role in `apple-ads-cli access`"],
  [/MIN_QUERY_LENGH|at least 3/i, "use a query of 3 or more characters"],
];

export function hintFor(status: number, code: string, message: string): string | undefined {
  for (const [re, hint] of TABLE) if (re.test(message) || re.test(code)) return hint;
  if (code === "ENTITY_NOT_FOUND" || status === 404) return "list first to get a valid ID";
  if (code === "FORBIDDEN" || status === 403) return "check --ad-account-id and run `apple-ads-cli auth doctor`";
  if (status === 401) return "run `apple-ads-cli auth doctor`";
  if (status === 429) return "rate limited; wait and retry, or narrow the query";
  return undefined;
}
