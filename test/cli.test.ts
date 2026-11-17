// Runs the compiled entry point as a child process with no network access needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tempHome } from "./helpers/cli.js";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");
function run(args: string[]) {
  const home = tempHome();
  // An unroutable proxy and no credentials: any network call would fail loudly.
  const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, "c"), XDG_CACHE_HOME: join(home, "k"), HTTPS_PROXY: "http://127.0.0.1:9" };
  return spawnSync(process.execPath, [ENTRY, ...args], { env, encoding: "utf8", timeout: 20_000 });
}

test("--help and --version work offline", () => {
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Exit codes: 0 ok/);
  const v = run(["--version"]);
  assert.equal(v.status, 0);
  assert.match(v.stdout.trim(), /^2\.\d+\.\d+$/);
  assert.equal(run(["-V"]).stdout, v.stdout);
  const leaf = run(["reports", "keywords", "--help"]);
  assert.equal(leaf.status, 0);
  assert.match(leaf.stdout, /Endpoint: POST \/v1\/reports\/apps\/keywords\/query/);
});

test("schema exit-codes works offline", () => {
  const r = run(["schema", "exit-codes"]);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).result.length, 7);
});

test("unknown command: exit 2 with a suggestion as JSON on stderr", () => {
  const r = run(["campagns", "list"]);
  assert.equal(r.status, 2);
  const e = JSON.parse(r.stderr).error;
  assert.equal(e.code, "USAGE");
  assert.match(e.message, /Did you mean campaigns/);
  assert.equal(r.stdout, "");
});

test("usage errors are JSON on stderr with exit 2", () => {
  const r = run(["keywords", "list"]);
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stderr).error.message, /--campaign-id or --ad-group-id/);
  const m = run(["reports", "keywords"]);
  assert.equal(m.status, 2);
  assert.match(JSON.parse(m.stderr).error.message, /--campaign-id/);
});

test("no credentials: exit 3 with a setup hint, no stack trace", () => {
  const r = run(["campaigns", "list"]);
  assert.equal(r.status, 3);
  const e = JSON.parse(r.stderr.trim().split("\n").pop()!).error;
  assert.match(e.hint, /auth setup/);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});
