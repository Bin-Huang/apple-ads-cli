import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "../src/http.js";
import { buildQuery, filter, paginate, parseFields, parseFilterFlag, parseSort } from "../src/query.js";
import { mockFetch, type Call } from "./helpers/mock-fetch.js";
import { assertNoV5Keys } from "./helpers/v5.js";

test("--filter parsing: IS_NULL without a value, IN lists, BETWEEN, booleans, date-times", () => {
  assert.deepEqual(parseFilterFlag("adGroupId:IS_NULL"), { field: "adGroupId", operator: "IS_NULL" });
  assert.deepEqual(parseFilterFlag("status:in:ENABLED,PAUSED"), { field: "status", operator: "IN", value: ["ENABLED", "PAUSED"] });
  assert.deepEqual(parseFilterFlag("id:EQUALS:111111111"), { field: "id", operator: "EQUALS", value: ["111111111"] });
  assert.deepEqual(parseFilterFlag("deleted:EQUALS:true"), { field: "deleted", operator: "EQUALS", value: [true] });
  assert.deepEqual(parseFilterFlag("startTime:GREATER_THAN:2026-11-01T00:00:00.000"), { field: "startTime", operator: "GREATER_THAN", value: ["2026-11-01T00:00:00.000"] });
  assert.deepEqual(parseFilterFlag("eventTime:BETWEEN:2026-11-01,2026-11-07").value, ["2026-11-01", "2026-11-07"]);
  assert.throws(() => parseFilterFlag("eventTime:BETWEEN:2026-11-01"), (e: any) => e.exitCode === 2);
  assert.throws(() => parseFilterFlag("status:CONTAINS:x"), (e: any) => e.exitCode === 2);
  assert.throws(() => parseFilterFlag("nocolon"), (e: any) => e.exitCode === 2);
  assert.throws(() => filter("status", "EQUALS"), (e: any) => e.exitCode === 2);
});

test("sorting and fields", () => {
  assert.deepEqual(parseSort("localSpend:desc"), { field: "localSpend", order: "DESC" });
  assert.deepEqual(parseSort("name"), { field: "name", order: "ASC" });
  assert.throws(() => parseSort("name:UP"), (e: any) => e.exitCode === 2);
  assert.deepEqual(parseFields("name,status"), ["id", "name", "status"]);
  assert.deepEqual(parseFields("id,name"), ["id", "name"]);
  const q = buildQuery({ filters: [filter("campaignId", "EQUALS", "1")], sorting: [parseSort("name")], fields: ["id"] });
  assert.deepEqual(Object.keys(q), ["filters", "sorting", "fields"]);
  assertNoV5Keys(q);
});

function pager(pages: Array<{ rows: number; totalCount?: number }>) {
  let i = 0;
  const m = mockFetch({
    "POST /keywords/query": (c: Call) => {
      const p = pages[i++]!;
      const start = c.body.pagination.offset;
      return { json: { result: Array.from({ length: p.rows }, (_, k) => ({ id: start + k })), pagination: { offset: start, pageSize: p.rows, ...(p.totalCount !== undefined ? { totalCount: p.totalCount } : {}) } } };
    },
  });
  const client = new Client({ fetch: m.fetch, tokens: { get: async () => "t", invalidate: () => false }, adAccountId: async () => "1", sleep: async () => {}, timeoutMs: 1000 });
  return { client, m };
}

test("pager stops at a short page and is not truncated", async () => {
  const { client, m } = pager([{ rows: 2 }, { rows: 1 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 2, limit: 10, all: false, offset: 0 });
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.pagination, { offset: 0, returned: 3, truncated: false });
  assert.deepEqual(m.calls.map((c) => c.body.pagination), [{ offset: 0, pageSize: 2 }, { offset: 2, pageSize: 2 }]);
  m.calls.forEach((c) => assertNoV5Keys(c.body));
});

test("pager stops on totalCount", async () => {
  const { client, m } = pager([{ rows: 2, totalCount: 4 }, { rows: 2, totalCount: 4 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 2, limit: 100, all: false, offset: 0, fetchTotalCount: true });
  assert.equal(r.rows.length, 4);
  assert.equal(r.pagination.truncated, false);
  assert.equal(m.calls.length, 2);
  assert.equal(m.calls[0]!.body.pagination.fetchTotalCount, true);
});

test("pager stops at --limit and reports truncated + nextOffset", async () => {
  const { client } = pager([{ rows: 3, totalCount: 10 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 1000, limit: 3, all: false, offset: 0 });
  assert.deepEqual(r.pagination, { offset: 0, returned: 3, totalCount: 10, truncated: true, nextOffset: 3 });
});

test("a short page with rows left asks once more; an empty page ends it (ads report quirk)", async () => {
  const { client, m } = pager([{ rows: 10, totalCount: 15 }, { rows: 0, totalCount: 15 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 5000, limit: 5000, all: false, offset: 0 });
  assert.equal(r.rows.length, 10);
  assert.equal(r.pagination.truncated, false);
  assert.deepEqual(m.calls.map((c) => c.body.pagination.offset), [0, 10]);
});

test("server-capped page sizes are followed to totalCount, not mistaken for the end", async () => {
  const { client, m } = pager([{ rows: 200, totalCount: 450 }, { rows: 200, totalCount: 450 }, { rows: 50, totalCount: 450 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 1000, limit: 1000, all: false, offset: 0 });
  assert.equal(r.rows.length, 450);
  assert.equal(r.pagination.truncated, false);
  assert.equal(m.calls.length, 3);
});

test("--all follows pages up to maxItems", async () => {
  const { client, m } = pager([{ rows: 2, totalCount: 5 }, { rows: 2, totalCount: 5 }, { rows: 1, totalCount: 5 }]);
  const r = await paginate(client, { path: "/keywords/query", body: {}, pageMax: 2, limit: 1, all: true, offset: 0 });
  assert.equal(r.rows.length, 5);
  assert.equal(m.calls.length, 3);
});
