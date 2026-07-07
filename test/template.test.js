import test from "node:test";
import assert from "node:assert/strict";

import {
  TemplateError,
  findVariables,
  renderTemplate,
  validateTemplate,
} from "../src/template.js";

const TEMPLATE = "You are a helper for {{company}}.\nQuestion: {{question}}";

test("findVariables returns each placeholder once, in order", () => {
  assert.deepEqual(findVariables("{{b}} {{a}} {{b}}"), ["b", "a"]);
  assert.deepEqual(findVariables("no variables"), []);
});

test("render substitutes values and supports nested paths", () => {
  const rendered = renderTemplate("Hi {{user.name}}, ticket {{ticket.id}}", {
    user: { name: "Priya" },
    ticket: { id: 42 },
  });
  assert.equal(rendered.text, "Hi Priya, ticket 42");
  assert.deepEqual(rendered.used, ["user.name", "ticket.id"]);
});

test("missing variables throw with the missing list", () => {
  const error = (() => {
    try {
      renderTemplate(TEMPLATE, { company: "Mesa" });
      return null;
    } catch (caught) {
      return caught;
    }
  })();
  assert.ok(error instanceof TemplateError);
  assert.deepEqual(error.missing, ["question"]);
  assert.match(error.message, /missing: question/);
});

test("unknown variables throw too", () => {
  assert.throws(
    () => renderTemplate(TEMPLATE, { company: "Mesa", question: "Why?", extra: "ignored" }),
    TemplateError,
  );
});

test("non-strict rendering leaves missing placeholders blank", () => {
  const rendered = renderTemplate(TEMPLATE, { company: "Mesa" }, { strict: false });
  assert.match(rendered.text, /Question: $/);
  assert.deepEqual(rendered.missing, ["question"]);
});

test("empty strings count as missing", () => {
  assert.throws(() => renderTemplate("{{value}}", { value: "" }), /missing: value/);
});

test("numbers and booleans are rendered, objects are serialised", () => {
  assert.equal(renderTemplate("{{n}} {{flag}}", { n: 3, flag: false }).text, "3 false");
  assert.equal(renderTemplate("{{obj}}", { obj: { a: 1 } }).text, '{"a":1}');
});

test("validateTemplate spots unbalanced braces and bad names", () => {
  assert.equal(validateTemplate(TEMPLATE).valid, true);
  const broken = validateTemplate("{{company");
  assert.equal(broken.valid, false);
  assert.match(broken.problems[0], /unbalanced/);
  assert.equal(validateTemplate("{{first name}}").valid, false);
});

test("an estimated token count is provided for the cost column", () => {
  const rendered = renderTemplate(TEMPLATE, { company: "Mesa", question: "Why?" });
  assert.ok(rendered.estimatedTokens > 0);
});
