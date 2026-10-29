// PromptOps demo, evaluations are computed here from the recorded outputs.
// Nothing in this file hard-codes a pass rate: assertions run in the browser
// through the same engine the CLI uses.
import { CUSTOM_HANDLERS } from "../src/custom.js";
import { diffPromptVersions } from "../src/diff.js";
import { comparePair, getPrompt, promptSummaries, registryStats, resolveVersion } from "../src/registry.js";
import { formatComparison } from "../src/report.js";
import { compareEvaluations, evaluateSuite } from "../src/runner.js";

const el = A.el;
const $ = A.$;
const $$ = A.$$;

const state = {
  registry: null,
  view: "results",
  promptId: "ticket-classifier",
  promptVersion: null,
  suiteId: "ticket-suite",
  compareSuite: "ticket-suite",
  diffPrompt: "ticket-classifier",
  diffFrom: null,
  diffTo: null,
};

const percent = (value) => `${(value * 100).toFixed(0)}%`;
const money = (value) => `$${value.toFixed(6)}`;

function evaluationsFor(suiteId) {
  const suite = state.registry.suites.find((candidate) => candidate.id === suiteId);
  const pair = comparePair(state.registry, suiteId);
  const baseline = evaluateSuite(suite, pair.baseline, { custom: CUSTOM_HANDLERS });
  const candidate = evaluateSuite(suite, pair.candidate, { custom: CUSTOM_HANDLERS });
  return { suite, pair, baseline, candidate, comparison: compareEvaluations(baseline, candidate) };
}

/* ------------------------------------------------------------- registry */

function renderRegistry() {
  const summaries = promptSummaries(state.registry);
  $("#prompt-count").textContent = `${summaries.length} prompts`;
  $("#prompt-list").replaceChildren(
    ...summaries.map((summary) =>
      el("button", {
        class: "prompt-item" + (summary.id === state.promptId ? " selected" : ""),
        type: "button",
        onclick: () => {
          state.promptId = summary.id;
          state.promptVersion = resolveVersion(state.registry, summary.id, "prod").version;
          renderRegistry();
        },
      },
        el("span", { class: "prompt-name", text: summary.name }),
        el("span", { class: "prompt-meta", text: `${summary.prod} · ${summary.versions} versions` }),
      ),
    ),
  );

  const prompt = getPrompt(state.registry, state.promptId);
  const version = resolveVersion(state.registry, state.promptId, state.promptVersion || "prod");
  state.promptVersion = version.version;
  $("#prompt-title").textContent = prompt.name;
  $("#prompt-desc").textContent = prompt.description;
  $("#prod-badge").textContent = `prod ${prompt.labels?.prod || version.version}`;

  $("#version-table").replaceChildren(
    A.dataTable({
      columns: [
        { key: "version", label: "Version", render: (row) => el("span", { class: "mono strong", text: row.version }) },
        { key: "createdAt", label: "Date", render: (row) => el("span", { class: "mono muted", text: row.createdAt }) },
        { key: "model", label: "Model", render: (row) => el("span", { class: "small muted", text: row.model }) },
        { key: "changelog", label: "Changelog" },
      ],
      rows: [...prompt.versions].reverse(),
      onRowClick: (row) => {
        state.promptVersion = row.version;
        renderRegistry();
      },
    }),
  );

  $("#version-tabs").replaceChildren(
    ...prompt.versions.map((candidate) =>
      el("button", {
        class: "tab" + (candidate.version === version.version ? " active" : ""),
        type: "button",
        text: candidate.version,
        onclick: () => {
          state.promptVersion = candidate.version;
          renderRegistry();
        },
      }),
    ),
  );

  $("#template").textContent = version.template;
  $("#template-meta").textContent = `${version.version} · ${version.model} · temperature ${version.temperature} · ${version.createdAt}`;
  $("#variables").replaceChildren(
    ...version.variables.map((name) => el("span", { class: "chip", text: `{{${name}}}` })),
  );
}

