import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

// Module sizes in KB, minified + gzipped.
//
// Measured against the published sibujs 4.0.0 / sibujs-ui 1.5.0 packages with
// esbuild (bundle + minify, gzip -9). The entry-point rows are the MARGINAL
// cost of adding that entry on top of the root package, not its standalone
// size, because this command adds them to the per-import estimates below
// rather than replacing them — publishing standalone sizes here would count
// the shared reactivity core once per entry point.
//
// For reference, the standalone figures are roughly double the marginal ones
// (sibujs/plugins is 28.1 KB alone but 18.7 KB on top of the root), and the
// root package is 26.0 KB for `import * as`.
//
// Re-measure when the framework's dependency graph changes.
const MODULE_SIZES: Record<string, number> = {
  // Root package, whole surface.
  sibujs: 26.0,
  // Entry points: marginal cost over the root.
  "sibujs/extras": 54.8,
  "sibujs/plugins": 18.7,
  // Build tooling runs in Node and never reaches the browser bundle.
  "sibujs/build": 0,
  "sibujs/testing": 9.7,
  "sibujs/data": 5.8,
  "sibujs/browser": 5.7,
  "sibujs/patterns": 3.6,
  "sibujs/motion": 1.8,
  "sibujs/ui": 8.7,
  "sibujs/widgets": 6.4,
  "sibujs/ssr": 10.5,
  "sibujs/devtools": 6.6,
  "sibujs/performance": 3.4,
  "sibujs/ecosystem": 1.8,
  // sibujs-ui, marginal over the root. Tree-shakes hard: a single component
  // such as { Button } costs about 20 KB of this once its primitives land.
  "sibujs-ui": 126.5,
  // Individual named imports (tree-shaken sizes)
  signal: 0.3,
  effect: 0.2,
  derived: 0.3,
  watch: 0.2,
  mount: 0.8,
  each: 0.5,
  ref: 0.2,
  store: 0.4,
  array: 0.3,
  memo: 0.2,
  memoFn: 0.2,
  batch: 0.1,
  context: 0.3,
  ErrorBoundary: 0.4,
  getSlot: 0.1,
  lazy: 0.3,
  Suspense: 0.3,
  deepSignal: 0.3,
  writable: 0.2,
  KeepAlive: 0.3,
  html: 0.6,
  // Tag factories are nearly free (shared factory function)
  div: 0.05,
  span: 0.05,
  button: 0.05,
  input: 0.05,
  p: 0.05,
  h1: 0.05,
  h2: 0.05,
  h3: 0.05,
  a: 0.05,
  ul: 0.05,
  li: 0.05,
  nav: 0.05,
  section: 0.05,
  header: 0.05,
  footer: 0.05,
  form: 0.05,
  label: 0.05,
  textarea: 0.05,
  select: 0.05,
  option: 0.05,
  // Plugins
  router: 1.2,
  i18n: 0.8,
};

// Tag factory names share a single factory function, so the actual
// tree-shaken cost is the factory (~0.3 KB) + ~0 per additional tag.
// The reactivity core plus the rendering path (tag factories + mount) that any
// SibuJS app pulls in on its first import. Measured at 25.9 KB min+gzip on
// sibujs 4.0.0; the per-import rows below are marginal costs ON TOP of this,
// which is why they are small. Without this base the total came out ~10x under
// what a real bundle weighs.
const BASE_RUNTIME_SIZE = 25.9;

