import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportBody, normalizeRows } from "../src/commands/reports.js";
import { dateIn, resolveRange } from "../src/time.js";
import { cli, NOW } from "./helpers/cli.js";
import { assertNoV5Keys } from "./helpers/v5.js";

const TODAY = "2026-11-16";

test("golden bodies, one per report kind", () => {
  const camp = buildReportBody("campaigns", { campaignIds: ["111111111", "111111112"], last: "7d" }, TODAY).body;
  assert.deepEqual(camp, {
    timeRange: { start: "2026-11-09", end: "2026-11-15", timeZone: "ORTZ" },
    filters: [{ field: "id", operator: "IN", value: ["111111111", "111111112"] }],
    sorting: [{ field: "localSpend", order: "DESC" }],
    options: { includeRows: ["GRAND_TOTAL"] },
  });
  for (const kind of ["ad-groups", "keywords", "search-terms", "ads"] as const) {
    const b = buildReportBody(kind, { campaignIds: ["111111111"], adGroupId: "222222222", start: "2026-11-01", end: "2026-11-14", granularity: kind === "search-terms" || kind === "ads" ? "DAILY" : "DAILY" }, TODAY).body;
    assert.deepEqual(b, {
      timeRange: { start: "2026-11-01", end: "2026-11-14", timeZone: "ORTZ", granularity: "DAILY" },
      filters: [
        { field: "campaignId", operator: "EQUALS", value: ["111111111"] },
        { field: "adGroupId", operator: "EQUALS", value: ["222222222"] },
      ],
      sorting: [{ field: "localSpend", order: "DESC" }],
      options: { includeRows: ["GRAND_TOTAL"] },
    }, kind);
    assertNoV5Keys(b, kind);
  }
  const g = buildReportBody("keywords", { campaignIds: ["1"], groupBy: ["countryOrRegion"], metrics: "impressions,taps", sort: ["taps:ASC"], grandTotal: false, last: "28d" }, TODAY).body;
  assert.deepEqual(g.groupBy, ["countryOrRegion"]);
  assert.deepEqual(g.fields, ["impressions", "taps"]);
  assert.deepEqual(g.sorting, [{ field: "taps", order: "ASC" }]);
  assert.equal(g.options, undefined);
});

test("required filters: campaigns use id IN and reject --ad-group-id; others need one --campaign-id", () => {
  assert.equal(buildReportBody("campaigns", {}, TODAY).body.filters, undefined);
  assert.throws(() => buildReportBody("campaigns", { adGroupId: "2" }, TODAY), (e: any) => e.exitCode === 2);
  assert.throws(() => buildReportBody("keywords", {}, TODAY), (e: any) => e.exitCode === 2 && /--campaign-id/.test(e.message));
  assert.throws(() => buildReportBody("ads", { campaignIds: ["1", "2"] }, TODAY), (e: any) => e.exitCode === 2);
});

test("span and granularity rules", () => {
  const b = (o: object, kind: any = "campaigns") => () => buildReportBody(kind, o as never, TODAY);
  assert.throws(b({ start: "2026-11-01", end: "2026-11-08", granularity: "HOURLY" }), /7 days or less/);
  assert.doesNotThrow(b({ start: "2026-11-09", end: "2026-11-15", granularity: "HOURLY" }));
  assert.throws(b({ last: "7d", granularity: "HOURLY", campaignIds: ["1"] }, "ads"), /not supported for ads/);
  assert.throws(b({ last: "7d", granularity: "HOURLY", campaignIds: ["1"] }, "search-terms"), /not supported/);
  assert.throws(b({ last: "91d", granularity: "DAILY" }), /90 days or less/);
  assert.throws(b({ last: "10d", granularity: "WEEKLY" }), /14 days or more/);
  assert.doesNotThrow(b({ last: "14d", granularity: "WEEKLY" }));
  assert.throws(b({ last: "60d", granularity: "MONTHLY" }), /90 days or more/);
  assert.throws(b({ last: "7d", timeZone: "UTC", campaignIds: ["1"] }, "search-terms"), /ORTZ only/);
  assert.throws(b({ last: "7d", includeEmpty: true, groupBy: ["countryOrRegion"] }), /cannot be combined/);
  assert.throws(b({ last: "7d", groupBy: ["gender"], campaignIds: ["1"] }, "keywords"), /not valid/);
  assert.throws(b({ last: "7d", start: "2026-11-01", end: "2026-11-02" }), /not both/);
  assert.throws(b({ start: "2026-11-05", end: "2026-11-01" }), /after/);
});

