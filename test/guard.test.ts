import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNotProtected, scanForProtected } from "../src/guard.js";
import { cli, one } from "./helpers/cli.js";
import { AD_GROUP, CAMPAIGN, KEYWORD } from "./fixtures.js";

const P = { protectedCampaignIds: ["111111111"], allowPauseProtected: false };

test("protected campaign and children are refused with exit 6", () => {
  assert.throws(() => assertNotProtected([{ type: "campaign", id: "111111111" }], P, false), (e: any) => e.exitCode === 6 && e.code === "PROTECTED");
  assert.throws(() => assertNotProtected([{ type: "keyword", id: "3", campaignId: "111111111" }], P, false), (e: any) => e.exitCode === 6);
  assert.doesNotThrow(() => assertNotProtected([{ type: "campaign", id: "999" }], P, false));
  assert.doesNotThrow(() => assertNotProtected([{ type: "campaign", id: "111111111" }], { protectedCampaignIds: [], allowPauseProtected: false }, false));
});

test("allowPauseProtected lets reduce-only writes through, never others", () => {
  const allow = { ...P, allowPauseProtected: true };
  assert.doesNotThrow(() => assertNotProtected([{ type: "campaign", id: "111111111" }], allow, true));
  assert.throws(() => assertNotProtected([{ type: "campaign", id: "111111111" }], allow, false), (e: any) => e.exitCode === 6);
});

test("raw api scan finds IDs in the path and body", () => {
  assert.deepEqual(scanForProtected("/campaigns/111111111", undefined, ["111111111"]), ["111111111"]);
  assert.deepEqual(scanForProtected("/adgroups", { campaignId: 111111111 }, ["111111111"]), ["111111111"]);
  assert.deepEqual(scanForProtected("/adgroups", { campaignId: 2 }, ["111111111"]), []);
});

const ENV = { APPLE_ADS_PROTECTED_CAMPAIGN_IDS: "111111111" };

test("command level: children resolved by GET are refused before any write; env IDs count", async () => {
  const r = await cli(["keywords", "update", "333333333", "--bid", "0.55", "--confirm"], { env: ENV, routes: { "GET /keywords/333333333": one(KEYWORD) } });
  assert.equal(r.code, 6);
  assert.equal(r.err().error.code, "PROTECTED");
  assert.equal(r.mock.writes().length, 0);
  assert.equal(r.stdout, "");
  const ag = await cli(["ad-groups", "pause", "222222222", "--dry-run"], { env: ENV, routes: { "GET /adgroups/222222222": one(AD_GROUP) } });
  assert.equal(ag.code, 6);
  const c = await cli(["campaigns", "resume", "111111111", "--confirm"], { env: ENV, routes: { "GET /campaigns/111111111": one(CAMPAIGN) } });
  assert.equal(c.code, 6);
  assert.equal(c.mock.writes().length, 0);
});

test("raw api writes to a child of a protected campaign are refused", async () => {
  const r = await cli(["api", "PUT", "/adgroups/222222222", "--data", '{"name":"x"}', "--confirm"], { env: ENV, routes: { "GET /adgroups/222222222": one(AD_GROUP) } });
  assert.equal(r.code, 6);
  const b = await cli(["api", "POST", "/keywords/bulk-update", "--data", '{"items":[{"correlationId":0,"data":{"id":333333333,"status":"PAUSED"}}]}', "--confirm"], { env: ENV, routes: { "GET /keywords/333333333": one(KEYWORD) } });
  assert.equal(b.code, 6);
  assert.equal(b.mock.writes().length, 0);
});