/* -------------------------------------------------------------- results */

function renderResults() {
  const { suite, pair, baseline, candidate, comparison } = evaluationsFor(state.suiteId);
  $("#suite-select").value = state.suiteId;

  const stats = [
    { label: "Baseline pass", value: `${baseline.passed}/${baseline.total}`, note: `v${pair.baseline.version}`, tone: "" },
    { label: "Candidate pass", value: `${candidate.passed}/${candidate.total}`, note: `v${pair.candidate.version}`, tone: candidate.failed ? "gold" : "green" },
    { label: "Regressions", value: comparison.regressionCount, note: "previously passing cases", tone: comparison.regressionCount ? "red" : "green" },
    { label: "Pass-rate change", value: `${comparison.passRateDelta >= 0 ? "+" : ""}${(comparison.passRateDelta * 100).toFixed(0)} pp`, note: `${comparison.fixCount} fixed`, tone: comparison.passRateDelta >= 0 ? "green" : "red" },
  ];
  $("#result-stats").replaceChildren(
    ...stats.map((stat) =>
      el("div", { class: "card" },
        el("div", { class: "stat" },
          el("div", { class: "stat-label", text: stat.label }),
          el("div", { class: `stat-value ${stat.tone}`, text: String(stat.value) }),
          el("div", { class: "small muted", text: stat.note }),
        ),
      ),
    ),
  );

  $("#matrix-sub").textContent = `${suite.name} · ${pair.baseline.version} baseline vs ${pair.candidate.version} candidate`;
  $("#matrix").replaceChildren(buildMatrix(suite, baseline, candidate));

  const typeCounts = new Map();
  for (const testCase of suite.cases) {
    for (const assertion of testCase.assertions) {
      typeCounts.set(assertion.type, (typeCounts.get(assertion.type) || 0) + 1);
    }
  }
  $("#assertion-mix").replaceChildren(
    A.barList({
      rows: [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ label: type, value: count })),
      format: (value) => `${value}`,
    }),
  );
  $("#suite-note").textContent =
    `${suite.name} has ${suite.cases.length} cases and ${[...typeCounts.values()].reduce((sum, value) => sum + value, 0)} assertions. ` +
    `The pass/fail matrix is computed from the recorded outputs; opening a row shows each assertion against both runs.`;
}

function buildMatrix(suite, baseline, candidate) {
  const table = el("table", { class: "table matrix-table" });
  table.append(el("thead", {}, el("tr", {},
    el("th", { text: "Case" }),
    el("th", { text: `v${baseline.version} · baseline` }),
    el("th", { text: `v${candidate.version} · candidate` }),
    el("th", { style: "text-align:right", text: "Change" }),
  )));

  const baseByCase = new Map(baseline.cases.map((item) => [item.caseId, item]));
  const candByCase = new Map(candidate.cases.map((item) => [item.caseId, item]));
  const body = el("tbody");

  for (const testCase of suite.cases) {
    const before = baseByCase.get(testCase.id);
    const after = candByCase.get(testCase.id);
    const regressed = before?.passed && after && !after.passed;
    const fixed = before && !before.passed && after?.passed;
    const changeClass = regressed ? "regressed" : fixed ? "fixed" : "same";
    const changeText = regressed ? "regressed" : fixed ? "fixed" : before?.passed && after?.passed ? "still passing" : "still failing";

    body.append(el("tr", {
      style: "cursor:pointer",
      onclick: () => openCase(testCase, suite, before, after),
    },
      el("td", {},
        el("span", { class: "case-id", text: testCase.id }),
        el("div", { class: "case-name", text: testCase.name }),
      ),
      el("td", {},
        el("span", { class: `badge ${before?.passed ? "green" : "red"}`, text: before?.passed ? "pass" : "fail" }),
        !before?.passed && before?.failures.length ? el("span", { class: "cell-fail", text: before.failures[0] }) : null,
      ),
      el("td", {},
        el("span", { class: `badge ${after?.passed ? "green" : "red"}`, text: after?.passed ? "pass" : "fail" }),
        !after?.passed && after?.failures.length ? el("span", { class: "cell-fail", text: after.failures[0] }) : null,
      ),
      el("td", { class: "num" }, el("span", { class: `change ${changeClass}`, text: changeText })),
    ));
  }
  table.append(body);
  return el("div", { class: "table-wrap" }, table);
}

