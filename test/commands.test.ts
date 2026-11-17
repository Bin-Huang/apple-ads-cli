// Every command's request (method, path, body) at least once, against a strict mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cli, list, one, tempHome } from "./helpers/cli.js";
import { writeKey } from "./helpers/keys.js";
import type { Route } from "./helpers/mock-fetch.js";
import { AD, AD_GROUP, CAMPAIGN, CREATIVE, KEYWORD, NEGATIVE, PRODUCT_PAGE } from "./fixtures.js";
import { assertNoV5Keys } from "./helpers/v5.js";

interface Case {
  argv: string[];
  routes?: Record<string, Route>;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  code?: number;
}

const ok = (result: unknown) => one(result);
const bulkOk = (c: any) => ({ json: { result: c.body.items.map((it: any) => ({ correlationId: it.correlationId, success: true, result: { id: it.data.id ?? 333333333 } })) } });
const R = {
  campaign: { "GET /campaigns/111111111": ok(CAMPAIGN) },
  adGroup: { "GET /adgroups/222222222": ok(AD_GROUP) },
  keyword: { "GET /keywords/333333333": ok(KEYWORD) },
  negative: { "GET /negative-keywords/444444444": ok(NEGATIVE) },
  ad: { "GET /ads/555555555": ok(AD) },
  creative: { "GET /creatives/666666": ok(CREATIVE) },
};
const eq = (field: string, value: unknown) => ({ field, operator: "EQUALS", value: [value] });

