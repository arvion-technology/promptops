import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CUSTOM_HANDLERS } from "../src/custom.js";
import { compareEvaluations, evaluateSuite } from "../src/runner.js";

const registry = JSON.parse(readFileSync(new URL("../data/registry.json", import.meta.url), "utf8"));
const suiteById = (id) => registry.suites.find((suite) => suite.id === id);
const runById = (id) => registry.runs.find((run) => run.id === id);

test("a recorded run evaluates into one result per case", () => {
  const evaluation = evaluateSuite(suiteById("ticket-suite"), runById("ticket-baseline"), { custom: CUSTOM_HANDLERS });
  assert.equal(evaluation.total, 5);
  assert.equal(evaluation.failed, 0);
  assert.equal(evaluation.passRate, 1);
  assert.equal(evaluation.cases.length, 5);
  assert.ok(evaluation.cases.every((item) => Array.isArray(item.results)));
});

test("failures carry the assertion messages", () => {
  const evaluation = evaluateSuite(suiteById("ticket-suite"), runById("ticket-candidate"), { custom: CUSTOM_HANDLERS });
  const missingUrgency = evaluation.cases.find((item) => item.caseId === "T-1");
  assert.equal(missingUrgency.passed, false);
  assert.ok(missingUrgency.failures.some((message) => /urgency/.test(message)));
  const prose = evaluation.cases.find((item) => item.caseId === "T-3");
  assert.ok(prose.failures.some((message) => /valid JSON/.test(message)));
});

test("cost and latency are summed from the recorded cases", () => {
  const evaluation = evaluateSuite(suiteById("refund-suite"), runById("refund-baseline"), { custom: CUSTOM_HANDLERS });
  const expectedCost = Object.values(runById("refund-baseline").cases).reduce((sum, item) => sum + item.costUsd, 0);
  assert.ok(Math.abs(evaluation.costUsd - expectedCost) < 1e-9);
  assert.equal(evaluation.averageLatencyMs, Math.round(evaluation.latencyMs / 5));
});

test("comparison finds regressions and fixes", () => {
  const baseline = evaluateSuite(suiteById("ticket-suite"), runById("ticket-baseline"), { custom: CUSTOM_HANDLERS });
  const candidate = evaluateSuite(suiteById("ticket-suite"), runById("ticket-candidate"), { custom: CUSTOM_HANDLERS });
  const comparison = compareEvaluations(baseline, candidate);
  assert.equal(comparison.regressionCount, 2);
  assert.deepEqual(comparison.regressions.map((item) => item.caseId), ["T-1", "T-3"]);
  assert.equal(comparison.fixCount, 0);
  assert.ok(comparison.passRateDelta < 0);
  assert.equal(comparison.gate, "fail");
});

test("a fix-only comparison passes the gate", () => {
  const baseline = evaluateSuite(suiteById("refund-suite"), runById("refund-baseline"), { custom: CUSTOM_HANDLERS });
  const candidate = evaluateSuite(suiteById("refund-suite"), runById("refund-candidate"), { custom: CUSTOM_HANDLERS });
  const comparison = compareEvaluations(baseline, candidate);
  assert.equal(comparison.regressionCount, 0);
  assert.deepEqual(comparison.fixes.map((item) => item.caseId), ["R-1"]);
  assert.ok(comparison.passRateDelta > 0);
  assert.equal(comparison.gate, "pass");
});

test("a swap of one failure for another is still a regression", () => {
  const baseline = evaluateSuite(suiteById("sql-suite"), runById("sql-baseline"), { custom: CUSTOM_HANDLERS });
  const candidate = evaluateSuite(suiteById("sql-suite"), runById("sql-candidate"), { custom: CUSTOM_HANDLERS });
  const comparison = compareEvaluations(baseline, candidate);
  assert.deepEqual(comparison.regressions.map((item) => item.caseId), ["S-1"]);
  assert.deepEqual(comparison.fixes.map((item) => item.caseId), ["S-2"]);
  assert.equal(comparison.gate, "fail");
});

test("a run missing a case fails that case instead of skipping it", () => {
  const partial = { ...runById("ticket-baseline"), cases: { "T-1": runById("ticket-baseline").cases["T-1"] } };
  const evaluation = evaluateSuite(suiteById("ticket-suite"), partial, { custom: CUSTOM_HANDLERS });
  assert.equal(evaluation.total, 5);
  assert.equal(evaluation.passed, 1);
  assert.equal(evaluation.failed, 4);
});
