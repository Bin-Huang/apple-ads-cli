import { refused } from "./errors.js";

export interface Target {
  type: string;
  id?: string;
  campaignId?: string;
}

export interface GuardSettings {
  protectedCampaignIds: string[];
  allowPauseProtected: boolean;
}

/**
 * Refuses (exit 6) any write whose target is a protected campaign or sits under one.
 * `reduceOnly` writes (pause, negatives add) pass only when allowPauseProtected is true.
 */
export function assertNotProtected(targets: Target[], g: GuardSettings, reduceOnly: boolean): void {
  if (!g.protectedCampaignIds.length) return;
  const set = new Set(g.protectedCampaignIds.map((x) => canonicalId(String(x))));
  const has = (v: unknown) => v !== undefined && v !== null && v !== "" && set.has(canonicalId(String(v)));
  const hits = targets.filter((t) => has(t.campaignId) || (t.type === "campaign" && has(t.id)));
  if (!hits.length) return;
  if (reduceOnly && g.allowPauseProtected) return;
  const which = [...new Set(hits.map((t) => t.campaignId ?? t.id))].join(", ");
  throw refused(
    "PROTECTED",
    `Campaign ${which} is protected in this profile; the write was not sent`,
    "ask the user; protectedCampaignIds is set in the CLI config and only the owner should change it",
  );
}

/** Numeric IDs without leading zeros, so "0555" and "555" compare equal. Other strings are unchanged. */
export function canonicalId(v: string): string {
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, "") : v;
}

/** For the raw `api` command: finds protected IDs in the path or anywhere in the body. */
export function scanForProtected(path: string, body: unknown, ids: string[]): string[] {
  if (!ids.length) return [];
  const set = new Set(ids.map((x) => canonicalId(String(x))));
  const found = new Set<string>();
  const check = (v: string) => {
    const c = canonicalId(v.trim());
    if (set.has(c)) found.add(c);
  };
  for (const seg of path.split(/[/?&=,#]/)) check(seg);
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (typeof v === "string" || typeof v === "number") {
      check(String(v));
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(body);
  return [...found];
}