const CASES: Case[] = [
  { argv: ["me"], routes: { "GET /me": ok({ userId: 1, orgId: 2 }) }, method: "GET", path: "/me" },
  { argv: ["access"], routes: { "GET /acls": ok({ acls: [] }) }, method: "GET", path: "/acls" },
  { argv: ["accounts", "get"], method: "GET", path: "/ad-accounts/123456789" },
  { argv: ["orgs", "get", "987654321"], routes: { "GET /orgs/987654321": ok({}) }, method: "GET", path: "/orgs/987654321" },
  { argv: ["apps", "search", "--query", "example", "--storefront", "US"], routes: { "GET /search/apps": list([]) }, method: "GET", path: "/search/apps", query: { query: "example", storeFronts: "US", limit: "20", offset: "0" } },
  { argv: ["apps", "search", "--owned"], routes: { "GET /search/apps": list([]) }, method: "GET", path: "/search/apps", query: { returnOwnedApps: "true" } },
  { argv: ["apps", "get", "1234567890"], routes: { "GET /apps/1234567890": ok({}) }, method: "GET", path: "/apps/1234567890" },
  { argv: ["apps", "eligibility", "1234567890", "--country", "us"], routes: { "POST /eligibilities/apps/query": list([]) }, method: "POST", path: "/eligibilities/apps/query", body: { filters: [{ field: "adamId", operator: "EQUALS", value: 1234567890 }, eq("countryOrRegion", "US")], pagination: { offset: 0, pageSize: 1000 } } },
  { argv: ["apps", "locales", "1234567890"], routes: { "POST /apps/1234567890/locale-details/query": list([]) }, method: "POST", path: "/apps/1234567890/locale-details/query", body: {} },
  { argv: ["product-pages", "list", "--adam-id", "1234567890", "--state", "visible"], routes: { "POST /product-pages/query": list([PRODUCT_PAGE]) }, method: "POST", path: "/product-pages/query", body: { filters: [eq("adamId", "1234567890"), eq("state", "VISIBLE")], pagination: { offset: 0, pageSize: 1000 } } },
  { argv: ["product-pages", "get", PRODUCT_PAGE.id], routes: { [`GET /product-pages/${PRODUCT_PAGE.id}`]: ok(PRODUCT_PAGE) }, method: "GET", path: `/product-pages/${PRODUCT_PAGE.id}` },
  { argv: ["geo", "search", "--query", "united", "--entity", "Country"], routes: { "GET /search/geo": list([]) }, method: "GET", path: "/search/geo", query: { supplySource: "APPSTORE", query: "united", entity: "Country" } },
  { argv: ["budget-orders", "list"], routes: { "POST /shared-budgets/query": list([]) }, method: "POST", path: "/shared-budgets/query", body: { pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["budget-orders", "get", "777777777"], routes: { "GET /shared-budgets/777777777": ok({}) }, method: "GET", path: "/shared-budgets/777777777" },
  // campaigns
  { argv: ["campaigns", "list", "--status", "enabled", "--name", "Example", "--sort", "name", "--fields", "name,status"], routes: { "POST /campaigns/query": list([CAMPAIGN]) }, method: "POST", path: "/campaigns/query", body: { filters: [eq("status", "ENABLED"), { field: "name", operator: "LIKE", value: ["Example"], ignoreCase: true }], sorting: [{ field: "name", order: "ASC" }], fields: ["id", "name", "status"], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["campaigns", "get", "111111111"], routes: R.campaign, method: "GET", path: "/campaigns/111111111" },
  { argv: ["campaigns", "create", "--name", "Example New", "--adam-id", "1234567890", "--daily-budget", "2", "--countries", "us,gb", "--start", "2027-01-01", "--confirm"], routes: { "POST /campaigns/query": list([]), "POST /campaigns": ok({ id: 111111112 }), "GET /campaigns/111111112": ok(CAMPAIGN) }, method: "POST", path: "/campaigns", body: { name: "Example New", adAccountId: 123456789, billingEvent: "TAPS", promotedObjectType: "APPSTORE_APP", promotedObjectId: "1234567890", dailyBudget: { value: { amount: "2.00", currency: "USD" } }, targeting: { supplySource: { include: ["APPSTORE"] }, supplyPlacement: { include: ["APPSTORE_SEARCH_RESULTS"] }, countryOrRegion: { include: ["US", "GB"] } }, bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP" }, startTime: "2027-01-01T00:00:00.000", status: "PAUSED" } },
  { argv: ["campaigns", "update", "111111111", "--name", "Renamed", "--end", "2027-01-31", "--confirm"], routes: { ...R.campaign, "PUT /campaigns/111111111": ok(CAMPAIGN) }, method: "PUT", path: "/campaigns/111111111", body: { name: "Renamed", endTime: "2027-01-31T23:59:59.000" } },
  { argv: ["campaigns", "update", "111111111", "--data", '{"name":"From data","status":"PAUSED"}', "--name", "Flag wins", "--confirm"], routes: { ...R.campaign, "PUT /campaigns/111111111": ok(CAMPAIGN) }, method: "PUT", path: "/campaigns/111111111", body: { name: "Flag wins", status: "PAUSED" } },
  { argv: ["campaigns", "pause", "111111111", "--confirm"], routes: { ...R.campaign, "PUT /campaigns/111111111": ok(CAMPAIGN) }, method: "PUT", path: "/campaigns/111111111", body: { status: "PAUSED" } },
  { argv: ["campaigns", "resume", "111111111", "--confirm"], routes: { ...R.campaign, "PUT /campaigns/111111111": ok(CAMPAIGN) }, method: "PUT", path: "/campaigns/111111111", body: { status: "ENABLED" } },
  { argv: ["campaigns", "delete", "111111111", "--confirm", "--force-delete"], routes: { ...R.campaign, "DELETE /campaigns/111111111": { status: 200 } }, method: "DELETE", path: "/campaigns/111111111" },
  // ad groups
  { argv: ["ad-groups", "list", "--campaign-id", "111111111"], routes: { "POST /adgroups/query": list([AD_GROUP]) }, method: "POST", path: "/adgroups/query", body: { filters: [eq("campaignId", "111111111")], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["ad-groups", "get", "222222222"], routes: R.adGroup, method: "GET", path: "/adgroups/222222222" },
  { argv: ["ad-groups", "create", "--campaign-id", "111111111", "--name", "New Group", "--bid", "0.6", "--start", "2027-01-01", "--confirm"], routes: { ...R.campaign, "POST /adgroups/query": list([]), "POST /adgroups": ok({ id: 222222223 }), "GET /adgroups/222222223": ok(AD_GROUP) }, method: "POST", path: "/adgroups", body: { campaignId: 111111111, name: "New Group", pricingModel: "CPT", automatedKeywordsOptIn: false, bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP", bid: { amount: "0.60", currency: "USD" } }, startTime: "2027-01-01T00:00:00.000", status: "PAUSED" } },
  { argv: ["ad-groups", "update", "222222222", "--bid", "0.65", "--search-match", "off", "--confirm"], routes: { ...R.adGroup, "PUT /adgroups/222222222": ok(AD_GROUP) }, method: "PUT", path: "/adgroups/222222222", body: { bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP", bid: { amount: "0.65", currency: "USD" } }, automatedKeywordsOptIn: false } },
  { argv: ["ad-groups", "pause", "222222222", "--confirm"], routes: { ...R.adGroup, "PUT /adgroups/222222222": ok(AD_GROUP) }, method: "PUT", path: "/adgroups/222222222", body: { status: "PAUSED" } },
  { argv: ["ad-groups", "resume", "222222222", "--confirm"], routes: { ...R.adGroup, "PUT /adgroups/222222222": ok(AD_GROUP) }, method: "PUT", path: "/adgroups/222222222", body: { status: "ENABLED" } },
  { argv: ["ad-groups", "delete", "222222222", "--confirm", "--force-delete"], routes: { ...R.adGroup, "DELETE /adgroups/222222222": { status: 200 } }, method: "DELETE", path: "/adgroups/222222222" },
  // keywords
  { argv: ["keywords", "list", "--ad-group-id", "222222222", "--status", "enabled"], routes: { "POST /keywords/query": list([KEYWORD]) }, method: "POST", path: "/keywords/query", body: { filters: [eq("adGroupId", "222222222"), eq("status", "ENABLED")], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["keywords", "get", "333333333"], routes: R.keyword, method: "GET", path: "/keywords/333333333" },
  { argv: ["keywords", "add", "--ad-group-id", "222222222", "--text", "new term", "--confirm"], routes: { ...R.adGroup, ...R.keyword, "POST /keywords/query": list([]), "POST /keywords/bulk-create": bulkOk }, method: "POST", path: "/keywords/bulk-create", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { adGroupId: 222222222, text: "new term", matchType: "EXACT" } }] } },
  { argv: ["keywords", "update", "333333333", "--bid", "0.55", "--confirm"], routes: { ...R.keyword, "POST /keywords/bulk-update": bulkOk }, method: "POST", path: "/keywords/bulk-update", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 333333333, bid: { amount: "0.55", currency: "USD" } } }] } },
  { argv: ["keywords", "pause", "333333333", "--confirm"], routes: { ...R.keyword, "POST /keywords/bulk-update": bulkOk }, method: "POST", path: "/keywords/bulk-update", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 333333333, status: "PAUSED" } }] } },
  { argv: ["keywords", "resume", "333333333", "--confirm"], routes: { ...R.keyword, "POST /keywords/bulk-update": bulkOk }, method: "POST", path: "/keywords/bulk-update", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 333333333, status: "ENABLED" } }] } },
  { argv: ["keywords", "delete", "333333333", "--confirm", "--force-delete"], routes: { ...R.keyword, "POST /keywords/bulk-delete": bulkOk }, method: "POST", path: "/keywords/bulk-delete", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 333333333 } }] } },
  // negatives
  { argv: ["negatives", "list", "--ad-group-id", "222222222"], routes: { "POST /negative-keywords/query": list([]) }, method: "POST", path: "/negative-keywords/query", body: { filters: [eq("adGroupId", "222222222")], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["negatives", "list", "--campaign-id", "111111111", "--campaign-level"], routes: { "POST /negative-keywords/query": list([NEGATIVE]) }, method: "POST", path: "/negative-keywords/query", body: { filters: [eq("campaignId", "111111111"), { field: "adGroupId", operator: "IS_NULL" }], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["negatives", "add", "--campaign-id", "111111111", "--text", "free example", "--confirm"], routes: { "POST /negative-keywords/query": list([]), "POST /negative-keywords/bulk-create": bulkOk, "GET /negative-keywords/333333333": ok(NEGATIVE) }, method: "POST", path: "/negative-keywords/bulk-create", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { campaignId: 111111111, text: "free example", matchType: "EXACT" } }] } },
  { argv: ["negatives", "pause", "444444444", "--confirm"], routes: { ...R.negative, "POST /negative-keywords/bulk-update": bulkOk }, method: "POST", path: "/negative-keywords/bulk-update", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 444444444, status: "PAUSED" } }] } },
  { argv: ["negatives", "resume", "444444444", "--confirm"], routes: { ...R.negative, "POST /negative-keywords/bulk-update": bulkOk }, method: "POST", path: "/negative-keywords/bulk-update", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 444444444, status: "ENABLED" } }] } },
  { argv: ["negatives", "delete", "444444444", "--confirm", "--force-delete"], routes: { ...R.negative, "POST /negative-keywords/bulk-delete": bulkOk }, method: "POST", path: "/negative-keywords/bulk-delete", body: { allowPartialSuccess: true, items: [{ correlationId: 0, data: { id: 444444444 } }] } },
  // creatives
  { argv: ["creatives", "list", "--status", "valid"], routes: { "POST /creatives/query": list([CREATIVE]) }, method: "POST", path: "/creatives/query", body: { filters: [eq("systemStatus", "VALID")], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["creatives", "get", "666666"], routes: R.creative, method: "GET", path: "/creatives/666666" },
  { argv: ["creatives", "create", "--name", "New CPP", "--adam-id", "1234567890", "--product-page-id", PRODUCT_PAGE.id, "--confirm"], routes: { [`GET /product-pages/${PRODUCT_PAGE.id}`]: ok(PRODUCT_PAGE), "POST /creatives/query": list([]), "POST /creatives": ok({ id: 666667 }), "GET /creatives/666667": ok(CREATIVE) }, method: "POST", path: "/creatives", body: { name: "New CPP", creativeType: "CUSTOM_PRODUCT_PAGE", destination: { destinationType: "APP_STORE_PRODUCT_PAGE", parameters: { adamId: "1234567890", productPageId: PRODUCT_PAGE.id } } } },
  { argv: ["creatives", "delete", "666666", "--confirm", "--force-delete"], routes: { ...R.creative, "POST /ads/query": list([]), "DELETE /creatives/666666": { status: 200 } }, method: "DELETE", path: "/creatives/666666" },
  // ads
  { argv: ["ads", "list", "--ad-group-id", "222222222"], routes: { "POST /ads/query": list([AD]) }, method: "POST", path: "/ads/query", body: { filters: [eq("adGroupId", "222222222")], pagination: { offset: 0, pageSize: 1000, fetchTotalCount: true } } },
  { argv: ["ads", "get", "555555555"], routes: R.ad, method: "GET", path: "/ads/555555555" },
  { argv: ["ads", "create", "--ad-group-id", "222222222", "--creative-id", "666666", "--name", "New Ad", "--confirm"], routes: { ...R.adGroup, ...R.creative, "POST /ads/query": list([]), "POST /ads": ok({ id: 555555556 }), "GET /ads/555555556": ok(AD) }, method: "POST", path: "/ads", body: { campaignId: 111111111, adGroupId: 222222222, creativeId: 666666, name: "New Ad", status: "PAUSED" } },
  { argv: ["ads", "update", "555555555", "--name", "Renamed Ad", "--confirm"], routes: { ...R.ad, "PUT /ads/555555555": ok(AD) }, method: "PUT", path: "/ads/555555555", body: { name: "Renamed Ad" } },
  { argv: ["ads", "pause", "555555555", "--confirm"], routes: { ...R.ad, "PUT /ads/555555555": ok(AD) }, method: "PUT", path: "/ads/555555555", body: { status: "PAUSED" } },
  { argv: ["ads", "resume", "555555555", "--confirm"], routes: { ...R.ad, "PUT /ads/555555555": ok(AD) }, method: "PUT", path: "/ads/555555555", body: { status: "ENABLED" } },
  { argv: ["ads", "delete", "555555555", "--confirm", "--force-delete"], routes: { ...R.ad, "DELETE /ads/555555555": { status: 200 } }, method: "DELETE", path: "/ads/555555555" },
  // reports, insights, history
  { argv: ["reports", "campaigns", "--last", "7d"], routes: { "POST /reports/apps/campaigns/query": list([]) }, method: "POST", path: "/reports/apps/campaigns/query" },
  { argv: ["reports", "ad-groups", "--campaign-id", "111111111"], routes: { "POST /reports/apps/adgroups/query": list([]) }, method: "POST", path: "/reports/apps/adgroups/query" },
  { argv: ["reports", "keywords", "--campaign-id", "111111111"], routes: { "POST /reports/apps/keywords/query": list([]) }, method: "POST", path: "/reports/apps/keywords/query" },
  { argv: ["reports", "search-terms", "--campaign-id", "111111111"], routes: { "POST /reports/apps/searchterms/query": list([]) }, method: "POST", path: "/reports/apps/searchterms/query" },
  { argv: ["reports", "ads", "--campaign-id", "111111111"], routes: { "POST /reports/apps/ads/query": list([]) }, method: "POST", path: "/reports/apps/ads/query" },
  { argv: ["insights", "impression-share", "--adam-id", "1234567890", "--country", "US", "--start", "2026-11-01", "--end", "2026-11-14"], routes: { "POST /insights/apps/impression-share/query": { json: { result: { rows: [] }, pagination: { totalCount: 0 } } } }, method: "POST", path: "/insights/apps/impression-share/query", body: { filters: [{ field: "promotedObjectId", operator: "IN", value: ["1234567890"] }, { field: "countryOrRegion", operator: "IN", value: ["US"] }], options: { impressionShareReportType: "FIRST_SLOT" }, timeRange: { start: "2026-11-01", end: "2026-11-14", timeZone: "UTC", granularity: "DAILY" }, pagination: { offset: 0, pageSize: 5000 } } },
  { argv: ["insights", "keyword-suggestions", "--adam-id", "1234567890", "--term", "example"], routes: { "POST /suggestions/keywords/query": list([]) }, method: "POST", path: "/suggestions/keywords/query", body: { filters: [eq("promotedObjectId", "1234567890"), eq("promotedObjectType", "APPSTORE_APP"), { field: "terms", operator: "IN", value: ["example"] }], pagination: { offset: 0, pageSize: 1000 } } },
  { argv: ["history", "list", "--since", "7d", "--entity-type", "Keyword"], routes: { "POST /change-history/query": list([]) }, method: "POST", path: "/change-history/query", body: { filters: [{ field: "eventTime", operator: "BETWEEN", value: ["2026-11-09", "2026-11-17"] }, { field: "entityType", operator: "IN", value: ["Keyword"] }], options: { metadata: "latest" }, pagination: { offset: 0, pageSize: 1000 } } },
  { argv: ["history", "get", "Campaign.111111111.txn"], routes: { "GET /change-history/Campaign.111111111.txn": ok([]) }, method: "GET", path: "/change-history/Campaign.111111111.txn", query: { limit: "100", offset: "0" } },
  // raw api
  { argv: ["api", "GET", "/v1/campaigns/111111111"], routes: R.campaign, method: "GET", path: "/campaigns/111111111" },
  { argv: ["api", "POST", "/campaigns/query", "--data", '{"pagination":{"offset":0,"pageSize":1}}'], routes: { "POST /campaigns/query": list([]) }, method: "POST", path: "/campaigns/query", body: { pagination: { offset: 0, pageSize: 1 } } },
  { argv: ["api", "PUT", "/adgroups/222222222", "--data", '{"name":"x"}', "--confirm"], routes: { "PUT /adgroups/222222222": ok({}) }, method: "PUT", path: "/adgroups/222222222", body: { name: "x" } },
];

