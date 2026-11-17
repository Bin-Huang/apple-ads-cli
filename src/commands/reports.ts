import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { PAGE_MAX_REPORT } from "../constants.js";
import { usageError } from "../errors.js";
import type { Column } from "../output.js";
import { filter, paginate, parseFilterFlag, parseSort, type Filter, type Sort } from "../query.js";
import { addDays, resolveRange, validateGranularity, type Granularity } from "../time.js";
import { addListFlags, doc, idArg, listOpts, truncationNote } from "./shared.js";

export type ReportKind = "campaigns" | "ad-groups" | "keywords" | "search-terms" | "ads";

export const REPORT_PATH: Record<ReportKind, string> = {
  campaigns: "/reports/apps/campaigns/query",
  "ad-groups": "/reports/apps/adgroups/query",
  keywords: "/reports/apps/keywords/query",
  "search-terms": "/reports/apps/searchterms/query",
  ads: "/reports/apps/ads/query",
};

export const GROUP_BY: Record<ReportKind, string[]> = {
  campaigns: ["deviceClass", "ageRange", "gender", "countryCode", "adminArea", "locality", "countryOrRegion"],
  "ad-groups": ["deviceClass", "ageRange", "gender", "countryCode", "adminArea", "locality", "countryOrRegion"],
  keywords: ["deviceClass", "countryOrRegion"],
  "search-terms": ["deviceClass", "countryOrRegion"],
  ads: ["countryOrRegion"],
};

export const COUNT_METRICS = [
  "impressions", "taps", "tapInstalls", "viewInstalls", "totalInstalls", "tapNewDownloads", "tapRedownloads",
  "totalNewDownloads", "totalRedownloads", "viewNewDownloads", "viewRedownloads", "tapPreOrdersPlaced",
  "viewPreOrdersPlaced", "totalPreOrdersPlaced",
];

export const METRICS = [
  "localSpend", "impressions", "taps", "ttr", "cpt", "cpm", "tapInstalls", "tapInstallCPI", "tapInstallRate",
  "tapNewDownloads", "tapRedownloads", "viewInstalls", "viewNewDownloads", "viewRedownloads", "totalInstalls",
  "totalNewDownloads", "totalRedownloads", "totalAvgCPI", "totalInstallRate", "tapPreOrdersPlaced",
  "viewPreOrdersPlaced", "totalPreOrdersPlaced",
];

export interface ReportOpts {
  campaignIds?: string[];
  adGroupId?: string;
  last?: string;
  start?: string;
  end?: string;
  granularity?: string;
  groupBy?: string[];
  timeZone?: string;
  sort?: string[];
  metrics?: string;
  includeEmpty?: boolean;
  grandTotal?: boolean;
  filter?: string[];
}

/** The one report body builder: always sends timeRange and sorting, never v5 names. */
export function buildReportBody(kind: ReportKind, o: ReportOpts, today: string): { body: Record<string, unknown>; start: string; end: string; timeZone: string } {
  const { start, end } = resolveRange({ last: o.last, start: o.start, end: o.end }, today);
  const granularity = o.granularity ? (o.granularity.toUpperCase() as Granularity) : undefined;
  validateGranularity(granularity, start, end, today, kind);
  const timeZone = (o.timeZone ?? "ORTZ").toUpperCase();
  if (timeZone !== "ORTZ" && timeZone !== "UTC") throw usageError("--time-zone must be ORTZ or UTC");
  if (kind === "search-terms" && timeZone === "UTC") throw usageError("search-terms reports support ORTZ only", "drop --time-zone UTC");

  const filters: Filter[] = [];
  if (kind === "campaigns") {
    if (o.adGroupId) throw usageError("reports campaigns does not take --ad-group-id", "use reports ad-groups --campaign-id <id>");
    // Campaign reports reject campaignId; they filter on id.
    if (o.campaignIds?.length) filters.push(filter("id", "IN", o.campaignIds.map(String)));
  } else {
    if (!o.campaignIds?.length) throw usageError(`reports ${kind} needs --campaign-id`, "Apple requires a campaignId filter for this report");
    if (o.campaignIds.length > 1) throw usageError(`reports ${kind} takes one --campaign-id`);
    filters.push(filter("campaignId", "EQUALS", [String(o.campaignIds[0])]));
    if (o.adGroupId) filters.push(filter("adGroupId", "EQUALS", [String(o.adGroupId)]));
  }
  for (const f of o.filter ?? []) filters.push(parseFilterFlag(f));

  const groupBy = (o.groupBy ?? []).flatMap((g) => g.split(",")).map((g) => g.trim()).filter(Boolean);
  for (const g of groupBy) if (!GROUP_BY[kind].includes(g)) throw usageError(`--group-by ${g} is not valid for ${kind} reports`, `use: ${GROUP_BY[kind].join(", ")}`);
  if (o.includeEmpty && groupBy.length) throw usageError("--include-empty cannot be combined with --group-by");
  if (o.includeEmpty && kind === "search-terms") throw usageError("search-terms reports do not support --include-empty");

  const sorting: Sort[] = (o.sort?.length ? o.sort : ["localSpend:DESC"]).map(parseSort);
  const includeRows: string[] = [];
  if (o.grandTotal !== false) includeRows.push("GRAND_TOTAL");
  if (o.includeEmpty) includeRows.push("EMPTY_METRICS");

  const timeRange: Record<string, string> = { start, end, timeZone };
  if (granularity) timeRange.granularity = granularity;
  const body: Record<string, unknown> = { timeRange };
  if (filters.length) body.filters = filters;
  if (o.metrics) body.fields = o.metrics.split(",").map((s) => s.trim()).filter(Boolean);
  if (groupBy.length) body.groupBy = groupBy;
  body.sorting = sorting;
  if (includeRows.length) body.options = { includeRows };
  return { body, start, end, timeZone };
}

