// Line diff for prompt versions.
//
// A longest-common-subsequence diff, not a character diff: prompt edits are made
// at line granularity (an instruction added, a rule removed), and a character
// diff of a reworded paragraph is noise. The output is shaped for rendering in
// the dashboard and for a terminal.

export function diffLines(before, after) {
  const a = String(before ?? "").split("\n");
  const b = String(after ?? "").split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: "context", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ type: "removed", text: a[i], oldLine: i + 1, newLine: null });
      removed += 1;
      i += 1;
    } else {
      lines.push({ type: "added", text: b[j], oldLine: null, newLine: j + 1 });
      added += 1;
      j += 1;
    }
  }
  while (i < a.length) {
    lines.push({ type: "removed", text: a[i], oldLine: i + 1, newLine: null });
    removed += 1;
    i += 1;
  }
  while (j < b.length) {
    lines.push({ type: "added", text: b[j], oldLine: null, newLine: j + 1 });
    added += 1;
    j += 1;
  }

  return {
    lines,
    added,
    removed,
    changed: added + removed > 0,
  };
}

/** Resolve two versions of the same prompt and diff their templates. */
export function diffPromptVersions(prompt, fromVersion, toVersion) {
  const from = prompt.versions.find((version) => version.version === fromVersion);
  const to = prompt.versions.find((version) => version.version === toVersion);
  if (!from || !to) {
    throw new Error(`unknown version: ${!from ? fromVersion : toVersion}`);
  }
  const diff = diffLines(from.template, to.template);
  const changedFields = ["model", "temperature"].filter((field) => from[field] !== to[field]);
  return {
    promptId: prompt.id,
    name: prompt.name,
    from: { version: from.version, createdAt: from.createdAt, changelog: from.changelog },
    to: { version: to.version, createdAt: to.createdAt, changelog: to.changelog },
    ...diff,
    changedFields,
    variablesAdded: to.variables.filter((name) => !from.variables.includes(name)),
    variablesRemoved: from.variables.filter((name) => !to.variables.includes(name)),
  };
}
