import { LARGE_BID_STEP, LARGE_BUDGET_STEP, MONTHLY_BUDGET_FACTOR } from "./constants.js";
import { cents, fractionChange, pct } from "./money.js";

export type Effect = "increase" | "decrease" | "none" | "unknown";

export interface Reason {
  effect: Effect;
  text: string;
  largeStep?: boolean;
}

export interface Ceilings {
  daily: string | null;
  currency: string | null;
  monthlyMax: string | null;
  scheduledDays: number | null;
  scheduleMax: string | null;
  daysLeft: number | null;
}

export interface Spend {
  effect: Effect;
  reasons: Reason[];
  ceilings?: Ceilings;
}

export function combine(reasons: Reason[], ceilings?: Ceilings): Spend {
  const has = (e: Effect) => reasons.some((r) => r.effect === e);
  const effect: Effect = has("increase") ? "increase" : has("unknown") ? "unknown" : has("decrease") ? "decrease" : "none";
  const s: Spend = { effect, reasons };
  if (ceilings) s.ceilings = ceilings;
  return s;
}

const r = (effect: Effect, text: string, largeStep?: boolean): Reason => (largeStep ? { effect, text, largeStep } : { effect, text });

function money2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function parseApiTime(t: string | undefined): number | undefined {
  if (!t) return undefined;
  const ms = Date.parse(t.endsWith("Z") ? t : `${t}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Apple's ceilings for a campaign: daily × 30.4 a month, and days × daily when there is an end date. */
export function budgetCeilings(c: any, nowMs: number): Ceilings {
  const daily: string | undefined = c?.dailyBudget?.value?.amount ?? c?.dailyBudget?.amount;
  const currency: string | null = c?.dailyBudget?.value?.currency ?? c?.dailyBudget?.currency ?? null;
  const d = daily !== undefined ? Number(daily) : undefined;
  const start = parseApiTime(c?.startTime);
  const end = parseApiTime(c?.endTime);
  let scheduledDays: number | null = null;
  let daysLeft: number | null = null;
  if (end !== undefined) {
    const from = start ?? nowMs;
    scheduledDays = Math.max(0, Math.ceil((end - from) / 86_400_000));
    daysLeft = Math.max(0, Math.ceil((end - Math.max(nowMs, from)) / 86_400_000));
  }
  return {
    daily: d !== undefined ? money2(d) : null,
    currency,
    monthlyMax: d !== undefined ? money2(d * MONTHLY_BUDGET_FACTOR) : null,
    scheduledDays,
    scheduleMax: d !== undefined && scheduledDays !== null ? money2(d * scheduledDays) : null,
    daysLeft,
  };
}

export function statusReason(kind: string, id: string, status: string | undefined): Reason {
  if (status === "ENABLED") return r("increase", `${kind} ${id} enabled (can start spending)`);
  if (status === "PAUSED") return r("decrease", `${kind} ${id} paused`);
  return r("unknown", `${kind} ${id} status ${status ?? "unchanged"}`);
}

export function budgetReason(id: string, oldAmount: string | undefined, newAmount: string): Reason {
  const f = fractionChange(oldAmount, newAmount);
  const large = f !== undefined && Math.abs(f) > LARGE_BUDGET_STEP;
  const effect: Effect = cents(newAmount)! > (cents(oldAmount) ?? 0) ? "increase" : cents(newAmount)! < (cents(oldAmount) ?? 0) ? "decrease" : "none";
  return r(effect, `campaign ${id} daily budget ${oldAmount ?? "none"} -> ${newAmount} (${pct(f)})${large ? `; large-step: more than ${LARGE_BUDGET_STEP * 100}% in one change` : ""}`, large);
}

export function bidReason(kind: string, id: string, oldAmount: string | undefined, newAmount: string): Reason {
  const f = fractionChange(oldAmount, newAmount);
  const large = f !== undefined && Math.abs(f) > LARGE_BID_STEP;
  const o = cents(oldAmount);
  const n = cents(newAmount)!;
  const effect: Effect = o === undefined ? "unknown" : n > o ? "increase" : n < o ? "decrease" : "none";
  return r(effect, `${kind} ${id} bid ${oldAmount ?? "inherited"} -> ${newAmount} (${pct(f)})${large ? `; large-step: more than ${LARGE_BID_STEP * 100}% in one change` : ""}`, large);
}

export function endTimeReason(kind: string, id: string, oldEnd: string | undefined, newEnd: string | null): Reason {
  if (newEnd === null) return r("increase", `${kind} ${id} end date removed (runs with no end)`);
  if (!oldEnd || newEnd > oldEnd) return r("increase", `${kind} ${id} end date ${oldEnd ?? "none"} -> ${newEnd} (runs longer)`);
  if (newEnd < oldEnd) return r("decrease", `${kind} ${id} end date ${oldEnd} -> ${newEnd} (ends sooner)`);
  return r("none", `${kind} ${id} end date unchanged`);
}

export function countriesReason(id: string, oldC: string[], newC: string[]): Reason {
  const added = newC.filter((c) => !oldC.includes(c));
  const removed = oldC.filter((c) => !newC.includes(c));
  if (added.length) return r("increase", `campaign ${id} countries ${oldC.join(",")} -> ${newC.join(",")} (adds ${added.join(",")})`);
  if (removed.length) return r("decrease", `campaign ${id} countries ${oldC.join(",")} -> ${newC.join(",")} (removes ${removed.join(",")})`);
  return r("none", `campaign ${id} countries unchanged`);
}

export function searchMatchReason(id: string, on: boolean): Reason {
  return on ? r("increase", `ad group ${id} Search Match on (broader matching)`) : r("decrease", `ad group ${id} Search Match off`);
}

export function nameReason(kind: string, id: string): Reason {
  return r("none", `${kind} ${id} renamed`);
}

export function createReason(kind: string, status: string, parentRunning: boolean | undefined): Reason {
  if (status === "PAUSED") return r("none", `new ${kind} is PAUSED; enabling it is a separate step`);
  if (parentRunning === false) return r("none", `new ${kind} is ENABLED but its parent is not running`);
  return r(parentRunning ? "increase" : "unknown", `new ${kind} is ENABLED${parentRunning ? " under a running parent" : ""}`);
}

export function deleteReason(kind: string, id: string): Reason {
  return r("decrease", `${kind} ${id} deleted (cannot be undone)`);
}

export function negativeReason(n: number): Reason {
  return r("decrease", `${n} negative keyword(s) added (reduces reach)`);
}

export { r as reason };

/**
 * Spend reasons for --data/--file keys that no flag set: status, Search Match, budget, bid, end date and
 * countries are assessed like their flags; any other key is "unknown".
 */
export function overlayReasons(kind: "campaign" | "ad group", id: string, before: any, overlay: Record<string, any>, patch: Record<string, unknown>): Reason[] {
  const out: Reason[] = [];
  for (const k of Object.keys(overlay)) {
    if (k in patch) continue;
    const v = overlay[k];
    if (k === "status" && typeof v === "string") out.push(statusReason(kind, id, v.toUpperCase()));
    else if (k === "automatedKeywordsOptIn" && typeof v === "boolean") out.push(searchMatchReason(id, v));
    else if (k === "dailyBudget" && v?.value?.amount !== undefined) out.push(budgetReason(id, before?.dailyBudget?.value?.amount, String(v.value.amount)));
    else if (k === "bidStrategy" && v?.bid?.amount !== undefined) out.push(bidReason(kind, id, before?.bidStrategy?.bid?.amount, String(v.bid.amount)));
    else if (k === "endTime" && (v === null || typeof v === "string")) out.push(endTimeReason(kind, id, before?.endTime, v));
    else if (k === "targeting" && Array.isArray(v?.countryOrRegion?.include)) out.push(countriesReason(id, before?.targeting?.countryOrRegion?.include ?? [], v.countryOrRegion.include));
    else out.push(r("unknown", `${kind} ${id} field ${k} set from --data/--file`));
  }
  return out;
}