/** The count metrics to zero-fill: the requested --metrics that are counts, else every count metric. */
export function countMetricsFor(metrics?: string): string[] {
  if (!metrics) return COUNT_METRICS;
  const asked = metrics.split(",").map((s) => s.trim());
  return COUNT_METRICS.filter((k) => asked.includes(k));
}

function zeroCounts(m: any, counts: string[] = COUNT_METRICS): any {
  if (!m || typeof m !== "object") return m;
  const out = { ...m };
  for (const k of counts) if (out[k] === undefined || out[k] === null) out[k] = 0;
  return out;
}

/** Empty result -> [], missing requested counts -> 0, Default Ad rows dropped, low-volume flagged. */
export function normalizeRows(kind: ReportKind, rows: any[], includeDefaultAds = false, counts: string[] = COUNT_METRICS): any[] {
  const out: any[] = [];
  for (const row of rows ?? []) {
    const r = { ...row };
    if (r.totalMetrics) r.totalMetrics = zeroCounts(r.totalMetrics, counts);
    if (Array.isArray(r.granularMetrics)) r.granularMetrics = r.granularMetrics.map((g: any) => zeroCounts(g, counts));
    const cli: Record<string, unknown> = {};
    if (kind === "ads" && Number(r.metadata?.id) === -1) {
      if (!includeDefaultAds) continue;
      cli.defaultAd = true;
    }
    if (kind === "search-terms" && !r.metadata?.searchTermText) cli.lowVolume = true;
    if (Object.keys(cli).length) r.cli = cli;
    out.push(r);
  }
  return out;
}

const NAME_PATH: Record<ReportKind, string> = {
  campaigns: "metadata.name",
  "ad-groups": "metadata.name",
  keywords: "metadata.text",
  "search-terms": "metadata.searchTermText",
  ads: "metadata.name",
};

function columns(kind: ReportKind, groupBy: string[]): Column[] {
  const m = (h: string) => ({ header: h, path: `totalMetrics.${h}` });
  return [
    { header: "id", path: "metadata.id" },
    { header: "name", path: NAME_PATH[kind] },
    ...groupBy.map((g) => ({ header: g, path: `metadata.${g}` })),
    ...["impressions", "taps", "ttr", "localSpend", "tapInstalls", "tapInstallCPI", "tapInstallRate"].map(m),
  ];
}

const collect = (v: string, prev: string[] = []) => [...prev, v];

