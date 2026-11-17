import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSettings, writeConfig } from "../src/config.js";
import { cli, tempHome } from "./helpers/cli.js";
import { writeKey } from "./helpers/keys.js";

function cfg(home: string, profiles: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const path = join(home, "config.json");
  writeConfig(path, { profiles: profiles as never, ...extra });
  return path;
}

test("precedence: flag > env > config, with sources", () => {
  const home = tempHome();
  const path = cfg(home, { main: { clientId: "C-file", teamId: "T-file", keyId: "K-file", privateKeyPath: "~/k.pem", adAccountId: "111", protectedCampaignIds: [5] } });
  const s = resolveSettings({ config: path, adAccountId: "333" }, { HOME: home, APPLE_ADS_AD_ACCOUNT_ID: "222", APPLE_ADS_TEAM_ID: "T-env", APPLE_ADS_PROTECTED_CAMPAIGN_IDS: "6, 7" });
  assert.equal(s.profile, "main");
  assert.equal(s.adAccountId, "333");
  assert.equal(s.sources.adAccountId, "flag");
  assert.equal(s.teamId, "T-env");
  assert.equal(s.sources.teamId, "env");
  assert.equal(s.clientId, "C-file");
  assert.equal(s.sources.clientId, "config");
  assert.equal(s.privateKeyPath, join(home, "k.pem"));
  assert.deepEqual(s.protectedCampaignIds, ["5", "6", "7"], "env IDs are added, never replace");
  const s2 = resolveSettings({ config: path }, { HOME: home, APPLE_ADS_AD_ACCOUNT_ID: "222" });
  assert.equal(s2.adAccountId, "222");
});

test("config written with mode 600 in a 700 dir; group-readable config refused (exit 3)", () => {
  const home = tempHome();
  const path = cfg(home, { main: {} });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  chmodSync(path, 0o644);
  assert.throws(() => resolveSettings({ config: path }, { HOME: home }), (e: any) => e.exitCode === 3 && /chmod 600/.test(e.hint));
});

test("profile selection: --profile, env, defaultProfile, single profile; unknown profile is a usage error", () => {
  const home = tempHome();
  const path = cfg(home, { a: { adAccountId: "1" }, b: { adAccountId: "2" } }, { defaultProfile: "b" });
  assert.equal(resolveSettings({ config: path }, { HOME: home }).adAccountId, "2");
  assert.equal(resolveSettings({ config: path }, { HOME: home, APPLE_ADS_PROFILE: "a" }).adAccountId, "1");
  assert.equal(resolveSettings({ config: path, profile: "b" }, { HOME: home, APPLE_ADS_PROFILE: "a" }).adAccountId, "2");
  assert.throws(() => resolveSettings({ config: path, profile: "zz" }, { HOME: home }), (e: any) => e.exitCode === 2);
});

test("auth setup refuses PEM contents as --private-key and stores only the path", async () => {
  const home = tempHome();
  const r = await cli(["auth", "setup", "--client-id", "SEARCHADS.c", "--team-id", "SEARCHADS.t", "--key-id", "k", "--private-key", ["-----BEGIN", "EC PRIVATE KEY-----\nMHcCAQEE\n-----END", "EC PRIVATE KEY-----"].join(" ")], { env: { HOME: home } });
  assert.equal(r.code, 2);
  assert.match(r.err().error.message, /file path/);
  const { path } = writeKey(home);
  const ok = await cli(["auth", "setup", "--client-id", "SEARCHADS.c", "--team-id", "SEARCHADS.t", "--key-id", "k", "--private-key", path, "--no-verify", "--protect", "111111111"], { env: { HOME: home } });
  assert.equal(ok.code, 0, ok.stderr);
  const st = await cli(["auth", "status"], { env: { HOME: home, APPLE_ADS_ACCESS_TOKEN: undefined, APPLE_ADS_AD_ACCOUNT_ID: undefined } });
  const res = st.json().result;
  assert.equal(res.settings.privateKeyPath.value, path);
  assert.deepEqual(res.protectedCampaignIds, ["111111111"]);
  assert.equal(res.key.mode, "600");
  assert.doesNotMatch(st.stdout, /BEGIN/);
});

test("ad account fallback to /acls: one account is used, several is exit 3", async () => {
  const one = await cli(["campaigns", "list"], {
    env: { APPLE_ADS_AD_ACCOUNT_ID: undefined },
    routes: { "GET /acls": { json: { result: { acls: [{ roles: ["API Campaign Manager"], adAccount: { id: 123456789, name: "x", orgId: 1 } }] } } }, "POST /campaigns/query": { json: { result: [], pagination: { totalCount: 0 } } } },
  });
  assert.equal(one.code, 0, one.stderr);
  assert.match(one.stderr, /only one in \/acls/);
  assert.equal(one.mock.calls[1]!.headers["x-ap-context"], "adAccountId=123456789");
  const many = await cli(["campaigns", "list"], {
    env: { APPLE_ADS_AD_ACCOUNT_ID: undefined },
    routes: { "GET /acls": { json: { result: { acls: [{ adAccount: { id: 1 } }, { adAccount: { id: 2 } }] } } } },
  });
  assert.equal(many.code, 3);
  assert.equal(many.err().error.code, "AD_ACCOUNT_REQUIRED");
});

test("auth status warns about a legacy v1.x credentials.json and the env token", async () => {
  const home = tempHome();
  mkdirSync(join(home, ".config", "apple-ads-cli"), { recursive: true });
  writeFileSync(join(home, ".config", "apple-ads-cli", "credentials.json"), "{}", { mode: 0o600 });
  const r = await cli(["auth", "status"], { env: { HOME: home } });
  const w = r.json().result.warnings.join(" ");
  assert.match(w, /credentials\.json/);
  assert.match(w, /APPLE_ADS_ACCESS_TOKEN/);
  assert.doesNotMatch(r.stdout, /test-access-token/);
});
