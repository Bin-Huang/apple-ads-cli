import { usageError } from "./errors.js";

export interface Money {
  amount: string;
  currency: string;
}

const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

/** Validates a money string ("3.5", "0.60") and returns it with two decimals. */
export function parseAmount(value: string, field: string): string {
  const v = String(value).trim();
  if (!AMOUNT_RE.test(v)) throw usageError(`${field} must be a decimal amount such as 3.50 (got "${value}")`, "no currency symbol, no leading zeros, at most 2 decimals");
  const [int, frac = ""] = v.split(".");
  return `${int}.${frac.padEnd(2, "0")}`;
}

export function money(amount: string, currency: string): Money {
  return { amount, currency };
}

/** Converts a money string to integer cents to compare without float error. */
export function cents(amount: string | undefined): number | undefined {
  if (amount === undefined || amount === null) return undefined;
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/** Fractional change from old to new (0.15 = +15%). Undefined when old is zero or missing. */
export function fractionChange(oldAmount: string | undefined, newAmount: string | undefined): number | undefined {
  const a = cents(oldAmount);
  const b = cents(newAmount);
  if (a === undefined || b === undefined || a === 0) return undefined;
  return (b - a) / a;
}

export function pct(f: number | undefined): string {
  return f === undefined ? "n/a" : `${f >= 0 ? "+" : ""}${(f * 100).toFixed(1)}%`;
}

export function fmtMoney(m: Money | undefined): string {
  return m ? `${Number(m.amount).toFixed(2)} ${m.currency}` : "none";
}