// Every write case once more without --confirm (refused, exit 6) and with --dry-run instead (exit 0): no write is sent.
for (const c of CASES.filter((x) => x.argv.includes("--confirm"))) {
  const without = c.argv.filter((a) => a !== "--confirm");
  test(`${without.join(" ")} (no --confirm) sends nothing`, async () => {
    const r = await cli(without, { routes: c.routes });
    assert.equal(r.code, 6, `exit ${r.code}: ${r.stderr}`);
    assert.ok(["CONFIRM_REQUIRED", "FORCE_DELETE_REQUIRED"].includes(r.err().error.code), r.stderr);
    assert.deepEqual(r.mock.writes(), []);
  });
  const dry = c.argv.map((a) => (a === "--confirm" ? "--dry-run" : a));
  test(`${dry.join(" ")} sends nothing`, async () => {
    const r = await cli(dry, { routes: c.routes });
    assert.equal(r.code, 0, `exit ${r.code}: ${r.stderr}`);
    assert.equal(r.json().dryRun, true);
    assert.deepEqual(r.mock.writes(), []);
  });
}

for (const c of CASES) {
  test(c.argv.join(" "), async () => {
    const r = await cli(c.argv, { routes: c.routes });
    assert.equal(r.code, c.code ?? 0, `exit ${r.code}: ${r.stderr}`);
    assert.equal(r.mock.unmatched.length, 0);
    const call = r.mock.calls.find((x) => x.method === c.method && x.path === c.path);
    assert.ok(call, `no ${c.method} ${c.path} in ${r.mock.calls.map((x) => `${x.method} ${x.path}`).join(", ")}`);
    if (c.body !== undefined) assert.deepEqual(call!.body, c.body);
    if (c.query) for (const [k, v] of Object.entries(c.query)) assert.equal(new URL(call!.url).searchParams.get(k), v, k);
    for (const x of r.mock.calls) assertNoV5Keys(x.body, `${x.method} ${x.path}`);
    if (!["me", "access", "orgs"].includes(c.argv[0]!)) assert.ok(r.stdout.trim().startsWith("{"), "one JSON document on stdout");
  });
}

