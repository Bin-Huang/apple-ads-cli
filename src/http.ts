import {
  API_BASE,
  PACING_MAX_WAIT_S,
  PACING_REMAINING_THRESHOLD,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_WAIT_S,
  VERSION,
  isNoContextPath,
} from "./constants.js";
import { CliError, ExitCode, parseApiError } from "./errors.js";

export type QueryValue = string | number | boolean | undefined | Array<string | number>;

export interface RequestOpts {
  method: string;
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Defaults from the path: account context unless the path is in the no-context list. */
  context?: "account" | "none";
  /** Defaults to "read" for GET and /query paths, else "write". */
  retry?: "read" | "write";
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  json: any;
  requestId?: string;
}

export interface TokenSource {
  get(): Promise<string>;
  invalidate(): boolean;
  readonly usesEnvToken?: boolean;
}

export interface Logger {
  debug(msg: string): void;
  note(msg: string): void;
  readonly debugEnabled: boolean;
}

export interface ClientDeps {
  fetch: typeof fetch;
  tokens: TokenSource;
  adAccountId: () => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  log?: Logger;
}

/** The path that fetch actually sends, relative to /v1 (query string and fragment removed, dots resolved). */
export function sentPathname(path: string): string {
  return new URL(buildUrl(path)).pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
}

/** Classifies by the URL that is actually sent, so a fragment or dot segment cannot turn a write into a read. */
export function isReadRequest(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || (m === "POST" && /\/query$/.test(sentPathname(path)));
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const p = "/" + path.replace(/^\/+/, "").replace(/^v1\//, "");
  const url = new URL(API_BASE + p);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const x of v) url.searchParams.append(k, String(x));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function normalizePath(path: string): string {
  return "/" + path.replace(/^\/+/, "").replace(/^v1\//, "");
}

function family(path: string): string {
  const parts = normalizePath(path).split("?")[0]!.split("/").filter(Boolean);
  const grouped = ["reports", "insights", "suggestions", "recommendations", "search", "eligibilities"];
  return grouped.includes(parts[0] ?? "") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
}

function numHeader(h: Headers, name: string): number | undefined {
  const v = h.get(name);
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export class Client {
  private pacing = new Map<string, { remaining: number; reset: number }>();

  constructor(private deps: ClientDeps) {}

  async request(opts: RequestOpts): Promise<ApiResponse> {
    const method = opts.method.toUpperCase();
    const path = normalizePath(opts.path);
    const context = opts.context ?? (isNoContextPath(method, path) ? "none" : "account");
    const retry = opts.retry ?? (isReadRequest(method, path) ? "read" : "write");
    const url = buildUrl(path, opts.query);
    if (opts.body !== undefined && (method === "GET" || method === "HEAD")) {
      throw new CliError({ exitCode: ExitCode.USAGE, code: "USAGE", message: `${method} requests cannot have a body`, hint: "drop --data/--file, or use POST for /query endpoints" });
    }
    const fam = family(path);
    const log = this.deps.log;
    let refreshed = false;
    let attempt = 0;

    for (;;) {
      const pace = this.pacing.get(fam);
      if (pace && pace.remaining < PACING_REMAINING_THRESHOLD && pace.reset > 0) {
        const wait = Math.min(pace.reset, PACING_MAX_WAIT_S);
        log?.note(`rate limit nearly used for ${fam}; waiting ${wait}s`);
        await this.deps.sleep(wait * 1000);
        this.pacing.delete(fam);
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await this.deps.tokens.get()}`,
        Accept: "application/json",
        "User-Agent": `apple-ads-cli/${VERSION}`,
      };
      if (context === "account") headers["X-AP-Context"] = `adAccountId=${await this.deps.adAccountId()}`;
      let bodyText: string | undefined;
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        bodyText = JSON.stringify(opts.body);
      }
      if (log?.debugEnabled) {
        const shown = { ...headers, Authorization: "Bearer ***" };
        log.debug(`${method} ${url} headers=${JSON.stringify(shown)}${bodyText ? ` body=${bodyText}` : ""}`);
      }
      const started = Date.now();
      let res: Response;
      try {
        res = await this.deps.fetch(url, { method, headers, body: bodyText, signal: AbortSignal.timeout(this.deps.timeoutMs) });
      } catch (e) {
        const name = (e as Error).name;
        const isTimeout = name === "TimeoutError" || name === "AbortError";
        if (retry === "read" && attempt < RETRY_MAX_ATTEMPTS - 1) {
          const wait = Math.min(RETRY_MAX_WAIT_S, 2 ** attempt);
          log?.note(`${isTimeout ? "timeout" : "network error"} on ${method} ${path}; retrying in ${wait}s`);
          await this.deps.sleep(wait * 1000);
          attempt++;
          continue;
        }
        throw new CliError({
          exitCode: ExitCode.RATE_LIMIT,
          code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
          message: isTimeout ? `${method} ${path} timed out` : `${method} ${path} failed: ${(e as Error).message}`,
          hint: retry === "write" ? "a write may or may not have been applied; list before retrying" : "raise --timeout or retry later",
        });
      }
      const text = await res.text();
      const requestId = res.headers.get("apple-request-id") ?? res.headers.get("x-request-id") ?? undefined;
      const ctype = res.headers.get("content-type") ?? "";
      let json: unknown = undefined;
      if (text.length > 0 && /json/i.test(ctype)) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      } else if (text.length > 0 && !ctype) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      const remaining = numHeader(res.headers, "ratelimit-remaining");
      const reset = numHeader(res.headers, "ratelimit-reset");
      if (remaining !== undefined) this.pacing.set(fam, { remaining, reset: reset ?? 1 });
      if (log?.debugEnabled) {
        log.debug(
          `-> ${res.status} in ${Date.now() - started}ms request-id=${requestId ?? "-"} ratelimit=${res.headers.get("ratelimit-remaining") ?? "-"}/${res.headers.get("ratelimit-limit") ?? "-"} reset=${res.headers.get("ratelimit-reset") ?? "-"}`,
        );
      }
      if (res.ok) return { status: res.status, headers: res.headers, json: json ?? {}, requestId };

      if (res.status === 401 && !refreshed && this.deps.tokens.invalidate()) {
        refreshed = true;
        log?.note("access token rejected; refreshing once");
        continue;
      }
      const retryable = res.status === 429 || (retry === "read" && [500, 502, 503, 504].includes(res.status));
      if (retryable && attempt < RETRY_MAX_ATTEMPTS - 1) {
        const retryAfter = numHeader(res.headers, "retry-after");
        const wait = retryAfter !== undefined ? Math.min(retryAfter, PACING_MAX_WAIT_S) : Math.min(RETRY_MAX_WAIT_S, (reset ?? 1) * 2 ** attempt);
        log?.note(`HTTP ${res.status} on ${method} ${path}; retrying in ${wait}s`);
        await this.deps.sleep(Math.max(0, wait) * 1000);
        attempt++;
        continue;
      }
      const err = parseApiError(res.status, json ?? text, requestId);
      if (res.status === 401 && this.deps.tokens.usesEnvToken) {
        err.hint = "APPLE_ADS_ACCESS_TOKEN is set and is used as given; unset it so the CLI can sign in with the key";
      }
      throw err;
    }
  }
}
