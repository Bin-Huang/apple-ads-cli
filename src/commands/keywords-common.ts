import type { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { buildBulkBodies, parseKeywordFile, parseKeywordText, type KeywordInput } from "../bulk.js";
import type { Target } from "../guard.js";
import { runPlan, type Step } from "../mutate.js";
import { filter, paginate, type Filter } from "../query.js";
import { RESOURCES, type Resource } from "../resources.js";
import { combine, deleteReason, reason, statusReason } from "../spend.js";
import { PAGE_MAX_ENTITY } from "../constants.js";
import { addWriteFlags, checkIds, doc, getOne, reread, statusFields } from "./shared.js";

export const MATCH_TYPES = ["EXACT", "BROAD"];

export function matchType(v: string | undefined, def = "EXACT"): string {
  const m = (v ?? def).toUpperCase();
  if (!MATCH_TYPES.includes(m)) throw usageError(`--match-type must be EXACT or BROAD (got "${v}")`);
  return m;
}

export function bulkSteps(path: string, items: Record<string, unknown>[]): Step[] {
  return buildBulkBodies(items).map((b) => ({ method: "POST", path, body: b.body, bulk: true }));
}

/** Reads --text (repeatable) and/or --keywords-file into keyword inputs. */
export async function keywordInputs(ctx: Ctx, o: any): Promise<KeywordInput[]> {
  const list: KeywordInput[] = (o.text ?? []).map((t: string) => ({ text: t.trim() }));
  if (o.file === "-") list.push(...parseKeywordText(await ctx.deps.readStdin(), "stdin"));
  else if (o.file) list.push(...parseKeywordFile(o.file));
  if (!list.length) throw usageError("Give keywords with --text <t> (repeatable) or --file <path>");
  for (const k of list) if (!k.text) throw usageError("Keyword text must not be empty");
  return list;
}

/** Lists every keyword (or negative) matching the filters, for duplicate checks. */
export async function existingKeys(ctx: Ctx, res: Resource, filters: Filter[]): Promise<Map<string, any>> {
  const page = await paginate(ctx.client, { path: res.queryPath, body: { filters }, pageMax: PAGE_MAX_ENTITY, limit: 0, all: true, offset: 0, maxItems: 100_000 });
  const m = new Map<string, any>();
  for (const k of page.rows as any[]) m.set(`${String(k.text).toLowerCase()}|${k.matchType}`, k);
  return m;
}

export async function campaignOfKeywordLike(ctx: Ctx, e: any): Promise<string | undefined> {
  if (e?.campaignId !== undefined && e?.campaignId !== null) return String(e.campaignId);
  if (e?.adGroupId) return String((await getOne(ctx, RESOURCES.adGroups, String(e.adGroupId)))?.campaignId);
  return undefined;
}

async function readTargets(ctx: Ctx, res: Resource, ids: string[]) {
  const before = [];
  const targets: Target[] = [];
  for (const id of ids) {
    const e = await getOne(ctx, res, id);
    before.push(statusFields(e));
    targets.push({ type: res.type, id, campaignId: await campaignOfKeywordLike(ctx, e) });
  }
  return { before, targets };
}

export function registerBulkStatus(parent: Command, deps: Deps, res: Resource, verb: "pause" | "resume"): void {
  const status = verb === "pause" ? "PAUSED" : "ENABLED";
  const cmd = parent.command(verb).description(`${verb === "pause" ? "Pause" : "Resume"} ${res.label}s`).argument("<ids...>", `${res.label} ID(s)`);
  addWriteFlags(cmd, { data: false });
  cmd.action(
    act(deps, async (ctx, o, ids) => {
      checkIds(ids);
      const { before, targets } = await readTargets(ctx, res, ids);
      await runPlan(
        ctx,
        {
          action: `${parent.name()}.${verb}`,
          steps: bulkSteps(`${res.path}/bulk-update`, ids.map((id) => ({ id: Number(id), status }))),
          targets,
          before,
          spend: combine(
            ids.map((id) =>
              res.type === "negative"
                ? reason(verb === "pause" ? "increase" : "decrease", `negative keyword ${id} ${verb === "pause" ? "paused (widens reach)" : "resumed (narrows reach)"}`)
                : statusReason(res.label, id, status),
            ),
          ),
          reduceOnly: res.type !== "negative" && verb === "pause",
          verify: () => reread(ctx, res, ids),
          summary: `${ids.length} ${res.label}(s) set to ${status}`,
        },
        o,
      );
    }),
  );
  doc(cmd, {
    endpoint: `POST /v1${res.path}/bulk-update`,
    schema: "BulkUpdateRequest {allowPartialSuccess, items[{correlationId, data:{id, status}}]}",
    examples: [`apple-ads-cli ${parent.name()} ${verb} 333333333 --dry-run`],
    notes: res.type === "negative" ? ["pausing a negative widens reach (spend may increase); resuming narrows it"] : undefined,
  });
}

export function registerBulkDelete(parent: Command, deps: Deps, res: Resource): void {
  const cmd = parent.command("delete").description(`Delete ${res.label}s (cannot be undone)`).argument("<ids...>", `${res.label} ID(s)`);
  addWriteFlags(cmd, { data: false, destructive: true });
  cmd.action(
    act(deps, async (ctx, o, ids) => {
      checkIds(ids);
      const { before, targets } = await readTargets(ctx, res, ids);
      await runPlan(
        ctx,
        {
          action: `${parent.name()}.delete`,
          steps: bulkSteps(`${res.path}/bulk-delete`, ids.map((id) => ({ id: Number(id) }))),
          targets,
          before,
          destructive: true,
          spend: combine(ids.map((id) => (res.type === "negative" ? reason("increase", `negative keyword ${id} removed (widens reach)`) : deleteReason(res.label, id)))),
          verify: () => reread(ctx, res, ids),
          summary: `${ids.length} ${res.label}(s) deleted`,
        },
        o,
      );
    }),
  );
  doc(cmd, {
    endpoint: `POST /v1${res.path}/bulk-delete`,
    schema: "BulkDeleteRequest {allowPartialSuccess, items[{correlationId, data:{id}}]}",
    examples: [`apple-ads-cli ${parent.name()} delete 333333333 --confirm --force-delete`],
  });
}

export { filter };
