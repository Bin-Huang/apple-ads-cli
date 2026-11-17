import type { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { runPlan } from "../mutate.js";
import { buildQuery, filter, paginate, parseSort, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { combine, negativeReason } from "../spend.js";
import { PAGE_MAX_ENTITY } from "../constants.js";
import { addListFlags, addWriteFlags, doc, extraFilters, getOne, idArg, listOpts, reread, truncationNote } from "./shared.js";
import { bulkSteps, existingKeys, keywordInputs, matchType, registerBulkDelete, registerBulkStatus } from "./keywords-common.js";

const R = RESOURCES.negatives;
const collect = (v: string, prev: string[] = []) => [...prev, v];

async function query(ctx: Ctx, o: any, filters: Filter[], scope: "campaign" | "adGroup") {
  const body = buildQuery({ filters: [...filters, ...extraFilters(o)], sorting: (o.sort ?? []).map(parseSort) });
  const page = await paginate(ctx.client, { path: R.queryPath, body: body as Record<string, unknown>, pageMax: PAGE_MAX_ENTITY, fetchTotalCount: true, ...listOpts(o, "entity") });
  return { rows: page.rows.map((r: any) => ({ ...r, cli: { scope } })), pagination: page.pagination };
}

export function registerNegatives(program: Command, deps: Deps): void {
  const g = program.command("negatives").description("List and add negative keywords (campaign or ad group level)");

  const list = addListFlags(g.command("list").description("List negative keywords"), "entity")
    .option("--campaign-id <id>", "campaign-level negatives, then each ad group's", idArg("--campaign-id"))
    .option("--campaign-level", "with --campaign-id: campaign-level negatives only")
    .option("--ad-group-id <id>", "this ad group's negatives", idArg("--ad-group-id"))
    .action(
      act(deps, async (ctx, o) => {
        if (!o.campaignId && !o.adGroupId) throw usageError("negatives list needs --campaign-id or --ad-group-id");
        if (o.adGroupId) {
          const r = await query(ctx, o, [filter("adGroupId", "EQUALS", o.adGroupId)], "adGroup");
          ctx.out.emit({ result: r.rows, pagination: r.pagination }, R.columns);
          return truncationNote(ctx, r.pagination);
        }
        const camp = await query(ctx, o, [filter("campaignId", "EQUALS", o.campaignId), filter("adGroupId", "IS_NULL")], "campaign");
        const rows = [...camp.rows];
        let truncated = camp.pagination.truncated;
        if (!o.campaignLevel) {
          const groups = await paginate(ctx.client, { path: RESOURCES.adGroups.queryPath, body: { filters: [filter("campaignId", "EQUALS", o.campaignId)], fields: ["id", "name"] }, pageMax: PAGE_MAX_ENTITY, limit: 0, all: true, offset: 0 });
          for (const ag of groups.rows as any[]) {
            const r = await query(ctx, o, [filter("adGroupId", "EQUALS", String(ag.id))], "adGroup");
            rows.push(...r.rows);
            truncated ||= r.pagination.truncated;
          }
        }
        ctx.out.emit({ result: rows, pagination: { offset: 0, returned: rows.length, truncated } }, R.columns);
        if (truncated) ctx.out.note("more rows in at least one scope: re-run with --all");
      }),
    );
  doc(list, {
    endpoint: "POST /v1/negative-keywords/query",
    schema: "QueryRequest -> NegativeKeyword[]",
    examples: ["apple-ads-cli negatives list --campaign-id 111111111 --campaign-level", "apple-ads-cli negatives list --ad-group-id 222222222"],
    notes: ["campaign level = campaignId EQUALS plus adGroupId IS_NULL; each row gets cli.scope"],
  });

  const add = g
    .command("add")
    .description("Add negative keywords (EXACT by default; skips existing ones)")
    .option("--campaign-id <id>", "campaign-level negatives", idArg("--campaign-id"))
    .option("--ad-group-id <id>", "ad-group-level negatives", idArg("--ad-group-id"))
    .option("--text <text>", "negative keyword text (repeatable)", collect)
    .option("--file <path>", "JSON array or CSV of keywords; '-' for stdin")
    .option("--match-type <type>", "EXACT (default) or BROAD");
  addWriteFlags(add, { data: false });
  add.action(
    act(deps, async (ctx, o) => {
      if (!!o.campaignId === !!o.adGroupId) throw usageError("Give exactly one of --campaign-id or --ad-group-id");
      const inputs = await keywordInputs(ctx, o);
      let campaignId: string = o.campaignId;
      let scopeFilters: Filter[];
      if (o.adGroupId) {
        campaignId = String((await getOne(ctx, RESOURCES.adGroups, o.adGroupId))?.campaignId);
        scopeFilters = [filter("adGroupId", "EQUALS", o.adGroupId)];
      } else {
        scopeFilters = [filter("campaignId", "EQUALS", o.campaignId), filter("adGroupId", "IS_NULL")];
      }
      const have = await existingKeys(ctx, R, scopeFilters);
      const existing: unknown[] = [];
      const items: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const k of inputs) {
        const mt = matchType(k.matchType ?? o.matchType);
        const key = `${k.text.toLowerCase()}|${mt}`;
        if (have.has(key) || seen.has(key)) {
          existing.push({ text: k.text, matchType: mt, ...(have.get(key) ? { id: have.get(key).id } : { duplicateInInput: true }) });
          continue;
        }
        seen.add(key);
        // Campaign scope omits adGroupId; ad group scope omits campaignId.
        items.push(o.adGroupId ? { adGroupId: Number(o.adGroupId), text: k.text, matchType: mt } : { campaignId: Number(o.campaignId), text: k.text, matchType: mt });
      }
      await runPlan(
        ctx,
        {
          action: "negatives.add",
          steps: items.length ? bulkSteps(`${R.path}/bulk-create`, items) : [],
          targets: [{ type: "negative", campaignId }],
          existing,
          spend: combine(items.length ? [negativeReason(items.length)] : []),
          reduceOnly: true,
          verify: async (res) => reread(ctx, R, res.filter((r) => r.ok && r.id).map((r) => String(r.id))),
          summary: `${items.length} negative keyword(s) added`,
        },
        o,
      );
    }),
  );
  doc(add, {
    endpoint: "POST /v1/negative-keywords/bulk-create",
    schema: "NegativeKeywordCreateBulkRequest",
    examples: ["apple-ads-cli negatives add --campaign-id 111111111 --text 'free example' --dry-run", "apple-ads-cli negatives add --ad-group-id 222222222 --text 'example' --match-type BROAD --confirm"],
    notes: ["Apple's default match type is BROAD; this CLI defaults to EXACT"],
  });

  registerBulkStatus(g, deps, R, "pause");
  registerBulkStatus(g, deps, R, "resume");
  registerBulkDelete(g, deps, R);
}
