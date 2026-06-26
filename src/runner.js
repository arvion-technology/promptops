// Suite evaluation and run comparison.
//
// A "run" is a recorded set of model outputs for one prompt version. Keeping the
// outputs as data is what lets the suite run in CI with no key, no network and no
// flaky model: the assertions and the regression diff are still real, and
// recording a new run is a separate, deliberate step.

import { evaluateAssertions } from "./assertions.js";

export function evaluateSuite(suite, run, { custom = {} } = {}) {
  const cases = suite.cases.map((testCase) => {
    const recorded = run.cases?.[testCase.id] || {};
    const output = recorded.output ?? "";
    const evaluation = evaluateAssertions(output, testCase.assertions || [], {
      custom,
      vars: testCase.vars,
      caseId: testCase.id,
      promptId: suite.promptId,
    });
    return {
      caseId: testCase.id,
      name: testCase.name,
      tags: testCase.tags || [],
      passed: evaluation.passed,
      failures: evaluation.failures,
      results: evaluation.results,
      output,
      latencyMs: recorded.latencyMs ?? 0,
      costUsd: recorded.costUsd ?? 0,
      vars: testCase.vars,
    };
  });

  const passed = cases.filter((item) => item.passed).length;
  const total = cases.length;
  return {
    runId: run.id,
    suiteId: suite.id,
    suiteName: suite.name,
    promptId: suite.promptId,
    version: run.version,
    role: run.role,
    createdAt: run.createdAt,
    cases,
    passed,
    failed: total - passed,
    total,
    passRate: total ? Math.round((passed / total) * 10000) / 10000 : 0,
    costUsd: Math.round(cases.reduce((sum, item) => sum + item.costUsd, 0) * 1e6) / 1e6,
    latencyMs: Math.round(cases.reduce((sum, item) => sum + item.latencyMs, 0)),
    averageLatencyMs: total ? Math.round(cases.reduce((sum, item) => sum + item.latencyMs, 0) / total) : 0,
  };
}

export function compareEvaluations(baseline, candidate) {
  const baselineByCase = new Map(baseline.cases.map((item) => [item.caseId, item]));
  const candidateByCase = new Map(candidate.cases.map((item) => [item.caseId, item]));
  const caseIds = [...new Set([...baselineByCase.keys(), ...candidateByCase.keys()])];

  const regressions = [];
  const fixes = [];
  const stillFailing = [];
  for (const caseId of caseIds) {
    const before = baselineByCase.get(caseId);
    const after = candidateByCase.get(caseId);
    const name = after?.name || before?.name || caseId;
    if (before?.passed && after && !after.passed) regressions.push({ caseId, name, failures: after.failures });
    if (before && !before.passed && after?.passed) fixes.push({ caseId, name });
    if (before && !before.passed && after && !after.passed) stillFailing.push({ caseId, name, failures: after.failures });
  }

  return {
    suiteId: baseline.suiteId,
    baseline: { runId: baseline.runId, version: baseline.version, passed: baseline.passed, total: baseline.total, passRate: baseline.passRate },
    candidate: { runId: candidate.runId, version: candidate.version, passed: candidate.passed, total: candidate.total, passRate: candidate.passRate },
    regressions,
    fixes,
    stillFailing,
    regressionCount: regressions.length,
    fixCount: fixes.length,
    passRateDelta: Math.round((candidate.passRate - baseline.passRate) * 10000) / 10000,
    costDeltaUsd: Math.round((candidate.costUsd - baseline.costUsd) * 1e6) / 1e6,
    latencyDeltaMs: candidate.averageLatencyMs - baseline.averageLatencyMs,
    // The CI gate: a regression fails the build even if the pass rate rose.
    gate: regressions.length ? "fail" : candidate.passRate >= baseline.passRate ? "pass" : "fail",
  };
}
