import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function cli(...args) {
  const result = spawnSync(process.execPath, ["bin/promptops.mjs", ...args], { cwd: root, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("list prints every prompt and registry totals", () => {
  const { code, stdout } = cli("list");
  assert.equal(code, 0);
  assert.match(stdout, /ticket-classifier/);
  assert.match(stdout, /refund-reply/);
  assert.match(stdout, /3 prompts · 7 versions/);
});

test("compare exits non-zero when a regression is present", () => {
  const { code, stdout } = cli("compare", "ticket-suite");
  assert.equal(code, 1);
  assert.match(stdout, /REGRESSIONS \(2\)/);
  assert.match(stdout, /gate: FAIL/);
});

test("compare exits zero for a fix-only change", () => {
  const { code, stdout } = cli("compare", "refund-suite");
  assert.equal(code, 0);
  assert.match(stdout, /FIXES \(1\)/);
  assert.match(stdout, /gate: PASS/);
});

test("run evaluates the recorded outputs", () => {
  const { code, stdout } = cli("run", "refund-suite", "--run", "refund-candidate");
  assert.equal(code, 0);
  assert.match(stdout, /5\/5 passed/);
});

test("diff prints a unified-style line diff", () => {
  const { code, stdout } = cli("diff", "ticket-classifier", "1.1.0", "2.0.0");
  assert.equal(code, 0);
  assert.match(stdout, /\+Answer in one line/);
  assert.match(stdout, /-Never invent an account id/);
});

test("render fails loudly on a missing variable", () => {
  const { code, stderr } = cli("render", "ticket-classifier", "--vars", "{}");
  assert.equal(code, 2);
  assert.match(stderr, /missing: ticket/);
});

test("render substitutes variables with --vars", () => {
  const { code, stdout } = cli("render", "ticket-classifier", "--vars", '{"ticket":"charged twice"}');
  assert.equal(code, 0);
  assert.match(stdout, /charged twice/);
  assert.doesNotMatch(stdout, /\{\{ticket\}\}/);
});

test("an unknown command exits with a usage error", () => {
  const { code, stderr } = cli("frobnicate");
  assert.equal(code, 2);
  assert.match(stderr, /unknown command/);
});
