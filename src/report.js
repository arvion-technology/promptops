// Terminal formatting for the CLI.

export function formatSuite(evaluation) {
  const lines = [];
  lines.push(`${evaluation.suiteName} · run ${evaluation.runId} · prompt ${evaluation.promptId}@${evaluation.version}`);
  lines.push(`${evaluation.passed}/${evaluation.total} passed · ${(evaluation.passRate * 100).toFixed(0)}% · $${evaluation.costUsd.toFixed(6)} · ${evaluation.averageLatencyMs}ms avg`);
  lines.push("");
  const width = Math.max(...evaluation.cases.map((item) => item.caseId.length), 4);
  for (const item of evaluation.cases) {
    const mark = item.passed ? "PASS" : "FAIL";
    lines.push(`${mark}  ${item.caseId.padEnd(width)}  ${item.name}`);
    for (const failure of item.failures) lines.push(`      - ${failure}`);
  }
  return lines.join("\n");
}

export function formatComparison(comparison) {
  const lines = [];
  lines.push(`${comparison.suiteId}`);
  lines.push(`baseline  ${comparison.baseline.runId} · ${comparison.baseline.version} · ${comparison.baseline.passed}/${comparison.baseline.total}`);
  lines.push(`candidate ${comparison.candidate.runId} · ${comparison.candidate.version} · ${comparison.candidate.passed}/${comparison.candidate.total}`);
  lines.push(`pass rate ${comparison.passRateDelta >= 0 ? "+" : ""}${(comparison.passRateDelta * 100).toFixed(1)} pp · cost ${comparison.costDeltaUsd >= 0 ? "+" : ""}$${comparison.costDeltaUsd.toFixed(6)} · latency ${comparison.latencyDeltaMs >= 0 ? "+" : ""}${comparison.latencyDeltaMs}ms`);
  lines.push("");
  if (comparison.regressions.length) {
    lines.push(`REGRESSIONS (${comparison.regressions.length})`);
    for (const item of comparison.regressions) {
      lines.push(`  ${item.caseId}  ${item.name}`);
      for (const failure of item.failures) lines.push(`      - ${failure}`);
    }
  } else {
    lines.push("REGRESSIONS (0)");
  }
  if (comparison.fixes.length) {
    lines.push(`FIXES (${comparison.fixes.length})`);
    for (const item of comparison.fixes) lines.push(`  ${item.caseId}  ${item.name}`);
  }
  lines.push("");
  lines.push(`gate: ${comparison.gate.toUpperCase()}`);
  return lines.join("\n");
}

export function formatPrompt(prompt, version) {
  const lines = [
    `${prompt.id} · ${prompt.name}`,
    `${prompt.description}`,
    `version ${version.version} · ${version.model} · temperature ${version.temperature} · ${version.createdAt}`,
    `changelog: ${version.changelog}`,
    `variables: ${version.variables.join(", ") || "none"}`,
    "",
    version.template,
  ];
  return lines.join("\n");
}

export function formatPromptList(registry, summaries) {
  const lines = ["prompt".padEnd(22) + "prod".padEnd(9) + "versions".padEnd(10) + "suites"];
  for (const summary of summaries) {
    lines.push(
      summary.id.padEnd(22) + summary.prod.padEnd(9) + String(summary.versions).padEnd(10) + (summary.suites.join(", ") || ", "),
    );
  }
  return lines.join("\n");
}

export function formatDiff(diff) {
  const lines = [`${diff.promptId} · ${diff.from.version} → ${diff.to.version} (+${diff.added} −${diff.removed})`];
  if (diff.changedFields.length) lines.push(`also changed: ${diff.changedFields.join(", ")}`);
  if (diff.variablesAdded.length) lines.push(`variables added: ${diff.variablesAdded.join(", ")}`);
  if (diff.variablesRemoved.length) lines.push(`variables removed: ${diff.variablesRemoved.join(", ")}`);
  lines.push("");
  for (const line of diff.lines) {
    const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
    lines.push(prefix + line.text);
  }
  return lines.join("\n");
}
