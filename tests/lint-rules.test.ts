import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lintSource } from "../src/commands/lint";

/**
 * Regression tests for the linter.
 *
 * The previous implementation walked characters, so it could not tell code from
 * comments, strings or template literals, and `each-requires-key` treated the
 * mere presence of a third argument as proof of a key.
 */

const CLI = path.resolve(__dirname, "..", "dist", "index.js");

function lint(code: string, fileName = "test.ts") {
  return lintSource(ts, fileName, code);
}

function rules(code: string, rule: string) {
  return lint(code).filter((v) => v.rule === rule);
}

const EACH = "each-requires-key";
const HOOKS = "no-hooks-in-conditionals";
const DOM = "no-direct-dom-mutation";

describe("each-requires-key: reports calls without a statically known key", () => {
  it.each([
    ["no third argument", "each(items, renderItem);"],
    ["empty object", "each(items, renderItem, {});"],
    ["explicit undefined", "each(items, renderItem, undefined);"],
    ["unrelated properties only", "each(items, renderItem, { fallback: emptyState });"],
    ["opaque variable", "each(items, renderItem, optionsWithoutKey);"],
    ["spread of a variable", "each(items, renderItem, { ...opts });"],
    ["a call expression", "each(items, renderItem, makeOptions());"],
    ["null", "each(items, renderItem, null);"],
    ["a key-less nested object", "each(items, renderItem, { opts: { key: k } });"],
  ])("%s", (_label, code) => {
    expect(rules(code, EACH)).toHaveLength(1);
  });

  it("reports each of several bad calls", () => {
    const code = ["each(a, r);", "each(b, r, {});", "each(c, r, undefined);"].join("\n");
    expect(rules(code, EACH)).toHaveLength(3);
  });
});

