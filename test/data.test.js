import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ASSERTION_TYPES } from "../src/assertions.js";
import { evaluateSuite, compareEvaluations } from "../src/runner.js";
import { CUSTOM_HANDLERS } from "../src/custom.js";
import { findVariables } from "../src/template.js";
import { comparePair } from "../src/registry.js";

const registry = JSON.parse(readFileSync(new URL("../data/registry.json", import.meta.url), "utf8"));

test("every suite points at a real prompt", () => {
  for (const suite of registry.suites) {
    assert.ok(registry.prompts.some((prompt) => prompt.id === suite.promptId), suite.id);
  }
});

test("templates declare exactly the variables they use", () => {
  for (const prompt of registry.prompts) {
    for (const version of prompt.versions) {
      assert.deepEqual(findVariables(version.template).sort(), [...version.variables].sort(), `${prompt.id}@${version.version}`);
      assert.ok(version.changelog && version.changelog.length > 10, "changelogs are not placeholders");
    }
  }
});

test("every assertion in every suite uses a supported type", () => {
  for (const suite of registry.suites) {
    for (const testCase of suite.cases) {
      assert.ok(testCase.assertions.length > 0, testCase.id);
      for (const assertion of testCase.assertions) {
        assert.ok(ASSERTION_TYPES.includes(assertion.type), `${testCase.id}: ${assertion.type}`);
        if (assertion.type === "custom") assert.ok(CUSTOM_HANDLERS[assertion.fn], assertion.fn);
      }
    }
  }
});

test("every run references a real version and covers every case", () => {
  for (const run of registry.runs) {
    const prompt = registry.prompts.find((candidate) => candidate.id === run.promptId);
    assert.ok(prompt, run.id);
    assert.ok(prompt.versions.some((version) => version.version === run.version), `${run.id}@${run.version}`);
    const suite = registry.suites.find((candidate) => candidate.id === run.suiteId);
    for (const testCase of suite.cases) {
      assert.ok(run.cases[testCase.id], `${run.id} missing ${testCase.id}`);
      assert.ok(run.cases[testCase.id].output.length > 0);
    }
  }
});

test("every suite has exactly one baseline and one candidate run", () => {
  for (const suite of registry.suites) {
    const runs = registry.runs.filter((run) => run.suiteId === suite.id);
    assert.equal(runs.length, 2, suite.id);
    assert.deepEqual(runs.map((run) => run.role).sort(), ["baseline", "candidate"]);
  }
});

test("the demo's regression stories are the ones the data produces", () => {
  const gates = {};
  for (const suite of registry.suites) {
    const pair = comparePair(registry, suite.id);
    const baseline = evaluateSuite(suite, pair.baseline, { custom: CUSTOM_HANDLERS });
    const candidate = evaluateSuite(suite, pair.candidate, { custom: CUSTOM_HANDLERS });
    const comparison = compareEvaluations(baseline, candidate);
    gates[suite.id] = comparison.gate;
    assert.ok(comparison.baseline.total === suite.cases.length);
  }
  assert.equal(gates["ticket-suite"], "fail");
  assert.equal(gates["refund-suite"], "pass");
  assert.equal(gates["sql-suite"], "fail");
});
