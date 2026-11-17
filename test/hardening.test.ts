// Regression tests for review findings: raw-path bypasses, key contents, bulk confirmation, history ranges,
// report normalisation, spend assessment, amount ceilings and config directory modes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSecureFile } from "../src/config.js";
import { isReadRequest } from "../src/http.js";
import { normalizeRows } from "../src/commands/reports.js";
import { cli, list, one, tempHome } from "./helpers/cli.js";
import { writeKey } from "./helpers/keys.js";
import { AD, AD_GROUP, CAMPAIGN, KEYWORD } from "./fixtures.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV = { APPLE_ADS_PROTECTED_CAMPAIGN_IDS: "111111111" };

test("raw api: fragments, percent-encoding, backslashes and dot segments are refused before any request", async () => {
  for (const path of ["/keywords/bulk-delete#/query", "/campaigns/111111111#x", "/campaigns/%31%31%31%31%31%31%31%31%31", "/adgroups/bulk-update/../query", "/campaigns\\111111111", "/campaigns/./query"]) {
    const r = await cli(["api", "POST", path, "--data", '{"items":[{"data":{"id":1}}]}', "--confirm", "--force-delete"], { env: ENV });
    assert.equal(r.code, 2, `${path}: exit ${r.code} ${r.stderr}`);
    assert.equal(r.mock.calls.length, 0, path);
  }
});

test("read/write classification uses the URL that is sent", () => {
  assert.equal(isReadRequest("POST", "/campaigns/query"), true);
  assert.equal(isReadRequest("POST", "/keywords/bulk-delete#/query"), false);
  assert.equal(isReadRequest("POST", "/query/../keywords/bulk-delete"), false);
  assert.equal(isReadRequest("POST", "/campaigns/query?x=1"), true);
});

test("raw api: leading zeros do not get past the protected-campaign guard", async () => {
  const r = await cli(["api", "PUT", "/campaigns/0111111111", "--data", '{"status":"ENABLED"}', "--confirm"], { env: ENV });
  assert.equal(r.code, 6, r.stderr);
  assert.equal(r.err().error.code, "PROTECTED");
  assert.deepEqual(r.mock.writes(), []);
  const b = await cli(["api", "POST", "/adgroups", "--data", '{"campaignId":"00111111111","name":"x"}', "--confirm"], { env: ENV });
  assert.equal(b.code, 6, b.stderr);
});

test("raw api: DELETE/PUT /creatives/{id} resolves the ads that use the creative", async () => {
  for (const method of ["DELETE", "PUT"]) {
    const r = await cli(["api", method, "/creatives/666666", ...(method === "PUT" ? ["--data", '{"name":"x"}'] : []), "--confirm", "--force-delete"], {
      env: ENV,
      routes: { "POST /ads/query": list([AD]) },
    });
    assert.equal(r.code, 6, `${method}: ${r.stderr}`);
    assert.equal(r.err().error.code, "PROTECTED");
    assert.deepEqual(r.mock.writes(), []);
  }
});

test("raw api: GET with a body is a usage error and sends nothing (no retries)", async () => {
  const r = await cli(["api", "GET", "/me", "--data", "{}"]);
  assert.equal(r.code, 2, r.stderr);
  assert.equal(r.mock.calls.length, 0);
  assert.deepEqual(r.sleeps, []);
});

test("private key contents in the path setting never appear in any output", async () => {
  const home = tempHome();
  const { path } = writeKey(home);
  const pem = readFileSync(path, "utf8");
  const body = pem.split("\n")[1]!;
  const env = { HOME: home, APPLE_ADS_ACCESS_TOKEN: undefined, APPLE_ADS_CLIENT_ID: "SEARCHADS.c", APPLE_ADS_TEAM_ID: "SEARCHADS.t", APPLE_ADS_KEY_ID: "k", APPLE_ADS_PRIVATE_KEY_PATH: pem };
  for (const argv of [["campaigns", "list"], ["auth", "status"], ["auth", "doctor"]]) {
    const r = await cli(argv, { env });
    assert.equal(r.code, 3, `${argv.join(" ")}: exit ${r.code}`);
    assert.ok(!r.stdout.includes(body) && !r.stderr.includes(body), `${argv.join(" ")} printed the key`);
    assert.ok(!r.stdout.includes("PRIVATE KEY") && !r.stderr.includes("PRIVATE KEY"), argv.join(" "));
    assert.match(r.stdout + r.stderr, /KEY_IS_CONTENT|file path, not the key contents/);
  }
});

