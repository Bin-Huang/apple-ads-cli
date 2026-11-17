import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { act, Ctx, type Deps } from "../context.js";
import { cacheDir, defaultConfigPath, expandHome, isKeyContent, legacyCredentialsPath, loadConfig, resolveSettings, writeConfig, type ProfileConfig } from "../config.js";
import { keyFileIsLoose, loadPrivateKey, makeClientSecret } from "../auth/jwt.js";
import { clearTokenCache, TokenProvider } from "../auth/token.js";
import { authError, toCliError, usageError } from "../errors.js";
import { doc } from "./shared.js";

const collect = (v: string, prev: string[] = []) => [...prev, v];

function keyInfo(path: string | undefined) {
  if (!path) return { path: null, exists: false };
  if (!existsSync(path)) return { path, exists: false };
  const mode = (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
  return { path, exists: true, mode, readableByOthers: keyFileIsLoose(path) };
}

function warnings(ctx: Ctx): string[] {
  const w: string[] = [];
  if (existsSync(legacyCredentialsPath(ctx.env))) w.push("a v1.x credentials.json exists; 2.0 does not read it (see CHANGELOG migration notes) and it can be deleted");
  if (ctx.env.APPLE_ADS_ACCESS_TOKEN) w.push("APPLE_ADS_ACCESS_TOKEN is set: it is used as given, with no refresh");
  return w;
}

export function registerAuth(program: Command, deps: Deps): void {
  const g = program.command("auth").description("Set up and check credentials (never prints secrets)");

  const setup = g
    .command("setup")
    .description("Save a profile (key path, not contents), get a token and pick the ad account")
    .requiredOption("--client-id <id>", "SEARCHADS.<uuid> from Apple Ads > Account Settings > API")
    .requiredOption("--team-id <id>", "SEARCHADS.<uuid>")
    .requiredOption("--key-id <id>", "key ID (uuid)")
    .requiredOption("--private-key <path>", "path to the EC P-256 private key PEM (the path is stored, never the key)")
    .option("--name <profile>", "profile name", "default")
    .option("--org-id <id>", "org ID (optional, informational)")
    .option("--protect <campaignId>", "add a protected campaign ID (repeatable)", collect)
    .option("--no-verify", "write the profile without calling Apple");
  setup.action(
    act(deps, async (ctx, o) => {
      if (isKeyContent(o.privateKey)) throw usageError("--private-key takes a file path, not the key contents", "save the key to a file with mode 600 and pass its path");
      const keyPath = resolve(expandHome(o.privateKey, ctx.env));
      loadPrivateKey(keyPath);
      if (keyFileIsLoose(keyPath)) ctx.out.note(`key file ${keyPath} is readable by group or others; run: chmod 600 ${keyPath}`);
      const configPath = ctx.globals.config ? expandHome(ctx.globals.config, ctx.env) : defaultConfigPath(ctx.env);
      const { config } = loadConfig(configPath);
      const prev: ProfileConfig = config.profiles[o.name] ?? {};
      const profile: ProfileConfig = {
        clientId: o.clientId,
        teamId: o.teamId,
        keyId: o.keyId,
        privateKeyPath: keyPath,
        ...(ctx.globals.adAccountId ?? prev.adAccountId ? { adAccountId: ctx.globals.adAccountId ?? prev.adAccountId } : {}),
        ...(o.orgId ?? prev.orgId ? { orgId: o.orgId ?? prev.orgId } : {}),
        protectedCampaignIds: [...new Set([...(prev.protectedCampaignIds ?? []).map(String), ...(o.protect ?? [])])],
        allowPauseProtected: prev.allowPauseProtected ?? false,
      };
      for (const id of profile.protectedCampaignIds ?? []) if (!/^\d+$/.test(String(id))) throw usageError(`--protect takes numeric campaign IDs (got "${id}")`);
      config.profiles[o.name] = profile;
      config.defaultProfile ??= o.name;
      writeConfig(configPath, config);
      const result: Record<string, unknown> = { profile: o.name, configPath, privateKeyPath: keyPath, adAccountId: profile.adAccountId ?? null, protectedCampaignIds: profile.protectedCampaignIds, verified: false };
      if (o.verify === false) return ctx.out.emit({ result });
      const vctx = new Ctx(ctx.deps, { ...ctx.globals, profile: o.name, config: configPath });
      await vctx.tokens.refresh();
      result.token = { ok: true, ...(vctx.tokens.state().expiresAt ? { expiresAt: vctx.tokens.state().expiresAt } : {}) };
      const acls: any[] = (await vctx.client.request({ method: "GET", path: "/acls", context: "none" })).json?.result?.acls ?? [];
      result.accounts = acls.map((a) => ({ adAccountId: a?.adAccount?.id, name: a?.adAccount?.name, orgId: a?.adAccount?.orgId, roles: a?.roles ?? [] }));
      if (!profile.adAccountId && acls.length === 1) {
        profile.adAccountId = String(acls[0].adAccount.id);
        profile.orgId ??= acls[0].adAccount.orgId !== undefined ? String(acls[0].adAccount.orgId) : undefined;
        writeConfig(configPath, config);
        result.adAccountId = profile.adAccountId;
      } else if (!profile.adAccountId && acls.length > 1) {
        ctx.out.note("several ad accounts are visible; re-run with --ad-account-id <id>");
      }
      result.verified = true;
      ctx.out.emit({ result });
    }),
  );
  doc(setup, {
    endpoint: "POST https://appleid.apple.com/auth/oauth2/token, GET /v1/acls",
    examples: [
      "apple-ads-cli auth setup --client-id SEARCHADS.00000000-0000-0000-0000-000000000000 --team-id SEARCHADS.00000000-0000-0000-0000-000000000000 --key-id 00000000-0000-0000-0000-000000000000 --private-key ~/.config/apple-ads-cli/private-key.pem",
    ],
  });

  doc(
    g
      .command("status")
      .description("Show the active profile, where each setting comes from and the token cache state (offline)")
      .action(
        act(deps, async (ctx) => {
          const s = ctx.settings;
          const t = new TokenProvider(s, { fetch: ctx.deps.fetch, cacheDir: cacheDir(ctx.env), now: ctx.deps.now }).state();
          ctx.out.emit({
            result: {
              profile: s.profile ?? null,
              configPath: s.configPath,
              configExists: s.configExists,
              settings: {
                clientId: { value: s.clientId ?? null, source: s.sources.clientId },
                teamId: { value: s.teamId ?? null, source: s.sources.teamId },
                keyId: { value: s.keyId ?? null, source: s.sources.keyId },
                privateKeyPath: { value: s.privateKeyPath ?? null, source: s.sources.privateKeyPath },
                adAccountId: { value: s.adAccountId ?? null, source: s.sources.adAccountId },
                orgId: { value: s.orgId ?? null, source: s.sources.orgId },
              },
              key: keyInfo(s.privateKeyPath),
              token: { source: t.source, valid: t.valid, ...(t.expiresAt ? { expiresAt: t.expiresAt } : {}) },
              protectedCampaignIds: s.protectedCampaignIds,
              allowPauseProtected: s.allowPauseProtected,
              warnings: warnings(ctx),
            },
          });
        }),
      ),
    { endpoint: "none (offline)", examples: ["apple-ads-cli auth status"] },
  );

  doc(
    g
      .command("doctor")
      .description("Run setup checks against Apple (read-only); exits 3 if any fails")
      .action(
        act(deps, async (ctx) => {
          const checks: Array<{ name: string; ok: boolean; detail?: unknown; hint?: string }> = [];
          const check = async (name: string, fn: () => Promise<unknown> | unknown, hint?: string): Promise<boolean> => {
            try {
              const detail = await fn();
              checks.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
              return true;
            } catch (e) {
              const err = toCliError(e);
              checks.push({ name, ok: false, detail: err.message, hint: err.hint ?? hint });
              return false;
            }
          };
          let s: ReturnType<typeof resolveSettings> | undefined;
          const configOk = await check("config", () => {
            s = ctx.settings;
            return { path: s.configPath, exists: s.configExists };
          });
          let ready = configOk;
          if (configOk && s) {
            const st = s;
            ready = await check("profile", () => {
              const req = st.accessToken ? [] : (["clientId", "teamId", "keyId", "privateKeyPath"] as const).filter((k) => !st[k]);
              if (req.length) throw authError(`missing ${req.join(", ")}`, "run `apple-ads-cli auth setup`");
              return { profile: st.profile ?? null, sources: st.sources };
            });
            if (!st.accessToken) {
              ready = (await check("private key", () => {
                loadPrivateKey(st.privateKeyPath!);
                if (keyFileIsLoose(st.privateKeyPath!)) throw authError(`key file is readable by group or others`, `run: chmod 600 ${st.privateKeyPath}`);
                return { path: st.privateKeyPath, curve: "P-256" };
              })) && ready;
              ready = (await check("client secret", () => {
                makeClientSecret({ clientId: st.clientId!, teamId: st.teamId!, keyId: st.keyId!, privateKeyPath: st.privateKeyPath! });
                return "signed (ES256)";
              })) && ready;
            }
          }
          let serverDate: string | null = null;
          if (ready && s) {
            const st = s;
            const tokenOk = await check("token", async () => {
              if (st.accessToken) return "APPLE_ADS_ACCESS_TOKEN (not refreshed)";
              await ctx.tokens.refresh();
              return { expiresAt: ctx.tokens.state().expiresAt };
            });
            if (tokenOk) {
              await check("GET /me", async () => {
                const r = await ctx.client.request({ method: "GET", path: "/me", context: "none" });
                serverDate = r.headers.get("date");
                return r.json?.result ?? null;
              });
              const aclOk = await check("GET /acls", async () => {
                const acls: any[] = (await ctx.client.request({ method: "GET", path: "/acls", context: "none" })).json?.result?.acls ?? [];
                const id = st.adAccountId;
                const mine = id ? acls.find((a) => String(a?.adAccount?.id) === String(id)) : undefined;
                if (id && !mine) throw authError(`ad account ${id} is not in /acls`, `visible: ${acls.map((a) => a?.adAccount?.id).join(", ") || "none"}`);
                return id ? { adAccountId: id, roles: mine.roles } : { visible: acls.map((a) => a?.adAccount?.id) };
              });
              if (aclOk) {
                await check("GET /ad-accounts/{id}", async () => {
                  const a = await ctx.account();
                  if (a?.systemStatus && a.systemStatus !== "ACTIVE") throw authError(`ad account systemStatus is ${a.systemStatus}`, `reasons: ${(a.systemStatusReasons ?? []).join(", ")}`);
                  return { currency: a?.currency, timezone: a?.timezone, paymentModel: a?.paymentModel, systemStatus: a?.systemStatus };
                });
              }
              await check("clock", () => {
                if (!serverDate) return "no Date header";
                const skew = Math.round((ctx.deps.now() - Date.parse(serverDate)) / 1000);
                if (Math.abs(skew) > 60) throw authError(`local clock is ${skew}s off the server`, "sync the system clock; the client secret uses iat/exp");
                return { skewSeconds: skew };
              });
            }
          }
          const w = ctx.settings && configOk ? warnings(ctx) : [];
          checks.push({ name: "warnings", ok: true, detail: w });
          const ok = checks.every((c) => c.ok);
          ctx.out.emit({ ok, checks });
          if (!ok) throw authError("One or more checks failed", "see checks[].hint on stdout", "DOCTOR_FAILED");
        }),
      ),
    { endpoint: "token URL, GET /v1/me, GET /v1/acls, GET /v1/ad-accounts/{id}", examples: ["apple-ads-cli auth doctor"] },
  );

  doc(
    g
      .command("logout")
      .description("Delete the cached access token (this profile, or --all)")
      .option("--all", "every cached token")
      .action(
        act(deps, async (ctx, o) => {
          const dir = cacheDir(ctx.env);
          const removed = o.all ? clearTokenCache(dir) : clearTokenCache(dir, new TokenProvider(ctx.settings, { fetch: ctx.deps.fetch, cacheDir: dir, now: ctx.deps.now }).state().cacheFile ?? "");
          ctx.out.emit({ result: { removed } });
        }),
      ),
    { endpoint: "none (local)", examples: ["apple-ads-cli auth logout", "apple-ads-cli auth logout --all"] },
  );
}