describe("each-requires-key: accepts a statically established key", () => {
  it.each([
    ["arrow key", "each(items, renderItem, { key: (item) => item.id });"],
    ["shorthand key", "each(items, renderItem, { key });"],
    ["identifier key", "each(items, renderItem, { key: keyFn });"],
    ["quoted key", 'each(items, renderItem, { "key": keyFn });'],
    ["key alongside others", "each(items, renderItem, { fallback: e, key: keyFn });"],
  ])("%s", (_label, code) => {
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("handles a multiline call", () => {
    const code = `each(
  items,
  (item) => div(item.name),
  {
    key: (item) => item.id,
  },
);`;
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("handles a multiline call that is missing the key", () => {
    const code = `each(
  items,
  (item) => div(item.name),
  {
    fallback: empty,
  },
);`;
    expect(rules(code, EACH)).toHaveLength(1);
  });
});

describe("each-requires-key: syntax that confused the character walker", () => {
  it("ignores a commented-out call", () => {
    expect(rules("// each(items, renderItem);", EACH)).toHaveLength(0);
    expect(rules("/* each(items, renderItem); */", EACH)).toHaveLength(0);
    expect(rules("/**\n * each(items, renderItem);\n */", EACH)).toHaveLength(0);
  });

  it("ignores a call inside a string", () => {
    expect(rules('const s = "each(items, renderItem)";', EACH)).toHaveLength(0);
    expect(rules("const s = 'each(items, renderItem)';", EACH)).toHaveLength(0);
  });

  it("ignores a call inside a template literal", () => {
    expect(rules("const s = `each(items, renderItem)`;", EACH)).toHaveLength(0);
  });

  it("still reports a real call inside a template substitution", () => {
    expect(rules("const s = `${each(items, r)}`;", EACH)).toHaveLength(1);
  });

  it("handles nested calls containing commas", () => {
    const code = "each(items, (i) => div(cls(a, b), span(c, d)), { key: (i) => i.id });";
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("handles strings containing commas and parentheses", () => {
    const code = 'each(items, (i) => div("a, b) c", i), { key: (i) => i.id });';
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("handles a regular expression argument", () => {
    const code = "each(items, (i) => i.name.replace(/a,b\\)/g, ''), { key: (i) => i.id });";
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("handles TypeScript generics", () => {
    const code = "each<Item>(items, (i) => div(i.name), { key: (i) => i.id });";
    expect(rules(code, EACH)).toHaveLength(0);
  });

  it("does not treat a member call as the each() helper", () => {
    expect(rules("obj.each(items, renderItem);", EACH)).toHaveLength(0);
  });

  it("does not treat a property named each as a call", () => {
    expect(rules("const o = { each: 1 };", EACH)).toHaveLength(0);
  });
});

describe("no-hooks-in-conditionals", () => {
  it("reports a braceless if", () => {
    expect(rules("if (condition) signal(0);", HOOKS)).toHaveLength(1);
  });

  it("reports a braced if", () => {
    expect(rules("if (condition) {\n  signal(0);\n}", HOOKS)).toHaveLength(1);
  });

  it("reports both sides of a ternary", () => {
    expect(rules("const v = condition ? signal(0) : signal(1);", HOOKS)).toHaveLength(2);
  });

  it("reports a && short-circuit", () => {
    expect(rules("condition && effect(fn);", HOOKS)).toHaveLength(1);
  });

  it("reports a || short-circuit", () => {
    expect(rules("condition || effect(fn);", HOOKS)).toHaveLength(1);
  });

  it("reports an else branch", () => {
    expect(rules("if (c) {\n  a();\n} else {\n  signal(0);\n}", HOOKS)).toHaveLength(1);
  });

  it("reports an else-if branch", () => {
    expect(rules("if (c) {\n  a();\n} else if (d) {\n  derived(fn);\n}", HOOKS)).toHaveLength(1);
  });

  it("reports nested conditional blocks exactly once each", () => {
    const code = `if (a) {
  if (b) {
    signal(0);
  }
}`;
    expect(rules(code, HOOKS)).toHaveLength(1);
  });

  it("does not report hooks at the top level of a function", () => {
    const code = `function C() {
  const [x, setX] = signal(0);
  effect(() => {});
  return x;
}`;
    expect(rules(code, HOOKS)).toHaveLength(0);
  });

  it("does not report a hook inside a function declared in a conditional", () => {
    // The hook runs when the function is called, not when the branch is taken.
    const code = `if (c) {
  const make = () => signal(0);
  use(make);
}`;
    expect(rules(code, HOOKS)).toHaveLength(0);
  });

  it("reports the hook call itself, not hooks nested in its callback", () => {
    expect(rules("if (c) { effect(() => { signal(0); }); }", HOOKS)).toHaveLength(1);
  });

  it("ignores fake hook calls in comments", () => {
    expect(rules("// if (c) signal(0);", HOOKS)).toHaveLength(0);
    expect(rules("/* if (c) { signal(0); } */", HOOKS)).toHaveLength(0);
  });

  it("ignores fake hook calls in strings and templates", () => {
    expect(rules('const s = "if (c) { signal(0); }";', HOOKS)).toHaveLength(0);
    expect(rules("const s = `if (c) { signal(0); }`;", HOOKS)).toHaveLength(0);
  });

  it("does not report a member call with a hook-like name", () => {
    expect(rules("if (c) { obj.signal(0); }", HOOKS)).toHaveLength(0);
  });

  it("does not report a property named like a hook", () => {
    expect(rules("if (c) { const o = { signal: 1 }; }", HOOKS)).toHaveLength(0);
  });
});

describe("no-direct-dom-mutation", () => {
  it("reports innerHTML assignment", () => {
    expect(rules('el.innerHTML = "x";', DOM)).toHaveLength(1);
  });

  it("reports outerHTML assignment", () => {
    expect(rules('el.outerHTML = "x";', DOM)).toHaveLength(1);
  });

  it("reports a computed innerHTML assignment", () => {
    expect(rules('el["innerHTML"] = "x";', DOM)).toHaveLength(1);
  });

  it("does not report a read of innerHTML", () => {
    expect(rules("const v = el.innerHTML;", DOM)).toHaveLength(0);
  });

  it("does not report an equality comparison", () => {
    expect(rules('if (el.innerHTML === "x") {}', DOM)).toHaveLength(0);
  });

  it("ignores an assignment inside a string", () => {
    expect(rules(`const s = "el.innerHTML = 'x'";`, DOM)).toHaveLength(0);
  });

  it("ignores an assignment inside a comment", () => {
    expect(rules("// el.innerHTML = 'x';", DOM)).toHaveLength(0);
    expect(rules("/* el.innerHTML = 'x'; */", DOM)).toHaveLength(0);
  });

  it("honours an inline sibujs-disable comment", () => {
    expect(rules('el.innerHTML = "x"; // sibujs-disable', DOM)).toHaveLength(0);
  });

  it("honours sibujs-disable-next-line", () => {
    expect(rules('// sibujs-disable-next-line\nel.innerHTML = "x";', DOM)).toHaveLength(0);
  });

  it("honours a rule-scoped disable comment", () => {
    expect(rules('// sibujs-disable-next-line no-direct-dom-mutation\nel.innerHTML = "x";', DOM)).toHaveLength(0);
  });

  it("does not let a disable comment for another rule suppress this one", () => {
    expect(rules('// sibujs-disable-next-line each-requires-key\nel.innerHTML = "x";', DOM)).toHaveLength(1);
  });
});

describe("disable comments across rules", () => {
  it("suppresses each-requires-key on the next line", () => {
    expect(rules("// sibujs-disable-next-line each-requires-key\neach(items, r, opts);", EACH)).toHaveLength(0);
  });

  it("suppresses no-hooks-in-conditionals on the next line", () => {
    expect(rules("// sibujs-disable-next-line no-hooks-in-conditionals\nif (c) signal(0);", HOOKS)).toHaveLength(0);
  });
});

describe("lint exit status", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-lint-"));
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "lint-fixture" }));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function runLint(args: string[] = []) {
    try {
      const stdout = execFileSync(process.execPath, [CLI, "lint", ...args], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output: stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  it("exits 0 when there are no violations", () => {
    fs.writeFileSync(path.join(dir, "src", "ok.ts"), "export const x = 1;\n");
    const result = runLint();
    expect(result.code).toBe(0);
    expect(result.output).toContain("No lint issues found");
  });

  it("exits nonzero when violations exist, so CI cannot pass silently", () => {
    fs.writeFileSync(path.join(dir, "src", "bad.ts"), "each(items, renderItem);\n");
    const result = runLint();
    expect(result.code).toBe(1);
    expect(result.output).toContain("each()");
  });

  it("exits 0 under --warn-only, and says warning rather than error", () => {
    fs.writeFileSync(path.join(dir, "src", "bad.ts"), "each(items, renderItem);\n");
    const result = runLint(["--warn-only"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("warning");
  });

  it("exits 0 when there is nothing to lint", () => {
    const result = runLint();
    expect(result.code).toBe(0);
  });
});
