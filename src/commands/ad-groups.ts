import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { runPlan } from "../mutate.js";
import { parseAmount } from "../money.js";
import { filter, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { bidReason, combine, createReason, endTimeReason, nameReason, reason, searchMatchReason, overlayReasons, type Reason } from "../spend.js";
import { nowApiDateTime, toApiDateTime } from "../time.js";
import { addListFlags, addWriteFlags, CHANGED_FIELDS, deepMerge, doc, getOne, idArg, listEntities, readOverlay, registerDelete, registerGet, registerStatus, statusFields } from "./shared.js";

const R = RESOURCES.adGroups;

function onOff(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === "on" || v === "true") return true;
  if (v === "off" || v === "false") return false;
  throw usageError("--search-match takes on or off");
}

export interface AdGroupCreateInput {
  campaign: any;
  name: string;
  bid: string;
  currency: string;
  searchMatch?: boolean;
  start?: string;
  end?: string;
  status?: string;
  nowMs: number;
}

export function buildAdGroupBody(i: AdGroupCreateInput): Record<string, unknown> {
  const status = (i.status ?? "PAUSED").toUpperCase();
  if (status !== "PAUSED" && status !== "ENABLED") throw usageError("--status must be PAUSED or ENABLED");
  const billing = i.campaign?.billingEvent ?? "TAPS";
  const bs = i.campaign?.bidStrategy ?? {};
  const body: Record<string, unknown> = {
    campaignId: Number(i.campaign.id),
    name: i.name,
    pricingModel: billing === "IMPRESSIONS" ? "CPM" : "CPT",
    automatedKeywordsOptIn: i.searchMatch ?? false,
    bidStrategy: {
      bidStrategyType: bs.bidStrategyType ?? "MANUAL_CPT",
      bidStrategyGoal: bs.bidStrategyGoal ?? "TAP",
      bid: { amount: parseAmount(i.bid, "--bid"), currency: i.currency },
    },
    // Creation fails without a startTime, although the schema marks it optional.
    startTime: i.start ? toApiDateTime(i.start, "start") : nowApiDateTime(i.nowMs),
  };
  if (i.end) body.endTime = toApiDateTime(i.end, "end");
  body.status = status;
  if (!i.name.trim()) throw usageError("--name must not be empty");
  return body;
}

