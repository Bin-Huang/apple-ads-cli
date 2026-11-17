import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { TokenProvider, tokenCacheFile } from "../src/auth/token.js";
import type { Settings } from "../src/config.js";
import { mockFetch } from "./helpers/mock-fetch.js";
import { cli, tempHome } from "./helpers/cli.js";
import { writeKey } from "./helpers/keys.js";

function settings(keyPath: string, extra: Partial<Settings> = {}): Settings {
  return { configPath: "/x", configExists: false, clientId: "SEARCHADS.client", teamId: "SEARCHADS.team", keyId: "key-1", privateKeyPath: keyPath, protectedCampaignIds: [], allowPauseProtected: false, sources: {}, ...extra };
}
const TOKEN_ROUTE = "POST appleid.apple.com/auth/oauth2/token";

test("token exchange: form body, URL, mode-600 cache, reuse before expiry, refresh after", async () => {
  const home = tempHome();
  const { path } = writeKey(home);
  let n = 0;
  const m = mockFetch({ [TOKEN_ROUTE]: () => ({ json: { access_token: `tok-${++n}`, token_type: "Bearer", expires_in: 3600 } }) });
  let now = 1_800_000_000_000;
  const cacheDir = join(home, "cache");
  const tp = new TokenProvider(settings(path), { fetch: m.fetch, cacheDir, now: () => now });
  assert.equal(await tp.get(), "tok-1");
  const call = m.calls[0]!;
  assert.equal(call.url, "https://appleid.apple.com/auth/oauth2/token");
  assert.equal(call.headers["content-type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(call.rawBody!);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("client_id"), "SEARCHADS.client");
  assert.equal(form.get("scope"), "searchadsorg");
  assert.equal(form.get("client_secret")!.split(".").length, 3);
  const file = tokenCacheFile(cacheDir, "SEARCHADS.client", "key-1");
  assert.ok(existsSync(file));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(file)).mode & 0o777, 0o700);
  assert.ok(!file.includes("SEARCHADS"), "file name holds no identifier");
  const cached = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(cached.expires_at, 1_800_000_000 + 3600 - 60);
  // A new provider (new process) reuses the cache.
  const tp2 = new TokenProvider(settings(path), { fetch: m.fetch, cacheDir, now: () => now });
  now += 3000 * 1000;
  assert.equal(await tp2.get(), "tok-1");
  assert.equal(m.calls.length, 1);
  now += 600 * 1000; // past expires_in - 60
  assert.equal(await tp2.get(), "tok-2");
  assert.equal(m.calls.length, 2);
  // invalidate drops the cache file
  assert.equal(tp2.invalidate(), true);
  assert.ok(!existsSync(file));
});

test("a failed exchange is exit 3 with Apple's error, never the secret", async () => {
  const home = tempHome();
  const { path } = writeKey(home);
  const m = mockFetch({ [TOKEN_ROUTE]: { status: 400, json: { error: "invalid_client" } } });
  const tp = new TokenProvider(settings(path), { fetch: m.fetch, cacheDir: join(home, "c"), now: () => Date.now() });
  await assert.rejects(tp.get(), (e: any) => e.exitCode === 3 && /invalid_client/.test(e.message) && !/eyJ/.test(e.message));
});

test("env token escape hatch is used as given and cannot refresh", async () => {
  const m = mockFetch({});
  const tp = new TokenProvider(settings("/none", { accessToken: "pre-made" }), { fetch: m.fetch, cacheDir: "/tmp/none", now: () => 0 });
  assert.equal(await tp.get(), "pre-made");
  assert.equal(tp.invalidate(), false);
  assert.equal(tp.state().source, "env-token");
});

test("--debug output never contains the access token or the client secret", async () => {
  const home = tempHome();
  const { path } = writeKey(home);
  const r = await cli(["--debug", "me"], {
    env: { HOME: home, APPLE_ADS_ACCESS_TOKEN: undefined, APPLE_ADS_CLIENT_ID: "SEARCHADS.client", APPLE_ADS_TEAM_ID: "SEARCHADS.team", APPLE_ADS_KEY_ID: "key-1", APPLE_ADS_PRIVATE_KEY_PATH: path },
    routes: { [TOKEN_ROUTE]: { json: { access_token: "SECRET-TOKEN-VALUE", expires_in: 3600 } }, "GET /me": { json: { result: { userId: 1, orgId: 2 } } } },
  });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /Bearer \*\*\*/);
  assert.doesNotMatch(r.stderr + r.stdout, /SECRET-TOKEN-VALUE/);
  assert.doesNotMatch(r.stderr, /eyJ/);
  assert.equal(r.mock.calls[1]!.headers.authorization, "Bearer SECRET-TOKEN-VALUE");
});
