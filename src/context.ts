import type { Command } from "commander";
import { cacheDir, resolveSettings, type Env, type Settings } from "./config.js";
import { TokenProvider } from "./auth/token.js";
import { Client } from "./http.js";
import { Out, type Format } from "./output.js";
import { authError, usageError } from "./errors.js";
import { dateIn } from "./time.js";

export interface Deps {
  fetch: typeof fetch;
  env: Env;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  stdoutIsTTY: boolean;
  readStdin: () => Promise<string>;
}

export interface GlobalOpts {
  profile?: string;
  adAccountId?: string;
  output?: string;
  pretty?: boolean;
  debug?: boolean;
  config?: string;
  timeout?: string;
}

export class Ctx {
  readonly out: Out;
  private _settings?: Settings;
  private _tokens?: TokenProvider;
  private _client?: Client;
  private _adAccountId?: Promise<string>;
  private _account?: Promise<any>;

  constructor(
    readonly deps: Deps,
    readonly globals: GlobalOpts,
  ) {
    const format = (globals.output ?? "json") as Format;
    if (format !== "json" && format !== "table") throw usageError(`--output must be json or table (got ${globals.output})`);
    this.out = new Out({
      stdout: deps.stdout,
      stderr: deps.stderr,
      format,
      pretty: globals.pretty ?? deps.stdoutIsTTY,
      debug: !!globals.debug || deps.env.APPLE_ADS_DEBUG === "1",
    });
  }

  get env(): Env {
    return this.deps.env;
  }

  get settings(): Settings {
    this._settings ??= resolveSettings({ profile: this.globals.profile, adAccountId: this.globals.adAccountId, config: this.globals.config }, this.deps.env);
    return this._settings;
  }

  get timeoutMs(): number {
    const t = Number(this.globals.timeout ?? 60);
    if (!Number.isFinite(t) || t <= 0) throw usageError("--timeout must be a positive number of seconds");
    return t * 1000;
  }

  get tokens(): TokenProvider {
    this._tokens ??= new TokenProvider(this.settings, {
      fetch: this.deps.fetch,
      cacheDir: cacheDir(this.deps.env),
      now: this.deps.now,
      debug: (m) => this.out.debug(m),
      timeoutMs: this.timeoutMs,
    });
    return this._tokens;
  }

  get client(): Client {
    this._client ??= new Client({
      fetch: this.deps.fetch,
      tokens: this.tokens,
      adAccountId: () => this.adAccountId(),
      sleep: this.deps.sleep,
      timeoutMs: this.timeoutMs,
      log: this.out,
    });
    return this._client;
  }

  /** The ad account ID: flag > env > profile, else the only entry in /acls. */
  adAccountId(): Promise<string> {
    this._adAccountId ??= (async () => {
      const id = this.settings.adAccountId;
      if (id) return id;
      const res = await this.client.request({ method: "GET", path: "/acls", context: "none" });
      const acls: any[] = res.json?.result?.acls ?? [];
      const ids = acls.map((a) => String(a?.adAccount?.id)).filter((x) => x && x !== "undefined");
      if (ids.length === 1) {
        this.out.note(`using ad account ${ids[0]} (the only one in /acls); set it with --ad-account-id or auth setup`);
        this.settings.sources.adAccountId = "acls";
        this.settings.adAccountId = ids[0];
        return ids[0]!;
      }
      if (ids.length === 0) throw authError("No ad accounts are visible to these credentials", "check the API user's role in Apple Ads", "NO_AD_ACCOUNT");
      throw authError(
        `Several ad accounts are visible (${ids.join(", ")}); pick one`,
        "pass --ad-account-id <id>, set APPLE_ADS_AD_ACCOUNT_ID, or add adAccountId to the profile",
        "AD_ACCOUNT_REQUIRED",
      );
    })();
    return this._adAccountId;
  }

  /** GET /ad-accounts/{id}, memoised: currency and time zone. */
  account(): Promise<any> {
    this._account ??= (async () => {
      const id = await this.adAccountId();
      const res = await this.client.request({ method: "GET", path: `/ad-accounts/${id}` });
      return res.json?.result ?? {};
    })();
    return this._account;
  }

  async currency(): Promise<string> {
    const c = (await this.account())?.currency;
    if (!c) throw authError("Could not read the ad account currency", "run `apple-ads-cli accounts get`");
    return c;
  }

  async timeZone(): Promise<string> {
    return (await this.account())?.timezone ?? "UTC";
  }

  async today(): Promise<string> {
    return dateIn(await this.timeZone(), this.deps.now());
  }
}

export type Handler = (ctx: Ctx, opts: any, args: string[]) => Promise<void>;

/** Wraps a handler so it receives the context, its options and its positional args. */
export function act(deps: Deps, handler: Handler) {
  return async (...a: unknown[]) => {
    const cmd = a[a.length - 1] as Command;
    const opts = cmd.opts();
    const globals = cmd.optsWithGlobals() as GlobalOpts;
    const args = a.slice(0, -2).flatMap((x) => (Array.isArray(x) ? x.map(String) : x === undefined ? [] : [String(x)]));
    const ctx = new Ctx(deps, globals);
    await handler(ctx, opts, args);
  };
}
