// Optional live smoke test (read-only). Runs only with APPLE_ADS_LIVE=1 and a configured profile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");
const live = process.env.APPLE_ADS_LIVE === "1";
const run = (args: string[]) => spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8", env: process.env, timeout: 120_000 });

test("live read-only smoke", { skip: !live && "set APPLE_ADS_LIVE=1 to run" }, () => {
  const d = run(["auth", "doctor"]);
  assert.equal(d.status, 0, d.stdout + d.stderr);
  assert.equal(JSON.parse(d.stdout).ok, true);
  const me = JSON.parse(run(["me"]).stdout);
  assert.ok(me.result.userId);
  const c = JSON.parse(run(["campaigns", "list", "--limit", "1"]).stdout);
  assert.ok(Array.isArray(c.result));
  assert.equal(typeof c.pagination.truncated, "boolean");
  const r = JSON.parse(run(["reports", "campaigns", "--last", "7d"]).stdout);
  assert.ok(Array.isArray(r.result.rows));
  assert.ok(r.cli.timeRange.start);
});
