import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCampaignBody } from "../src/commands/campaigns.js";
import { buildAdGroupBody } from "../src/commands/ad-groups.js";
import { buildCreativeBody } from "../src/commands/creatives.js";
import { buildAdBody } from "../src/commands/ads.js";
import { parseAmount } from "../src/money.js";
import { cli, list, one } from "./helpers/cli.js";
import { AD_GROUP, CAMPAIGN } from "./fixtures.js";

const NOW = Date.parse("2026-11-16T20:00:30.000Z");

test("campaign create body matches the shape of a request that worked (PAUSED default)", () => {
  const b = buildCampaignBody({ name: "Example US Search", adamId: "1234567890", dailyBudget: "3.5", currency: "USD", countries: ["US"], start: "2026-12-01", end: "2026-12-31", adAccountId: "123456789", nowMs: NOW });
  const want = {
    name: "Example US Search", adAccountId: 123456789, billingEvent: "TAPS", promotedObjectType: "APPSTORE_APP", promotedObjectId: "1234567890",
    dailyBudget: { value: { amount: "3.50", currency: "USD" } },
    targeting: { supplySource: { include: ["APPSTORE"] }, supplyPlacement: { include: ["APPSTORE_SEARCH_RESULTS"] }, countryOrRegion: { include: ["US"] } },
    bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP" },
    startTime: "2026-12-01T00:00:00.000", endTime: "2026-12-31T23:59:59.000", status: "PAUSED",
  };
  assert.deepEqual(b, want);
  assert.deepEqual(Object.keys(b), Object.keys(want), "same field order");
  const now = buildCampaignBody({ name: "x", adamId: "1", dailyBudget: "1", currency: "USD", countries: ["US"], adAccountId: "1", nowMs: NOW });
  assert.equal(now.startTime, "2026-11-16T20:00:00.000");
  assert.equal(now.endTime, undefined);
  assert.throws(() => buildCampaignBody({ name: "x", adamId: "1", dailyBudget: "1", currency: "USD", countries: ["US"], adAccountId: "1", nowMs: NOW, start: "2026-12-02", end: "2026-12-01" }), (e: any) => e.exitCode === 2);
});

test("ad group create body: CPT from TAPS, bid strategy from the campaign, startTime always set", () => {
  const b = buildAdGroupBody({ campaign: CAMPAIGN, name: "Example Group", bid: "0.6", currency: "USD", nowMs: NOW });
  assert.deepEqual(b, {
    campaignId: 111111111, name: "Example Group", pricingModel: "CPT", automatedKeywordsOptIn: false,
    bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP", bid: { amount: "0.60", currency: "USD" } },
    startTime: "2026-11-16T20:00:00.000", status: "PAUSED",
  });
});

test("creative bodies: CPP vs default product page", () => {
  assert.deepEqual(buildCreativeBody("Example CPP", "1234567890", "00000000-0000-0000-0000-000000000000"), {
    name: "Example CPP", creativeType: "CUSTOM_PRODUCT_PAGE",
    destination: { destinationType: "APP_STORE_PRODUCT_PAGE", parameters: { adamId: "1234567890", productPageId: "00000000-0000-0000-0000-000000000000" } },
  });
  assert.deepEqual(buildCreativeBody("Example", "1234567890"), { name: "Example", creativeType: "DEFAULT_PRODUCT_PAGE", destination: { destinationType: "APP_STORE_PRODUCT_PAGE", parameters: { adamId: "1234567890" } } });
});

test("ad body: PAUSED default, campaignId included", () => {
  assert.deepEqual(buildAdBody("111111111", "222222222", "666666", "Example Ad"), { campaignId: 111111111, adGroupId: 222222222, creativeId: 666666, name: "Example Ad", status: "PAUSED" });
});

test("money validation", () => {
  assert.equal(parseAmount("5", "x"), "5.00");
  assert.equal(parseAmount("0.6", "x"), "0.60");
  assert.equal(parseAmount("10.25", "x"), "10.25");
  for (const bad of ["05.00", "1.234", "$5", "-1", "1,00", "", "abc"]) assert.throws(() => parseAmount(bad, "x"), (e: any) => e.exitCode === 2, bad);
});

test("keyword bulk body: chunks, correlationIds, EXACT default; negatives scope", async () => {
  const kw = await cli(["keywords", "add", "--ad-group-id", "222222222", "--text", "example term", "--text", "other term", "--bid", "0.5", "--dry-run"], {
    routes: { "GET /adgroups/222222222": one(AD_GROUP), "POST /keywords/query": list([]) },
  });
  assert.equal(kw.code, 0, kw.stderr);
  assert.deepEqual(kw.json().plan.steps[0].body, {
    allowPartialSuccess: true,
    items: [
      { correlationId: 0, data: { adGroupId: 222222222, text: "example term", matchType: "EXACT", bid: { amount: "0.50", currency: "USD" } } },
      { correlationId: 1, data: { adGroupId: 222222222, text: "other term", matchType: "EXACT", bid: { amount: "0.50", currency: "USD" } } },
    ],
  });
  const camp = await cli(["negatives", "add", "--campaign-id", "111111111", "--text", "free example", "--dry-run"], { routes: { "POST /negative-keywords/query": list([]) } });
  assert.deepEqual(camp.json().plan.steps[0].body.items[0].data, { campaignId: 111111111, text: "free example", matchType: "EXACT" });
  const q = camp.mock.calls.find((c) => c.path === "/negative-keywords/query")!.body;
  assert.deepEqual(q.filters, [{ field: "campaignId", operator: "EQUALS", value: ["111111111"] }, { field: "adGroupId", operator: "IS_NULL" }]);
  const ag = await cli(["negatives", "add", "--ad-group-id", "222222222", "--text", "free example", "--match-type", "broad", "--dry-run"], { routes: { "GET /adgroups/222222222": one(AD_GROUP), "POST /negative-keywords/query": list([]) } });
  assert.deepEqual(ag.json().plan.steps[0].body.items[0].data, { adGroupId: 222222222, text: "free example", matchType: "BROAD" });
});
