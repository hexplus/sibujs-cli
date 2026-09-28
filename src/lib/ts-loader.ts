import { createRequire } from "node:module";
import path from "node:path";
import pc from "picocolors";
import type * as TS from "typescript";

/**
 * Locate a TypeScript compiler to parse with.
 *
 * The linter needs a real parser: the previous character-walking implementation
 * could not tell code from comments, strings or template literals, which
 * produced both false positives and false negatives.
 *
 * TypeScript is resolved at runtime rather than bundled, so `dependencies`
 * stays at three small packages. It is looked for in the project being linted
 * first (every project scaffolded by `sibujs create` has it, and any TypeScript
 * project does), then next to this CLI. Declared as an optional peer so npm
 * surfaces the requirement.
 *
 * Resolution is per project root, so one process can lint several projects —
 * `lint(files, { cwd })` is reusable programmatically — and each is parsed with
 * its own compiler. Results are cached by the resolved root; Node's own module
 * cache, keyed by the compiler's real path, makes two roots that resolve to one
 * installation share one instance.
 */
const cache = new Map<string, typeof TS | null>();
// The CLI's own installation, looked up once.
let selfCompiler: typeof TS | null | undefined;

function loadOwnTypeScript(): typeof TS | null {
  if (selfCompiler !== undefined) return selfCompiler;
  try {
    selfCompiler = createRequire(import.meta.url)("typescript") as typeof TS;
  } catch {
    selfCompiler = null;
  }
  return selfCompiler;
}

export function loadTypeScript(cwd: string = process.cwd()): typeof TS | null {
  const root = path.resolve(cwd);
  const hit = cache.get(root);
  if (hit !== undefined) return hit;

  let compiler: typeof TS | null;
  try {
    // The project being linted takes precedence, so the parser matches the
    // TypeScript the project itself compiles with.
    compiler = createRequire(path.join(root, "package.json"))("typescript") as typeof TS;
  } catch {
    // Then this CLI's own installation.
    compiler = loadOwnTypeScript();
  }
  cache.set(root, compiler);
  return compiler;
}

/** Reset the module cache. Test seam only. */
export function resetTypeScriptCache(): void {
  cache.clear();
  selfCompiler = undefined;
}

export function typeScriptMissingMessage(): string {
  return [
    `${pc.red("✖")} ${pc.bold("sibujs lint")} needs the TypeScript compiler to parse your source.`,
    "",
    "  Install it in this project:",
    `    ${pc.cyan("npm install --save-dev typescript")}`,
    "",
    `  ${pc.dim("The linter parses real syntax rather than matching text, so it can tell")}`,
    `  ${pc.dim("code apart from comments, strings and template literals.")}`,
  ].join("\n");
}
