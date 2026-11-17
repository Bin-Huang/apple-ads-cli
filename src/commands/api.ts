import type { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { scanForProtected, type Target } from "../guard.js";
import { isReadRequest, normalizePath, sentPathname } from "../http.js";
import { creativeTargets } from "./creatives.js";
import { runPlan } from "../mutate.js";
import { RESOURCES } from "../resources.js";
import { combine, reason } from "../spend.js";
import { doc, readOverlay } from "./shared.js";

const collect = (v: string, prev: string[] = []) => [...prev, v];
const METHODS = ["GET", "POST", "PUT", "DELETE"];

const ENTITY_PATHS: Record<string, keyof typeof RESOURCES> = {
  campaigns: "campaigns",
  adgroups: "adGroups",
  ads: "ads",
  keywords: "keywords",
  "negative-keywords": "negatives",
};

function collectKey(v: unknown, key: string, out: Set<string>): void {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach((x) => collectKey(x, key, out));
  for (const [k, x] of Object.entries(v)) {
    if (k === key && (typeof x === "number" || typeof x === "string")) out.add(String(x));
    else collectKey(x, key, out);
  }
}

/**
 * Refuses raw paths whose meaning could differ from what the guard reads: fragments, percent-encoding,
 * backslashes, dot segments, or any character outside letters, digits and - . _ ~ / (exit 2).
 */
export function checkRawPath(path: string): void {
  if (/[#%\\]/.test(path)) throw usageError(`Raw path "${path}" contains '#', '%' or '\\'`, "write the path plainly, e.g. /campaigns/111111111; pass parameters with --query");
  const [p, ...q] = path.split("?");
  if (q.length > 1) throw usageError(`Raw path "${path}" has more than one '?'`, "pass parameters with --query k=v");
  if (!/^[A-Za-z0-9._~\-/]+$/.test(p!)) throw usageError(`Raw path "${p}" has characters outside letters, digits and - . _ ~ /`, "write the path plainly, e.g. /campaigns/111111111");
  if (p!.split("/").some((seg) => seg === "." || seg === "..")) throw usageError(`Raw path "${p}" has a '.' or '..' segment`, "write the full path, e.g. /keywords/bulk-update");
}

/** Finds the campaigns a raw write touches: IDs in the path and body, and parents resolved by GET. */
async function rawTargets(ctx: Ctx, method: string, path: string, body: unknown): Promise<Target[]> {
  const ids = ctx.settings.protectedCampaignIds;
  if (!ids.length) return [];
  const targets: Target[] = scanForProtected(path, body, ids).map((id) => ({ type: "campaign", id, campaignId: id }));
  // Lower-cased so /ADGROUPS/{id} resolves its campaign too; numeric IDs lose leading zeros.
  const parts = path.split("?")[0]!.split("/").filter(Boolean).map((x) => (/^\d+$/.test(x) ? x.replace(/^0+(?=\d)/, "") : x.toLowerCase()));
  const res = ENTITY_PATHS[parts[0] ?? ""];
  const get = async (r: keyof typeof RESOURCES, id: string) => (await ctx.client.request({ method: "GET", path: `${RESOURCES[r].path}/${id}` })).json?.result;
  if (res && parts[1] && /^\d+$/.test(parts[1]) && res !== "campaigns") {
    const e = await get(res, parts[1]);
    targets.push({ type: RESOURCES[res].type, id: parts[1], campaignId: e?.campaignId !== undefined ? String(e.campaignId) : undefined });
  }
  if (parts[0] === "creatives" && parts[1] && /^\d+$/.test(parts[1])) targets.push(...(await creativeTargets(ctx, parts[1])));
  if (res && (res === "keywords" || res === "negatives") && /^bulk-(update|delete)$/.test(parts[1] ?? "")) {
    const itemIds = new Set<string>();
    for (const it of (body as any)?.items ?? []) if (it?.data?.id !== undefined) itemIds.add(String(it.data.id));
    for (const id of itemIds) {
      const e = await get(res, id);
      targets.push({ type: RESOURCES[res].type, id, campaignId: e?.campaignId !== undefined ? String(e.campaignId) : undefined });
    }
  }
  const adGroupIds = new Set<string>();
  collectKey(body, "adGroupId", adGroupIds);
  for (const id of adGroupIds) {
    const e = await get("adGroups", id);
    targets.push({ type: "adGroup", id, campaignId: e?.campaignId !== undefined ? String(e.campaignId) : undefined });
  }
  return targets;
}

export function registerApi(program: Command, deps: Deps): void {
  const cmd = program
    .command("api")
    .description("Raw request to any Platform API v1 path (writes need --confirm)")
    .argument("<method>", "GET, POST, PUT or DELETE")
    .argument("<path>", "path relative to /v1, e.g. /campaigns/query")
    .option("--data <json>", "JSON body")
    .option("--file <path>", "JSON body from a file ('-' for stdin)")
    .option("--query <k=v>", "query parameter (repeatable)", collect)
    .option("--no-context", "do not send X-AP-Context")
    .option("--dry-run", "writes: print the request and send nothing")
    .option("--confirm", "writes: send")
    .option("--force-delete", "required with --confirm for DELETE and bulk-delete")
    .option("--allow-large", "send bids above maxBid or daily budgets above maxDailyBudget");
  cmd.action(
    act(deps, async (ctx, o, [m, rawPath]) => {
      const method = m!.toUpperCase();
      if (!METHODS.includes(method)) throw usageError(`Method must be one of ${METHODS.join(", ")}`);
      checkRawPath(rawPath!);
      const path = normalizePath(rawPath!);
      const body = await readOverlay(ctx, o);
      if (method === "GET" && body !== undefined) throw usageError("GET requests cannot have a body", "drop --data/--file, or use POST for /query endpoints");
      const query: Record<string, string | string[]> = {};
      for (const kv of o.query ?? []) {
        const i = kv.indexOf("=");
        if (i <= 0) throw usageError(`--query takes k=v (got "${kv}")`);
        const k = kv.slice(0, i);
        const v = kv.slice(i + 1);
        query[k] = query[k] === undefined ? v : ([] as string[]).concat(query[k]!, v);
      }
      const context = o.context === false ? ("none" as const) : undefined;
      if (isReadRequest(method, path)) {
        const res = await ctx.client.request({ method, path, body, query, context, retry: "read" });
        ctx.out.emit(res.json);
        return;
      }
      if (Object.keys(query).length) throw usageError("--query is only supported on reads here; put write parameters in the body");
      const targets = await rawTargets(ctx, method, path, body);
      await runPlan(
        ctx,
        {
          action: `api.${method}`,
          steps: [{ method, path, body, context }],
          targets,
          destructive: method === "DELETE" || /\/bulk-delete$/.test(sentPathname(path)),
          spend: combine([reason("unknown", `raw ${method} ${path}: the CLI cannot assess its spend effect`)]),
          summary: `${method} ${path}`,
        },
        o,
      );
    }),
  );
  doc(cmd, {
    endpoint: "any /v1 path",
    examples: [
      "apple-ads-cli api GET /campaigns/111111111",
      "apple-ads-cli api POST /campaigns/query --data '{\"pagination\":{\"offset\":0,\"pageSize\":10}}'",
      "apple-ads-cli api PUT /adgroups/222222222 --data '{\"name\":\"Example\"}' --dry-run",
    ],
    notes: ["GET and POST .../query run directly; anything else is a write and follows --dry-run/--confirm and the protected-campaign guard"],
  });
}
