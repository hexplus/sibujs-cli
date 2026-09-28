import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lint } from "../src/commands/lint";
import { loadTypeScript, resetTypeScriptCache } from "../src/lib/ts-loader";

/**
 * TypeScript resolution is per project root.
 *
 * `lint(files, { cwd })` resolved its targets against `cwd` but loaded the
 * compiler against `process.cwd()`, and the loader cached the first compiler it
 * found for the rest of the process — so a second project in the same process
 * silently parsed with the first project's TypeScript.
 *
 * Each fixture project here ships its own `typescript` package: a thin wrapper
 * over the real compiler that records which project's copy parsed a file. The
 * CLI's own installation is never what these tests observe.
 */

const REAL_TS = createRequire(import.meta.url).resolve("typescript");
const USED_KEY = "__sibujsLintFixtureTs";

type UsageLog = string[];
const usage = (): UsageLog => ((globalThis as Record<string, unknown>)[USED_KEY] ??= []) as UsageLog;

let roots: string[] = [];

/** A project whose own `node_modules/typescript` tags every parse with `label`. */
function fixtureProject(label: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `sibujs-ts-${label}-`)));
  roots.push(root);
  const tsDir = path.join(root, "node_modules", "typescript");
  fs.mkdirSync(tsDir, { recursive: true });
  fs.writeFileSync(path.join(tsDir, "package.json"), JSON.stringify({ name: "typescript", main: "index.js" }));
  fs.writeFileSync(
    path.join(tsDir, "index.js"),
    [
      `const real = require(${JSON.stringify(REAL_TS)});`,
      `const log = (globalThis[${JSON.stringify(USED_KEY)}] ??= []);`,
      "module.exports = {",
      "  ...real,",
      `  __fixture: ${JSON.stringify(label)},`,
      "  createSourceFile(...args) {",
      `    log.push(${JSON.stringify(label)});`,
      "    return real.createSourceFile(...args);",
      "  },",
      "};",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: `fixture-${label}` }));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "main.ts"), "export const x = 1;\n");
  return root;
}

beforeEach(() => {
  resetTypeScriptCache();
  usage().length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  resetTypeScriptCache();
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots = [];
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("loadTypeScript", () => {
  it("resolves each project root to that project's own compiler", () => {
    const a = fixtureProject("a");
    const b = fixtureProject("b");
    expect((loadTypeScript(a) as unknown as { __fixture: string }).__fixture).toBe("a");
    // The first project's compiler must not be handed to the second.
    expect((loadTypeScript(b) as unknown as { __fixture: string }).__fixture).toBe("b");
    expect((loadTypeScript(a) as unknown as { __fixture: string }).__fixture).toBe("a");
  });

  it("returns the same compiler for the same root, however it is spelled", () => {
    const a = fixtureProject("a");
    const first = loadTypeScript(a);
    expect(loadTypeScript(path.join(a, "src", ".."))).toBe(first);
    expect(loadTypeScript(`${a}${path.sep}`)).toBe(first);
  });

  it("resolves from a nested directory to the enclosing project's compiler", () => {
    const a = fixtureProject("a");
    expect((loadTypeScript(path.join(a, "src")) as unknown as { __fixture: string }).__fixture).toBe("a");
  });

  it("falls back to the CLI's own compiler when the project has none", () => {
    const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-ts-bare-")));
    roots.push(bare);
    const ts = loadTypeScript(bare) as unknown as { __fixture?: string; createSourceFile?: unknown };
    expect(ts).not.toBeNull();
    expect(ts.__fixture).toBeUndefined();
    expect(typeof ts.createSourceFile).toBe("function");
  });
});

describe("lint(files, { cwd }) parses with the cwd project's compiler", () => {
  it("uses the compiler of the project named by cwd, not process.cwd()", () => {
    const a = fixtureProject("a");
    expect(lint(["src"], { cwd: a })).toBe(0);
    expect(usage()).toEqual(["a"]);
  });

  it("two projects linted in one process each use their own compiler", () => {
    const a = fixtureProject("a");
    const b = fixtureProject("b");
    lint(undefined, { cwd: a });
    lint(undefined, { cwd: b });
    lint(["src/main.ts"], { cwd: a });
    expect(usage()).toEqual(["a", "b", "a"]);
  });
});