function openCase(testCase, suite, before, after) {
  const section = (label, evaluation) =>
    el("div", { style: "margin-bottom:16px" },
      el("div", { class: "row mb-1" },
        el("span", { class: "card-title", text: label }),
        el("span", { class: "spacer" }),
        el("span", { class: `badge ${evaluation?.passed ? "green" : "red"}`, text: evaluation?.passed ? "pass" : "fail" }),
      ),
      el("div", {},
        ...(evaluation?.results || []).map((result) =>
          el("div", { class: "assertion-line" + (result.passed ? "" : " failed") },
            el("span", { class: "type", text: result.type }),
            el("span", { class: "msg", text: result.message }),
          ),
        ),
      ),
      el("pre", { class: "code", style: "margin-top:8px;font-size:11px;max-height:120px", text: evaluation?.output || "" }),
    );

  A.modal({
    title: `${testCase.id} · ${testCase.name}`,
    body: el("div", {},
      el("div", { class: "small muted", style: "margin-bottom:12px" },
        `suite ${suite.name} · vars ${JSON.stringify(testCase.vars)}`,
      ),
      section("Baseline", before),
      section("Candidate", after),
    ),
  });
}

/* ----------------------------------------------------------------- diff */

function versionOptions(prompt, selected) {
  return prompt.versions.map((version) => el("option", { value: version.version, text: version.version, selected: version.version === selected }));
}

function defaultDiffRange(prompt) {
  const latest = prompt.versions[prompt.versions.length - 1].version;
  const previous = prompt.labels?.previous || prompt.versions[Math.max(0, prompt.versions.length - 2)].version;
  return { from: previous, to: latest };
}

function renderDiff() {
  const prompt = getPrompt(state.registry, state.diffPrompt);
  const defaults = defaultDiffRange(prompt);
  if (!state.diffFrom || !prompt.versions.some((version) => version.version === state.diffFrom)) state.diffFrom = defaults.from;
  if (!state.diffTo || !prompt.versions.some((version) => version.version === state.diffTo)) state.diffTo = defaults.to;

  $("#diff-prompt").replaceChildren(
    ...state.registry.prompts.map((candidate) => el("option", { value: candidate.id, text: candidate.name, selected: candidate.id === prompt.id })),
  );
  $("#diff-from").replaceChildren(...versionOptions(prompt, state.diffFrom));
  $("#diff-to").replaceChildren(...versionOptions(prompt, state.diffTo));

  const diff = diffPromptVersions(prompt, state.diffFrom, state.diffTo);
  $("#diff-title").textContent = `${prompt.id} · ${diff.from.version} → ${diff.to.version}`;
  $("#added-badge").textContent = `+${diff.added}`;
  $("#removed-badge").textContent = `−${diff.removed}`;
  $("#diff-meta").textContent = `${diff.from.changelog.split(".")[0]} → ${diff.to.changelog.split(".")[0]}`;

  $("#diff-lines").replaceChildren(
    ...diff.lines.map((line) =>
      el("div", { class: `diff-line ${line.type}` },
        el("span", { class: "num", text: line.oldLine ? String(line.oldLine) : "" }),
        el("span", { class: "num", text: line.newLine ? String(line.newLine) : "" }),
        el("span", { class: "mark", text: line.type === "added" ? "+" : line.type === "removed" ? "-" : " " }),
        el("span", { class: "text", text: line.text || " " }),
      ),
    ),
  );

  $("#diff-notes").replaceChildren(
    el("div", { class: "contract-row" }, el("span", { class: "k", text: diff.from.version }), el("span", { class: "v", text: diff.from.changelog })),
    el("div", { class: "contract-row" }, el("span", { class: "k", text: diff.to.version }), el("span", { class: "v", text: diff.to.changelog })),
  );

  const contract = [
    { k: "Variables added", v: diff.variablesAdded.length ? diff.variablesAdded.join(", ") : "none" },
    { k: "Variables removed", v: diff.variablesRemoved.length ? diff.variablesRemoved.join(", ") : "none" },
    { k: "Other changes", v: diff.changedFields.length ? diff.changedFields.join(", ") : "template only" },
    { k: "Lines", v: `+${diff.added} / −${diff.removed}` },
  ];
  $("#diff-contract").replaceChildren(
    ...contract.map((row) => el("div", { class: "contract-row" }, el("span", { class: "k", text: row.k }), el("span", { class: "v", text: row.v }))),
  );
}

