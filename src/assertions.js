// Assertion engine.
//
// A suite is only useful if the assertions are cheap to write and hard to fool.
// These six cover the common prompt contracts: must contain / must not contain,
// must match a pattern, must be parseable JSON with named fields, must equal a
// value, and must stay short. Custom handlers cover the rest without changing
// the engine.

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

/** Models wrap JSON in prose or code fences often enough that a JSON assertion
 *  which only accepts a bare object would fail every other run. */
export function extractJson(output) {
  const text = String(output ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const attempts = [candidate];
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) attempts.push(candidate.slice(firstBrace, lastBrace + 1));
  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) attempts.push(candidate.slice(firstBracket, lastBracket + 1));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next shape
    }
  }
  throw new AssertionError("output is not valid JSON");
}

function getPath(value, path) {
  return String(path).split(".").reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), value);
}

const result = (type, passed, message) => ({ type, passed, message });

export function evaluateAssertion(output, assertion, context = {}) {
  const type = assertion?.type;
  const value = assertion?.value;
  const text = String(output ?? "");
  const lower = text.toLowerCase();

  switch (type) {
    case "contains": {
      const needle = String(value ?? "").toLowerCase();
      const passed = needle === "" ? true : (assertion.ignoreCase === false ? text.includes(String(value)) : lower.includes(needle));
      return result(type, passed, passed ? `contains "${value}"` : `missing required text "${value}"`);
    }
    case "not_contains": {
      const needle = String(value ?? "").toLowerCase();
      const passed = needle === "" ? true : !lower.includes(needle);
      return result(type, passed, passed ? `does not contain "${value}"` : `contains forbidden text "${value}"`);
    }
    case "regex": {
      let pattern;
      try {
        pattern = new RegExp(String(value), assertion.flags || "");
      } catch (error) {
        return result(type, false, `invalid pattern: ${error.message}`);
      }
      const passed = pattern.test(text);
      return result(type, passed, passed ? `matches /${value}/` : `does not match /${value}/`);
    }
    case "json": {
      try {
        const parsed = extractJson(text);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return result(type, false, "JSON is not an object");
        }
        const required = assertion.required || [];
        const missing = required.filter((key) => !(key in parsed));
        if (missing.length) return result(type, false, `JSON missing keys: ${missing.join(", ")}`);
        return result(type, true, `valid JSON with ${required.length} required key(s)`);
      } catch (error) {
        return result(type, false, error.message);
      }
    }
    case "json_field": {
      try {
        const parsed = extractJson(text);
        const actual = getPath(parsed, assertion.field);
        if (actual === undefined) return result(type, false, `missing field ${assertion.field}`);
        const fields = [];
        if (assertion.equals !== undefined) {
          fields.push(actual === assertion.equals ? null : `expected ${JSON.stringify(assertion.equals)}, got ${JSON.stringify(actual)}`);
        }
        if (assertion.matches !== undefined) {
          fields.push(new RegExp(assertion.matches, "i").test(String(actual)) ? null : `${assertion.field}=${JSON.stringify(actual)} does not match /${assertion.matches}/`);
        }
        const problems = fields.filter(Boolean);
        return result(type, problems.length === 0, problems.length ? problems.join("; ") : `${assertion.field} = ${JSON.stringify(actual)}`);
      } catch (error) {
        return result(type, false, error.message);
      }
    }
    case "equals": {
      const passed = text.trim() === String(value ?? "").trim();
      return result(type, passed, passed ? "equals expected value" : `expected ${JSON.stringify(value)}`);
    }
    case "length_max": {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const limit = Number(value);
      const passed = words <= limit;
      return result(type, passed, `${words} words (limit ${limit})`);
    }
    case "custom": {
      const handler = context.custom?.[assertion.fn];
      if (typeof handler !== "function") return result(type, false, `no custom handler named "${assertion.fn}"`);
      try {
        const outcome = handler(text, { ...context, args: assertion.args, value });
        if (typeof outcome === "boolean") return result(type, outcome, outcome ? `custom ${assertion.fn} passed` : `custom ${assertion.fn} failed`);
        return result(type, Boolean(outcome?.passed), outcome?.message || `custom ${assertion.fn}`);
      } catch (error) {
        return result(type, false, `custom ${assertion.fn} threw: ${error.message}`);
      }
    }
    default:
      return result(type || "unknown", false, `unknown assertion type: ${type}`);
  }
}

export function evaluateAssertions(output, assertions = [], context = {}) {
  const results = assertions.map((assertion) => evaluateAssertion(output, assertion, context));
  return {
    passed: results.every((item) => item.passed),
    results,
    failures: results.filter((item) => !item.passed).map((item) => item.message),
  };
}

export const ASSERTION_TYPES = ["contains", "not_contains", "regex", "json", "json_field", "equals", "length_max", "custom"];