const KW_ROUTES = { "GET /keywords/333333333": one(KEYWORD) };

test("bulk write with no per-item results, or too few, is BULK_UNCONFIRMED (exit 1), not success", async () => {
  for (const json of [{ result: {} }, { result: [] }, {}]) {
    const r = await cli(["keywords", "update", "333333333", "--bid", "0.55", "--confirm"], { routes: { ...KW_ROUTES, "POST /keywords/bulk-update": { json } } });
    assert.equal(r.code, 1, `${JSON.stringify(json)}: ${r.stderr}`);
    assert.equal(r.err().error.code, "BULK_UNCONFIRMED");
    assert.match(r.err().error.hint, /list the parent/);
  }
  const short = await cli(["keywords", "pause", "333333333", "444444444", "--confirm"], {
    routes: { ...KW_ROUTES, "GET /keywords/444444444": one({ ...KEYWORD, id: 444444444 }), "POST /keywords/bulk-update": { json: { result: [{ correlationId: 0, success: true, result: { id: 333333333 } }] } } },
  });
  assert.equal(short.code, 1, short.stderr);
  assert.equal(short.err().error.code, "BULK_UNCONFIRMED");
});

test("after (the re-read) keeps the bid for keywords and ad groups", async () => {
  const k = await cli(["keywords", "update", "333333333", "--bid", "0.55", "--confirm"], {
    routes: {
      "GET /keywords/333333333": [one(KEYWORD), one({ ...KEYWORD, bid: { amount: "0.55", currency: "USD" } })],
      "POST /keywords/bulk-update": { json: { result: [{ correlationId: 0, success: true, result: { id: 333333333 } }] } },
    },
  });
  assert.equal(k.code, 0, k.stderr);
  assert.deepEqual(k.json().after[0].bid, { amount: "0.55", currency: "USD" });
  assert.deepEqual(k.json().plan.before[0].bid, { amount: "0.5", currency: "USD" });
  const g = await cli(["ad-groups", "update", "222222222", "--bid", "0.65", "--confirm"], {
    routes: { "GET /adgroups/222222222": one(AD_GROUP), "PUT /adgroups/222222222": one(AD_GROUP) },
  });
  assert.equal(g.code, 0, g.stderr);
  assert.ok(g.json().after[0].bidStrategy.bid, "ad group after has the bid");
  assert.equal(g.json().after[0].automatedKeywordsOptIn, false);
});

test("history --start/--end includes the whole end date", async () => {
  const r = await cli(["history", "list", "--start", "2026-11-15", "--end", "2026-11-16", "--entity-type", "Campaign"], { routes: { "POST /change-history/query": list([]) } });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.mock.calls[0]!.body.filters[0], { field: "eventTime", operator: "BETWEEN", value: ["2026-11-15", "2026-11-17"] });
  assert.deepEqual(r.json().cli.eventTime, { from: "2026-11-15", to: "2026-11-16", toInclusive: true });
});

test("history with --campaign-id merges both queries, then applies --offset and --limit once", async () => {
  const ev = (t: string, id: number) => ({ eventTime: t, entityType: "Keyword", id });
  const children = [ev("2026-11-16T10:00:00", 1), ev("2026-11-15T10:00:00", 2), ev("2026-11-13T10:00:00", 3), ev("2026-11-11T10:00:00", 4), ev("2026-11-10T10:00:00", 5)];
  const camp = [ev("2026-11-16T12:00:00", 6), ev("2026-11-14T12:00:00", 7)];
  const r = await cli(["history", "list", "--campaign-id", "111111111", "--entity-type", "Campaign", "--entity-type", "Keyword", "--limit", "3", "--offset", "1"], {
    routes: { "POST /change-history/query": (c) => (c.body.filters.some((f: any) => f.field === "entityId") ? list(camp) : list(children)) },
  });
  assert.equal(r.code, 0, r.stderr);
  const j = r.json();
  assert.deepEqual(j.result.map((x: any) => x.id), [1, 2, 7]);
  assert.deepEqual(j.pagination, { offset: 1, returned: 3, truncated: true, nextOffset: 4 });
});

