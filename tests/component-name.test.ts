import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDirectChild, normalizeComponentName } from "../src/lib/component-name";

/**
 * Regression tests for the component-generation path-traversal defect.
 *
 * The end-to-end cases run the built CLI in a throwaway directory and assert
 * that a rejected name leaves the filesystem untouched — inside *and* outside
 * the project.
 */

const CLI = path.resolve(__dirname, "..", "dist", "index.js");

describe("normalizeComponentName: accepted forms", () => {
  it.each([
    ["button", "Button"],
    ["my-card", "MyCard"],
    ["user_profile", "UserProfile"],
    ["already-PascalCase", "AlreadyPascalCase"],
    ["Button", "Button"],
    ["a", "A"],
    ["item2", "Item2"],
    ["my-long-component-name", "MyLongComponentName"],
    ["mixed-case_separators", "MixedCaseSeparators"],
  ])("%s -> %s", (input, expected) => {
    const result = normalizeComponentName(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe(expected);
  });

  it("accepts a reserved word because normalization capitalizes it into a legal identifier", () => {
    // `class` is reserved, `Class` is not, and `export function Class()` parses.
    const result = normalizeComponentName("class");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Class");
  });
});

describe("normalizeComponentName: rejected forms", () => {
  const REJECTED: Array<[string, string]> = [
    ["../../../Outside", "traversal"],
    ["../Outside", "traversal"],
    ["./Outside", "traversal"],
    ["..", "traversal"],
    [".", "traversal"],
    ["/absolute/path", "absolute"],
    ["C:\\outside", "drive"],
    ["C:outside", "drive"],
    ["\\\\server\\share", "unc"],
    ["x/y", "separator"],
    ["x\\y", "separator"],
    ["my button", "whitespace"],
    ["\tbutton", "whitespace"],
    ["button\n", "whitespace"],
    ["123-widget", "leading digit"],
    ["1", "leading digit"],
    ["component.name", "dot"],
    ['component"', "quote"],
    ["component`", "backtick"],
    ["component'", "quote"],
    ["component${x}", "template"],
    ["", "empty"],
    ["-", "punctuation"],
    ["_", "punctuation"],
    ["--", "punctuation"],
    ["my--card--", "trailing separator"],
    ["comp;onent", "punctuation"],
    ["comp(onent)", "punctuation"],
    ["comp*", "punctuation"],
    ["café", "non-ascii"],
  ];

  it.each(REJECTED)("rejects %j (%s)", (input) => {
    const result = normalizeComponentName(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("rejects NUL and control characters", () => {
    for (const raw of ["comp\u0000onent", "comp\u0007onent", "comp\u001bonent", "comp\u007fonent"]) {
      const result = normalizeComponentName(raw);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects non-string input", () => {
    expect(normalizeComponentName(undefined).ok).toBe(false);
    expect(normalizeComponentName(null).ok).toBe(false);
    expect(normalizeComponentName(42).ok).toBe(false);
  });
});

describe("isDirectChild containment", () => {
  it("accepts a direct child", () => {
    expect(isDirectChild("/a/b", "/a/b/C.ts")).toBe(true);
  });

  it("rejects the directory itself", () => {
    expect(isDirectChild("/a/b", "/a/b")).toBe(false);
  });

  it("rejects a nested grandchild", () => {
    expect(isDirectChild("/a/b", "/a/b/c/D.ts")).toBe(false);
  });

  it("rejects traversal above the directory", () => {
    expect(isDirectChild("/a/b", "/a/C.ts")).toBe(false);
    expect(isDirectChild("/a/b", "/C.ts")).toBe(false);
  });

  it("rejects a sibling whose name shares a prefix", () => {
    // A naive startsWith check would wrongly accept this.
    expect(isDirectChild("/a/b", "/a/bb/C.ts")).toBe(false);
  });

  if (process.platform === "win32") {
    it("rejects a path on a different Windows drive", () => {
      expect(isDirectChild("C:\\a\\b", "D:\\a\\b\\C.ts")).toBe(false);
    });

    it("accepts a Windows direct child", () => {
      expect(isDirectChild("C:\\a\\b", "C:\\a\\b\\C.ts")).toBe(true);
    });
  }
});

describe("generate component: end to end", () => {
  let root: string;
  let project: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-gen-"));
    project = path.join(root, "project");
    fs.mkdirSync(path.join(project, "src"), { recursive: true });
    // A canary above the project: nothing may ever write here.
    fs.writeFileSync(path.join(root, "canary.txt"), "untouched");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function runGenerate(name: string, cwd = project) {
    try {
      const stdout = execFileSync(process.execPath, [CLI, "generate", "component", name], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  function snapshot(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else out.push(path.relative(dir, p).replace(/\\/g, "/"));
      }
    };
    walk(dir);
    return out.sort();
  }

  it("creates a component for a valid name", () => {
    const result = runGenerate("my-card");
    expect(result.code).toBe(0);
    const file = path.join(project, "src", "MyCard.ts");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toContain("export function MyCard()");
  });

  it("writes into src/components when it exists", () => {
    fs.mkdirSync(path.join(project, "src", "components"));
    const result = runGenerate("button");
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(project, "src", "components", "Button.ts"))).toBe(true);
    expect(fs.existsSync(path.join(project, "src", "Button.ts"))).toBe(false);
  });

  it("falls back to src when components/ is absent", () => {
    const result = runGenerate("button");
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(project, "src", "Button.ts"))).toBe(true);
  });

  it("still refuses to overwrite an existing component", () => {
    expect(runGenerate("button").code).toBe(0);
    const before = fs.readFileSync(path.join(project, "src", "Button.ts"), "utf-8");
    fs.writeFileSync(path.join(project, "src", "Button.ts"), "// hand-edited\n");
    const second = runGenerate("button");
    expect(second.code).toBe(1);
    expect(second.stdout).toContain("already exists");
    expect(fs.readFileSync(path.join(project, "src", "Button.ts"), "utf-8")).toBe("// hand-edited\n");
    expect(before).toContain("export function Button()");
  });

  const MALICIOUS = [
    "../../../Outside",
    "../Outside",
    "./Outside",
    "/absolute/path",
    "C:\\outside",
    "x/y",
    "x\\y",
    "my button",
    "123-widget",
    "component.name",
    'component"',
    "component`",
    "..",
    "comp\u0000onent",
  ];

  it.each(MALICIOUS)("rejects %j without touching the filesystem", (name) => {
    const before = snapshot(root);
    const result = runGenerate(name);

    expect(result.code).not.toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(fs.readFileSync(path.join(root, "canary.txt"), "utf-8")).toBe("untouched");
  });

  it("rejects an empty name", () => {
    const before = snapshot(root);
    const result = runGenerate("");
    expect(result.code).not.toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("does not create src/components as a side effect of a rejected name", () => {
    expect(fs.existsSync(path.join(project, "src", "components"))).toBe(false);
    runGenerate("../Escape");
    expect(fs.existsSync(path.join(project, "src", "components"))).toBe(false);
  });

  it("emits TypeScript that parses without errors", () => {
    for (const name of ["button", "my-card", "user_profile", "class", "item2"]) {
      const result = runGenerate(name);
      expect(result.code).toBe(0);
    }
    for (const file of fs.readdirSync(path.join(project, "src"))) {
      const full = path.join(project, "src", file);
      const text = fs.readFileSync(full, "utf-8");
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const diagnostics = (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics;
      expect(diagnostics).toHaveLength(0);
    }
  });
});
