import { readFileSync } from "node:fs";
import { BULK_CHUNK } from "./constants.js";
import { usageError } from "./errors.js";

export function chunk<T>(items: T[], size = BULK_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Bulk body: allowPartialSuccess and correlationId = the item's global index. */
export function buildBulkBodies(items: Record<string, unknown>[], size = BULK_CHUNK): Array<{ offset: number; body: { allowPartialSuccess: true; items: Array<{ correlationId: number; data: Record<string, unknown> }> } }> {
  return chunk(items, size).map((c, ci) => ({
    offset: ci * size,
    body: { allowPartialSuccess: true, items: c.map((data, i) => ({ correlationId: ci * size + i, data })) },
  }));
}

export interface KeywordInput {
  text: string;
  matchType?: string;
  bid?: string;
  status?: string;
}

function parseCsv(text: string): KeywordInput[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return [];
  const header = lines[0]!.toLowerCase().split(",").map((s) => s.trim());
  const hasHeader = header.includes("text");
  const cols = hasHeader ? header : ["text", "matchtype", "bid"];
  return (hasHeader ? lines.slice(1) : lines).map((l) => {
    const cells = l.split(",").map((s) => s.trim());
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      if (cells[i]) row[c] = cells[i]!;
    });
    const k: KeywordInput = { text: row.text ?? "" };
    if (row.matchtype) k.matchType = row.matchtype.toUpperCase();
    if (row.bid) k.bid = row.bid;
    if (row.status) k.status = row.status.toUpperCase();
    return k;
  });
}

/** Reads keywords from JSON (array of strings or objects) or CSV (text[,matchType[,bid]]). */
export function parseKeywordText(content: string, nameForErrors: string): KeywordInput[] {
  const trimmed = content.trim();
  let list: KeywordInput[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw usageError(`${nameForErrors} is not valid JSON: ${(e as Error).message}`);
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed as { keywords?: unknown[] }).keywords;
    if (!Array.isArray(arr)) throw usageError(`${nameForErrors} must be a JSON array of strings or {text, matchType?, bid?}`);
    list = arr.map((x) => (typeof x === "string" ? { text: x } : (x as KeywordInput)));
  } else {
    list = parseCsv(trimmed);
  }
  list.forEach((k, i) => {
    if (!k || typeof k.text !== "string" || !k.text.trim()) throw usageError(`${nameForErrors} item ${i} has no text`);
    k.text = k.text.trim();
    if (k.text.length > 200) throw usageError(`${nameForErrors} item ${i}: keyword text is longer than 200 characters`);
  });
  return list;
}

export function parseKeywordFile(path: string): KeywordInput[] {
  return parseKeywordText(readFileSync(path, "utf8"), path);
}
