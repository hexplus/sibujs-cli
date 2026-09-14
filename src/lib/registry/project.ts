import fs from "node:fs";
import path from "node:path";
import { declaredDependencies } from "./dependencies.js";
import { formatJson, parseJsonc } from "./jsonc.js";
import {
  type ImportDeclaration,
  maskSource,
  type ObjectLiteral,
  readArray,
  readImports,
  readObject,
  skipSpace,
  stringAt,
} from "./source-text.js";

/**
 * Project wiring for `sibujs init`: Tailwind CSS, the stylesheet, and the
 * import alias in tsconfig and Vite.
 *
 * Config files are edited only when the edit is unambiguous — a strict-JSON
 * tsconfig, a `defineConfig({ … })` Vite config. Anything else gets exact
 * instructions instead, because silently mangling a hand-written config is
 * worse than asking for a two-line paste.
 */

export interface FileChange {
  /** Absolute path. */
  file: string;
  display: string;
  /** New full content; absent when nothing needs writing. */
  content?: string;
  created?: boolean;
  summary: string;
}

export interface SetupPlan {
  changes: FileChange[];
  /** Instructions for edits that could not be made automatically. */
  manual: string[];
  warnings: string[];
  /** npm packages the setup needs (merged with the registry's). */
  dependencies: string[];
  devDependencies: string[];
}

const display = (root: string, file: string) => path.relative(root, file).replaceAll("\\", "/");

/** Stylesheets `init` looks for, most likely first. */
export const CSS_CANDIDATES = [
  "src/app.css",
  "src/style.css",
  "src/styles.css",
  "src/index.css",
  "src/main.css",
  "src/globals.css",
  "src/styles/globals.css",
  "app/globals.css",
  "style.css",
];

export function detectCssFile(root: string): string | undefined {
  return CSS_CANDIDATES.find((file) => fs.existsSync(path.join(root, file)));
}

const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

export function findViteConfig(root: string): string | undefined {
  return VITE_CONFIGS.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
}

/** Major Tailwind CSS version declared in package.json, if any. */
export function declaredTailwindMajor(root: string): number | undefined | null {
  const range = declaredDependencies(root).get("tailwindcss");
  if (range === undefined) return undefined;
  const match = /(\d+)/.exec(range);
  return match ? Number(match[1]) : null;
}

/**
 * Insert `line` after the last top-level import, or at the top. `null` when
 * the source cannot be scanned with confidence.
 */
