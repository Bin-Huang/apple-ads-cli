import { readFileSync } from "node:fs";
import { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { DEFAULT_LIMIT_ENTITY, DEFAULT_LIMIT_REPORT, DEFAULT_MAX_ITEMS, PAGE_MAX_ENTITY } from "../constants.js";
import { CliError, usageError } from "../errors.js";
import { runPlan, type Plan } from "../mutate.js";
import { buildQuery, filter, paginate, parseFields, parseFilterFlag, parseSort, type Filter } from "../query.js";
import type { Resource } from "../resources.js";
import { deleteReason, combine, statusReason } from "../spend.js";
import type { Target } from "../guard.js";

export const EXIT_CODES_HELP = "Exit codes: 0 ok, 1 API error, 2 usage, 3 auth, 4 not found, 5 rate limited/transient, 6 refused for safety";

export interface DocInfo {
  endpoint: string;
  schema?: string;
  examples: string[];
  notes?: string[];
}

export const DOCS = new WeakMap<Command, DocInfo>();

/** Adds the endpoint, schema, examples and exit codes to a leaf command's help. */
export function doc(cmd: Command, info: DocInfo): Command {
  DOCS.set(cmd, info);
  const lines = [
    "",
    `Endpoint: ${info.endpoint}`,
    ...(info.schema ? [`Schema: ${info.schema}`] : []),
    ...(info.notes ?? []).map((n) => `Note: ${n}`),
    "",
    "Examples:",
    ...info.examples.map((e) => `  ${e}`),
    "",
    EXIT_CODES_HELP,
  ];
  cmd.addHelpText("after", lines.join("\n"));
  return cmd;
}

const collect = (v: string, prev: string[] = []) => [...prev, v];

export function intArg(name: string) {
  return (v: string) => {
    if (!/^\d+$/.test(v)) throw usageError(`${name} must be a whole number (got "${v}")`);
    return Number(v);
  };
}

export function idArg(name: string) {
  return (v: string) => {
    if (!/^\d+$/.test(v)) throw usageError(`${name} must be a numeric ID (got "${v}")`);
    return v;
  };
}

export function checkIds(ids: string[], name = "ID"): string[] {
  for (const id of ids) if (!/^\d+$/.test(id)) throw usageError(`${name} must be numeric (got "${id}")`);
  if (!ids.length) throw usageError(`Give at least one ${name}`);
  return ids;
}

/** Shared list flags. `sort`, and `fields`/`deleted` (entity lists only), can be left off where the endpoint does not support them. */
export function addListFlags(cmd: Command, kind: "entity" | "report", opts: { fields?: boolean; deleted?: boolean; sort?: boolean } = {}): Command {
  const def = kind === "entity" ? DEFAULT_LIMIT_ENTITY : DEFAULT_LIMIT_REPORT;
  cmd
    .option("--limit <n>", `maximum rows to return (default ${def})`, intArg("--limit"))
    .option("--all", "follow every page (up to --max-items)")
    .option("--max-items <n>", `cap for --all (default ${DEFAULT_MAX_ITEMS})`, intArg("--max-items"))
    .option("--offset <n>", "start at this row", intArg("--offset"), 0);
  if (opts.sort !== false) cmd.option("--sort <field[:ASC|DESC]>", "sort order (repeatable)", collect);
  cmd
    .option("--filter <field:OPERATOR[:v1,v2]>", "extra filter (repeatable), e.g. status:EQUALS:ENABLED", collect);
  if (kind === "entity" && opts.fields !== false) cmd.option("--fields <a,b>", "only return these fields (id is always added)");
  if (kind === "entity" && opts.deleted !== false) cmd.option("--deleted", "list deleted entities instead (filter deleted EQUALS true)");
  return cmd;
}

export function addWriteFlags(cmd: Command, opts: { data?: boolean; destructive?: boolean; money?: boolean } = {}): Command {
  cmd.option("--dry-run", "print the exact request and send nothing").option("--confirm", "send the change (without it the plan prints and the command exits 6)");
  if (opts.data !== false) {
    cmd.option("--data <json>", "JSON object merged over the body the flags build (flags win)");
    cmd.option("--file <path>", "read that JSON object from a file ('-' for stdin)");
  }
  if (opts.destructive) cmd.option("--force-delete", "required with --confirm for deletes");
  if (opts.money) cmd.option("--allow-large", "send bids above maxBid (default 10.00) or daily budgets above maxDailyBudget (default 1000.00)");
  return cmd;
}

export function listOpts(opts: any, kind: "entity" | "report") {
  return {
    limit: opts.limit ?? (kind === "entity" ? DEFAULT_LIMIT_ENTITY : DEFAULT_LIMIT_REPORT),
    all: !!opts.all,
    offset: opts.offset ?? 0,
    maxItems: opts.maxItems ?? DEFAULT_MAX_ITEMS,
  };
}

export function extraFilters(opts: any): Filter[] {
  const f: Filter[] = (opts.filter ?? []).map(parseFilterFlag);
  if (opts.deleted) f.push(filter("deleted", "EQUALS", true));
  return f;
}

/** Runs an entity query with the shared list flags and emits the list envelope. */
export async function listEntities(ctx: Ctx, res: Resource, opts: any, filters: Filter[], decorate?: (row: any) => any): Promise<void> {
  const body = buildQuery({
    filters: [...filters, ...extraFilters(opts)],
    sorting: (opts.sort ?? []).map(parseSort),
    fields: parseFields(opts.fields),
  });
  const page = await paginate(ctx.client, { path: res.queryPath, body: body as Record<string, unknown>, pageMax: PAGE_MAX_ENTITY, fetchTotalCount: true, ...listOpts(opts, "entity") });
  const rows = decorate ? page.rows.map(decorate) : page.rows;
  ctx.out.emit({ result: rows, pagination: page.pagination }, res.columns);
  truncationNote(ctx, page.pagination);
}

export function truncationNote(ctx: Ctx, p: { truncated: boolean; nextOffset?: number }): void {
  if (p.truncated) ctx.out.note(`more rows: re-run with --all or --offset ${p.nextOffset}, or narrow with --filter/--status`);
}

export async function getOne(ctx: Ctx, res: Resource, id: string): Promise<any> {
  const r = await ctx.client.request({ method: "GET", path: `${res.path}/${id}` });
  return r.json?.result ?? {};
}

export async function getMany(ctx: Ctx, res: Resource, ids: string[], decorate?: (row: any) => any): Promise<void> {
  const rows = [];
  for (const id of ids) {
    const row = await getOne(ctx, res, id);
    rows.push(decorate ? decorate(row) : row);
  }
  ctx.out.emit({ result: rows.length === 1 ? rows[0] : rows }, res.columns);
}

export function registerGet(parent: Command, deps: Deps, res: Resource, decorate?: (ctx: Ctx) => (row: any) => any): Command {
  const cmd = parent
    .command("get")
    .description(`Get one or more ${res.label}s by ID`)
    .argument("<ids...>", `${res.label} ID(s)`)
    .action(act(deps, async (ctx, _o, ids) => getMany(ctx, res, checkIds(ids), decorate?.(ctx))));
  return doc(cmd, { endpoint: `GET /v1${res.path}/{id}`, schema: res.schema, examples: [`apple-ads-cli ${parent.name()} get 111111111`] });
}

/** Reads --data/--file (an object) to merge over the body the flags build. */
export async function readOverlay(ctx: Ctx, opts: any): Promise<Record<string, unknown> | undefined> {
  if (opts.data && opts.file) throw usageError("Use --data or --file, not both");
  let text: string | undefined;
  if (opts.data) text = opts.data;
  else if (opts.file === "-") text = await ctx.deps.readStdin();
  else if (opts.file) text = readFileSync(opts.file, "utf8");
  if (text === undefined) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw usageError(`--data/--file is not valid JSON: ${(e as Error).message}`);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw usageError("--data/--file must be a JSON object");
  return v as Record<string, unknown>;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Deep merge where `top` wins. Arrays are replaced whole. */
export function deepMerge(base: Record<string, unknown>, top: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(top)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

/** id, name/text and the status fields, plus `extra` fields (e.g. the bid a write changed). */
export function statusFields(e: any, extra?: unknown) {
  if (!e || typeof e !== "object") return e;
  const o: Record<string, unknown> = { id: e.id };
  for (const k of ["name", "text", ...(Array.isArray(extra) ? (extra as string[]) : []), "status", "systemStatus", "displayStatus", "systemStatusReasons", "systemStatusLimitingReasons", "deleted"]) if (e[k] !== undefined) o[k] = e[k];
  return o;
}

/** Fields a re-read keeps so `after` shows what a write changed. */
export const CHANGED_FIELDS: Record<string, string[]> = {
  keyword: ["matchType", "bid"],
  negative: ["matchType"],
  adGroup: ["bidStrategy", "automatedKeywordsOptIn", "endTime"],
  ad: ["creativeId"],
};

/** Re-reads entities; a 404 is reported as gone. */
export async function reread(ctx: Ctx, res: Resource, ids: string[]): Promise<unknown[]> {
  const out = [];
  for (const id of ids) {
    try {
      out.push(statusFields(await getOne(ctx, res, id), CHANGED_FIELDS[res.type]));
    } catch (e) {
      if (e instanceof CliError && e.exitCode === 4) out.push({ id: Number(id), gone: true });
      else throw e;
    }
  }
  return out;
}

export function campaignOf(res: Resource, e: any, id: string): string | undefined {
  if (res.type === "campaign") return id;
  return e?.campaignId !== undefined && e?.campaignId !== null ? String(e.campaignId) : undefined;
}

/** pause/resume for entities updated with PUT {status}. */
export function registerStatus(parent: Command, deps: Deps, res: Resource, verb: "pause" | "resume"): Command {
  const status = verb === "pause" ? "PAUSED" : "ENABLED";
  const cmd = parent
    .command(verb)
    .description(`${verb === "pause" ? "Pause" : "Resume (enable)"} ${res.label}s`)
    .argument("<ids...>", `${res.label} ID(s)`);
  addWriteFlags(cmd, { data: false });
  cmd.action(
    act(deps, async (ctx, opts, ids) => {
      checkIds(ids);
      const before = [];
      const targets: Target[] = [];
      for (const id of ids) {
        const e = await getOne(ctx, res, id);
        before.push(statusFields(e));
        targets.push({ type: res.type, id, campaignId: campaignOf(res, e, id) });
      }
      const plan: Plan = {
        action: `${parent.name()}.${verb}`,
        steps: ids.map((id) => ({ method: "PUT", path: `${res.path}/${id}`, body: { status } })),
        targets,
        before,
        spend: combine(ids.map((id) => statusReason(res.label, id, status))),
        reduceOnly: verb === "pause",
        verify: () => reread(ctx, res, ids),
        summary: `${res.label} ${ids.join(", ")} set to ${status}`,
      };
      await runPlan(ctx, plan, opts);
    }),
  );
  return doc(cmd, {
    endpoint: `PUT /v1${res.path}/{id} {"status":"${status}"}`,
    examples: [`apple-ads-cli ${parent.name()} ${verb} 111111111 --dry-run`, `apple-ads-cli ${parent.name()} ${verb} 111111111 --confirm`],
    notes: verb === "resume" ? ["resuming can increase spend"] : undefined,
  });
}

/** delete for entities with DELETE /{id}. */
export function registerDelete(
  parent: Command,
  deps: Deps,
  res: Resource,
  resolveTargets?: (ctx: Ctx, id: string, e: any) => Promise<Target[]>,
): Command {
  const cmd = parent.command("delete").description(`Delete ${res.label}s (cannot be undone)`).argument("<ids...>", `${res.label} ID(s)`);
  addWriteFlags(cmd, { data: false, destructive: true });
  cmd.action(
    act(deps, async (ctx, opts, ids) => {
      checkIds(ids);
      const before = [];
      const targets: Target[] = [];
      for (const id of ids) {
        const e = await getOne(ctx, res, id);
        before.push(statusFields(e));
        targets.push(...(resolveTargets ? await resolveTargets(ctx, id, e) : [{ type: res.type, id, campaignId: campaignOf(res, e, id) }]));
      }
      await runPlan(
        ctx,
        {
          action: `${parent.name()}.delete`,
          steps: ids.map((id) => ({ method: "DELETE", path: `${res.path}/${id}` })),
          targets,
          before,
          destructive: true,
          spend: combine(ids.map((id) => deleteReason(res.label, id))),
          verify: () => reread(ctx, res, ids),
          summary: `${res.label} ${ids.join(", ")} deleted`,
        },
        opts,
      );
    }),
  );
  return doc(cmd, {
    endpoint: `DELETE /v1${res.path}/{id}`,
    examples: [`apple-ads-cli ${parent.name()} delete 111111111 --dry-run`, `apple-ads-cli ${parent.name()} delete 111111111 --confirm --force-delete`],
  });
}

export function group(program: Command, name: string, description: string): Command {
  return program.command(name).description(description);
}