/* --------------------------------------------------------------- compare */

function renderCompare() {
  const { suite, pair, baseline, candidate, comparison } = evaluationsFor(state.compareSuite);
  $("#compare-suite").value = state.compareSuite;

  const banner = $("#gate-banner");
  banner.className = `gate-banner ${comparison.gate}`;
  banner.replaceChildren(
    el("div", { class: "gate-icon", text: comparison.gate === "fail" ? "✕" : "✓" }),
    el("div", { style: "flex:1" },
      el("div", { class: "gate-title", text: comparison.gate === "fail" ? `Gate failed, ${comparison.regressionCount} regression${comparison.regressionCount === 1 ? "" : "s"}` : "Gate passed" }),
      el("div", { class: "gate-sub", text: `${suite.name} · ${pair.baseline.version} → ${pair.candidate.version} · pass rate ${comparison.passRateDelta >= 0 ? "+" : ""}${(comparison.passRateDelta * 100).toFixed(0)} pp · ${comparison.fixCount} fix${comparison.fixCount === 1 ? "" : "es"} · cost ${comparison.costDeltaUsd >= 0 ? "+" : ""}${money(comparison.costDeltaUsd)}` }),
    ),
    el("span", { class: `badge ${comparison.gate === "fail" ? "red" : "green"}`, text: comparison.gate.toUpperCase() }),
  );

  $("#regression-count").textContent = String(comparison.regressionCount);
  $("#fix-count").textContent = String(comparison.fixCount);
  $("#regressions").replaceChildren(
    ...(comparison.regressions.length
      ? comparison.regressions.map((item) =>
          el("div", { class: "regression-item" },
            el("span", { class: "case-id", text: item.caseId }),
            el("div", {},
              el("div", { class: "case-name", text: item.name }),
              el("div", { class: "failures", text: item.failures.join(" · ") }),
            ),
          ),
        )
      : [el("div", { class: "empty-gate", text: "No previously-passing case broke." })]),
  );
  $("#fixes").replaceChildren(
    ...(comparison.fixes.length
      ? comparison.fixes.map((item) =>
          el("div", { class: "regression-item" },
            el("span", { class: "case-id", text: item.caseId }),
            el("div", {}, el("div", { class: "case-name", text: item.name }), el("div", { class: "small muted", text: "previously failing, now passes" })),
          ),
        )
      : []),
    ...(comparison.stillFailing.length
      ? comparison.stillFailing.map((item) =>
          el("div", { class: "regression-item" },
            el("span", { class: "case-id", text: item.caseId }),
            el("div", {}, el("div", { class: "case-name", text: item.name }), el("div", { class: "failures", text: item.failures.join(" · ") })),
          ),
        )
      : []),
    ...(!comparison.fixes.length && !comparison.stillFailing.length ? [el("div", { class: "empty-gate", text: "Nothing needed fixing; nothing is still failing." })] : []),
  );

  const maxCost = Math.max(baseline.costUsd, candidate.costUsd, 0.000001);
  const maxLatency = Math.max(baseline.averageLatencyMs, candidate.averageLatencyMs, 1);
  $("#cost-latency").replaceChildren(
    el("div", { class: "small muted", style: "margin-bottom:6px", text: "cost per run" }),
    costRow(`v${baseline.version} baseline`, baseline.costUsd, maxCost, ""),
    costRow(`v${candidate.version} candidate`, candidate.costUsd, maxCost, "blue"),
    el("div", { class: "divider" }),
    el("div", { class: "small muted", style: "margin-bottom:6px", text: "average latency per case" }),
    costRow(`v${baseline.version} baseline`, baseline.averageLatencyMs, maxLatency, "", `${baseline.averageLatencyMs} ms`),
    costRow(`v${candidate.version} candidate`, candidate.averageLatencyMs, maxLatency, "blue", `${candidate.averageLatencyMs} ms`),
  );

  $("#ci-output").textContent = `$ node bin/promptops.mjs compare ${state.compareSuite}\n\n${formatComparison(comparison)}`;
}

