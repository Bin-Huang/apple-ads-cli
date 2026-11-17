import type { Client } from "./http.js";
import { DEFAULT_MAX_ITEMS } from "./constants.js";
import { usageError } from "./errors.js";

export const OPERATORS = [
  "EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "CONTAINS_ANY", "NOT_CONTAINS_ANY", "CONTAINS_ALL", "NOT_CONTAINS_ALL",
  "LIKE", "NOT_LIKE", "STARTS_WITH", "ENDS_WITH", "GREATER_THAN", "GREATER_THAN_OR_EQUAL_TO", "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO", "BETWEEN", "IS_NULL", "IS_NOT_NULL",
] as const;

export type FilterValue = string | number | boolean;

export interface Filter {
  field: string;
  operator: string;
  value?: FilterValue | FilterValue[];
  ignoreCase?: boolean;
}

export interface Sort {
  field: string;
  order: "ASC" | "DESC";
}

export interface QueryBody {
  filters?: Filter[];
  sorting?: Sort[];
  pagination?: { offset: number; pageSize: number; fetchTotalCount?: boolean };
  fields?: string[];
}

/** Builds one filter. Values are always sent as an array; IS_NULL/IS_NOT_NULL take none. */
export function filter(field: string, operator: string, value?: FilterValue | FilterValue[]): Filter {
  const op = operator.toUpperCase();
  if (!(OPERATORS as readonly string[]).includes(op)) throw usageError(`Unknown filter operator ${operator}`, `use one of ${OPERATORS.join(", ")}`);
  if (op === "IS_NULL" || op === "IS_NOT_NULL") return { field, operator: op };
  if (value === undefined || (Array.isArray(value) && value.length === 0)) throw usageError(`Filter ${field} ${op} needs a value`);
  const values = Array.isArray(value) ? value : [value];
  if (op === "BETWEEN" && values.length !== 2) throw usageError(`Filter ${field} BETWEEN needs two values (min,max)`);
  return { field, operator: op, value: values };
}

function typed(v: string): FilterValue {
  if (v === "true") return true;
  if (v === "false") return false;
  return v; // numeric IDs stay strings; Apple accepts both
}

/** Parses `field:OPERATOR[:v1,v2]`. Only the first two colons split, so date-times survive. */
export function parseFilterFlag(spec: string): Filter {
  const i = spec.indexOf(":");
  if (i <= 0) throw usageError(`Bad --filter "${spec}"`, "use field:OPERATOR[:v1,v2], for example status:EQUALS:ENABLED or adGroupId:IS_NULL");
  const field = spec.slice(0, i);
  const rest = spec.slice(i + 1);
  const j = rest.indexOf(":");
  const op = (j < 0 ? rest : rest.slice(0, j)).toUpperCase();
  const raw = j < 0 ? undefined : rest.slice(j + 1);
  const values = raw === undefined || raw === "" ? undefined : raw.split(",").map((s) => typed(s.trim()));
  return filter(field, op, values);
}

export function parseSort(spec: string): Sort {
  const [field, order = "ASC"] = spec.split(":");
  const o = order.toUpperCase();
  if (!field || (o !== "ASC" && o !== "DESC")) throw usageError(`Bad --sort "${spec}"`, "use field[:ASC|DESC], for example localSpend:DESC");
  return { field, order: o };
}

export function parseFields(spec: string | undefined, addId = true): string[] | undefined {
  if (!spec) return undefined;
  const f = spec.split(",").map((s) => s.trim()).filter(Boolean);
  if (addId && !f.includes("id")) f.unshift("id");
  return f;
}

export interface BuildQueryInput {
  filters?: Filter[];
  sorting?: Sort[];
  fields?: string[];
}

export function buildQuery(input: BuildQueryInput): QueryBody {
  const body: QueryBody = {};
  if (input.filters?.length) body.filters = input.filters;
  if (input.sorting?.length) body.sorting = input.sorting;
  if (input.fields?.length) body.fields = input.fields;
  return body;
}

export interface PageOpts {
  limit: number;
  all: boolean;
  offset: number;
  maxItems?: number;
  pageMax: number;
  /** Ask entity queries for totalCount. */
  fetchTotalCount?: boolean;
  /** Pull rows out of a response (default: result as an array). */
  rows?: (json: any) => unknown[];
  path: string;
  body: Record<string, unknown>;
}

export interface Pagination {
  offset: number;
  returned: number;
  totalCount?: number;
  truncated: boolean;
  nextOffset?: number;
}

export interface PageResult {
  rows: unknown[];
  pagination: Pagination;
  first: any;
}

/** Pages through a POST /query endpoint until a short page, totalCount or the limit. */
export async function paginate(client: Client, opts: PageOpts): Promise<PageResult> {
  const target = opts.all ? (opts.maxItems ?? DEFAULT_MAX_ITEMS) : opts.limit;
  const rowsOf = opts.rows ?? ((j: any) => (Array.isArray(j?.result) ? j.result : []));
  const rows: unknown[] = [];
  let offset = opts.offset;
  let totalCount: number | undefined;
  let first: any;
  // A short page is the end only when there is no totalCount. When totalCount says rows remain, ask again:
  // some endpoints cap pageSize on the server, and the ads report counts rows it never returns (that next
  // page comes back empty, which ends the loop).
  let stop: "short" | "total" | "limit" = "limit";
  while (rows.length < target) {
    const pageSize = Math.min(opts.pageMax, target - rows.length);
    const pagination: Record<string, unknown> = { offset, pageSize };
    if (opts.fetchTotalCount) pagination.fetchTotalCount = true;
    const res = await client.request({ method: "POST", path: opts.path, body: { ...opts.body, pagination }, retry: "read" });
    first ??= res.json;
    const page = rowsOf(res.json);
    const tc = res.json?.pagination?.totalCount;
    if (typeof tc === "number") totalCount = tc;
    rows.push(...page);
    offset += page.length;
    if (page.length === 0) {
      stop = "short";
      break;
    }
    if (totalCount !== undefined && offset >= totalCount) {
      stop = "total";
      break;
    }
    if (page.length < pageSize && totalCount === undefined) {
      stop = "short";
      break;
    }
  }
  const truncated = stop === "limit" && (totalCount === undefined || offset < totalCount);
  const pagination: Pagination = { offset: opts.offset, returned: rows.length, truncated };
  if (totalCount !== undefined) pagination.totalCount = totalCount;
  if (truncated) pagination.nextOffset = offset;
  return { rows, pagination, first };
}
