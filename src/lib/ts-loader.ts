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
 */
let cached: typeof TS | null | undefined;

export function loadTypeScript(cwd: string = process.cwd()): typeof TS | null {
  if (cached !== undefined) return cached;

  // The project being linted takes precedence, so the parser matches the
  // TypeScript the project itself compiles with.
  try {
    const projectRequire = createRequire(path.join(path.resolve(cwd), "package.json"));
    cached = projectRequire("typescript") as typeof TS;
    return cached;
  } catch {
    // Fall through.
  }

  // Then this CLI's own installation.
  try {
    const selfRequire = createRequire(import.meta.url);
    cached = selfRequire("typescript") as typeof TS;
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

/** Reset the module cache. Test seam only. */
export function resetTypeScriptCache(): void {
  cached = undefined;
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
