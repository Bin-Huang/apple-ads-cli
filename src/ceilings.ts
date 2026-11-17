import { DEFAULT_MAX_BID, DEFAULT_MAX_DAILY_BUDGET } from "./constants.js";
import { cents } from "./money.js";
import { reason, type Reason } from "./spend.js";

export interface AmountCeilings {
  maxBid: string;
  maxDailyBudget: string;
}

export interface OverCeiling {
  field: "bid" | "dailyBudget";
  amount: string;
  ceiling: string;
  path: string;
}

/** Finds every bid ({bid:{amount}}) and daily budget ({dailyBudget:{value:{amount}}}) in a body above the ceilings. */
export function findOverCeiling(body: unknown, c: AmountCeilings): OverCeiling[] {
  const out: OverCeiling[] = [];
  const over = (amount: unknown, ceiling: string) => {
    const a = cents(String(amount));
    const m = cents(ceiling);
    return a !== undefined && m !== undefined && a > m;
  };
  const walk = (v: any, path: string): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    for (const [k, x] of Object.entries(v) as Array<[string, any]>) {
      const p = path ? `${path}.${k}` : k;
      if (k === "bid" && x && typeof x === "object" && x.amount !== undefined && over(x.amount, c.maxBid)) out.push({ field: "bid", amount: String(x.amount), ceiling: c.maxBid, path: p });
      else if (k === "dailyBudget" && x?.value?.amount !== undefined && over(x.value.amount, c.maxDailyBudget)) out.push({ field: "dailyBudget", amount: String(x.value.amount), ceiling: c.maxDailyBudget, path: p });
      else walk(x, p);
    }
  };
  walk(body, "");
  return out;
}

export function ceilingReasons(hits: OverCeiling[]): Reason[] {
  return hits.map((h) => reason("increase", `${h.path} ${h.amount} is above the ${h.field === "bid" ? "maxBid" : "maxDailyBudget"} ceiling ${h.ceiling}; large-step`, true));
}

export function resolveCeilings(s: { maxBid?: string; maxDailyBudget?: string }): AmountCeilings {
  return { maxBid: s.maxBid ?? DEFAULT_MAX_BID, maxDailyBudget: s.maxDailyBudget ?? DEFAULT_MAX_DAILY_BUDGET };
}