export function registerAdGroups(program: Command, deps: Deps): void {
  const g = program.command("ad-groups").description("List, inspect, create and change ad groups");

  const list = addListFlags(g.command("list").description("List ad groups"), "entity")
    .option("--campaign-id <id>", "only this campaign's ad groups", idArg("--campaign-id"))
    .option("--status <status>", "ENABLED or PAUSED")
    .option("--name <text>", "name contains this text, any case (LIKE, ignoreCase)")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [];
        if (o.campaignId) f.push(filter("campaignId", "EQUALS", o.campaignId));
        if (o.status) f.push(filter("status", "EQUALS", o.status.toUpperCase()));
        if (o.name) f.push({ ...filter("name", "LIKE", o.name), ignoreCase: true });
        await listEntities(ctx, R, o, f);
      }),
    );
  doc(list, { endpoint: "POST /v1/adgroups/query", schema: "QueryRequest -> AdGroup[]", examples: ["apple-ads-cli ad-groups list --campaign-id 111111111"] });

  registerGet(g, deps, R);

  const create = g
    .command("create")
    .description("Create an ad group (PAUSED unless --status ENABLED)")
    .requiredOption("--campaign-id <id>", "parent campaign", idArg("--campaign-id"))
    .requiredOption("--name <name>", "ad group name")
    .requiredOption("--bid <amount>", "default max CPT bid, e.g. 0.60")
    .option("--search-match <on|off>", "Search Match (automatedKeywordsOptIn), default off")
    .option("--start <date>", "start (UTC; default now)")
    .option("--end <date>", "end (UTC)")
    .option("--status <status>", "PAUSED (default) or ENABLED")
    .option("--allow-duplicate", "create even if the campaign has an ad group with this name");
  addWriteFlags(create, { money: true });
  create.action(
    act(deps, async (ctx, o) => {
      const campaign = await getOne(ctx, RESOURCES.campaigns, o.campaignId);
      const currency = campaign?.dailyBudget?.value?.currency ?? (await ctx.currency());
      const flagsBody = buildAdGroupBody({ campaign: { ...campaign, id: o.campaignId }, name: o.name, bid: o.bid, currency, searchMatch: onOff(o.searchMatch), start: o.start, end: o.end, status: o.status, nowMs: ctx.deps.now() });
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, flagsBody) : flagsBody;
      const dup = await ctx.client.request({
        method: "POST",
        path: R.queryPath,
        body: { filters: [filter("campaignId", "EQUALS", o.campaignId), filter("name", "EQUALS", String(body.name))], pagination: { offset: 0, pageSize: 10 } },
      });
      const existing = (dup.json?.result ?? []).map(statusFields);
      const skip = existing.length > 0 && !o.allowDuplicate;
      const reasons = [createReason("ad group", String(body.status), campaign?.displayStatus === "RUNNING")];
      if (body.automatedKeywordsOptIn === true) reasons.push(searchMatchReason("(new)", true));
      await runPlan(
        ctx,
        {
          action: "ad-groups.create",
          steps: skip ? [] : [{ method: "POST", path: R.path, body }],
          targets: [{ type: "adGroup", campaignId: String(o.campaignId) }],
          existing,
          spend: combine(reasons),
          verify: async (res) => (res[0]?.id ? [statusFields(await getOne(ctx, R, String(res[0].id)))] : []),
          summary: `ad group "${body.name}" created ${body.status}`,
        },
        o,
      );
    }),
  );
  doc(create, {
    endpoint: "POST /v1/adgroups",
    schema: "AdGroupCreate",
    examples: ["apple-ads-cli ad-groups create --campaign-id 111111111 --name 'Example Group' --bid 0.60 --dry-run"],
    notes: ["pricingModel follows the campaign billingEvent (TAPS -> CPT)"],
  });

  const update = g
    .command("update")
    .description("Change an ad group's bid, name, Search Match or end date")
    .argument("<id>", "ad group ID", idArg("ad group ID"))
    .option("--bid <amount>", "new default max CPT bid")
    .option("--name <name>", "new name")
    .option("--search-match <on|off>", "turn Search Match on or off")
    .option("--end <date>", "new end (UTC), or 'none'");
  addWriteFlags(update, { money: true });
  update.action(
    act(deps, async (ctx, o, [id]) => {
      const before = await getOne(ctx, R, id!);
      const patch: Record<string, unknown> = {};
      const reasons: Reason[] = [];
      const changes: unknown[] = [];
      if (o.bid) {
        const amount = parseAmount(o.bid, "--bid");
        const bs = before.bidStrategy ?? {};
        const currency = bs.bid?.currency ?? (await ctx.currency());
        patch.bidStrategy = { bidStrategyType: bs.bidStrategyType ?? "MANUAL_CPT", bidStrategyGoal: bs.bidStrategyGoal ?? "TAP", bid: { amount, currency } };
        reasons.push(bidReason("ad group", id!, bs.bid?.amount, amount));
        changes.push({ field: "bidStrategy.bid", before: bs.bid?.amount, after: amount });
      }
      if (o.name) {
        patch.name = o.name;
        reasons.push(nameReason("ad group", id!));
        changes.push({ field: "name", before: before.name, after: o.name });
      }
      const sm = onOff(o.searchMatch);
      if (sm !== undefined) {
        patch.automatedKeywordsOptIn = sm;
        reasons.push(searchMatchReason(id!, sm));
        changes.push({ field: "automatedKeywordsOptIn", before: before.automatedKeywordsOptIn, after: sm });
      }
      if (o.end) {
        patch.endTime = o.end === "none" ? null : toApiDateTime(o.end, "end");
        reasons.push(endTimeReason("ad group", id!, before.endTime, patch.endTime as string | null));
        changes.push({ field: "endTime", before: before.endTime ?? null, after: patch.endTime });
      }
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, patch) : patch;
      if (overlay) reasons.push(...overlayReasons("ad group", id!, before, overlay, patch));
      if (!Object.keys(body).length) throw usageError("Nothing to change", "pass --bid, --name, --search-match, --end or --data");
      await runPlan(
        ctx,
        {
          action: "ad-groups.update",
          steps: [{ method: "PUT", path: `${R.path}/${id}`, body }],
          targets: [{ type: "adGroup", id, campaignId: String(before.campaignId) }],
          before: statusFields(before, CHANGED_FIELDS.adGroup),
          changes,
          spend: combine(reasons),
          verify: async () => [statusFields(await getOne(ctx, R, id!), CHANGED_FIELDS.adGroup)],
          summary: `ad group ${id} updated`,
        },
        o,
      );
    }),
  );
  doc(update, { endpoint: "PUT /v1/adgroups/{id}", schema: "AdGroupUpdate", examples: ["apple-ads-cli ad-groups update 222222222 --bid 0.70 --dry-run"] });

  registerStatus(g, deps, R, "pause");
  registerStatus(g, deps, R, "resume");
  registerDelete(g, deps, R);
}
