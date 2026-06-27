// Prompt templates with strict variable validation.
//
// The failure this prevents is mundane and expensive: a prompt is edited, a
// placeholder is renamed, and production starts sending the literal text
// "{{company}}" to the model because nothing validates the render. Rendering
// here is strict by default — a missing variable or an unused variable throws
// with both lists, so a bad edit fails at build time instead of at request time.

const VARIABLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

export class TemplateError extends Error {
  constructor(message, { missing = [], unknown = [], problems = [] } = {}) {
    super(message);
    this.name = "TemplateError";
    this.missing = missing;
    this.unknown = unknown;
    this.problems = problems;
  }
}

export function findVariables(template) {
  const found = [];
  for (const match of String(template).matchAll(VARIABLE_RE)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

function readPath(variables, path) {
  return path.split(".").reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), variables);
}

function formatValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function validateTemplate(template) {
  const text = String(template ?? "");
  const problems = [];
  const opens = (text.match(/\{\{/g) || []).length;
  const closes = (text.match(/\}\}/g) || []).length;
  if (opens !== closes) problems.push(`unbalanced braces: ${opens} "{{" and ${closes} "}}"`);
  for (const match of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(match[1])) problems.push(`invalid variable name: ${match[1] || "(empty)"}`);
  }
  return { valid: problems.length === 0, variables: findVariables(text), problems };
}

export function renderTemplate(template, variables = {}, { strict = true } = {}) {
  const text = String(template ?? "");
  const declared = findVariables(text);
  const missing = declared.filter((name) => {
    const value = readPath(variables, name);
    return value === undefined || value === null || value === "";
  });
  // A dotted placeholder consumes the root object, so "user.name" makes a
  // top-level "user" key expected rather than unknown.
  const declaredRoots = new Set(declared.map((name) => name.split(".")[0]));
  const unknown = Object.keys(variables).filter((name) => !declaredRoots.has(name));

  if (strict && (missing.length || unknown.length)) {
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (unknown.length) parts.push(`unknown: ${unknown.join(", ")}`);
    throw new TemplateError(`cannot render template (${parts.join("; ")})`, { missing, unknown });
  }

  const rendered = text.replace(VARIABLE_RE, (_, name) => {
    const value = readPath(variables, name);
    return value === undefined || value === null ? "" : formatValue(value);
  });

  return {
    text: rendered,
    used: declared,
    missing,
    unknown,
    // Rough token estimate: four characters per token is the convention most
    // provider docs use for English prompts. It is used for the cost column,
    // never for billing.
    estimatedTokens: Math.ceil(rendered.length / 4),
  };
}
