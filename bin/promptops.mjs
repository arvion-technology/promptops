#!/usr/bin/env node
// promptops, evaluate recorded prompt runs, compare versions and fail CI on a
// regression. No API key: a "run" is a committed set of model outputs, so the
// assertions and the diff are real while the model stays out of CI.
//
// Usage:
//   node bin/promptops.mjs list
//   node bin/promptops.mjs show ticket-classifier --version prod
//   node bin/promptops.mjs render ticket-classifier --vars '{"ticket":"..."}'
//   node bin/promptops.mjs run ticket-suite
//   node bin/promptops.mjs diff ticket-classifier 1.1.0 2.0.0
//   node bin/promptops.mjs compare ticket-suite
//   node bin/promptops.mjs compare ticket-suite --baseline ticket-baseline --candidate ticket-candidate

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CUSTOM_HANDLERS } from "../src/custom.js";
import { diffPromptVersions } from "../src/diff.js";
import { getPrompt, promptSummaries, resolveVersion, comparePair, getRun, getSuite, registryStats } from "../src/registry.js";
import { formatComparison, formatDiff, formatPrompt, formatPromptList, formatSuite } from "../src/report.js";
import { compareEvaluations, evaluateSuite } from "../src/runner.js";
import { renderTemplate } from "../src/template.js";

const argv = process.argv.slice(2);
const command = argv[0];
const positional = [];
const flags = {};
for (let index = 1; index < argv.length; index++) {
  const token = argv[index];
  if (token.startsWith("--")) {
    const name = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
    flags[name] = value;
  } else {
    positional.push(token);
  }
}

const dataPath = resolve(String(flags.data || "data/registry.json"));
const registry = JSON.parse(readFileSync(dataPath, "utf8"));

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

function main() {
  switch (command) {
    case "list": {
      const stats = registryStats(registry);
      console.log(formatPromptList(registry, promptSummaries(registry)));
      console.log(`\n${stats.prompts} prompts · ${stats.versions} versions · ${stats.suites} suites · ${stats.cases} cases · ${stats.runs} runs`);
      return 0;
    }
    case "show": {
      const promptId = positional[0] || fail("show needs a prompt id");
      const prompt = getPrompt(registry, promptId);
      const version = resolveVersion(registry, promptId, flags.version || "prod");
      console.log(formatPrompt(prompt, version));
      return 0;
    }
    case "render": {
      const promptId = positional[0] || fail("render needs a prompt id");
      if (!flags.vars) fail("render needs --vars with a JSON object");
      const version = resolveVersion(registry, promptId, flags.version || "prod");
      let variables;
      try {
        variables = JSON.parse(String(flags.vars));
      } catch (error) {
        return fail(`--vars is not valid JSON: ${error.message}`);
      }
      try {
        const rendered = renderTemplate(version.template, variables);
        console.log(rendered.text);
        console.error(`\n(${rendered.estimatedTokens} estimated tokens, variables: ${rendered.used.join(", ")})`);
        return 0;
      } catch (error) {
        return fail(error.message);
      }
    }
    case "run": {
      const suiteId = positional[0] || fail("run needs a suite id");
      const suite = getSuite(registry, suiteId);
      const runs = registry.runs.filter((run) => run.suiteId === suiteId);
      if (!runs.length) return fail(`suite ${suiteId} has no recorded runs`);
      const selected = flags.run ? [getRun(registry, flags.run)] : runs;
      let failed = false;
      for (const run of selected) {
        const evaluation = evaluateSuite(suite, run, { custom: CUSTOM_HANDLERS });
        console.log(formatSuite(evaluation));
        console.log("");
        if (evaluation.failed > 0) failed = true;
      }
      return failed ? 1 : 0;
    }
    case "diff": {
      const promptId = positional[0];
      const [, from, to] = positional;
      if (!promptId || !from || !to) return fail("diff needs <promptId> <from> <to>");
      const prompt = getPrompt(registry, promptId);
      console.log(formatDiff(diffPromptVersions(prompt, from, to)));
      return 0;
    }
    case "compare": {
      const suiteId = positional[0] || fail("compare needs a suite id");
      const suite = getSuite(registry, suiteId);
      const pair = comparePair(registry, suiteId);
      const baselineRun = flags.baseline ? getRun(registry, String(flags.baseline)) : pair.baseline;
      const candidateRun = flags.candidate ? getRun(registry, String(flags.candidate)) : pair.candidate;
      const comparison = compareEvaluations(
        evaluateSuite(suite, baselineRun, { custom: CUSTOM_HANDLERS }),
        evaluateSuite(suite, candidateRun, { custom: CUSTOM_HANDLERS }),
      );
      console.log(formatComparison(comparison));
      return comparison.gate === "fail" ? 1 : 0;
    }
    case "help":
    case undefined:
      console.log("promptops <list|show|render|run|diff|compare> [args] [--data data/registry.json]");
      return command ? 0 : 1;
    default:
      return fail(`unknown command: ${command}`);
  }
}

process.exitCode = main();
