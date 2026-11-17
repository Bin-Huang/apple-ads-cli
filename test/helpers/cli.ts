import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../src/cli.js";
import { mockFetch, type Mock, type Route } from "./mock-fetch.js";

export const NOW = Date.parse("2026-11-16T20:00:00.000Z");
export const ACCOUNT = { id: 123456789, name: "Example", orgId: 987654321, timezone: "America/Los_Angeles", currency: "USD", paymentModel: "PAYG", systemStatus: "ACTIVE", systemStatusReasons: [] };

const homes: string[] = [];
process.on("exit", () => {
  for (const home of homes) rmSync(home, { recursive: true, force: true });
});

/** A new empty home directory, removed when the test process exits. */
export function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "aac-test-"));
  homes.push(home);
  return home;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  mock: Mock;
  json(): any;
  err(): any;
  sleeps: number[];
}

export interface RunOpts {
  routes?: Record<string, Route>;
  env?: Record<string, string | undefined>;
  stdin?: string;
  now?: number;
  /** Do not add the default account route. */
  noAccount?: boolean;
}

/** Runs the CLI in-process with a mocked fetch, a fixed clock and a temp HOME. */
export async function cli(argv: string[], opts: RunOpts = {}): Promise<RunResult> {
  const home = opts.env?.HOME ?? tempHome();
  const routes: Record<string, Route> = { ...(opts.noAccount ? {} : { "GET /ad-accounts/123456789": { json: { result: ACCOUNT } } }), ...(opts.routes ?? {}) };
  const mock = mockFetch(routes);
  let stdout = "";
  let stderr = "";
  const sleeps: number[] = [];
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    APPLE_ADS_ACCESS_TOKEN: "test-access-token",
    APPLE_ADS_AD_ACCOUNT_ID: "123456789",
    ...opts.env,
  };
  for (const k of Object.keys(env)) if ((env as Record<string, string | undefined>)[k] === undefined) delete (env as Record<string, string | undefined>)[k];
  const code = await run(argv, {
    fetch: mock.fetch,
    env,
    stdout: (s) => void (stdout += s),
    stderr: (s) => void (stderr += s),
    now: () => opts.now ?? NOW,
    sleep: async (ms) => void sleeps.push(ms),
    stdoutIsTTY: false,
    readStdin: async () => opts.stdin ?? "",
  });
  return {
    code,
    stdout,
    stderr,
    mock,
    sleeps,
    json: () => JSON.parse(stdout),
    err: () => JSON.parse(stderr.split("\n").filter((l) => l.startsWith("{")).pop() ?? "{}"),
  };
}

export const list = (result: unknown[], totalCount = result.length) => ({ json: { result, pagination: { offset: 0, pageSize: result.length, totalCount } } });
export const one = (result: unknown) => ({ json: { result } });
