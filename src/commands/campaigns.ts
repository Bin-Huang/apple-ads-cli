import type { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { runPlan } from "../mutate.js";
import { parseAmount } from "../money.js";
import { buildQuery, filter, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { budgetCeilings, budgetReason, combine, countriesReason, createReason, endTimeReason, nameReason, reason, overlayReasons, type Reason } from "../spend.js";
import { nowApiDateTime, toApiDateTime } from "../time.js";
import { addListFlags, addWriteFlags, deepMerge, doc, getOne, idArg, listEntities, readOverlay, registerDelete, registerGet, registerStatus, statusFields } from "./shared.js";

const R = RESOURCES.campaigns;
const PLACEMENTS = ["APPSTORE_SEARCH_RESULTS", "APPSTORE_SEARCH_TAB", "APPSTORE_TODAY_TAB", "APPSTORE_PRODUCT_PAGES"];

export const withBudget = (ctx: Ctx) => (c: any) => ({ ...c, cli: { ...(c?.cli ?? {}), budget: budgetCeilings(c, ctx.deps.now()) } });

/** Status fields plus budget ceilings, computed from the full entity. */
const statusWithBudget = (ctx: Ctx, c: any) => ({ ...statusFields(c), cli: { budget: budgetCeilings(c, ctx.deps.now()) } });

function countries(v: string): string[] {
  const list = v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const c of list) if (!/^[A-Z]{2}$/.test(c)) throw usageError(`--countries takes 2-letter codes such as US,GB (got "${c}")`);
  return list;
}

function bidStrategy(v: string | undefined) {
  switch ((v ?? "manual-cpt").toLowerCase()) {
    case "manual-cpt":
      return { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP" };
    case "max-conversions":
      return { bidStrategyType: "MAX_CONVERSIONS", bidStrategyGoal: "INSTALL" };
    default:
      throw usageError(`--bid-strategy must be manual-cpt or max-conversions (got "${v}")`);
  }
}

export interface CampaignCreateInput {
  name: string;
  adamId: string;
  dailyBudget: string;
  currency: string;
  countries: string[];
  placement?: string;
  start?: string;
  end?: string;
  bidStrategy?: string;
  status?: string;
  adAccountId: string;
  nowMs: number;
}

/** The create body, in the field order of a request that worked. */
export function buildCampaignBody(i: CampaignCreateInput): Record<string, unknown> {
  if (!/^\d+$/.test(i.adamId)) throw usageError("--adam-id must be the numeric App Store app ID");
  const placement = (i.placement ?? "APPSTORE_SEARCH_RESULTS").toUpperCase();
  if (!PLACEMENTS.includes(placement)) throw usageError(`--placement must be one of ${PLACEMENTS.join(", ")}`);
  const status = (i.status ?? "PAUSED").toUpperCase();
  if (status !== "PAUSED" && status !== "ENABLED") throw usageError("--status must be PAUSED or ENABLED");
  const body: Record<string, unknown> = {
    name: i.name,
    adAccountId: Number(i.adAccountId),
    billingEvent: "TAPS",
    promotedObjectType: "APPSTORE_APP",
    promotedObjectId: i.adamId,
    dailyBudget: { value: { amount: parseAmount(i.dailyBudget, "--daily-budget"), currency: i.currency } },
    targeting: {
      supplySource: { include: ["APPSTORE"] },
      supplyPlacement: { include: [placement] },
      countryOrRegion: { include: i.countries },
    },
    bidStrategy: bidStrategy(i.bidStrategy),
    startTime: i.start ? toApiDateTime(i.start, "start") : nowApiDateTime(i.nowMs),
  };
  if (i.end) body.endTime = toApiDateTime(i.end, "end");
  if (body.endTime && (body.endTime as string) <= (body.startTime as string)) throw usageError("--end must be after --start");
  body.status = status;
  if (!i.name.trim() || i.name.length > 200) throw usageError("--name must be 1-200 characters");
  return body;
}

export function registerCampaigns(program: Command, deps: Deps): void {
  const g = program.command("campaigns").description("List, inspect, create and change campaigns");

  const list = addListFlags(g.command("list").description("List campaigns"), "entity")
    .option("--status <status>", "ENABLED or PAUSED")
    .option("--name <text>", "name contains this text, any case (LIKE, ignoreCase)")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [];
        if (o.status) f.push(filter("status", "EQUALS", o.status.toUpperCase()));
        if (o.name) f.push({ ...filter("name", "LIKE", o.name), ignoreCase: true });
        await listEntities(ctx, R, o, f, withBudget(ctx));
      }),
    );
  doc(list, { endpoint: "POST /v1/campaigns/query", schema: "QueryRequest -> Campaign[]", examples: ["apple-ads-cli campaigns list", "apple-ads-cli campaigns list --status ENABLED --output table"] });

  registerGet(g, deps, R, withBudget);

  const create = g
    .command("create")
    .description("Create an App Store search results campaign (PAUSED unless --status ENABLED)")
    .requiredOption("--name <name>", "campaign name")
    .requiredOption("--adam-id <id>", "App Store app ID to promote")
    .requiredOption("--daily-budget <amount>", "average daily budget, e.g. 5.00")
    .requiredOption("--countries <codes>", "comma-separated country codes, e.g. US,GB")
    .option("--placement <placement>", "supply placement", "APPSTORE_SEARCH_RESULTS")
    .option("--start <date>", "start (UTC date or date-time; default now)")
    .option("--end <date>", "end (UTC date or date-time; set one for tests)")
    .option("--bid-strategy <s>", "manual-cpt (default) or max-conversions")
    .option("--currency <code>", "default: the ad account currency")
    .option("--status <status>", "PAUSED (default) or ENABLED")
    .option("--allow-duplicate", "create even if a campaign with this name exists");
  addWriteFlags(create, { money: true });
  create.action(
    act(deps, async (ctx, o) => {
      const flagsBody = buildCampaignBody({
        name: o.name,
        adamId: o.adamId,
        dailyBudget: o.dailyBudget,
        currency: o.currency ?? (await ctx.currency()),
        countries: countries(o.countries),
        placement: o.placement,
        start: o.start,
        end: o.end,
        bidStrategy: o.bidStrategy,
        status: o.status,
        adAccountId: await ctx.adAccountId(),
        nowMs: ctx.deps.now(),
      });
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, flagsBody) : flagsBody;
      const dup = await ctx.client.request({ method: "POST", path: R.queryPath, body: { ...buildQuery({ filters: [filter("name", "EQUALS", String(body.name))] }), pagination: { offset: 0, pageSize: 10 } } });
      const existing = (dup.json?.result ?? []).map(statusFields);
      const skip = existing.length > 0 && !o.allowDuplicate;
      await runPlan(
        ctx,
        {
          action: "campaigns.create",
          steps: skip ? [] : [{ method: "POST", path: R.path, body }],
          targets: [{ type: "campaign" }],
          existing,
          spend: combine([createReason("campaign", String(body.status), undefined)], budgetCeilings(body, ctx.deps.now())),
          verify: async (res) => {
            const id = res[0]?.id;
            return id ? [statusWithBudget(ctx, await getOne(ctx, R, String(id)))] : [];
          },
          summary: `campaign "${body.name}" created ${body.status}`,
        },
        o,
      );
      if (skip) ctx.out.note(`a campaign named "${body.name}" exists (id ${existing[0].id}); pass --allow-duplicate to create another`);
    }),
  );
  doc(create, {
    endpoint: "POST /v1/campaigns",
    schema: "CampaignCreate",
    examples: [
      "apple-ads-cli campaigns create --name 'Example US Search' --adam-id 1234567890 --daily-budget 5.00 --countries US --end 2027-01-31 --dry-run",
      "apple-ads-cli campaigns create --name 'Example US Search' --adam-id 1234567890 --daily-budget 5.00 --countries US --confirm",
    ],
    notes: ["billingEvent TAPS, supplySource APPSTORE, bid strategy MANUAL_CPT/TAP; times are UTC"],
  });

  const update = g
    .command("update")
    .description("Change a campaign's name, budget, dates or countries")
    .argument("<id>", "campaign ID", idArg("campaign ID"))
    .option("--name <name>", "new name")
    .option("--daily-budget <amount>", "new average daily budget")
    .option("--start <date>", "new start (UTC)")
    .option("--end <date>", "new end (UTC), or 'none' to remove it")
    .option("--countries <codes>", "replace the country list, e.g. US,GB");
  addWriteFlags(update, { money: true });
  update.action(
    act(deps, async (ctx, o, [id]) => {
      const before = await getOne(ctx, R, id!);
      const patch: Record<string, unknown> = {};
      const reasons: Reason[] = [];
      const changes: unknown[] = [];
      if (o.name) {
        patch.name = o.name;
        reasons.push(nameReason("campaign", id!));
        changes.push({ field: "name", before: before.name, after: o.name });
      }
      if (o.dailyBudget) {
        const amount = parseAmount(o.dailyBudget, "--daily-budget");
        const currency = before.dailyBudget?.value?.currency ?? (await ctx.currency());
        patch.dailyBudget = { value: { amount, currency } };
        reasons.push(budgetReason(id!, before.dailyBudget?.value?.amount, amount));
        changes.push({ field: "dailyBudget", before: before.dailyBudget?.value?.amount, after: amount });
      }
      if (o.start) {
        patch.startTime = toApiDateTime(o.start, "start");
        reasons.push(reason("unknown", `campaign ${id} start ${before.startTime ?? "none"} -> ${patch.startTime}`));
        changes.push({ field: "startTime", before: before.startTime, after: patch.startTime });
      }
      if (o.end) {
        patch.endTime = o.end === "none" ? null : toApiDateTime(o.end, "end");
        reasons.push(endTimeReason("campaign", id!, before.endTime, patch.endTime as string | null));
        changes.push({ field: "endTime", before: before.endTime ?? null, after: patch.endTime });
      }
      if (o.countries) {
        const next = countries(o.countries);
        const prev: string[] = before.targeting?.countryOrRegion?.include ?? [];
        // Arrays are replaced whole, so send the full targeting the update accepts.
        patch.targeting = { supplyPlacement: before.targeting?.supplyPlacement, countryOrRegion: { include: next } };
        reasons.push(countriesReason(id!, prev, next));
        changes.push({ field: "targeting.countryOrRegion.include", before: prev, after: next });
      }
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, patch) : patch;
      if (overlay) reasons.push(...overlayReasons("campaign", id!, before, overlay, patch));
      if (!Object.keys(body).length) throw usageError("Nothing to change", "pass --name, --daily-budget, --start, --end, --countries or --data");
      await runPlan(
        ctx,
        {
          action: "campaigns.update",
          steps: [{ method: "PUT", path: `${R.path}/${id}`, body }],
          targets: [{ type: "campaign", id, campaignId: id }],
          before: statusFields(before),
          changes,
          spend: combine(reasons, budgetCeilings({ ...before, ...body }, ctx.deps.now())),
          verify: async () => [statusWithBudget(ctx, await getOne(ctx, R, id!))],
          summary: `campaign ${id} updated`,
        },
        o,
      );
    }),
  );
  doc(update, {
    endpoint: "PUT /v1/campaigns/{id}",
    schema: "CampaignUpdate",
    examples: ["apple-ads-cli campaigns update 111111111 --daily-budget 6.00 --dry-run", "apple-ads-cli campaigns update 111111111 --end 2027-02-28 --confirm"],
    notes: ["partial update; arrays (countries) are replaced whole"],
  });

  registerStatus(g, deps, R, "pause");
  registerStatus(g, deps, R, "resume");
  registerDelete(g, deps, R);
}
