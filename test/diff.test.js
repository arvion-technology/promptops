import test from "node:test";
import assert from "node:assert/strict";

import { diffLines, diffPromptVersions } from "../src/diff.js";

test("identical text has no changes", () => {
  const diff = diffLines("one\ntwo", "one\ntwo");
  assert.equal(diff.changed, false);
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.lines.length, 2);
});

test("an added line is marked added and keeps new line numbers", () => {
  const diff = diffLines("a\nb", "a\nx\nb");
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);
  const added = diff.lines.find((line) => line.type === "added");
  assert.equal(added.text, "x");
  assert.equal(added.newLine, 2);
  assert.equal(added.oldLine, null);
});

test("a removed line is marked removed", () => {
  const diff = diffLines("a\nb\nc", "a\nc");
  assert.equal(diff.removed, 1);
  assert.equal(diff.lines.find((line) => line.type === "removed").text, "b");
});

test("replacements appear as one removal and one addition", () => {
  const diff = diffLines("keep\nold", "keep\nnew");
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.deepEqual(diff.lines.map((line) => line.type), ["context", "removed", "added"]);
});

test("a trailing newline at the end of both files is stable", () => {
  assert.equal(diffLines("a\n", "a\n").changed, false);
});

const prompt = {
  id: "ticket-classifier",
  name: "Ticket classifier",
  versions: [
    {
      version: "1.0.0",
      createdAt: "2026-01-01",
      changelog: "first",
      template: "Classify {{ticket}}.\nRespond as JSON.",
      variables: ["ticket"],
      model: "gpt-4o-mini",
      temperature: 0,
    },
    {
      version: "2.0.0",
      createdAt: "2026-02-01",
      changelog: "second",
      template: "Classify {{ticket}} and {{account_id}}.\nRespond as JSON.\nBe brief.",
      variables: ["ticket", "account_id"],
      model: "gpt-4o",
      temperature: 0,
    },
  ],
};

test("diffPromptVersions reports metadata and template changes", () => {
  const diff = diffPromptVersions(prompt, "1.0.0", "2.0.0");
  assert.equal(diff.promptId, "ticket-classifier");
  assert.equal(diff.from.version, "1.0.0");
  assert.equal(diff.to.changelog, "second");
  assert.ok(diff.added >= 1);
  assert.deepEqual(diff.variablesAdded, ["account_id"]);
  assert.deepEqual(diff.variablesRemoved, []);
  assert.deepEqual(diff.changedFields, ["model"]);
});

test("unknown versions are rejected", () => {
  assert.throws(() => diffPromptVersions(prompt, "1.0.0", "9.9.9"), /unknown version/);
});
