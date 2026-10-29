import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSERTION_TYPES,
  evaluateAssertion,
  evaluateAssertions,
  extractJson,
} from "../src/assertions.js";

const run = (output, assertion, context) => evaluateAssertion(output, assertion, context);

test("contains is case-insensitive by default and can be strict", () => {
  assert.equal(run("Refunds take 5 days", { type: "contains", value: "refund" }).passed, true);
  assert.equal(run("Refunds take 5 days", { type: "contains", value: "refund", ignoreCase: false }).passed, false);
});

test("not_contains rejects forbidden text", () => {
  assert.equal(run("We can help", { type: "not_contains", value: "unfortunately" }).passed, true);
  assert.equal(run("Unfortunately, no", { type: "not_contains", value: "unfortunately" }).passed, false);
});

test("regex assertions report invalid patterns instead of throwing", () => {
  assert.equal(run("in 3-5 days", { type: "regex", value: "\\d-\\d" }).passed, true);
  const invalid = run("anything", { type: "regex", value: "(" });
  assert.equal(invalid.passed, false);
  assert.match(invalid.message, /invalid pattern/);
});

test("extractJson accepts fenced JSON and JSON surrounded by prose", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":2}, done.'), { a: 2 });
  assert.deepEqual(extractJson("[1,2]"), [1, 2]);
  assert.throws(() => extractJson("not json"), /not valid JSON/);
});

test("json assertion checks required keys", () => {
  assert.equal(run('{"category":"billing"}', { type: "json", required: ["category"] }).passed, true);
  assert.equal(run('{"category":"billing"}', { type: "json", required: ["category", "urgency"] }).passed, false);
  assert.equal(run("plain text", { type: "json" }).passed, false);
  assert.equal(run("[1,2]", { type: "json" }).passed, false);
});

test("json_field compares values and patterns", () => {
  const output = '{"category":"billing","urgency":"high"}';
  assert.equal(run(output, { type: "json_field", field: "category", equals: "billing" }).passed, true);
  assert.equal(run(output, { type: "json_field", field: "category", equals: "bug" }).passed, false);
  assert.equal(run(output, { type: "json_field", field: "urgency", matches: "^(low|normal|high)$" }).passed, true);
  assert.equal(run(output, { type: "json_field", field: "missing", equals: 1 }).passed, false);
});

test("equals compares trimmed text", () => {
  assert.equal(run("  yes\n", { type: "equals", value: "yes" }).passed, true);
  assert.equal(run("no", { type: "equals", value: "yes" }).passed, false);
});

test("length_max counts words", () => {
  assert.equal(run("one two three", { type: "length_max", value: 3 }).passed, true);
  assert.equal(run("one two three four", { type: "length_max", value: 3 }).passed, false);
  assert.equal(run("", { type: "length_max", value: 0 }).passed, true);
});

test("custom handlers receive text and context", () => {
  const custom = {
    mentions_days: (text, context) => ({ passed: /business days/.test(text), message: `case ${context.caseId}` }),
  };
  const passed = run("within three business days", { type: "custom", fn: "mentions_days" }, { custom, caseId: "R-1" });
  assert.equal(passed.passed, true);
  assert.match(passed.message, /case R-1/);
  assert.equal(run("soon", { type: "custom", fn: "nope" }, { custom }).passed, false);
});

test("a custom handler that throws becomes a failed assertion", () => {
  const custom = { explode: () => { throw new Error("boom"); } };
  const result = run("text", { type: "custom", fn: "explode" }, { custom });
  assert.equal(result.passed, false);
  assert.match(result.message, /boom/);
});

test("unknown assertion types fail rather than pass silently", () => {
  assert.equal(run("text", { type: "vibes" }).passed, false);
});

test("evaluateAssertions aggregates and lists failures", () => {
  const evaluation = evaluateAssertions("Refund in 5 business days", [
    { type: "contains", value: "refund" },
    { type: "contains", value: "unfortunately" },
    { type: "length_max", value: 2 },
  ]);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.results.length, 3);
  assert.equal(evaluation.failures.length, 2);
});

test("every declared assertion type is handled", () => {
  for (const type of ASSERTION_TYPES) {
    const assertion = type === "custom" ? { type, fn: "ok" } : { type, value: "x" };
    const result = run("x", assertion, { custom: { ok: () => true } });
    assert.notEqual(result.message, `unknown assertion type: ${type}`);
  }
});
