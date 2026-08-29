import ts from "typescript";
import { describe, expect, it } from "vitest";
import { lintSource, parseDirective } from "../src/commands/lint";

/**
 * Regression tests for suppression-directive parsing.
 *
 * Directives were previously collected with `line.includes("sibujs-disable")`
 * over raw source text, so any string, template, regex or JSX literal
 * containing that text switched the rules off. Directives now come from parser
 * comment trivia only.
 */

const HOOKS = "no-hooks-in-conditionals";
const DOM = "no-direct-dom-mutation";
const EACH = "each-requires-key";

function lint(code: string, fileName = "test.ts") {
  return lintSource(ts, fileName, code);
}

function count(code: string, rule: string, fileName = "test.ts") {
  return lint(code, fileName).filter((v) => v.rule === rule).length;
}

// A violation of each rule, as a single line of source.
const VIOLATION = {
  [HOOKS]: "if (ok) signal(0);",
  [DOM]: "element.innerHTML = html;",
  [EACH]: "each(items, renderItem);",
} as const;

describe("the reported bypasses", () => {
  it("a string in a conditional block does not suppress the hook violation", () => {
    const code = 'if (ok) {\n  console.log("sibujs-disable");\n  signal(0);\n}\n';
    expect(count(code, HOOKS)).toBe(1);
  });

  it("a string on the same line as the violation does not suppress it", () => {
    // The directive and the violation must share a line for the same-line rule
    // to apply at all; this is the form that actually bypassed.
    const code = 'if (ok) { console.log("sibujs-disable"); signal(0); }\n';
    expect(count(code, HOOKS)).toBe(1);
  });

  it("a bare string statement does not suppress the following line", () => {
    const code = '"sibujs-disable-next-line";\nif (ok) signal(0);\n';
    expect(count(code, HOOKS)).toBe(1);
  });

  it("a string constant does not suppress a DOM violation", () => {
    const code = 'const text = "sibujs-disable";\nelement.innerHTML = html;\n';
    expect(count(code, DOM)).toBe(1);
  });

  it("a template constant does not suppress an each() violation", () => {
    const code = "const text = `sibujs-disable-next-line`;\neach(items, renderItem);\n";
    expect(count(code, EACH)).toBe(1);
  });
});

describe("literals never act as directives", () => {
  const LITERALS: Array<[string, string]> = [
    ["double-quoted string", 'const m = "sibujs-disable-next-line";'],
    ["single-quoted string", "const m = 'sibujs-disable-next-line';"],
    ["template literal", "const m = `sibujs-disable-next-line`;"],
    ["multiline template", "const m = `\nsibujs-disable-next-line\n`;"],
    ["template interpolation", 'const m = `${"sibujs-disable-next-line"}`;'],
    ["object property value", 'const o = { note: "sibujs-disable-next-line" };'],
    ["import specifier", 'import x from "./sibujs-disable-next-line";'],
    ["string holding line-comment syntax", 'const v = "// sibujs-disable-next-line";'],
    ["string holding block-comment syntax", 'const v = "/* sibujs-disable-next-line */";'],
    ["template holding line-comment syntax", "const v = `// sibujs-disable-next-line`;"],
    ["regex literal", "const p = /sibujs-disable-next-line/;"],
    ["regex holding escaped comment syntax", String.raw`const p = /\/\/ sibujs-disable-next-line/;`],
    ["regex holding escaped block syntax", String.raw`const p = /\/\* sibujs-disable-next-line \*\//;`],
  ];

  for (const [label, prelude] of LITERALS) {
    for (const rule of [HOOKS, DOM, EACH] as const) {
      it(`${label} does not suppress ${rule}`, () => {
        expect(count(`${prelude}\n${VIOLATION[rule]}\n`, rule)).toBe(1);
      });
    }
  }

  it("a string on the same line does not suppress a same-line violation", () => {
    expect(count('const t = "sibujs-disable"; element.innerHTML = h;\n', DOM)).toBe(1);
  });
});

