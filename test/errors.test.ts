import { test } from "node:test";
import assert from "node:assert/strict";
import { exitCodeForStatus, parseApiError } from "../src/errors.js";

test("v1 error shape: code, detail message and field from info", () => {
  const e = parseApiError(400, { error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: [{ code: "INVALID_FIELD_ATTRIBUTE", message: "Filters contain unsupported fields campaignId", info: { invalidFields: ["campaignId"], fields: ["filters[0].field"] } }] } }, "req-1");
  assert.equal(e.exitCode, 1);
  assert.equal(e.code, "VALIDATION_ERROR");
  assert.match(e.message, /unsupported fields campaignId/);
  assert.equal(e.details![0]!.field, "filters[0].field");
  assert.match(e.hint!, /reports campaigns --campaign-id/);
  assert.equal(e.requestId, "req-1");
});

test("v1 field fallbacks: info.field, then fields[0], then invalidFields", () => {
  const f = (info: unknown) => parseApiError(400, { error: { code: "X", details: [{ code: "Y", message: "m", info }] } }).details![0]!.field;
  assert.equal(f({ field: "conditions[0].operator" }), "conditions[0].operator");
  assert.equal(f({ fields: ["a"] }), "a");
  assert.equal(f({ invalidFields: ["b", "c"] }), "b,c");
});

test("v5-style errors (seen on 401) map to exit 3", () => {
  const e = parseApiError(401, { data: null, pagination: null, error: { errors: [{ messageCode: "UNAUTHORIZED", message: "Invalid token: abc", field: "" }] } });
  assert.equal(e.exitCode, 3);
  assert.equal(e.code, "UNAUTHORIZED");
  assert.match(e.hint!, /auth doctor/);
});

test("non-JSON and empty bodies", () => {
  const html = parseApiError(503, "<html><h1>503 Service Temporarily Unavailable</h1></html>");
  assert.equal(html.code, "NON_JSON_RESPONSE");
  assert.doesNotMatch(html.message, /</);
  assert.match(html.hint!, /unknown path/);
  assert.match(parseApiError(429, "").message, /empty body/);
});

test("status to exit code", () => {
  assert.equal(exitCodeForStatus(400), 1);
  assert.equal(exitCodeForStatus(401), 3);
  assert.equal(exitCodeForStatus(403), 3);
  assert.equal(exitCodeForStatus(404), 4);
  assert.equal(exitCodeForStatus(400, "ENTITY_NOT_FOUND"), 4);
  assert.equal(exitCodeForStatus(429), 5);
  assert.equal(exitCodeForStatus(503), 5);
});

test("hint table", () => {
  const h = (m: string) => parseApiError(400, { error: { code: "VALIDATION_ERROR", details: [{ code: "X", message: m }] } }).hint;
  assert.match(h("adGroupId or campaignId condition is required")!, /--campaign-id/);
  assert.match(h("Time range cannot be null")!, /--last 7d/);
  assert.match(h("Timezone 'UTC' is not supported for the SEARCHTERM")!, /ORTZ/);
  assert.match(h("Operator EQUALS is not supported by field promotedObjectId.")!, /schema filters/);
  assert.match(h("Requested page size 1001 exceeds maximum allowed page size of 1000.")!, /--limit/);
  assert.match(parseApiError(403, { error: { code: "FORBIDDEN", details: [{ code: "FORBIDDEN", message: "HTTP 403 Forbidden" }] } }).hint!, /--ad-account-id/);
  assert.match(parseApiError(404, { error: { code: "ENTITY_NOT_FOUND", details: [] } }).hint!, /list first/);
});
