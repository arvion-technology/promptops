// Registry lookups. Pure functions over the parsed data file so the browser demo
// and the CLI resolve versions the same way.

export function getPrompt(registry, promptId) {
  const prompt = registry.prompts.find((candidate) => candidate.id === promptId);
  if (!prompt) throw new Error(`unknown prompt: ${promptId}`);
  return prompt;
}

/** Resolve a selector: an exact version, or a label such as "prod". */
export function resolveVersion(registry, promptId, selector) {
  const prompt = getPrompt(registry, promptId);
  if (!selector) {
    const label = prompt.labels?.prod;
    if (label) return resolveVersion(registry, promptId, label);
    return prompt.versions[prompt.versions.length - 1];
  }
  if (prompt.labels && selector in prompt.labels) {
    return resolveVersion(registry, promptId, prompt.labels[selector]);
  }
  const version = prompt.versions.find((candidate) => candidate.version === selector);
  if (!version) throw new Error(`prompt ${promptId} has no version or label ${selector}`);
  return version;
}

export function getSuite(registry, suiteId) {
  const suite = registry.suites.find((candidate) => candidate.id === suiteId);
  if (!suite) throw new Error(`unknown suite: ${suiteId}`);
  return suite;
}

export function getRun(registry, runId) {
  const run = registry.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  return run;
}

export function runsForSuite(registry, suiteId) {
  return registry.runs.filter((run) => run.suiteId === suiteId);
}

/** The pair the dashboard compares: the recorded baseline and the candidate. */
export function comparePair(registry, suiteId) {
  const runs = runsForSuite(registry, suiteId);
  const baseline = runs.find((run) => run.role === "baseline") || runs[0];
  const candidate = runs.find((run) => run.role === "candidate") || runs[1];
  if (!baseline || !candidate) throw new Error(`suite ${suiteId} needs two runs to compare`);
  return { baseline, candidate };
}

export function promptSummaries(registry) {
  return registry.prompts.map((prompt) => ({
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    versions: prompt.versions.length,
    latest: prompt.versions[prompt.versions.length - 1].version,
    prod: prompt.labels?.prod || prompt.versions[prompt.versions.length - 1].version,
    suites: registry.suites.filter((suite) => suite.promptId === prompt.id).map((suite) => suite.id),
  }));
}

export function registryStats(registry) {
  const cases = registry.suites.reduce((sum, suite) => sum + suite.cases.length, 0);
  return {
    prompts: registry.prompts.length,
    versions: registry.prompts.reduce((sum, prompt) => sum + prompt.versions.length, 0),
    suites: registry.suites.length,
    cases,
    runs: registry.runs.length,
  };
}