test("auth setup (verified), doctor, status and logout", async () => {
  const home = tempHome();
  const { path } = writeKey(home);
  const env = { HOME: home, APPLE_ADS_ACCESS_TOKEN: undefined, APPLE_ADS_AD_ACCOUNT_ID: undefined };
  const routes = {
    "POST appleid.apple.com/auth/oauth2/token": { json: { access_token: "tok", expires_in: 3600 } },
    "GET /acls": ok({ acls: [{ roles: ["API Campaign Manager"], adAccount: { id: 123456789, name: "Example", orgId: 987654321 } }] }),
    "GET /me": { json: { result: { userId: 1, orgId: 987654321 } }, headers: { date: new Date(Date.parse("2026-11-16T20:00:00Z")).toUTCString() } },
  };
  const s = await cli(["auth", "setup", "--client-id", "SEARCHADS.c", "--team-id", "SEARCHADS.t", "--key-id", "k", "--private-key", path], { env, routes });
  assert.equal(s.code, 0, s.stderr);
  const res = s.json().result;
  assert.equal(res.verified, true);
  assert.equal(res.adAccountId, "123456789", "the only ad account is picked");
  assert.doesNotMatch(s.stdout, /"tok"/);
  const d = await cli(["auth", "doctor"], { env, routes });
  assert.equal(d.code, 0, d.stdout);
  assert.deepEqual(d.json().checks.map((c: any) => c.name), ["config", "profile", "private key", "client secret", "token", "GET /me", "GET /acls", "GET /ad-accounts/{id}", "clock", "warnings"]);
  const st = await cli(["auth", "status"], { env });
  assert.equal(st.json().result.token.source, "cache");
  const lo = await cli(["auth", "logout"], { env });
  assert.equal(lo.json().result.removed, 1);
  const bad = await cli(["auth", "doctor"], { env: { ...env, APPLE_ADS_PRIVATE_KEY_PATH: "/nonexistent.pem" }, routes });
  assert.equal(bad.code, 3);
  assert.equal(bad.json().checks.find((c: any) => c.name === "private key").ok, false);
});

test("schema topics are offline", async () => {
  for (const argv of [["schema"], ["schema", "commands"], ["schema", "filters", "keywords"], ["schema", "reports"], ["schema", "enums", "campaigndisplaystatus"], ["schema", "exit-codes"]]) {
    const r = await cli(argv, { noAccount: true });
    assert.equal(r.code, 0, `${argv.join(" ")}: ${r.stderr}`);
    assert.equal(r.mock.calls.length, 0);
  }
  const cmds = (await cli(["schema", "commands"])).json().result;
  assert.ok(cmds.length > 60);
  assert.ok(cmds.every((c: any) => c.endpoint), "every leaf names its endpoint");
});

test("--output table renders a table on stdout", async () => {
  const r = await cli(["--output", "table", "campaigns", "list"], { routes: { "POST /campaigns/query": list([CAMPAIGN]) } });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^id\s+name\s+status/);
  assert.match(r.stdout, /3\.50 USD/);
});
