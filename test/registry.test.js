import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  comparePair,
  getPrompt,
  getRun,
  getSuite,
  promptSummaries,
  registryStats,
  resolveVersion,
  runsForSuite,
} from "../src/registry.js";

const registry = JSON.parse(readFileSync(new URL("../data/registry.json", import.meta.url), "utf8"));

test("resolveVersion follows labels and explicit versions", () => {
  assert.equal(resolveVersion(registry, "ticket-classifier", "prod").version, "2.0.0");
  assert.equal(resolveVersion(registry, "ticket-classifier", "previous").version, "1.1.0");
  assert.equal(resolveVersion(registry, "ticket-classifier", "1.0.0").version, "1.0.0");
  assert.equal(resolveVersion(registry, "ticket-classifier", null).version, "2.0.0");
});

test("unknown prompts, versions and suites are rejected", () => {
  assert.throws(() => getPrompt(registry, "nope"), /unknown prompt/);
  assert.throws(() => resolveVersion(registry, "ticket-classifier", "9.9.9"), /no version/);
  assert.throws(() => getSuite(registry, "nope"), /unknown suite/);
  assert.throws(() => getRun(registry, "nope"), /unknown run/);
});

test("comparePair picks the baseline and candidate runs", () => {
  const pair = comparePair(registry, "ticket-suite");
  assert.equal(pair.baseline.role, "baseline");
  assert.equal(pair.candidate.role, "candidate");
  assert.equal(pair.baseline.version, "1.1.0");
  assert.equal(pair.candidate.version, "2.0.0");
});

test("runsForSuite returns only that suite's runs", () => {
  assert.equal(runsForSuite(registry, "refund-suite").length, 2);
  assert.ok(runsForSuite(registry, "refund-suite").every((run) => run.suiteId === "refund-suite"));
});

test("prompt summaries expose the production version and suites", () => {
  const summaries = promptSummaries(registry);
  assert.equal(summaries.length, 3);
  const ticket = summaries.find((summary) => summary.id === "ticket-classifier");
  assert.equal(ticket.prod, "2.0.0");
  assert.equal(ticket.versions, 3);
  assert.deepEqual(ticket.suites, ["ticket-suite"]);
});

test("registryStats counts the registry", () => {
  const stats = registryStats(registry);
  assert.deepEqual(stats, { prompts: 3, versions: 7, suites: 3, cases: 15, runs: 6 });
});
