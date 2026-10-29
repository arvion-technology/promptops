// Custom assertion handlers used by the demo suites.
//
// The engine does not know anything about refunds or SQL; these handlers are
// ordinary functions passed in at evaluation time. That is the extension point:
// a team adds checks for its own domain without editing the assertion engine.

export const CUSTOM_HANDLERS = {
  mentions_business_days(text) {
    // Support replies mix digits and words ("3-5 days", "five to ten days"), so
    // the check accepts both rather than forcing an unnatural writing style.
    const number = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)";
    const match = text.match(new RegExp(`\\b(${number})\\s*(?:-|, |to)\\s*(${number})\\s+business days\\b`, "i"));
    return {
      passed: Boolean(match),
      message: match ? `states ${match[1]}, ${match[2]} business days` : "does not state a business-day window",
    };
  },

  no_competitor_mention(text) {
    const match = text.match(/\b(zendesk|intercom|freshdesk|helpscout)\b/i);
    return {
      passed: !match,
      message: match ? `mentions a competitor: ${match[1]}` : "no competitor mentioned",
    };
  },

  sql_select_only(output) {
    const text = output.trim().toLowerCase();
    return {
      passed: text.startsWith("select") && !/\b(insert|update|delete|drop|alter)\b/.test(text),
      message: text.startsWith("select") ? "statement is a read-only SELECT" : "statement is not a SELECT",
    };
  },

  has_parameter_placeholder(output) {
    const passed = /\$\d|:\w+|\?/.test(output);
    return { passed, message: passed ? "uses a bind parameter" : "interpolates a literal value" };
  },
};
