import { describe, expect, it } from "vitest";
import { RULES } from "../src/commands/lint";

function getRule(name: string) {
  const rule = RULES.find((r) => r.name === name);
  if (!rule) throw new Error(`Rule "${name}" not found`);
  return rule;
}

describe("lint rule: no-hooks-in-conditionals", () => {
  const rule = getRule("no-hooks-in-conditionals");

  it("flags signal() inside if block", () => {
    const code = `
      function Foo() {
        if (cond) {
          const [x, setX] = signal(0);
        }
      }
    `;
    const results = rule.check(code);
    expect(results.length).toBeGreaterThan(0);
  });

  it("flags effect() inside else block", () => {
    const code = `
      function Foo() {
        if (cond) {
          doA();
        } else {
          effect(() => {});
        }
      }
    `;
    const results = rule.check(code);
    expect(results.length).toBeGreaterThan(0);
  });

  it("does not flag hooks at top level of a function", () => {
    const code = `
      function Foo() {
        const [x, setX] = signal(0);
        effect(() => {});
        return div();
      }
    `;
    const results = rule.check(code);
    expect(results.length).toBe(0);
  });

  it("does not flag hooks inside returned closures", () => {
    const code = `
      function Foo() {
        return button({ on: { click: () => {
          if (cond) doSomething();
        }}});
      }
    `;
    const results = rule.check(code);
    expect(results.length).toBe(0);
  });
});

describe("lint rule: each-requires-key", () => {
  const rule = getRule("each-requires-key");

  it("flags each() with only two arguments", () => {
    const code = `each(items, (item) => div(item().name))`;
    const results = rule.check(code);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("key");
  });

  it("accepts each() with a key option", () => {
    const code = `each(items, (item) => div(item().name), { key: (i) => i.id })`;
    const results = rule.check(code);
    expect(results.length).toBe(0);
  });

  it("accepts each() with key passed positionally inline", () => {
    const code = `each(items, (item) => span(item().text), { key: keyFn })`;
    const results = rule.check(code);
    expect(results.length).toBe(0);
  });

  it("flags multiple each() calls individually", () => {
    const code = `
      each(a, renderA);
      each(b, renderB, { key: (x) => x.id });
      each(c, renderC);
    `;
    const results = rule.check(code);
    expect(results.length).toBe(2);
  });
});

describe("RULES registry", () => {
  it("has both expected rules", () => {
    const names = RULES.map((r) => r.name);
    expect(names).toContain("no-hooks-in-conditionals");
    expect(names).toContain("each-requires-key");
  });

  it("every rule has a name and check fn", () => {
    for (const rule of RULES) {
      expect(typeof rule.name).toBe("string");
      expect(rule.name.length).toBeGreaterThan(0);
      expect(typeof rule.check).toBe("function");
    }
  });

  it("rules return empty arrays for empty content", () => {
    for (const rule of RULES) {
      expect(rule.check("")).toEqual([]);
    }
  });
});