function costRow(label, value, max, tone, display) {
  return el("div", { class: "cost-row" },
    el("span", { class: "label", text: label }),
    el("div", { class: `cost-bar ${tone}` }, el("i", { style: `width:${Math.max(2, (value / max) * 100)}%` })),
    el("span", { class: "value", text: display || money(value) }),
  );
}

/* ------------------------------------------------------------------ nav */

function populateSelects() {
  $("#suite-select").replaceChildren(
    ...state.registry.suites.map((suite) => el("option", { value: suite.id, text: suite.name })),
  );
  $("#compare-suite").replaceChildren(
    ...state.registry.suites.map((suite) => el("option", { value: suite.id, text: suite.name })),
  );
  $("#suite-select").value = state.suiteId;
  $("#compare-suite").value = state.compareSuite;
}

function show(view) {
  if (!["registry", "results", "diff", "compare"].includes(view)) view = "results";
  state.view = view;
  $$("[data-view-panel]").forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  $$(".nav-item[data-view]").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (view === "registry") renderRegistry();
  if (view === "results") renderResults();
  if (view === "diff") renderDiff();
  if (view === "compare") renderCompare();
}

function bind() {
  window.addEventListener("hashchange", () => show(location.hash.replace("#", "")));
  $$(".nav-item[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      show(link.dataset.view);
    });
  });

  $("#suite-select").addEventListener("change", (event) => {
    state.suiteId = event.target.value;
    renderResults();
  });
  $("#compare-suite").addEventListener("change", (event) => {
    state.compareSuite = event.target.value;
    renderCompare();
  });
  $("#diff-prompt").addEventListener("change", (event) => {
    state.diffPrompt = event.target.value;
    state.diffFrom = null;
    state.diffTo = null;
    renderDiff();
  });
  $("#diff-from").addEventListener("change", (event) => {
    state.diffFrom = event.target.value;
    renderDiff();
  });
  $("#diff-to").addEventListener("change", (event) => {
    state.diffTo = event.target.value;
    renderDiff();
  });
}

/* ----------------------------------------------------------------- boot */

async function boot() {
  const response = await fetch(new URL("../data/registry.json", import.meta.url));
  if (!response.ok) throw new Error(`registry: HTTP ${response.status}`);
  state.registry = await response.json();
  state.promptVersion = resolveVersion(state.registry, state.promptId, "prod").version;
  populateSelects();
  bind();
  const stats = registryStats(state.registry);
  console.info(`promptops demo: ${stats.prompts} prompts, ${stats.runs} recorded runs`);
  show(location.hash.replace("#", "") || "results");
}

boot().catch((error) => {
  console.error(error);
  const answer = document.querySelector("#matrix");
  if (answer) answer.textContent = `Could not load the registry: ${error.message}. Run the demo through scripts/serve.mjs.`;
});
