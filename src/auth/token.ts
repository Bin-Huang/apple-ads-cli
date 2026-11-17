import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { SCOPE, TOKEN_EXPIRY_BUFFER_S, TOKEN_URL } from "../constants.js";
import { authError } from "../errors.js";
import { writeSecureFile, type Settings } from "../config.js";
import { makeClientSecret } from "./jwt.js";

export type FetchFn = typeof fetch;

export interface TokenDeps {
  fetch: FetchFn;
  cacheDir: string;
  /** Milliseconds since the epoch. */
  now: () => number;
  debug?: (msg: string) => void;
  timeoutMs?: number;
}

interface CacheEntry {
  access_token: string;
  expires_at: number;
  client_id: string;
}

export function tokenCacheFile(cacheDir: string, clientId: string, keyId: string): string {
  const h = createHash("sha256").update(`${clientId}|${keyId}`).digest("hex").slice(0, 16);
  return join(cacheDir, "tokens", `${h}.json`);
}

export interface TokenState {
  source: "env-token" | "cache" | "none";
  cacheFile?: string;
  expiresAt?: string;
  valid: boolean;
}

export class TokenProvider {
  private memo?: CacheEntry;

  constructor(
    private settings: Settings,
    private deps: TokenDeps,
  ) {}

  get usesEnvToken(): boolean {
    return !!this.settings.accessToken;
  }

  private cacheFile(): string | undefined {
    const { clientId, keyId } = this.settings;
    return clientId && keyId ? tokenCacheFile(this.deps.cacheDir, clientId, keyId) : undefined;
  }

  private nowS(): number {
    return Math.floor(this.deps.now() / 1000);
  }

  private readCache(): CacheEntry | undefined {
    const f = this.cacheFile();
    if (!f || !existsSync(f)) return undefined;
    try {
      if ((statSync(f).mode & 0o077) !== 0) return undefined;
      const e = JSON.parse(readFileSync(f, "utf8")) as CacheEntry;
      if (typeof e.access_token === "string" && typeof e.expires_at === "number" && e.client_id === this.settings.clientId) return e;
    } catch {
      /* ignore a corrupt cache */
    }
    return undefined;
  }

  state(): TokenState {
    if (this.settings.accessToken) return { source: "env-token", valid: true };
    const f = this.cacheFile();
    const e = this.readCache();
    if (!e) return { source: "none", cacheFile: f, valid: false };
    return { source: "cache", cacheFile: f, expiresAt: new Date(e.expires_at * 1000).toISOString(), valid: this.nowS() < e.expires_at };
  }

  async get(): Promise<string> {
    if (this.settings.accessToken) return this.settings.accessToken;
    if (this.memo && this.nowS() < this.memo.expires_at) return this.memo.access_token;
    const cached = this.readCache();
    if (cached && this.nowS() < cached.expires_at) {
      this.memo = cached;
      return cached.access_token;
    }
    return this.refresh();
  }

  /** Drops the cached token (used after a 401). Returns false when nothing can be refreshed. */
  invalidate(): boolean {
    if (this.settings.accessToken) return false;
    this.memo = undefined;
    const f = this.cacheFile();
    if (f && existsSync(f)) unlinkSync(f);
    return true;
  }

  async refresh(): Promise<string> {
    const { clientId, teamId, keyId, privateKeyPath } = this.settings;
    const missing = Object.entries({ clientId, teamId, keyId, privateKeyPath })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      throw authError(`Missing credentials: ${missing.join(", ")}`, "run `apple-ads-cli auth setup` (see `auth status`)", "NO_CREDENTIALS");
    }
    const secret = makeClientSecret({ clientId: clientId!, teamId: teamId!, keyId: keyId!, privateKeyPath: privateKeyPath! });
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: secret, scope: SCOPE });
    this.deps.debug?.(`POST ${TOKEN_URL} (client-secret JWT redacted)`);
    let res: Response;
    try {
      res = await this.deps.fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.deps.timeoutMs ?? 30_000),
      });
    } catch (e) {
      throw authError(`Token request failed: ${(e as Error).message}`, "check the network, then run `auth doctor`", "TOKEN_EXCHANGE_FAILED");
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* non-JSON */
    }
    this.deps.debug?.(`token response ${res.status} (body redacted)`);
    if (!res.ok || typeof json.access_token !== "string") {
      const err = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
      const desc = typeof json.error_description === "string" ? `: ${json.error_description}` : "";
      throw authError(
        `Token exchange failed (${err}${desc})`,
        err === "invalid_client" ? "check clientId, teamId, keyId and that the public key is uploaded in Apple Ads" : "run `apple-ads-cli auth doctor`",
        "TOKEN_EXCHANGE_FAILED",
      );
    }
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
    const entry: CacheEntry = { access_token: json.access_token, expires_at: this.nowS() + expiresIn - TOKEN_EXPIRY_BUFFER_S, client_id: clientId! };
    this.memo = entry;
    const f = this.cacheFile();
    if (f) writeSecureFile(f, JSON.stringify(entry));
    return entry.access_token;
  }
}

/** Deletes cached tokens: one profile's, or all of them. Returns how many were removed. */
export function clearTokenCache(cacheDir: string, file?: string): number {
  if (file) {
    if (existsSync(file)) {
      unlinkSync(file);
      return 1;
    }
    return 0;
  }
  const dir = join(cacheDir, "tokens");
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".json")) {
      unlinkSync(join(dir, f));
      n++;
    }
  }
  return n;
}
