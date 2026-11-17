import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildProgram } from "../src/cli.js";
import { VERSION } from "../src/constants.js";
import { DOCS } from "../src/commands/shared.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
}

test("no v5 API host or v5 body names anywhere in src", () => {
  for (const f of files(join(ROOT, "src"))) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /api\.searchads\.apple\.com/, f);
    assert.doesNotMatch(s, /\/api\/v5/, f);
    assert.doesNotMatch(s, /\bselector\b|\borderBy\b|returnRecordsWithNoMetrics/, f);
  }
});

test("the base URL appears only in constants.ts", () => {
  for (const f of files(join(ROOT, "src"))) if (!f.endsWith("constants.ts")) assert.doesNotMatch(readFileSync(f, "utf8"), /api\.ads\.apple\.com/, f);
});

test("VERSION matches package.json", () => {
  assert.equal(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, VERSION);
});

test("every leaf command's help names an endpoint path", () => {
  const program = buildProgram({ fetch: (() => { throw new Error("no network"); }) as never, env: {}, stdout: () => {}, stderr: () => {}, now: () => 0, sleep: async () => {}, stdoutIsTTY: false, readStdin: async () => "" });
  const leaves: Command[] = [];
  const walk = (c: Command) => c.commands.forEach((x) => (x.commands.length ? walk(x) : leaves.push(x)));
  walk(program);
  assert.ok(leaves.length > 60, `found ${leaves.length}`);
  for (const l of leaves) {
    if (l.name() === "help") continue;
    assert.ok(DOCS.get(l), `${l.parent?.name()} ${l.name()} has no doc()`);
    let help = "";
    l.configureOutput({ writeOut: (s) => void (help += s) });
    l.outputHelp();
    assert.match(help, /Endpoint: /, `${l.parent?.name()} ${l.name()}`);
  }
});

test("every source file stays under 300 lines", () => {
  for (const f of files(join(ROOT, "src"))) {
    if (f.endsWith("schema-data.ts")) continue;
    const n = readFileSync(f, "utf8").split("\n").length;
    assert.ok(n < 300, `${f} has ${n} lines`);
  }
});
