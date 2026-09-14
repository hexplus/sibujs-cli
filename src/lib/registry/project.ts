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

interface ViteSource {
  /** Comments and string contents blanked, quotes kept. */
  code: string;
  imports: ImportDeclaration[];
  /** Index of the exported config object's `{`, or -1. */
  open: number;
  /** Top-level properties of the exported config object; `null` without one. */
  config: ObjectLiteral | null;
}

/**
 * Only the exported object is the configuration Vite reads: another
 * `defineConfig({ … })` elsewhere in the file (an example, a shared base) is
 * not. The file must have exactly one `export default`, directly followed by
 * `defineConfig({` or `{`; a function form, an exported variable or anything
 * else leaves `open` at -1, and callers print instructions.
 */
function scanVite(source: string): ViteSource | null {
  const code = maskSource(source, { strings: true });
  if (code === null) return null;
  const exports = [...code.matchAll(/(?<![\w$.])export\s+default(?![\w$])/g)];
  let open = -1;
  if (exports.length === 1) {
    const at = exports[0].index ?? 0;
    const literal = /^export\s+default\s+(?:defineConfig\s*\(\s*)?\{/.exec(code.slice(at));
    if (literal) open = at + literal[0].length - 1;
  }
  const config = open === -1 ? null : readObject(code, source, open);
  return { code, imports: readImports(code, source), open, config };
}

/**
 * The local name `specifier` is default-imported as (`import tw from …`,
 * `import { default as tw } from …`). `undefined` when it is not imported;
 * `null` when it is imported in a form whose binding cannot be used as a
 * plugin call (side effect only, namespace, `require`).
 */
function defaultImportName(vite: ViteSource, specifier: string): string | null | undefined {
  const matches = vite.imports.filter((i) => i.specifier === specifier);
  if (matches.length === 0) return undefined;
  for (const { clause } of matches) {
    const renamed = /\bdefault\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (renamed) return renamed[1];
    const plain = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (plain && plain[1] !== "type") return plain[1];
  }
  return null;
}

/**
 * The exported config's top-level `plugins` array: its `[` index, `"absent"`
 * when there is no `plugins` key to worry about, or `null` when it cannot be
 * edited with certainty (no exported object, a spread that may hold plugins,
 * or a value that is not an array literal).
 */
function pluginsArray(vite: ViteSource): number | "absent" | null {
  if (!vite.config) return null;
  const value = vite.config.keys.get("plugins");
  if (value === undefined) return vite.config.opaque ? null : "absent";
  const literal = literalAt(vite.code, value);
  return literal?.kind === "[" ? literal.open : null;
}

/** Whether an element of the plugins array at `open` calls `name(…)`. */
function callsPlugin(vite: ViteSource, open: number, name: string): boolean {
  const call = new RegExp(`^${escapeRegExp(name)}\\s*\\(`);
  return (readArray(vite.code, open) ?? []).some((element) => call.test(vite.code.slice(element)));
}

/** Whether `name` is already used as an identifier anywhere in the code. */
const usesIdentifier = (vite: ViteSource, name: string) =>
  new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`).test(vite.code);

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
 * The Vite config with the Tailwind plugin called in the exported top-level
 * `plugins` array: `undefined` when it already is, `null` when the config is
 * not one this can edit with certainty.
 *
 * An import alone configures nothing. When `@tailwindcss/vite` is imported but
 * its binding is not called in `plugins`, the call is added using the existing
 * binding; an import whose binding cannot be called (side effect only,
 * namespace, `require`) gets instructions instead.
 */
export function withTailwindPlugin(source: string): string | null | undefined {
  const vite = scanVite(source);
  if (!vite) return null;
  const binding = defaultImportName(vite, "@tailwindcss/vite");
  if (binding === null) return null;
  const plugins = pluginsArray(vite);
  if (plugins === null) return null;
  if (binding && plugins !== "absent" && callsPlugin(vite, plugins, binding)) return undefined;
  // Adding our own import must not shadow an unrelated `tailwindcss`.
  if (!binding && usesIdentifier(vite, "tailwindcss")) return null;

  const call = `${binding ?? "tailwindcss"}()`;
  let body: string;
  if (plugins !== "absent") {
    const at = plugins + 1;
    const empty = /^\s*\]/.test(vite.code.slice(at));
    body = empty
      ? `${source.slice(0, at)}${call}${source.slice(at).replace(/^\s*/, "")}`
      : `${source.slice(0, at)}${call}, ${source.slice(at)}`;
  } else {
    body = `${source.slice(0, vite.open + 1)}\n  plugins: [${call}],${source.slice(vite.open + 1)}`;
  }
  return binding ? body : addImport(body, 'import tailwindcss from "@tailwindcss/vite";');
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
  // vite-tsconfig-paths resolves the tsconfig alias itself, but only when it is
  // actually called in the exported plugins array. Imported and unused, it
  // does nothing, and `resolve.alias` below works with or without it.
  const tsconfigPaths = defaultImportName(vite, "vite-tsconfig-paths");
  const plugins = pluginsArray(vite);
  if (tsconfigPaths && typeof plugins === "number" && callsPlugin(vite, plugins, tsconfigPaths)) return undefined;
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
