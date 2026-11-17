import { test } from "node:test";
import assert from "node:assert/strict";
import { bidReason, budgetCeilings, budgetReason, combine, countriesReason, createReason, endTimeReason, searchMatchReason, statusReason } from "../src/spend.js";

test("rule table", () => {
  assert.equal(statusReason("campaign", "1", "ENABLED").effect, "increase");
  assert.equal(statusReason("campaign", "1", "PAUSED").effect, "decrease");
  assert.equal(budgetReason("1", "5.00", "5.50").effect, "increase");
  assert.equal(budgetReason("1", "5.00", "4.00").effect, "decrease");
  assert.equal(bidReason("keyword", "1", "1.00", "0.90").effect, "decrease");
  assert.equal(bidReason("keyword", "1", undefined, "0.90").effect, "unknown");
  assert.equal(searchMatchReason("1", true).effect, "increase");
  assert.equal(countriesReason("1", ["US"], ["US", "GB"]).effect, "increase");
  assert.equal(countriesReason("1", ["US", "GB"], ["US"]).effect, "decrease");
  assert.equal(endTimeReason("campaign", "1", "2026-12-01T00:00:00.000", null).effect, "increase");
  assert.equal(endTimeReason("campaign", "1", "2026-12-01T00:00:00.000", "2026-12-15T00:00:00.000").effect, "increase");
  assert.equal(endTimeReason("campaign", "1", "2026-12-15T00:00:00.000", "2026-12-01T00:00:00.000").effect, "decrease");
  assert.equal(createReason("campaign", "PAUSED", undefined).effect, "none");
  assert.equal(createReason("keyword", "ENABLED", true).effect, "increase");
  assert.equal(createReason("keyword", "ENABLED", false).effect, "none");
  assert.equal(combine([statusReason("c", "1", "PAUSED"), budgetReason("1", "1.00", "2.00")]).effect, "increase");
  assert.equal(combine([]).effect, "none");
});

test("large steps: bid > 15%, budget > 20%", () => {
  assert.equal(bidReason("keyword", "1", "1.00", "1.15").largeStep, undefined);
  assert.equal(bidReason("keyword", "1", "1.00", "1.16").largeStep, true);
  assert.equal(bidReason("keyword", "1", "1.00", "0.80").largeStep, true);
  assert.equal(budgetReason("1", "10.00", "12.00").largeStep, undefined);
  assert.equal(budgetReason("1", "10.00", "12.50").largeStep, true);
});

test("ceilings: daily x 30.4 a month, days x daily with an end date", () => {
  const c = budgetCeilings({ dailyBudget: { value: { amount: "3.5", currency: "USD" } }, startTime: "2026-12-01T00:00:00.000", endTime: "2026-12-28T23:59:59.000" }, Date.parse("2026-11-16T00:00:00Z"));
  assert.deepEqual(c, { daily: "3.50", currency: "USD", monthlyMax: "106.40", scheduledDays: 28, scheduleMax: "98.00", daysLeft: 28 });
  const open = budgetCeilings({ dailyBudget: { value: { amount: "100", currency: "USD" } } }, 0);
  assert.equal(open.monthlyMax, "3040.00");
  assert.equal(open.scheduleMax, null);
});