// Marginal cost of one named import from a sub-entry (sibujs/plugins, …) or
// from sibujs-ui. Calibrated against four scaffolded apps built with Vite 8:
//
//   scaffold   non-root named imports   real js gzip   this model   delta
//   plain                           0        26.9 KB      25.9 KB   -1.0
//   router                          5        33.1 KB      32.7 KB   -0.4
//   ui                              8        37.9 KB      36.7 KB   -1.2
//   full                           13        43.3 KB      40.8 KB   -2.5
//
// It runs slightly under across all four, and it is a heuristic rather than a
// bundler: a single import that drags in a large subsystem is understated, and
// names shared between two sub-entries are counted once. Treat it as a floor.
const PER_FEATURE_SIZE = 1.35;
const TAG_NAMES = new Set([
  "div",
  "span",
  "button",
  "input",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "ul",
  "li",
  "ol",
  "nav",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "form",
  "label",
  "textarea",
  "select",
  "option",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "img",
  "video",
  "audio",
  "canvas",
  "svg",
  "code",
  "pre",
  "strong",
  "em",
  "br",
  "hr",
]);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      results.push(...collectFiles(fullPath));
    } else if (/\.[tj]sx?$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function analyze() {
  const srcDir = path.resolve("src");
  const files = collectFiles(srcDir);

  if (files.length === 0) {
    console.log(pc.yellow("No source files found in src/."));
    return;
  }

  // Track named imports and module imports separately to avoid double-counting
  const namedImports = new Map<string, number>();
  const moduleImports = new Set<string>();
  // Modules pulled in wholesale via `import * as X` / `import X`. Only these
  // defeat tree-shaking, so only these are charged the whole entry-point cost.
  const wholeModuleImports = new Set<string>();
  // Named imports that came from a sub-entry or from sibujs-ui, i.e. the ones
  // that are NOT already inside the base runtime.
  const nonRootNamedImports = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    // Match named imports: import { x, y } from "sibujs" or "sibujs/extras" or "sibujs-ui"
    // Exclude type-only imports (import type { X }) which don't affect bundle size
    const namedRegex = /import\s+\{([^}]+)\}\s+from\s+["'](sibujs(?:\/[^"']+)?|sibujs-ui)["']/g;
    let match: RegExpExecArray | null;
    while ((match = namedRegex.exec(content)) !== null) {
      // Skip type-only imports: "import type { X }"
      const fullMatch = content.slice(Math.max(0, match.index - 10), match.index + match[0].length);
      if (/import\s+type\s+\{/.test(fullMatch)) continue;

      const modulePath = match[2];
      moduleImports.add(modulePath);
      const names = match[1].split(",").map((s) => {
        const trimmed = s.trim();
        // Skip inline type imports: "type Foo" in "import { type Foo, bar }"
        if (trimmed.startsWith("type ")) return "";
        return trimmed.split(/\s+as\s+/)[0].trim();
      });
      for (const name of names) {
        if (!name) continue;
        namedImports.set(name, (namedImports.get(name) ?? 0) + 1);
        if (modulePath !== "sibujs") nonRootNamedImports.add(name);
      }
    }

    // Match default/namespace imports: import X from "sibujs/extras"
    // Exclude: import type X from "sibujs"
    const defaultRegex = /import\s+(?:\w+|\*\s+as\s+\w+)\s+from\s+["'](sibujs(?:\/[^"']+)?|sibujs-ui)["']/g;
    while ((match = defaultRegex.exec(content)) !== null) {
      const fullMatch = content.slice(Math.max(0, match.index - 10), match.index + match[0].length);
      if (/import\s+type\s+/.test(fullMatch)) continue;
      moduleImports.add(match[1]);
      wholeModuleImports.add(match[1]);
    }
  }

  if (namedImports.size === 0 && moduleImports.size === 0) {
    console.log(pc.yellow("No sibujs imports found."));
    return;
  }

  console.log(`\n${pc.bold("SibuJS Import Analysis")}\n`);

  // Calculate estimated tree-shaken size
  let totalSize = 0;

  // Every SibuJS app pays the core + rendering base exactly once.
  totalSize += BASE_RUNTIME_SIZE;

  // Named imports from anything other than the root package cost extra on top
  // of that base; root-package names are already inside it. Charged per row
  // below so the printed rows and the total cannot drift apart.
  const hasTagImports = [...namedImports.keys()].some((n) => TAG_NAMES.has(n));

  // Show named imports sorted by usage
  const sorted = [...namedImports.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`${pc.dim("Import")}${" ".repeat(24)}${pc.dim("Uses")}  ${pc.dim("Est. Size")}\n`);

  console.log(
    `  ${"core + rendering (base)".padEnd(30)} ${pc.dim(" —")}  ${pc.green("█".repeat(12))} ${pc.dim(`${BASE_RUNTIME_SIZE.toFixed(1)} KB`)}`,
  );

  for (const [name, count] of sorted) {
    // Skip individual tag sizes — they're counted as the shared factory
    if (TAG_NAMES.has(name)) continue;

    // Root-package names live inside the base above; only names from a
    // sub-entry or sibujs-ui add bytes on top of it.
    const isExtra = nonRootNamedImports.has(name);
    const size = isExtra ? PER_FEATURE_SIZE : 0;
    totalSize += size;
    const paddedName = name.padEnd(30);
    const paddedCount = String(count).padStart(4);
    const sizeStr = isExtra ? `${size.toFixed(2)} KB` : pc.dim("in base");
    const bar = pc.green("█".repeat(Math.max(1, Math.ceil(size * 3))));
    console.log(`  ${paddedName} ${paddedCount}  ${isExtra ? bar : " "} ${pc.dim(sizeStr)}`);
  }

  // Add tag factory base cost if any tags are used
  if (hasTagImports) {
    const tagNames = [...namedImports.keys()].filter((n) => TAG_NAMES.has(n));
    const tagCount = tagNames.reduce((sum, n) => sum + (namedImports.get(n) ?? 0), 0);
    const paddedName = `tag factories (${tagNames.length} tags)`.padEnd(30);
    const paddedCount = String(tagCount).padStart(4);
    console.log(`  ${paddedName} ${paddedCount}   ${pc.dim("in base")}`);
  }

  // Add sub-package cost ONLY for modules imported wholesale (`import * as X`),
  // which is the case that genuinely defeats tree-shaking. A module reached
  // through named imports is already accounted for above, one name at a time —
  // charging its whole entry-point size on top would count the same bytes
  // twice, and for a big tree-shakeable package like sibujs-ui that overstates
  // a real bundle several times over.
  for (const mod of wholeModuleImports) {
    if (mod !== "sibujs" && MODULE_SIZES[mod]) {
      totalSize += MODULE_SIZES[mod];
      const paddedName = mod.padEnd(30);
      const sizeStr = `${MODULE_SIZES[mod].toFixed(1)} KB`;
      const bar = pc.green("█".repeat(Math.ceil(MODULE_SIZES[mod] * 3)));
      console.log(`  ${paddedName} ${pc.dim("pkg")}   ${bar} ${pc.dim(sizeStr)}`);
    }
  }

  console.log(`\n${pc.dim("─".repeat(50))}`);
  console.log(
    `  ${pc.bold("Estimated SibuJS footprint:")} ${pc.cyan(`~${totalSize.toFixed(1)} KB`)} ${pc.dim("(min+gzip, tree-shaken)")}`,
  );
  console.log(
    `  ${pc.dim(`Scanned ${files.length} file${files.length > 1 ? "s" : ""}, found ${namedImports.size} unique imports from ${moduleImports.size} module${moduleImports.size > 1 ? "s" : ""}`)}\n`,
  );
}
