import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lint, resolveLintTargets } from "../src/commands/lint";

/**
 * Target resolution for `sibujs lint [...paths]`.
 *
 * Explicit arguments used to be read as files unconditionally, so
 * `sibujs lint src tests` crashed with an uncaught EISDIR and a nonexistent
 * path with ENOENT. A directory argument is now linted recursively, exactly as
 * the no-argument `./src` scan always was.
 */

const CLEAN = "export const x = 1;\n";
const DIRTY = "if (ok) signal(0);\n";

let root: string;

function write(rel: string, content = CLEAN): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** Resolved files relative to the fixture root, with `/` separators. */
function rel(files: string[]): string[] {
  return files.map((f) => path.relative(root, f).split(path.sep).join("/"));
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-lint-")));
  write("src/main.ts");
  write("src/components/Nav.tsx");
  write("src/components/util.js");
  write("src/legacy/old.jsx");
  write("src/styles.css", "body {}\n");
  write("src/node_modules/pkg/index.ts");
  write("src/dist/bundle.js");
  write("src/components/node_modules/deep/index.ts");
  write("tests/app.test.ts");
  write("tests/fixtures/dist/out.ts");
  write("scripts/build.mjs", "export {};\n");
  write("scripts/gen.ts");
  write("README.md", "# readme\n");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("resolveLintTargets", () => {
  it("no arguments: scans ./src recursively, as before", () => {
    const { files, errors } = resolveLintTargets(undefined, root);
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual([
      "src/components/Nav.tsx",
      "src/components/util.js",
      "src/legacy/old.jsx",
      "src/main.ts",
    ]);
    expect(resolveLintTargets([], root).files).toEqual(files);
  });

  it("no arguments and no ./src: nothing to lint, no error", () => {
    fs.rmSync(path.join(root, "src"), { recursive: true });
    expect(resolveLintTargets(undefined, root)).toEqual({ files: [], errors: [] });
  });

  it("one file", () => {
    const { files, errors } = resolveLintTargets(["src/main.ts"], root);
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual(["src/main.ts"]);
  });

  it("one directory: recursive, supported extensions only", () => {
    const { files, errors } = resolveLintTargets(["src/components"], root);
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual(["src/components/Nav.tsx", "src/components/util.js"]);
  });

  it("multiple directories, in argument order", () => {
    const { files, errors } = resolveLintTargets(["tests", "src", "scripts"], root);
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual([
      "tests/app.test.ts",
      "src/components/Nav.tsx",
      "src/components/util.js",
      "src/legacy/old.jsx",
      "src/main.ts",
      "scripts/gen.ts",
    ]);
  });

  it("mixed file and directory", () => {
    const { files, errors } = resolveLintTargets(["scripts/gen.ts", "tests"], root);
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual(["scripts/gen.ts", "tests/app.test.ts"]);
  });

  it("a nonexistent path is an actionable error, not a crash", () => {
    const { files, errors } = resolveLintTargets(["src/main.ts", "nope", "src/missing.ts"], root);
    expect(rel(files)).toEqual(["src/main.ts"]);
    expect(errors).toEqual([
      expect.stringMatching(/^Path not found: nope\b/),
      expect.stringMatching(/^Path not found: src\/missing\.ts\b/),
    ]);
  });

  it("an explicit file with an unsupported extension is an actionable error", () => {
    const { files, errors } = resolveLintTargets(["README.md", "src/styles.css", "scripts/build.mjs"], root);
    expect(files).toEqual([]);
    expect(errors).toHaveLength(3);
    for (const e of errors) expect(e).toMatch(/^Unsupported file type: .+ \(expected \.ts, \.tsx, \.js or \.jsx\)$/);
  });

  it("duplicate targets are linted once, at their first position", () => {
    const { files, errors } = resolveLintTargets(
      ["src/main.ts", "src", "./src/main.ts", path.join(root, "src", "main.ts"), "src/components"],
      root,
    );
    expect(errors).toEqual([]);
    expect(rel(files)).toEqual([
      "src/main.ts",
      "src/components/Nav.tsx",
      "src/components/util.js",
      "src/legacy/old.jsx",
    ]);
  });

  it("node_modules and dist are skipped at any depth while recursing", () => {
    const { files } = resolveLintTargets(["src", "tests"], root);
    const found = rel(files);
    expect(found.some((f) => f.includes("node_modules"))).toBe(false);
    expect(found.some((f) => f.split("/").includes("dist"))).toBe(false);
  });

  it("a directory named explicitly is linted even if its name is excluded when recursing", () => {
    const { files } = resolveLintTargets(["src/dist"], root);
    expect(rel(files)).toEqual(["src/dist/bundle.js"]);
  });
});

describe("lint() with path arguments", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lints every file under a directory argument instead of crashing", () => {
    write("tests/bad.test.ts", DIRTY);
    write("scripts/bad.ts", DIRTY);
    expect(lint(["tests", "scripts"], { cwd: root })).toBe(2);
    expect(process.exitCode).toBe(1);
  });

  it("no arguments still lints ./src only", () => {
    write("tests/bad.test.ts", DIRTY);
    expect(lint(undefined, { cwd: root })).toBe(0);
    write("src/bad.ts", DIRTY);
    expect(lint(undefined, { cwd: root })).toBe(1);
  });

  it("a duplicate target reports its findings once", () => {
    write("src/bad.ts", DIRTY);
    expect(lint(["src/bad.ts", "src"], { cwd: root })).toBe(1);
  });

  it("a bad path is reported, the valid targets are still linted, and the command fails", () => {
    const errors = vi.mocked(console.error);
    write("src/bad.ts", DIRTY);
    expect(lint(["src/bad.ts", "nope"], { cwd: root, warnOnly: true })).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toMatch(/Path not found: nope/);
    // A usage error fails the command even with --warn-only.
    expect(process.exitCode).toBe(1);
  });

  it("only bad paths: nothing is linted and the command fails", () => {
    expect(lint(["nope"], { cwd: root })).toBe(0);
    expect(process.exitCode).toBe(1);
  });
});