function addImport(source: string, line: string): string | null {
  // Strings are blanked but keep their quotes, so the pattern still sees
  // module specifiers while an `import` inside a comment or a template never
  // matches. Spans multi-line named imports; `import(` never matches.
  const code = maskSource(source, { strings: true });
  if (code === null) return null;
  const imports = [...code.matchAll(/^import[\s{*"'][\s\S]*?["'][^"'\n]*["'];?[ \t]*$/gm)];
  const last = imports.at(-1);
  if (!last) return `${line}\n${source}`;
  const at = (last.index ?? 0) + last[0].length;
  return `${source.slice(0, at)}\n${line}${source.slice(at)}`;
}

/** `defineConfig({` or `export default {`: the config object Vite reads. */
const CONFIG_OPEN = /(?:\bdefineConfig\(\s*|\bexport\s+default\s+)\{/;

interface ViteSource {
  /** Comments and string contents blanked, quotes kept. */
  code: string;
  imports: ImportDeclaration[];
  /** Index of the config object's `{`, or -1. */
  open: number;
  /** Top-level properties of the config object; `null` without one. */
  config: ObjectLiteral | null;
}

function scanVite(source: string): ViteSource | null {
  const code = maskSource(source, { strings: true });
  if (code === null) return null;
  const match = CONFIG_OPEN.exec(code);
  const open = match ? match.index + match[0].length - 1 : -1;
  const config = open === -1 ? null : readObject(code, source, open);
  return { code, imports: readImports(code, source), open, config };
}

/** An object or array literal as a property value, or `undefined` for anything else. */
function literalAt(code: string, index: number): { kind: "{" | "["; open: number } | undefined {
  const at = skipSpace(code, index);
  return code[at] === "{" || code[at] === "[" ? { kind: code[at] as "{" | "[", open: at } : undefined;
}

export function planTailwind(root: string, plan: SetupPlan): void {
  const major = declaredTailwindMajor(root);
  if (major !== undefined && major !== null && major < 4) {
    plan.warnings.push(
      `package.json declares tailwindcss ${declaredDependencies(root).get("tailwindcss")}. sibujs-ui components need Tailwind CSS 4: https://tailwindcss.com/docs/upgrade-guide`,
    );
    return;
  }
  const deps = declaredDependencies(root);
  if (major === undefined) plan.dependencies.push("tailwindcss@^4");

  const viteFile = findViteConfig(root);
  const hasPostcss = ["postcss.config.js", "postcss.config.mjs", "postcss.config.cjs"].some((f) =>
    fs.existsSync(path.join(root, f)),
  );
  if (deps.has("@tailwindcss/postcss") || hasPostcss) return;
  if (!deps.has("@tailwindcss/vite")) plan.dependencies.push("@tailwindcss/vite@^4");
  if (!viteFile) {
    plan.manual.push(
      "No vite.config found. Tailwind CSS 4 needs a build integration: https://tailwindcss.com/docs/installation",
    );
    return;
  }

  const next = withTailwindPlugin(pendingContent(plan, viteFile) ?? fs.readFileSync(viteFile, "utf-8"));
  if (next === null) {
    plan.manual.push(
      `Add the Tailwind CSS plugin to ${display(root, viteFile)}:\n    import tailwindcss from "@tailwindcss/vite";\n    plugins: [tailwindcss()]`,
    );
  } else if (next !== undefined) {
    setChange(plan, viteFile, display(root, viteFile), next, "add the @tailwindcss/vite plugin");
  }
}

/**
 * The Vite config with `tailwindcss()` in the top-level `plugins` array:
 * `undefined` when the plugin is already imported, `null` when the config is
 * not one this can edit with certainty.
 */
export function withTailwindPlugin(source: string): string | null | undefined {
  const vite = scanVite(source);
  if (!vite) return null;
  // Only a real import counts; a comment or a string naming the package does not.
  if (vite.imports.some((i) => i.specifier === "@tailwindcss/vite")) return undefined;
  if (!vite.config) return null;

  const value = vite.config.keys.get("plugins");
  // A spread or shorthand could already hold `plugins`; do not add a second one.
  if (value === undefined && vite.config.opaque) return null;
  let body: string;
  if (value !== undefined) {
    const literal = literalAt(vite.code, value);
    // `plugins: somePlugins()` or a variable: not an array literal to extend.
    if (literal?.kind !== "[") return null;
    const at = literal.open + 1;
    const empty = /^\s*\]/.test(vite.code.slice(at));
    body = empty
      ? `${source.slice(0, at)}tailwindcss()${source.slice(at).replace(/^\s*/, "")}`
      : `${source.slice(0, at)}tailwindcss(), ${source.slice(at)}`;
  } else {
    body = `${source.slice(0, vite.open + 1)}\n  plugins: [tailwindcss()],${source.slice(vite.open + 1)}`;
  }
  return addImport(body, 'import tailwindcss from "@tailwindcss/vite";');
}

/**
 * Make sure a stylesheet exists and is imported by the entry module. Returns
 * the stylesheet path relative to the root, or `null` when there is nowhere
 * sensible to put one.
 */
export function planStylesheet(root: string, requested: string | undefined, plan: SetupPlan): string | null {
  const existing = requested ?? detectCssFile(root);
  if (existing) {
    if (fs.existsSync(path.join(root, existing))) {
      const text = fs.readFileSync(path.join(root, existing), "utf-8");
      if (text.includes("sibujs-ui/themes/")) {
        plan.warnings.push(
          `${existing} imports the packaged sibujs-ui themes (sibujs-ui/themes/*.css). The copied base.css defines the same tokens; remove those imports once you use copied components only.`,
        );
      }
      return existing.replaceAll("\\", "/");
    }
  }
  const rel = existing ?? (fs.existsSync(path.join(root, "src")) ? "src/app.css" : null);
  if (!rel) return null;
  const abs = path.join(root, rel);
  setChange(plan, abs, rel, '@import "tailwindcss";\n', "create stylesheet", true);

  const entry = ["src/main.ts", "src/main.js", "src/index.ts", "src/index.js"]
    .map((f) => path.join(root, f))
    .find((f) => fs.existsSync(f));
  let specifier = path.relative(entry ? path.dirname(entry) : root, abs).replaceAll("\\", "/");
  if (!specifier.startsWith(".")) specifier = `./${specifier}`;
  if (entry) {
    const source = fs.readFileSync(entry, "utf-8");
    const noComments = maskSource(source, { strings: false });
    const imported = noComments !== null && new RegExp(`import\\s+["']${escapeRegExp(specifier)}["']`).test(noComments);
    const next = imported ? source : addImport(source, `import "${specifier}";`);
    if (next === null) {
      plan.manual.push(`Import ${rel} from your entry module: import "${specifier}";`);
    } else if (next !== source) {
      setChange(plan, entry, display(root, entry), next, `import ${rel}`);
    }
  } else {
    plan.manual.push(`Import ${rel} from your entry module: import "${specifier}";`);
  }
  return rel;
}

/**
 * Declare `<prefix>/*` → `<dir>/*` in tsconfig `paths` and in `resolve.alias`
 * of the Vite config.
 */
export function planAlias(root: string, prefix: string, dir: string, plan: SetupPlan): void {
  const target = dir === "." ? "./*" : `./${dir}/*`;
  const tsconfig = ["tsconfig.app.json", "tsconfig.json"].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!tsconfig) {
    plan.manual.push(
      `Declare the import alias in your tsconfig:\n    "compilerOptions": { "paths": { "${prefix}/*": ["${target}"] } }`,
    );
  } else {
    const text = fs.readFileSync(tsconfig, "utf-8");
    let parsed: { data: unknown } | undefined;
    try {
      parsed = parseJsonc(text);
    } catch {
      parsed = undefined;
    }
    const data = parsed?.data as { compilerOptions?: { paths?: Record<string, string[]> } } | undefined;
    if (!data?.compilerOptions?.paths?.[`${prefix}/*`]) {
      let strict = true;
      try {
        JSON.parse(text);
      } catch {
        strict = false;
      }
      if (data && strict) {
        data.compilerOptions ??= {};
        data.compilerOptions.paths = { ...data.compilerOptions.paths, [`${prefix}/*`]: [target] };
        setChange(plan, tsconfig, display(root, tsconfig), formatJson(data), `add "${prefix}/*" to paths`);
      } else {
        plan.manual.push(
          `Add the import alias to ${display(root, tsconfig)} (it has comments, so it was not edited):\n    "compilerOptions": { "paths": { "${prefix}/*": ["${target}"] } }`,
        );
      }
    }
  }

  const viteFile = findViteConfig(root);
  if (!viteFile) return;
  const dirUrl = dir === "." ? "./" : `./${dir}`;
  const snippet = `resolve: {\n    alias: { "${prefix}": fileURLToPath(new URL("${dirUrl}", import.meta.url)) },\n  },`;
  const next = withAlias(pendingContent(plan, viteFile) ?? fs.readFileSync(viteFile, "utf-8"), prefix, snippet);
  if (next === null) {
    plan.manual.push(
      `Add the import alias to ${display(root, viteFile)}:\n    import { fileURLToPath } from "node:url";\n    ${snippet}`,
    );
  } else if (next !== undefined) {
    setChange(plan, viteFile, display(root, viteFile), next, `alias "${prefix}" → ${dirUrl}`);
  }
}

/**
 * The Vite config with a top-level `resolve` holding the alias: `undefined`
 * when the alias is already declared, `null` when the config is not one this
 * can edit with certainty (including an existing `resolve` to merge into).
 */
function withAlias(source: string, prefix: string, snippet: string): string | null | undefined {
  const vite = scanVite(source);
  if (!vite) return null;
  // vite-tsconfig-paths resolves the tsconfig alias itself.
  if (vite.imports.some((i) => i.specifier === "vite-tsconfig-paths")) return undefined;
  if (!vite.config) return null;

  const resolve = vite.config.keys.get("resolve");
  if (resolve !== undefined) {
    // Already declared in the top-level `resolve.alias`? Anything else in an
    // existing `resolve` is left for the user to merge.
    return declaresAlias(vite.code, source, resolve, prefix) ? undefined : null;
  }
  if (vite.config.opaque) return null;

  const next = `${source.slice(0, vite.open + 1)}\n  ${snippet}${source.slice(vite.open + 1)}`;
  const hasFileURLToPath = vite.imports.some(
    (i) => (i.specifier === "node:url" || i.specifier === "url") && /\bfileURLToPath\b/.test(i.clause),
  );
  return hasFileURLToPath ? next : addImport(next, 'import { fileURLToPath } from "node:url";');
}

/**
 * Whether the `resolve` value at `index` is an object whose `alias` maps
 * `prefix`, as `{ "@": … }` or `[{ find: "@", … }]`.
 */
function declaresAlias(code: string, source: string, index: number, prefix: string): boolean {
  const resolve = literalAt(code, index);
  if (resolve?.kind !== "{") return false;
  const alias = readObject(code, source, resolve.open)?.keys.get("alias");
  if (alias === undefined) return false;
  const value = literalAt(code, alias);
  if (value?.kind === "{") return readObject(code, source, value.open)?.keys.has(prefix) ?? false;
  if (value?.kind !== "[") return false;
  return (readArray(code, value.open) ?? []).some((element) => {
    if (code[element] !== "{") return false;
    const find = readObject(code, source, element)?.keys.get("find");
    return find !== undefined && stringAt(code, source, find) === prefix;
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pendingContent(plan: SetupPlan, file: string): string | undefined {
  return plan.changes.find((c) => c.file === file)?.content;
}

function setChange(plan: SetupPlan, file: string, shown: string, content: string, summary: string, created = false) {
  const existing = plan.changes.find((c) => c.file === file);
  if (existing) {
    existing.content = content;
    existing.summary = `${existing.summary}; ${summary}`;
  } else {
    plan.changes.push({ file, display: shown, content, summary, created });
  }
}

export function applySetup(plan: SetupPlan): void {
  for (const change of plan.changes) {
    if (change.content === undefined) continue;
    fs.mkdirSync(path.dirname(change.file), { recursive: true });
    fs.writeFileSync(change.file, change.content);
  }
}