test("reports zero-fill only the requested count metrics; ads pagination counts what is returned", async () => {
  const rows = normalizeRows("keywords", [{ metadata: { id: 1 }, totalMetrics: { impressions: 3 } }], false, ["impressions", "taps"]);
  assert.deepEqual(rows[0].totalMetrics, { impressions: 3, taps: 0 });
  const r = await cli(["reports", "keywords", "--campaign-id", "111111111", "--metrics", "impressions,taps,localSpend"], {
    routes: { "POST /reports/apps/keywords/query": { json: { result: { rows: [{ metadata: { id: 1 }, totalMetrics: { impressions: 2 } }], summary: { grandTotal: { impressions: 2 } } }, pagination: { totalCount: 1 } } } },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json().result.grandTotal, { impressions: 2, taps: 0 });
  assert.equal(r.json().result.rows[0].totalMetrics.tapInstalls, undefined);
  const a = await cli(["reports", "ads", "--campaign-id", "111111111"], {
    routes: { "POST /reports/apps/ads/query": { json: { result: { rows: [{ metadata: { id: -1 } }, { metadata: { id: 5 } }] }, pagination: { totalCount: 2 } } } },
  });
  assert.equal(a.json().pagination.returned, 1);
  assert.equal(a.json().pagination.droppedDefaultAds, 1);
  assert.equal(a.json().result.rows.length, 1);
});

test("keywords add: an ENABLED item in the file makes the effect increase even with --status PAUSED", async () => {
  const r = await cli(["keywords", "add", "--ad-group-id", "222222222", "--file", "-", "--status", "PAUSED", "--dry-run"], {
    stdin: JSON.stringify([{ text: "a", status: "ENABLED" }, { text: "b" }]),
    routes: { "GET /adgroups/222222222": one(AD_GROUP), "POST /keywords/query": list([]) },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json().spend.effect, "increase");
  const p = await cli(["keywords", "add", "--ad-group-id", "222222222", "--text", "a", "--status", "PAUSED", "--dry-run"], {
    routes: { "GET /adgroups/222222222": one(AD_GROUP), "POST /keywords/query": list([]) },
  });
  assert.equal(p.json().spend.effect, "none");
});

test("update --data keys are assessed like their flags (status, Search Match, budget, bid)", async () => {
  const c = await cli(["campaigns", "update", "111111111", "--data", '{"status":"ENABLED","dailyBudget":{"value":{"amount":"9.00","currency":"USD"}}}', "--dry-run"], { routes: { "GET /campaigns/111111111": one(CAMPAIGN) } });
  assert.equal(c.code, 0, c.stderr);
  const cs = c.json().spend;
  assert.equal(cs.effect, "increase");
  assert.ok(cs.reasons.some((x: any) => /enabled/.test(x.text)));
  assert.ok(cs.reasons.some((x: any) => /daily budget 3.5 -> 9.00/.test(x.text) && x.largeStep));
  const g = await cli(["ad-groups", "update", "222222222", "--data", '{"automatedKeywordsOptIn":true}', "--dry-run"], { routes: { "GET /adgroups/222222222": one(AD_GROUP) } });
  assert.equal(g.json().spend.effect, "increase");
  assert.match(g.json().spend.reasons[0].text, /Search Match on/);
});

test("bids and budgets above the ceilings need --allow-large; ceilings come from the profile or env", async () => {
  const r = await cli(["keywords", "update", "333333333", "--bid", "60", "--confirm"], { routes: KW_ROUTES });
  assert.equal(r.code, 6, r.stderr);
  assert.equal(r.err().error.code, "ABOVE_CEILING");
  assert.deepEqual(r.mock.writes(), []);
  const d = await cli(["keywords", "update", "333333333", "--bid", "60", "--dry-run"], { routes: KW_ROUTES });
  assert.equal(d.code, 0);
  assert.equal(d.json().overCeiling[0].field, "bid");
  assert.ok(d.json().spend.reasons.some((x: any) => x.largeStep && /ceiling/.test(x.text)));
  const ok = await cli(["keywords", "update", "333333333", "--bid", "60", "--confirm", "--allow-large"], {
    routes: { ...KW_ROUTES, "POST /keywords/bulk-update": { json: { result: [{ correlationId: 0, success: true, result: { id: 333333333 } }] } } },
  });
  assert.equal(ok.code, 0, ok.stderr);
  const b = await cli(["campaigns", "create", "--name", "N", "--adam-id", "1234567890", "--daily-budget", "500", "--countries", "US", "--confirm"], {
    env: { APPLE_ADS_MAX_DAILY_BUDGET: "100" },
    routes: { "POST /campaigns/query": list([]) },
  });
  assert.equal(b.code, 6, b.stderr);
  assert.equal(b.err().error.code, "ABOVE_CEILING");
});

test("writing a config into a user-chosen directory leaves that directory's mode alone", () => {
  const home = tempHome();
  const dir = join(home, "shared");
  mkdirSync(dir, { mode: 0o755 });
  writeSecureFile(join(dir, "cfg.json"), "{}");
  assert.equal(statSync(dir).mode & 0o777, 0o755);
  assert.equal(statSync(join(dir, "cfg.json")).mode & 0o777, 0o600);
  const own = join(home, "new", "apple-ads-cli");
  writeSecureFile(join(own, "config.json"), "{}");
  assert.equal(statSync(own).mode & 0o777, 0o700);
});

test("npm pack never includes skills/*/references/local.md", () => {
  // Put a placeholder local.md in place (it is gitignored) so the check proves the exclusion works.
  const local = join(ROOT, "skills", "apple-ads-cli", "references", "local.md");
  const made = !existsSync(local);
  if (made) writeFileSync(local, "placeholder\n");
  let out: string;
  try {
    out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } finally {
    if (made) rmSync(local);
  }
  const parsed = JSON.parse(out);
  const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const files: string[] = (entry as any).files.map((f: any) => f.path);
  assert.ok(files.includes("skills/apple-ads-cli/SKILL.md"));
  assert.ok(!files.some((f) => /references\/local\.md$/.test(f)), "local.md is packed");
  assert.deepEqual(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files.filter((f: string) => f.startsWith("!")), ["!skills/*/references/local.md"]);
});

test("WEEKLY_SUN_SAT with --last explains the fix with a working Sunday-Saturday example", async () => {
  const r = await cli(["insights", "impression-share", "--adam-id", "1234567890", "--granularity", "WEEKLY_SUN_SAT", "--last", "14d"]);
  assert.equal(r.code, 2);
  assert.match(r.err().error.hint, /--start 2026-11-01 --end 2026-11-14/);
  const h = await cli(["reports", "keywords", "--campaign-id", "111111111", "--granularity", "HOURLY", "--last", "28d"]);
  assert.equal(h.code, 2);
  assert.ok(h.err().error.hint);
});

test("product-pages and eligibility send --sort (and --fields where the endpoint has it); keyword-suggestions refuses it", async () => {
  const pp = await cli(["product-pages", "list", "--adam-id", "1234567890", "--sort", "name:ASC", "--fields", "name"], { routes: { "POST /product-pages/query": list([]) } });
  assert.equal(pp.code, 0, pp.stderr);
  assert.deepEqual(pp.mock.calls[0]!.body.sorting, [{ field: "name", order: "ASC" }]);
  assert.deepEqual(pp.mock.calls[0]!.body.fields, ["id", "name"]);
  const del = await cli(["product-pages", "list", "--adam-id", "1234567890", "--deleted"]);
  assert.equal(del.code, 2, "product-pages has no deleted field");
  const ks = await cli(["insights", "keyword-suggestions", "--adam-id", "1234567890", "--sort", "popularity:DESC"]);
  assert.equal(ks.code, 2, "keyword-suggestions has no sortable field, so no --sort");
  assert.equal(ks.mock.calls.length, 0);
  const el = await cli(["apps", "eligibility", "1234567890", "--sort", "countryOrRegion"], { routes: { "POST /eligibilities/apps/query": list([]) } });
  assert.deepEqual(el.mock.calls[0]!.body.sorting, [{ field: "countryOrRegion", order: "ASC" }]);
});
