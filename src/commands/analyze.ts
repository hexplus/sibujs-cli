import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

// Estimated module sizes in KB (approximate minified + gzipped)
const MODULE_SIZES: Record<string, number> = {
  // Core packages (full bundle)
  sibujs: 4.2,
  "sibujs/extras": 6.8,
  "sibujs/plugins": 3.5,
  "sibujs/build": 2.1,
  "sibujs/testing": 1.8,
  "sibujs/data": 2.5,
  "sibujs/browser": 1.5,
  "sibujs/patterns": 2.0,
  "sibujs/motion": 1.8,
  "sibujs/ui": 1.5,
  "sibujs/widgets": 2.0,
  "sibujs/ssr": 1.5,
  "sibujs/devtools": 1.0,
  "sibujs/performance": 1.2,
  "sibujs/ecosystem": 1.0,
  // sibujs-ui
  "sibujs-ui": 8.0,
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
const TAG_FACTORY_BASE_SIZE = 0.3;
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
        if (name) namedImports.set(name, (namedImports.get(name) ?? 0) + 1);
      }
    }

    // Match default/namespace imports: import X from "sibujs/extras"
    // Exclude: import type X from "sibujs"
    const defaultRegex = /import\s+(?:\w+|\*\s+as\s+\w+)\s+from\s+["'](sibujs(?:\/[^"']+)?|sibujs-ui)["']/g;
    while ((match = defaultRegex.exec(content)) !== null) {
      const fullMatch = content.slice(Math.max(0, match.index - 10), match.index + match[0].length);
      if (/import\s+type\s+/.test(fullMatch)) continue;
      moduleImports.add(match[1]);
    }
  }

  if (namedImports.size === 0 && moduleImports.size === 0) {
    console.log(pc.yellow("No sibujs imports found."));
    return;
  }

  console.log(`\n${pc.bold("SibuJS Import Analysis")}\n`);

  // Calculate estimated tree-shaken size
  let totalSize = 0;
  const hasTagImports = [...namedImports.keys()].some((n) => TAG_NAMES.has(n));

  // Show named imports sorted by usage
  const sorted = [...namedImports.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`${pc.dim("Import")}${" ".repeat(24)}${pc.dim("Uses")}  ${pc.dim("Est. Size")}\n`);

  for (const [name, count] of sorted) {
    // Skip individual tag sizes — they're counted as the shared factory
    if (TAG_NAMES.has(name)) continue;

    const size = MODULE_SIZES[name] ?? 0.1;
    totalSize += size;
    const paddedName = name.padEnd(30);
    const paddedCount = String(count).padStart(4);
    const sizeStr = size >= 1 ? `${size.toFixed(1)} KB` : `${(size * 1024).toFixed(0)} B`;
    const bar = pc.green("█".repeat(Math.max(1, Math.ceil(size * 3))));
    console.log(`  ${paddedName} ${paddedCount}  ${bar} ${pc.dim(sizeStr)}`);
  }

  // Add tag factory base cost if any tags are used
  if (hasTagImports) {
    const tagNames = [...namedImports.keys()].filter((n) => TAG_NAMES.has(n));
    const tagCount = tagNames.reduce((sum, n) => sum + (namedImports.get(n) ?? 0), 0);
    totalSize += TAG_FACTORY_BASE_SIZE;
    const paddedName = `tag factories (${tagNames.length} tags)`.padEnd(30);
    const paddedCount = String(tagCount).padStart(4);
    const bar = pc.green("█");
    console.log(`  ${paddedName} ${paddedCount}  ${bar} ${pc.dim(`${(TAG_FACTORY_BASE_SIZE * 1024).toFixed(0)} B`)}`);
  }

  // Add sub-package imports (sibujs/extras, etc.) that aren't covered by named imports
  for (const mod of moduleImports) {
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