function registerReport(g: Command, deps: Deps, kind: ReportKind, description: string): void {
  const cmd = g.command(kind).description(description);
  if (kind === "campaigns") cmd.option("--campaign-id <ids...>", "only these campaigns (sent as an id IN filter)");
  else cmd.requiredOption("--campaign-id <id>", "the campaign (required by Apple)", idArg("--campaign-id"));
  if (kind !== "campaigns") cmd.option("--ad-group-id <id>", "only this ad group", idArg("--ad-group-id"));
  cmd
    .option("--last <Nd>", "the N full days before today in the account time zone (default 7d)")
    .option("--start <date>", "YYYY-MM-DD, today or yesterday (with --end)")
    .option("--end <date>", "YYYY-MM-DD, today or yesterday (inclusive)")
    .option("--granularity <g>", "HOURLY, DAILY, WEEKLY or MONTHLY (default: totals only)")
    .option("--group-by <dims>", `dimensions: ${GROUP_BY[kind].join(", ")}`, collect)
    .option("--time-zone <tz>", "ORTZ (account time zone, default) or UTC")
    .option("--metrics <a,b>", "only these metric fields")
    .option("--include-empty", "include rows with no activity (EMPTY_METRICS)")
    .option("--no-grand-total", "skip the grand total");
  if (kind === "ads") cmd.option("--include-default-ads", "keep Apple's synthetic 'Default Ad' rows (id -1)");
  addListFlags(cmd, "report");
  cmd.action(
    act(deps, async (ctx, o) => {
      const today = await ctx.today();
      const campaignIds: string[] | undefined = o.campaignId === undefined ? undefined : Array.isArray(o.campaignId) ? o.campaignId.flatMap((x: string) => x.split(",")) : [o.campaignId];
      for (const id of campaignIds ?? []) if (!/^\d+$/.test(id)) throw usageError(`--campaign-id must be numeric (got "${id}")`);
      const built = buildReportBody(kind, { ...o, campaignIds }, today);
      const page = await paginate(ctx.client, { path: REPORT_PATH[kind], body: built.body, pageMax: PAGE_MAX_REPORT, rows: (j) => j?.result?.rows ?? [], ...listOpts(o, "report") });
      const counts = countMetricsFor(o.metrics);
      const rows = normalizeRows(kind, page.rows as any[], !!o.includeDefaultAds, counts);
      const dropped = page.rows.length - rows.length;
      const pagination = { ...page.pagination, returned: rows.length, ...(kind === "ads" && dropped ? { droppedDefaultAds: dropped } : {}) };
      const grandTotal = page.first?.result?.summary?.grandTotal;
      const provisionalStart = addDays(today, -2);
      const account = await ctx.account().catch(() => ({}));
      const result: Record<string, unknown> = { rows };
      if (grandTotal) result.grandTotal = zeroCounts(grandTotal, counts);
      ctx.out.emit(
        {
          result,
          pagination,
          cli: {
            report: kind,
            timeRange: { start: built.start, end: built.end },
            timeZone: built.timeZone === "ORTZ" ? `ORTZ (${account?.timezone ?? "account time zone"})` : "UTC",
            granularity: o.granularity?.toUpperCase() ?? null,
            currency: account?.currency ?? null,
            provisionalFrom: built.end >= provisionalStart ? (built.start > provisionalStart ? built.start : provisionalStart) : null,
            notes: [
              "the last 1-2 days are provisional; installs can arrive late",
              "times in metadata are in the account time zone; read schedules from the entity endpoints",
              ...(kind === "search-terms" ? ["terms under 10 impressions a day are hidden by Apple (cli.lowVolume rows); Low Volume is not zero"] : []),
              ...(kind === "ads" && !o.includeDefaultAds ? ["Apple's synthetic 'Default Ad' rows (id -1) were dropped"] : []),
            ],
          },
        },
        columns(kind, built.body.groupBy as string[] | undefined ?? []),
      );
      truncationNote(ctx, page.pagination);
    }),
  );
  doc(cmd, {
    endpoint: `POST /v1${REPORT_PATH[kind]}`,
    schema: "AppsReportingRequest",
    examples:
      kind === "campaigns"
        ? ["apple-ads-cli reports campaigns --last 7d", "apple-ads-cli reports campaigns --campaign-id 111111111 --start 2026-11-01 --end 2026-11-14 --granularity DAILY"]
        : [`apple-ads-cli reports ${kind} --campaign-id 111111111 --last 28d`, `apple-ads-cli reports ${kind} --campaign-id 111111111 --start yesterday --end yesterday --output table`],
    notes: [
      "spans: HOURLY <= 7 days, DAILY <= 90, WEEKLY >= 14, MONTHLY >= 90",
      ...(kind === "search-terms" ? ["ORTZ only, no HOURLY"] : kind === "ads" ? ["no HOURLY"] : []),
    ],
  });
}

export function registerReports(program: Command, deps: Deps): void {
  const g = program.command("reports").description("Performance reports (synchronous, account time zone by default)");
  registerReport(g, deps, "campaigns", "Campaign report for the whole account or chosen campaigns");
  registerReport(g, deps, "ad-groups", "Ad group report for one campaign");
  registerReport(g, deps, "keywords", "Keyword report for one campaign");
  registerReport(g, deps, "search-terms", "Search term report for one campaign (ORTZ only)");
  registerReport(g, deps, "ads", "Ad report for one campaign");
}