describe("JSX literals never act as directives", () => {
  it("JSX text", () => {
    const code = "const a = <div>sibujs-disable-next-line</div>;\nelement.innerHTML = html;\n";
    expect(count(code, DOM, "test.tsx")).toBe(1);
  });

  it("JSX attribute value", () => {
    const code = 'const a = <div title="sibujs-disable-next-line" />;\neach(items, renderItem);\n';
    expect(count(code, EACH, "test.tsx")).toBe(1);
  });

  it("JSX expression string", () => {
    const code = 'const a = <C value={"sibujs-disable-next-line"} />;\nelement.innerHTML = html;\n';
    expect(count(code, DOM, "test.tsx")).toBe(1);
  });

  it("a real JSX comment still works as a directive", () => {
    const code = "const a = <div>{/* sibujs-disable-next-line */}</div>;\n";
    // Nothing to suppress here; the point is that it parses as a comment.
    expect(lint(code, "test.tsx")).toHaveLength(0);
  });
});

describe("genuine directives still suppress", () => {
  it("same-line, all rules", () => {
    expect(count("element.innerHTML = html; // sibujs-disable\n", DOM)).toBe(0);
  });

  it("same-line, rule-specific", () => {
    expect(count("element.innerHTML = html; // sibujs-disable no-direct-dom-mutation\n", DOM)).toBe(0);
  });

  it("next-line, all rules", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;\n", DOM)).toBe(0);
  });

  it("next-line, rule-specific", () => {
    expect(count("// sibujs-disable-next-line no-direct-dom-mutation\nelement.innerHTML = html;\n", DOM)).toBe(0);
  });

  it("next-line for each-requires-key", () => {
    expect(count("// sibujs-disable-next-line each-requires-key\neach(items, renderItem, opts);\n", EACH)).toBe(0);
  });

  it("next-line for no-hooks-in-conditionals", () => {
    expect(count("// sibujs-disable-next-line no-hooks-in-conditionals\nif (ok) signal(0);\n", HOOKS)).toBe(0);
  });

  it("accepts a reason after a -- separator", () => {
    expect(count("// sibujs-disable-next-line -- reviewed, markup is trusted\nelement.innerHTML = h;\n", DOM)).toBe(0);
  });

  it("accepts a rule name and a reason", () => {
    const code = "// sibujs-disable-next-line no-direct-dom-mutation -- trusted\nelement.innerHTML = h;\n";
    expect(count(code, DOM)).toBe(0);
  });

  it("one named rule does not suppress another", () => {
    const code = "// sibujs-disable-next-line each-requires-key\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("suppresses every finding on the targeted line", () => {
    const code = "// sibujs-disable-next-line\nif (ok) { signal(0); derived(fn); }\n";
    expect(count(code, HOOKS)).toBe(0);
  });

  it("suppresses only the targeted rule when several are on one line", () => {
    const code = "// sibujs-disable-next-line no-hooks-in-conditionals\nif (ok) { signal(0); element.innerHTML = h; }\n";
    expect(count(code, HOOKS)).toBe(0);
    expect(count(code, DOM)).toBe(1);
  });

  it("does not suppress an earlier line", () => {
    const code = "element.innerHTML = a;\nelement.innerHTML = b; // sibujs-disable\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("does not suppress a later line", () => {
    const code = "element.innerHTML = a; // sibujs-disable\nelement.innerHTML = b;\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("next-line does not skip a blank line", () => {
    const code = "// sibujs-disable-next-line\n\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });
});

describe("block-comment policy", () => {
  it("a one-line block comment is a directive", () => {
    expect(count("/* sibujs-disable-next-line */\nelement.innerHTML = html;\n", DOM)).toBe(0);
  });

  it("a boxed block comment is a directive, based on the line it ends on", () => {
    const code = "/*\n * sibujs-disable-next-line\n */\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(0);
  });

  it("a trailing one-line block comment suppresses its own line", () => {
    expect(count("element.innerHTML = html; /* sibujs-disable */\n", DOM)).toBe(0);
  });

  it("a JSDoc description mentioning a directive is not a directive", () => {
    const code = "/**\n * Never write sibujs-disable-next-line in prose.\n */\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("a block comment with prose alongside the directive is not a directive", () => {
    const code = "/*\n * sibujs-disable-next-line\n * because reasons\n */\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });
});

describe("directive grammar", () => {
  it.each([
    "not-sibujs-disable",
    "sibujs-disabled",
    "sibujs-disable-something-else",
    "sibujs-disable-next-lines",
    "sibujs-disable-next-line-please",
    "xsibujs-disable",
  ])("lookalike %s is not a directive", (word) => {
    // On its own line (would be next-line) and trailing (would be same-line).
    expect(count(`// ${word}\nelement.innerHTML = html;\n`, DOM)).toBe(1);
    expect(count(`element.innerHTML = html; // ${word}\n`, DOM)).toBe(1);
  });

  it("an unknown rule name makes the directive invalid and suppresses nothing", () => {
    const code = "// sibujs-disable-next-line totally-made-up\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("an unknown rule name does not fall back to disabling every rule", () => {
    const code = "// sibujs-disable-next-line no-such-rule\nif (ok) { signal(0); element.innerHTML = h; }\n";
    expect(count(code, HOOKS)).toBe(1);
    expect(count(code, DOM)).toBe(1);
  });

  it("trailing junk after a rule name is invalid", () => {
    const code = "// sibujs-disable-next-line no-direct-dom-mutation extra\nelement.innerHTML = html;\n";
    expect(count(code, DOM)).toBe(1);
  });

  it("parseDirective classifies each form", () => {
    expect(parseDirective("sibujs-disable")).toEqual({ kind: "disable", rules: null });
    expect(parseDirective("sibujs-disable-next-line")).toEqual({ kind: "disable-next-line", rules: null });
    expect(parseDirective("sibujs-disable each-requires-key")).toEqual({
      kind: "disable",
      rules: ["each-requires-key"],
    });
    expect(parseDirective("sibujs-disable -- why")).toEqual({ kind: "disable", rules: null });
    expect(parseDirective("sibujs-disable each-requires-key -- why")).toEqual({
      kind: "disable",
      rules: ["each-requires-key"],
    });
    expect(parseDirective("sibujs-disable bogus-rule")).toBe("invalid");
    expect(parseDirective("sibujs-disable each-requires-key junk")).toBe("invalid");
    expect(parseDirective("sibujs-disabled")).toBeNull();
    expect(parseDirective("just a comment")).toBeNull();
    expect(parseDirective("")).toBeNull();
  });

  it("tolerates extra whitespace and extra leading slashes", () => {
    expect(count("///   sibujs-disable-next-line   \nelement.innerHTML = html;\n", DOM)).toBe(0);
  });
});

describe("line endings and file edges", () => {
  it("works with LF", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;\n", DOM)).toBe(0);
  });

  it("works with CRLF", () => {
    expect(count("// sibujs-disable-next-line\r\nelement.innerHTML = html;\r\n", DOM)).toBe(0);
  });

  it("reports correct positions with CRLF", () => {
    const violations = lint("const a = 1;\r\nelement.innerHTML = html;\r\n");
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(2);
    expect(violations[0].column).toBe(1);
  });

  it("works without a trailing newline", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;", DOM)).toBe(0);
  });

  it("handles a directive at the very start of a file", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;\n", DOM)).toBe(0);
  });

  it("handles a directive at the very end of a file with no newline", () => {
    // Nothing follows, so it suppresses nothing and must not crash.
    expect(count("element.innerHTML = html;\n// sibujs-disable-next-line", DOM)).toBe(1);
  });

  it("handles a trailing same-line directive at end of file with no newline", () => {
    expect(count("element.innerHTML = html; // sibujs-disable", DOM)).toBe(0);
  });

  it("keeps positions correct deep in a multiline file", () => {
    const filler = "const x = 1;\n".repeat(50);
    const violations = lint(`${filler}element.innerHTML = html;\n`);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(51);
  });
});

describe("javascript sources", () => {
  it("suppresses in .js", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;\n", DOM, "test.js")).toBe(0);
  });

  it("does not suppress from a .js string", () => {
    expect(count('const s = "sibujs-disable-next-line";\nelement.innerHTML = html;\n', DOM, "test.js")).toBe(1);
  });

  it("suppresses in .jsx", () => {
    expect(count("// sibujs-disable-next-line\nelement.innerHTML = html;\n", DOM, "test.jsx")).toBe(0);
  });

  it("does not suppress from .jsx JSX text", () => {
    const code = "const a = <div>sibujs-disable-next-line</div>;\nelement.innerHTML = html;\n";
    expect(count(code, DOM, "test.jsx")).toBe(1);
  });
});