test("--last resolves in the account time zone and excludes today; today/yesterday words", () => {
  // 2026-11-17T05:00Z is still 2026-11-16 in Los Angeles.
  const t = dateIn("America/Los_Angeles", Date.parse("2026-11-17T05:00:00Z"));
  assert.equal(t, "2026-11-16");
  assert.deepEqual(resolveRange({ last: "7d" }, t), { start: "2026-11-09", end: "2026-11-15" });
  assert.deepEqual(resolveRange({ start: "yesterday", end: "today" }, t), { start: "2026-11-15", end: "2026-11-16" });
});

test("normalisation: missing counts -> 0, Default Ad rows dropped or flagged, low volume flagged", () => {
  const rows = [
    { metadata: { id: -1, name: "Default Ad" }, totalMetrics: {} },
    { metadata: { id: 555555555 }, totalMetrics: { tapInstalls: 0, localSpend: { amount: "0", currency: "USD" } }, granularMetrics: [{ date: "2026-11-10" }] },
  ];
  const ads = normalizeRows("ads", rows);
  assert.equal(ads.length, 1);
  assert.equal(ads[0].totalMetrics.impressions, 0);
  assert.equal(ads[0].totalMetrics.taps, 0);
  assert.equal(ads[0].granularMetrics[0].impressions, 0);
  assert.deepEqual(ads[0].totalMetrics.localSpend, { amount: "0", currency: "USD" });
  assert.deepEqual(normalizeRows("ads", rows, true)[0].cli, { defaultAd: true });
  const st = normalizeRows("search-terms", [{ metadata: { searchTermText: "example" }, totalMetrics: {} }, { metadata: {}, totalMetrics: {} }]);
  assert.equal(st[0].cli, undefined);
  assert.deepEqual(st[1].cli, { lowVolume: true });
});

test("command: empty result -> rows [], grand total lifted, sorting always sent, cli envelope", async () => {
  const r = await cli(["reports", "keywords", "--campaign-id", "111111111"], { routes: { "POST /reports/apps/keywords/query": { json: { result: {}, pagination: { offset: 0, pageSize: 0, totalCount: 0 } } } } });
  assert.equal(r.code, 0, r.stderr);
  const j = r.json();
  assert.deepEqual(j.result, { rows: [] });
  assert.equal(j.pagination.truncated, false);
  assert.deepEqual(j.cli.timeRange, { start: "2026-11-09", end: "2026-11-15" });
  assert.equal(j.cli.currency, "USD");
  const body = r.mock.calls.find((c) => c.path === "/reports/apps/keywords/query")!.body;
  assert.deepEqual(body.sorting, [{ field: "localSpend", order: "DESC" }]);
  assert.deepEqual(body.pagination, { offset: 0, pageSize: 5000 });
  assertNoV5Keys(body);
  const g = await cli(["reports", "campaigns", "--campaign-id", "111111111"], {
    routes: { "POST /reports/apps/campaigns/query": { json: { result: { rows: [{ metadata: { id: 111111111 }, totalMetrics: { taps: 3 } }], summary: { grandTotal: { taps: 3 } } }, pagination: { totalCount: 1 } } } },
  });
  const gj = g.json();
  assert.equal(gj.result.grandTotal.taps, 3);
  assert.equal(gj.result.grandTotal.impressions, 0);
  assert.equal(gj.result.rows[0].totalMetrics.impressions, 0);
  assert.equal(NOW > 0, true);
});
