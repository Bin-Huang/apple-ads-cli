import type { Ctx } from "./context.js";
import { isNoContextPath } from "./constants.js";
import { CliError, ExitCode, refused, toCliError } from "./errors.js";
import { assertNotProtected, type Target } from "./guard.js";
import { buildUrl } from "./http.js";
import { ceilingReasons, findOverCeiling, resolveCeilings } from "./ceilings.js";
import { combine, type Spend } from "./spend.js";

export interface Step {
  method: string;
  path: string;
  body?: unknown;
  /** Bulk step: per-item results are read from the response. */
  bulk?: boolean;
  /** Overrides the path-based X-AP-Context choice. */
  context?: "account" | "none";
}

export interface Plan {
  action: string;
  steps: Step[];
  targets: Target[];
  spend: Spend;
  before?: unknown;
  changes?: unknown[];
  existing?: unknown[];
  /** Pause or negatives add: allowed on protected campaigns only with allowPauseProtected. */
  reduceOnly?: boolean;
  /** Deletes also need --force-delete. */
  destructive?: boolean;
  /** Re-reads after sending. */
  verify?: (results: ItemResult[]) => Promise<unknown[]>;
  summary: string;
}

export interface WriteFlags {
  dryRun?: boolean;
  confirm?: boolean;
  forceDelete?: boolean;
  allowLarge?: boolean;
}

export interface ItemResult {
  step: number;
  index?: number;
  ok: boolean;
  id?: unknown;
  status?: number;
  error?: unknown;
}

async function describeSteps(ctx: Ctx, steps: Step[]) {
  const out = [];
  for (const s of steps) {
    const noCtx = s.context ? s.context === "none" : isNoContextPath(s.method, s.path);
    out.push({
      method: s.method,
      url: buildUrl(s.path),
      xApContext: noCtx ? null : `adAccountId=${await ctx.adAccountId()}`,
      ...(s.body !== undefined ? { body: s.body } : {}),
    });
  }
  return out;
}

/** Runs the write protocol: guard, dry run or confirm, send, verify. */
export async function runPlan(ctx: Ctx, plan: Plan, flags: WriteFlags): Promise<void> {
  assertNotProtected(plan.targets, ctx.settings, !!plan.reduceOnly);
  const ceilings = resolveCeilings(ctx.settings);
  const overCeiling = plan.steps.flatMap((s) => findOverCeiling(s.body, ceilings));
  if (overCeiling.length) plan = { ...plan, spend: combine([...plan.spend.reasons, ...ceilingReasons(overCeiling)], plan.spend.ceilings) };
  const shown = {
    action: plan.action,
    steps: await describeSteps(ctx, plan.steps),
    ...(plan.changes?.length ? { changes: plan.changes } : {}),
    ...(plan.before !== undefined ? { before: plan.before } : {}),
  };
  const base = {
    plan: shown,
    spend: plan.spend,
    ...(plan.existing?.length ? { existing: plan.existing } : {}),
  };

  if (plan.steps.length === 0) {
    ctx.out.emit({ dryRun: !!flags.dryRun, sent: false, ...base, results: [], note: "nothing to send" });
    ctx.out.note("nothing to send (every item already exists or nothing changed)");
    return;
  }
  if (flags.dryRun) {
    ctx.out.emit({ dryRun: true, sent: false, ...base, ...(overCeiling.length ? { overCeiling } : {}) });
    if (overCeiling.length && !flags.allowLarge) ctx.out.note(`${overCeiling.length} amount(s) are above the ceiling; --confirm will need --allow-large`);
    ctx.out.note(`dry run: ${plan.steps.length} request(s) not sent; spend effect: ${plan.spend.effect}`);
    return;
  }
  if (overCeiling.length && !flags.allowLarge) {
    ctx.out.emit({ dryRun: false, sent: false, ...base, overCeiling });
    const h = overCeiling[0]!;
    throw refused(
      "ABOVE_CEILING",
      `${h.path} ${h.amount} is above the ${h.field === "bid" ? "maxBid" : "maxDailyBudget"} ceiling ${h.ceiling}; nothing was sent`,
      "check the amount (a typo such as 60 for 0.60?); if it is right, re-run with --allow-large, or raise maxBid/maxDailyBudget in the profile",
    );
  }
  if (plan.destructive && !flags.forceDelete) {
    ctx.out.emit({ dryRun: false, sent: false, ...base });
    throw refused("FORCE_DELETE_REQUIRED", "Deletes need --force-delete as well as --confirm", "deletes cannot be undone; re-run with --confirm --force-delete");
  }
  if (!flags.confirm) {
    ctx.out.emit({ dryRun: false, sent: false, ...base });
    throw refused("CONFIRM_REQUIRED", "Nothing was sent: this command changes the account", "re-run with --confirm to send");
  }

  const results: ItemResult[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i]!;
    try {
      const res = await ctx.client.request({ method: s.method, path: s.path, body: s.body, retry: "write", context: s.context });
      if (s.bulk) {
        const isArr = Array.isArray(res.json?.result);
        const items: any[] = isArr ? res.json.result : [];
        if (!items.length && res.json?.error) throw new CliError({ exitCode: ExitCode.API, code: "BULK_FAILED", message: JSON.stringify(res.json.error) });
        for (const it of items) {
          results.push({ step: i, index: it?.correlationId, ok: it?.success === true, id: it?.result?.id, ...(it?.success === true ? {} : { error: it?.error }) });
        }
        const sentItems = Array.isArray((s.body as any)?.items) ? (s.body as any).items.length : 0;
        if (!isArr || items.length < sentItems) {
          throw new CliError({
            exitCode: ExitCode.API,
            code: "BULK_UNCONFIRMED",
            message: `bulk request sent ${sentItems} item(s) but Apple confirmed ${items.length}; the outcome of the rest is unknown`,
            hint: "list the parent ad group or campaign and check each item before retrying",
          });
        }
      } else {
        results.push({ step: i, ok: true, status: res.status, id: res.json?.result?.id });
      }
    } catch (e) {
      const err = toCliError(e);
      ctx.out.emit({ dryRun: false, sent: true, ...base, results, failedStep: i, error: err.toJSON() });
      err.hint = `${err.hint ? err.hint + "; " : ""}${results.length} item(s) succeeded before the failure; list the parent before retrying so nothing is created twice`;
      throw err;
    }
  }

  let after: unknown[] = [];
  if (plan.verify) {
    try {
      after = await plan.verify(results);
    } catch (e) {
      ctx.out.note(`sent, but the re-read failed: ${toCliError(e).message}`);
    }
  }
  const failed = results.filter((r) => !r.ok);
  ctx.out.emit({ dryRun: false, sent: true, ...base, results, after });
  ctx.out.note(`sent ${plan.steps.length} request(s); ${plan.summary}${plan.spend.effect === "increase" ? " (spend may increase)" : ""}`);
  if (failed.length) {
    throw new CliError({
      exitCode: ExitCode.API,
      code: "PARTIAL_FAILURE",
      message: `${failed.length} of ${results.length} item(s) failed`,
      hint: "see results[].error on stdout; fix those items and re-run, existing items are skipped",
    });
  }
}
