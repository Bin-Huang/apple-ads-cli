import { test } from "node:test";
import assert from "node:assert/strict";
import { cli, list, one } from "./helpers/cli.js";
import { AD_GROUP, CAMPAIGN, KEYWORD } from "./fixtures.js";

const CAMPAIGN_ROUTES = { "GET /campaigns/111111111": one(CAMPAIGN) };

test("dry run sends only reads and exits 0 with the exact request", async () => {
  const r = await cli(["campaigns", "resume", "111111111", "--dry-run"], { routes: CAMPAIGN_ROUTES });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.mock.writes().length, 0);
  const j = r.json();
  assert.equal(j.dryRun, true);
  assert.equal(j.sent, false);
  assert.deepEqual(j.plan.steps[0], { method: "PUT", url: "https://api.ads.apple.com/v1/campaigns/111111111", xApContext: "adAccountId=123456789", body: { status: "ENABLED" } });
  assert.equal(j.spend.effect, "increase");
});

test("without --confirm the plan prints, nothing is sent, exit 6 CONFIRM_REQUIRED", async () => {
  const r = await cli(["campaigns", "pause", "111111111"], { routes: CAMPAIGN_ROUTES });
  assert.equal(r.code, 6);
  assert.equal(r.err().error.code, "CONFIRM_REQUIRED");
  assert.equal(r.mock.writes().length, 0);
  assert.equal(r.json().sent, false);
});

test("--confirm sends, then re-reads and reports displayStatus", async () => {
  let n = 0;
  const r = await cli(["campaigns", "pause", "111111111", "--confirm"], {
    routes: {
      "GET /campaigns/111111111": () => one(n++ === 0 ? { ...CAMPAIGN, status: "ENABLED", displayStatus: "RUNNING" } : { ...CAMPAIGN, status: "PAUSED", displayStatus: "PAUSED" }),
      "PUT /campaigns/111111111": one({ ...CAMPAIGN, status: "PAUSED" }),
    },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.mock.writes().length, 1);
  assert.deepEqual(r.mock.writes()[0]!.body, { status: "PAUSED" });
  const j = r.json();
  assert.equal(j.sent, true);
  assert.equal(j.after[0].displayStatus, "PAUSED");
  assert.match(r.stderr, /sent 1 request/);
});

test("deletes need --force-delete as well as --confirm", async () => {
  const r = await cli(["campaigns", "delete", "111111111", "--confirm"], { routes: CAMPAIGN_ROUTES });
  assert.equal(r.code, 6);
  assert.equal(r.err().error.code, "FORCE_DELETE_REQUIRED");
  assert.equal(r.mock.writes().length, 0);
  const ok = await cli(["campaigns", "delete", "111111111", "--confirm", "--force-delete"], {
    routes: { "GET /campaigns/111111111": [one(CAMPAIGN), { status: 404, json: { error: { code: "ENTITY_NOT_FOUND", details: [] } } }], "DELETE /campaigns/111111111": { status: 200 } },
  });
  assert.equal(ok.code, 0, ok.stderr);
  assert.deepEqual(ok.json().after, [{ id: 111111111, gone: true }]);
});

test("bulk: 250 keywords -> 3 chunks with global correlationIds; duplicates skipped as existing", async () => {
  const texts = Array.from({ length: 250 }, (_, i) => `term ${i}`);
  const sent: any[] = [];
  const r = await cli(["keywords", "add", "--ad-group-id", "222222222", "--file", "-", "--confirm"], {
    stdin: JSON.stringify([...texts, "example term"]),
    routes: {
      "GET /adgroups/222222222": one(AD_GROUP),
      "POST /keywords/query": list([KEYWORD]),
      "POST /keywords/bulk-create": (c) => {
        sent.push(c.body);
        return { json: { result: c.body.items.map((it: any) => ({ correlationId: it.correlationId, operation: "CREATE", success: true, result: { id: 900000000 + it.correlationId }, error: null })), error: null } };
      },
      "GET /keywords/900000000": one({ id: 900000000 }),
      ...Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`GET /keywords/${900000000 + i}`, one({ id: 900000000 + i, status: "ENABLED" })])),
    },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(sent.map((b) => b.items.length), [100, 100, 50]);
  assert.equal(sent[2].items[0].correlationId, 200);
  assert.ok(sent.every((b) => b.allowPartialSuccess === true));
  const j = r.json();
  assert.equal(j.results.length, 250);
  assert.deepEqual(j.existing, [{ text: "example term", matchType: "EXACT", id: 333333333, status: "ENABLED" }]);
});

test("partial bulk failure: per-item errors printed, exit 1 PARTIAL_FAILURE", async () => {
  const r = await cli(["negatives", "add", "--campaign-id", "111111111", "--text", "a", "--text", "b", "--confirm"], {
    routes: {
      "POST /negative-keywords/query": list([]),
      "POST /negative-keywords/bulk-create": { json: { result: [{ correlationId: 0, success: true, result: { id: 444444444 } }, { correlationId: 1, success: false, error: { code: "INVALID" } }] } },
      "GET /negative-keywords/444444444": one({ id: 444444444, status: "ENABLED" }),
    },
  });
  assert.equal(r.code, 1);
  assert.equal(r.err().error.code, "PARTIAL_FAILURE");
  const j = r.json();
  assert.deepEqual(j.results.map((x: any) => x.ok), [true, false]);
});

test("a chunk that fails as a whole stops, prints what succeeded, and hints to list first", async () => {
  const texts = Array.from({ length: 150 }, (_, i) => `t${i}`);
  let n = 0;
  const r = await cli(["keywords", "add", "--ad-group-id", "222222222", "--file", "-", "--confirm"], {
    stdin: JSON.stringify(texts),
    routes: {
      "GET /adgroups/222222222": one(AD_GROUP),
      "POST /keywords/query": list([]),
      "POST /keywords/bulk-create": (c) => (n++ === 0 ? { json: { result: c.body.items.map((it: any) => ({ correlationId: it.correlationId, success: true, result: { id: it.correlationId + 1 } })) } } : { status: 400, json: { error: { code: "VALIDATION_ERROR", details: [{ code: "LIMIT_EXCEEDED_FIELD", message: "too many" }] } } }),
    },
  });
  assert.equal(r.code, 1);
  assert.match(r.err().error.hint, /list the parent before retrying/);
  const j = r.json();
  assert.equal(j.results.length, 100);
  assert.equal(j.failedStep, 1);
});

test("campaign create detects a duplicate name and sends nothing", async () => {
  const r = await cli(["campaigns", "create", "--name", "Example US Search", "--adam-id", "1234567890", "--daily-budget", "3.50", "--countries", "US", "--confirm"], {
    routes: { "POST /campaigns/query": list([CAMPAIGN]) },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.mock.writes().length, 0);
  assert.equal(r.json().existing[0].id, 111111111);
});

test("keyword bid changes show old -> new and flag steps over 15%", async () => {
  const r = await cli(["keywords", "update", "333333333", "--bid", "0.75", "--dry-run"], { routes: { "GET /keywords/333333333": one(KEYWORD) } });
  assert.equal(r.code, 0, r.stderr);
  const j = r.json();
  assert.deepEqual(j.plan.changes[0], { id: 333333333, text: "example term", field: "bid", before: "0.5", after: "0.75" });
  assert.equal(j.spend.effect, "increase");
  assert.equal(j.spend.reasons[0].largeStep, true);
  assert.match(r.stderr, /15%/);
});
