import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { authError, usageError } from "./errors.js";

export type Env = Record<string, string | undefined>;
export type Source = "flag" | "env" | "config" | "acls" | "none";

export interface ProfileConfig {
  clientId?: string;
  teamId?: string;
  keyId?: string;
  privateKeyPath?: string;
  adAccountId?: string;
  orgId?: string;
  protectedCampaignIds?: Array<string | number>;
  allowPauseProtected?: boolean;
  /** Ceilings above which bids and daily budgets need --allow-large (account currency). */
  maxBid?: string | number;
  maxDailyBudget?: string | number;
}

export interface ConfigFile {
  defaultProfile?: string;
  profiles: Record<string, ProfileConfig>;
}

export interface GlobalFlags {
  profile?: string;
  adAccountId?: string;
  config?: string;
}

export interface Settings {
  profile?: string;
  configPath: string;
  configExists: boolean;
  clientId?: string;
  teamId?: string;
  keyId?: string;
  privateKeyPath?: string;
  adAccountId?: string;
  orgId?: string;
  accessToken?: string;
  protectedCampaignIds: string[];
  allowPauseProtected: boolean;
  maxBid?: string;
  maxDailyBudget?: string;
  sources: Record<string, Source>;
}

export function homeDir(env: Env): string {
  return env.HOME || homedir();
}

export function expandHome(p: string, env: Env): string {
  return p === "~" ? homeDir(env) : p.startsWith("~/") ? join(homeDir(env), p.slice(2)) : p;
}

export function defaultConfigPath(env: Env): string {
  if (env.APPLE_ADS_CONFIG) return expandHome(env.APPLE_ADS_CONFIG, env);
  return join(env.XDG_CONFIG_HOME || join(homeDir(env), ".config"), "apple-ads-cli", "config.json");
}

export function cacheDir(env: Env): string {
  return join(env.XDG_CACHE_HOME || join(homeDir(env), ".cache"), "apple-ads-cli");
}

export function legacyCredentialsPath(env: Env): string {
  return join(env.XDG_CONFIG_HOME || join(homeDir(env), ".config"), "apple-ads-cli", "credentials.json");
}

export function isGroupOrOtherReadable(path: string): boolean {
  return (statSync(path).mode & 0o077) !== 0;
}

export function loadConfig(path: string): { exists: boolean; config: ConfigFile } {
  if (!existsSync(path)) return { exists: false, config: { profiles: {} } };
  if (isGroupOrOtherReadable(path)) {
    throw authError(`Config ${path} is readable by group or others`, `run: chmod 600 ${path}`, "CONFIG_PERMISSIONS");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw authError(`Config ${path} is not valid JSON: ${(e as Error).message}`, "fix the file or re-run `auth setup`", "CONFIG_INVALID");
  }
  const c = parsed as Partial<ConfigFile>;
  if (!c || typeof c !== "object" || (c.profiles !== undefined && typeof c.profiles !== "object")) {
    throw authError(`Config ${path} must be an object with a "profiles" map`, undefined, "CONFIG_INVALID");
  }
  return { exists: true, config: { defaultProfile: c.defaultProfile, profiles: c.profiles ?? {} } };
}

