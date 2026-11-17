#!/usr/bin/env node
import { run } from "./cli.js";

const code = await run(process.argv.slice(2), {
  fetch: globalThis.fetch,
  env: process.env,
  stdout: (s) => void process.stdout.write(s),
  stderr: (s) => void process.stderr.write(s),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  stdoutIsTTY: !!process.stdout.isTTY,
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
});
process.exitCode = code;
