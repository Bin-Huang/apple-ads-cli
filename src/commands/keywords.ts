import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import type { Target } from "../guard.js";
import { runPlan } from "../mutate.js";
import { parseAmount } from "../money.js";
import { filter, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { bidReason, combine, createReason, reason, type Reason } from "../spend.js";
import { addListFlags, addWriteFlags, CHANGED_FIELDS, checkIds, doc, getOne, idArg, listEntities, reread, registerGet, statusFields } from "./shared.js";
import { bulkSteps, existingKeys, keywordInputs, matchType, registerBulkDelete, registerBulkStatus } from "./keywords-common.js";

const R = RESOURCES.keywords;
const collect = (v: string, prev: string[] = []) => [...prev, v];

export function registerKeywords(program: Command, deps: Deps): void {
  const g = program.command("keywords").description("List, add and change targeting keywords");

  const list = addListFlags(g.command("list").description("List keywords (needs --campaign-id or --ad-group-id)"), "entity")
    .option("--campaign-id <id>", "every keyword in this campaign", idArg("--campaign-id"))
    .option("--ad-group-id <id>", "keywords in this ad group", idArg("--ad-group-id"))
    .option("--status <status>", "ENABLED or PAUSED")
    .action(
      act(deps, async (ctx, o) => {
        if (!o.campaignId && !o.adGroupId) throw usageError("keywords list needs --campaign-id or --ad-group-id", "Apple rejects keyword queries without one");
        const f: Filter[] = [];
        if (o.campaignId) f.push(filter("campaignId", "EQUALS", o.campaignId));
        if (o.adGroupId) f.push(filter("adGroupId", "EQUALS", o.adGroupId));
        if (o.status) f.push(filter("status", "EQUALS", o.status.toUpperCase()));
        await listEntities(ctx, R, o, f);
      }),
    );
  doc(list, { endpoint: "POST /v1/keywords/query", schema: "QueryRequest -> Keyword[]", examples: ["apple-ads-cli keywords list --ad-group-id 222222222", "apple-ads-cli keywords list --campaign-id 111111111 --all"] });

  registerGet(g, deps, R);

  const add = g
    .command("add")
    .description("Add keywords to an ad group (skips ones that already exist)")
    .requiredOption("--ad-group-id <id>", "ad group", idArg("--ad-group-id"))
    .option("--text <text>", "keyword text (repeatable)", collect)
    .option("--file <path>", "JSON array (strings or {text, matchType?, bid?}) or CSV text[,matchType[,bid]]; '-' for stdin")
    .option("--match-type <type>", "EXACT (default) or BROAD")
    .option("--bid <amount>", "max CPT bid for these keywords (default: the ad group bid)")
    .option("--status <status>", "ENABLED (default) or PAUSED")
    .option("--allow-duplicate", "send even if text and match type exist");
  addWriteFlags(add, { data: false, money: true });
  add.action(
    act(deps, async (ctx, o) => {
      const inputs = await keywordInputs(ctx, o);
      const adGroup = await getOne(ctx, RESOURCES.adGroups, o.adGroupId);
      const currency = adGroup?.bidStrategy?.bid?.currency ?? (await ctx.currency());
      const have = await existingKeys(ctx, R, [filter("adGroupId", "EQUALS", o.adGroupId)]);
      const existing: unknown[] = [];
      const items: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const k of inputs) {
        const mt = matchType(k.matchType ?? o.matchType);
        const key = `${k.text.toLowerCase()}|${mt}`;
        if ((have.has(key) || seen.has(key)) && !o.allowDuplicate) {
          existing.push({ text: k.text, matchType: mt, ...(have.get(key) ? { id: have.get(key).id, status: have.get(key).status } : { duplicateInInput: true }) });
          continue;
        }
        seen.add(key);
        const data: Record<string, unknown> = { adGroupId: Number(o.adGroupId), text: k.text, matchType: mt };
        const bid = k.bid ?? o.bid;
        if (bid) data.bid = { amount: parseAmount(bid, "bid"), currency };
        const st = (k.status ?? o.status)?.toUpperCase();
        if (st) {
          if (st !== "ENABLED" && st !== "PAUSED") throw usageError("--status must be ENABLED or PAUSED");
          data.status = st;
        }
        items.push(data);
      }
      const running = adGroup?.displayStatus === "RUNNING";
      await runPlan(
        ctx,
        {
          action: "keywords.add",
          steps: items.length ? bulkSteps(`${R.path}/bulk-create`, items) : [],
          targets: [{ type: "keyword", campaignId: String(adGroup.campaignId) }],
          existing,
          spend: combine(items.length ? [createReason(`${items.length} keyword(s)`, items.some((d) => (d.status ?? "ENABLED") === "ENABLED") ? "ENABLED" : "PAUSED", running)] : []),
          verify: async (res) => reread(ctx, R, res.filter((r) => r.ok && r.id).map((r) => String(r.id))),
          summary: `${items.length} keyword(s) added to ad group ${o.adGroupId}`,
        },
        o,
      );
    }),
  );
  doc(add, {
    endpoint: "POST /v1/keywords/bulk-create",
    schema: "KeywordCreateBulkRequest {allowPartialSuccess, items[{correlationId, data: KeywordCreate}]}",
    examples: ["apple-ads-cli keywords add --ad-group-id 222222222 --text 'example term' --text 'other term' --dry-run", "apple-ads-cli keywords add --ad-group-id 222222222 --file kws.csv --bid 0.50 --confirm"],
    notes: ["sent in chunks of 100 with allowPartialSuccess; created IDs are printed even when some items fail"],
  });

  const update = g
    .command("update")
    .description("Change keyword bids (or status) by ID or from a file")
    .argument("[ids...]", "keyword ID(s)")
    .option("--bid <amount>", "new max CPT bid for the given IDs")
    .option("--file <path>", "JSON array of {id, bid?, status?}");
  addWriteFlags(update, { data: false, money: true });
  update.action(
    act(deps, async (ctx, o, ids) => {
      let wanted: Array<{ id: string; bid?: string; status?: string }>;
      if (o.file) {
        if (ids.length || o.bid) throw usageError("Use IDs with --bid, or --file, not both");
        const arr = JSON.parse(readFileSync(o.file, "utf8"));
        if (!Array.isArray(arr)) throw usageError("--file must be a JSON array of {id, bid?, status?}");
        wanted = arr.map((x: any) => ({ id: String(x.id), bid: x.bid !== undefined ? String(x.bid?.amount ?? x.bid) : undefined, status: x.status }));
      } else {
        if (!o.bid) throw usageError("Give --bid <amount> with keyword IDs, or --file");
        wanted = checkIds(ids, "keyword ID").map((id) => ({ id, bid: o.bid }));
      }
      checkIds(wanted.map((w) => w.id), "keyword ID");
      const before: unknown[] = [];
      const targets: Target[] = [];
      const reasons: Reason[] = [];
      const changes: unknown[] = [];
      const items: Record<string, unknown>[] = [];
      for (const w of wanted) {
        const k = await getOne(ctx, R, w.id);
        before.push(statusFields(k, CHANGED_FIELDS.keyword));
        targets.push({ type: "keyword", id: w.id, campaignId: k.campaignId !== undefined ? String(k.campaignId) : undefined });
        const data: Record<string, unknown> = { id: Number(w.id) };
        if (w.bid !== undefined) {
          const amount = parseAmount(w.bid, `bid for ${w.id}`);
          data.bid = { amount, currency: k.bid?.currency ?? (await ctx.currency()) };
          reasons.push(bidReason("keyword", w.id, k.bid?.amount, amount));
          changes.push({ id: Number(w.id), text: k.text, field: "bid", before: k.bid?.amount ?? null, after: amount });
        }
        if (w.status) {
          const st = w.status.toUpperCase();
          if (st !== "ENABLED" && st !== "PAUSED") throw usageError(`status for ${w.id} must be ENABLED or PAUSED`);
          data.status = st;
          reasons.push(reason(st === "ENABLED" ? "increase" : "decrease", `keyword ${w.id} ${st}`));
        }
        items.push(data);
      }
      const large = reasons.filter((r) => r.largeStep).length;
      if (large) ctx.out.note(`${large} change(s) are larger than 15% in one step; the playbook suggests at most 15% per step`);
      await runPlan(
        ctx,
        {
          action: "keywords.update",
          steps: bulkSteps(`${R.path}/bulk-update`, items),
          targets,
          before,
          changes,
          spend: combine(reasons),
          verify: () => reread(ctx, R, wanted.map((w) => w.id)),
          summary: `${items.length} keyword(s) updated`,
        },
        o,
      );
    }),
  );
  doc(update, {
    endpoint: "POST /v1/keywords/bulk-update",
    schema: "KeywordUpdateBulkRequest {allowPartialSuccess, items[{correlationId, data:{id, bid?, status?}}]}",
    examples: ["apple-ads-cli keywords update 333333333 --bid 0.55 --dry-run", "apple-ads-cli keywords update --file updates.json --confirm"],
    notes: ["the plan shows old -> new bid and flags changes over 15%"],
  });

  registerBulkStatus(g, deps, R, "pause");
  registerBulkStatus(g, deps, R, "resume");
  registerBulkDelete(g, deps, R);
}
