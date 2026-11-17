import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "../src/http.js";
import { mockFetch, type Route } from "./helpers/mock-fetch.js";

function client(routes: Record<string, Route>, tokens = { n: 0, get: async function () { return `tok-${this.n}`; }, invalidate() { this.n++; return true; } }) {
  const m = mockFetch(routes);
  const sleeps: number[] = [];
  const c = new Client({ fetch: m.fetch, tokens, adAccountId: async () => "123456789", sleep: async (ms) => void sleeps.push(ms), timeoutMs: 1000 });
  return { c, m, sleeps };
}

test("context header present for account paths, absent for /me, /acls, /orgs and budget-order writes", async () => {
  const { c, m } = client({ "GET /me": { json: { result: {} } }, "GET /acls": { json: {} }, "GET /orgs/1": { json: {} }, "POST /campaigns/query": { json: { result: [] } }, "PUT /shared-budgets/9": { json: {} }, "POST /shared-budgets/query": { json: {} } });
  await c.request({ method: "GET", path: "/me" });
  await c.request({ method: "GET", path: "/acls" });
  await c.request({ method: "GET", path: "/orgs/1" });
  await c.request({ method: "POST", path: "/campaigns/query", body: {} });
  await c.request({ method: "PUT", path: "/shared-budgets/9", body: {} });
  await c.request({ method: "POST", path: "/shared-budgets/query", body: {} });
  const ctx = m.calls.map((x) => x.headers["x-ap-context"]);
  assert.deepEqual(ctx, [undefined, undefined, undefined, "adAccountId=123456789", undefined, "adAccountId=123456789"]);
  assert.equal(m.calls[3]!.headers["content-type"], "application/json");
  assert.match(m.calls[3]!.headers["user-agent"]!, /^apple-ads-cli\/2\./);
});

test("HTML 503 and empty 429 bodies are parsed without a crash", async () => {
  const { c } = client({ "GET /nope": { status: 503, text: "<html><body>503 Service Temporarily Unavailable</body></html>", headers: { "content-type": "text/html" } }, "PUT /campaigns/1": { status: 429 } });
  await assert.rejects(c.request({ method: "GET", path: "/nope" }), (e: any) => e.exitCode === 5 && e.code === "NON_JSON_RESPONSE" && /Service Temporarily/.test(e.message));
  await assert.rejects(c.request({ method: "PUT", path: "/campaigns/1", body: {} }), (e: any) => e.exitCode === 5 && /empty body/.test(e.message));
});

test("reads retry 5xx with backoff; Retry-After is honoured", async () => {
  const { c, m, sleeps } = client({ "POST /campaigns/query": [{ status: 500, json: { error: { code: "X" } } }, { status: 429, headers: { "retry-after": "3" } }, { json: { result: [1] } }] });
  const r = await c.request({ method: "POST", path: "/campaigns/query", body: {} });
  assert.deepEqual(r.json.result, [1]);
  assert.equal(m.calls.length, 3);
  assert.deepEqual(sleeps, [1000, 3000]);
});

test("writes are not retried on 5xx but are retried on 429", async () => {
  const a = client({ "POST /campaigns": { status: 502, json: { error: { code: "BAD_GATEWAY" } } } });
  await assert.rejects(a.c.request({ method: "POST", path: "/campaigns", body: {} }), (e: any) => e.exitCode === 5);
  assert.equal(a.m.calls.length, 1);
  const b = client({ "POST /campaigns": [{ status: 429 }, { json: { result: { id: 1 } } }] });
  const r = await b.c.request({ method: "POST", path: "/campaigns", body: {} });
  assert.equal(r.json.result.id, 1);
  assert.equal(b.m.calls.length, 2);
});

test("a 401 refreshes the token once and retries once, also for writes", async () => {
  const { c, m } = client({ "PUT /campaigns/1": [{ status: 401, json: { error: { errors: [{ messageCode: "UNAUTHORIZED", message: "Invalid token: x" }] } } }, { json: { result: { id: 1 } } }] });
  const r = await c.request({ method: "PUT", path: "/campaigns/1", body: {} });
  assert.equal(r.status, 200);
  assert.deepEqual(m.calls.map((x) => x.headers.authorization), ["Bearer tok-0", "Bearer tok-1"]);
  const d = client({ "GET /me": { status: 401, json: { error: { errors: [{ messageCode: "UNAUTHORIZED", message: "Invalid token: x" }] } } } });
  await assert.rejects(d.c.request({ method: "GET", path: "/me" }), (e: any) => e.exitCode === 3);
  assert.equal(d.m.calls.length, 2, "only one refresh");
});

test("pacing: low RateLimit-Remaining sleeps RateLimit-Reset before the next call", async () => {
  const { c, sleeps } = client({ "GET /me": { json: { result: {} }, headers: { "ratelimit-remaining": "2", "ratelimit-reset": "4" } } });
  await c.request({ method: "GET", path: "/me" });
  await c.request({ method: "GET", path: "/me" });
  assert.deepEqual(sleeps, [4000]);
});

test("network errors: reads retry, writes fail at once with a list-first hint", async () => {
  const boom = { throws: new TypeError("fetch failed") };
  const a = client({ "GET /me": [boom, { json: { result: { ok: 1 } } }] });
  assert.equal((await a.c.request({ method: "GET", path: "/me" })).json.result.ok, 1);
  const b = client({ "POST /campaigns": boom });
  await assert.rejects(b.c.request({ method: "POST", path: "/campaigns", body: {} }), (e: any) => e.exitCode === 5 && /list before retrying/.test(e.hint));
  assert.equal(b.m.calls.length, 1);
});
