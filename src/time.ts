import { usageError } from "./errors.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for an instant in a time zone. */
export function dateIn(timeZone: string, nowMs: number): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function checkDate(v: string, name: string): string {
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw usageError(`${name} must be YYYY-MM-DD, today or yesterday (got "${v}")`);
  return v;
}

export function resolveDateWord(v: string, today: string, name: string): string {
  if (v === "today") return today;
  if (v === "yesterday") return addDays(today, -1);
  return checkDate(v, name);
}

export interface RangeInput {
  last?: string;
  start?: string;
  end?: string;
}

/** Resolves --last Nd or --start/--end. --last excludes today. */
export function resolveRange(input: RangeInput, today: string): { start: string; end: string } {
  if (input.last && (input.start || input.end)) throw usageError("Use --last or --start/--end, not both");
  if (input.start || input.end) {
    if (!input.start || !input.end) throw usageError("--start and --end go together");
    const start = resolveDateWord(input.start, today, "--start");
    const end = resolveDateWord(input.end, today, "--end");
    if (start > end) throw usageError(`--start ${start} is after --end ${end}`);
    return { start, end };
  }
  const last = input.last ?? "7d";
  const m = /^(\d{1,3})d$/.exec(last);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 365) throw usageError(`Bad --last "${last}"`, "use Nd with N from 1 to 365, for example 7d, 28d or 90d");
  const n = Number(m[1]);
  return { start: addDays(today, -n), end: addDays(today, -1) };
}

/** Converts a date or date-time to Apple's UTC format yyyy-MM-ddTHH:mm:ss.SSS (no zone suffix). */
export function toApiDateTime(v: string, edge: "start" | "end"): string {
  const s = v.trim();
  if (DATE_RE.test(s)) {
    checkDate(s, "date");
    return `${s}T${edge === "start" ? "00:00:00.000" : "23:59:59.000"}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]00:?00)?$/.exec(s);
  if (!m) throw usageError(`Bad date-time "${v}"`, "use YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS] in UTC");
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}.${(m[5] ?? "000").padEnd(3, "0")}`;
}

/** Current UTC time rounded down to the minute, in Apple's format. */
export function nowApiDateTime(nowMs: number): string {
  const d = new Date(Math.floor(nowMs / 60_000) * 60_000);
  return d.toISOString().slice(0, 23);
}

export type Granularity = "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";

export function validateGranularity(g: Granularity | undefined, start: string, end: string, today: string, kind: string): void {
  if (!g) return;
  const span = daysBetweenInclusive(start, end);
  switch (g) {
    case "HOURLY":
      if (kind === "ads" || kind === "search-terms") throw usageError(`HOURLY is not supported for ${kind} reports`, "use DAILY or omit --granularity");
      if (span > 7) throw usageError(`HOURLY needs a span of 7 days or less (got ${span})`, "use --last 7d or less, or --granularity DAILY");
      if (daysBetweenInclusive(start, today) > 366) throw usageError("HOURLY needs a start date within the last 365 days", "move --start later, or use --granularity DAILY");
      return;
    case "DAILY":
      if (span > 90) throw usageError(`DAILY needs a span of 90 days or less (got ${span})`, "use --granularity WEEKLY or a shorter range");
      return;
    case "WEEKLY":
      if (span < 14) throw usageError(`WEEKLY needs a span of 14 days or more (got ${span})`, "use --last 14d or more, or --granularity DAILY");
      return;
    case "MONTHLY":
      if (span < 90) throw usageError(`MONTHLY needs a span of 90 days or more (got ${span})`, "use --last 90d or more, or --granularity WEEKLY");
      return;
    default:
      throw usageError(`Unknown granularity ${g as string}`, "use HOURLY, DAILY, WEEKLY or MONTHLY");
  }
}