export function writeConfig(path: string, config: ConfigFile): void {
  writeSecureFile(path, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Writes a file with mode 600, atomically. The directory is set to mode 700 only when the CLI
 * created it or it is the CLI's own apple-ads-cli directory; a user-chosen directory keeps its mode.
 */
export function writeSecureFile(path: string, content: string): void {
  const dir = dirname(path);
  const created = mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (created !== undefined || basename(dir) === "apple-ads-cli") chmodSync(dir, 0o700);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function looksLikePem(value: string): boolean {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) || /^MI[GH][A-Za-z0-9+/]{20,}/.test(value.trim());
}

/** True when a "path" is really PEM or base64 key text (or anything multi-line). */
export function isKeyContent(value: string): boolean {
  return looksLikePem(value) || /[\r\n]/.test(value);
}

export function resolveProfileName(flags: GlobalFlags, env: Env, config: ConfigFile): { name?: string; source: Source } {
  if (flags.profile) return { name: flags.profile, source: "flag" };
  if (env.APPLE_ADS_PROFILE) return { name: env.APPLE_ADS_PROFILE, source: "env" };
  if (config.defaultProfile) return { name: config.defaultProfile, source: "config" };
  const names = Object.keys(config.profiles);
  if (names.length === 1) return { name: names[0], source: "config" };
  return { name: undefined, source: "none" };
}

const ENV_NAMES = {
  clientId: "APPLE_ADS_CLIENT_ID",
  teamId: "APPLE_ADS_TEAM_ID",
  keyId: "APPLE_ADS_KEY_ID",
  privateKeyPath: "APPLE_ADS_PRIVATE_KEY_PATH",
  adAccountId: "APPLE_ADS_AD_ACCOUNT_ID",
  orgId: "APPLE_ADS_ORG_ID",
} as const;

/** Resolves settings: flag > env > config profile. */
export function resolveSettings(flags: GlobalFlags, env: Env): Settings {
  const configPath = flags.config ? expandHome(flags.config, env) : defaultConfigPath(env);
  const { exists, config } = loadConfig(configPath);
  const pn = resolveProfileName(flags, env, config);
  if (pn.name && pn.source !== "config" && exists && !config.profiles[pn.name] && Object.keys(config.profiles).length > 0) {
    throw usageError(`Profile "${pn.name}" is not in ${configPath}`, `known profiles: ${Object.keys(config.profiles).join(", ")}`);
  }
  const prof: ProfileConfig = (pn.name && config.profiles[pn.name]) || {};
  const sources: Record<string, Source> = { profile: pn.source };
  const s: Settings = {
    profile: pn.name,
    configPath,
    configExists: exists,
    protectedCampaignIds: [],
    allowPauseProtected: prof.allowPauseProtected === true,
    sources,
  };
  for (const [key, envName] of Object.entries(ENV_NAMES) as Array<[keyof typeof ENV_NAMES, string]>) {
    let value: string | undefined;
    let src: Source = "none";
    if (key === "adAccountId" && flags.adAccountId) {
      value = flags.adAccountId;
      src = "flag";
    } else if (env[envName]) {
      value = env[envName];
      src = "env";
    } else if (prof[key] !== undefined && prof[key] !== "") {
      value = String(prof[key]);
      src = "config";
    }
    if (key === "privateKeyPath" && value !== undefined && isKeyContent(value)) {
      // Never echo the value: it is the key itself.
      throw authError(
        `${src === "env" ? envName : "privateKeyPath in the profile"} must be a file path, not the key contents`,
        "save the key to a file with mode 600 and set the path instead",
        "KEY_IS_CONTENT",
      );
    }
    if (value !== undefined) (s as unknown as Record<string, unknown>)[key] = key === "privateKeyPath" ? expandHome(value, env) : value;
    sources[key] = src;
  }
  if (env.APPLE_ADS_ACCESS_TOKEN) {
    s.accessToken = env.APPLE_ADS_ACCESS_TOKEN;
    sources.accessToken = "env";
  }
  for (const [k, envName] of [["maxBid", "APPLE_ADS_MAX_BID"], ["maxDailyBudget", "APPLE_ADS_MAX_DAILY_BUDGET"]] as const) {
    const v = env[envName] ?? (prof[k] !== undefined ? String(prof[k]) : undefined);
    if (v === undefined || v === "") continue;
    if (!/^\d+(\.\d{1,2})?$/.test(v.trim())) throw usageError(`${k} must be an amount such as 10.00 (got "${v}")`, `fix ${envName} or ${k} in the profile`);
    s[k] = v.trim();
  }
  const fromConfig = (prof.protectedCampaignIds ?? []).map(String);
  const fromEnv = (env.APPLE_ADS_PROTECTED_CAMPAIGN_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  s.protectedCampaignIds = [...new Set([...fromConfig, ...fromEnv])];
  return s;
}
