import fs from "node:fs";
import path from "node:path";
import type { ProjectConfig } from "./config.js";
import { CliError } from "./errors.js";
import type { FileRoot, RegistryFile, RegistryItem } from "./schema.js";

/**
 * Turning registry items into file writes.
 *
 * Everything here plans; nothing writes until `applyPlan`. That keeps
 * `--dry-run` honest (it runs the exact same decisions) and lets conflicts be
 * settled — by flag or by prompt — before the first byte lands on disk.
 */

export type FileStatus = "create" | "identical" | "conflict" | "kept";

export interface PlannedFile {
  item: string;
  /** Absolute target path. */
  target: string;
  /** Target relative to the project root, POSIX separators. */
  display: string;
  content: string;
  status: FileStatus;
  /** Set once a conflict is settled. */
  overwrite?: boolean;
  note?: string;
}

const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/;

/** Where a registry file lands: the first path segment picks the directory. */
export function targetPath(config: ProjectConfig, file: RegistryFile): string {
  const [head, ...rest] = file.path.split("/") as [FileRoot, ...string[]];
  let dir: string;
  if (head === "lib" && rest.join("/") === "utils.ts") {
    // `aliases.utils` may point somewhere other than `<lib>/utils`.
    const utils = path.resolve(config.root, `${config.paths.utils}.ts`);
    return checkInside(config.root, path.dirname(utils), utils, file.path);
  }
  if (head === "ui") dir = config.paths.ui;
  else if (head === "lib") dir = config.paths.lib;
  else if (head === "styles") dir = config.paths.styles;
  else throw new CliError(`Cannot place registry file "${file.path}".`);
  const base = path.resolve(config.root, dir);
  return checkInside(config.root, base, path.resolve(base, ...rest), file.path);
}

function checkInside(root: string, base: string, target: string, source: string): string {
  for (const container of [base, root]) {
    const rel = path.relative(container, target);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new CliError(`Refusing to write registry file "${source}" outside ${container}.`);
    }
  }
  return target;
}

/**
 * Rewrite the canonical registry aliases (`@/components/ui/*`, `@/lib/*`) to
 * the project's. One pass with a callback, so a replacement is never matched
 * again by another rule.
 */
export function transformContent(content: string, file: RegistryFile, config: ProjectConfig): string {
  if (!SCRIPT_FILE.test(file.path)) return content;
  return content.replace(
    /(["'])@\/(components\/ui|lib)\/([^"'\n]+)\1/g,
    (_match, quote: string, root: string, rest: string) => {
      if (root === "lib" && rest === "utils") return `${quote}${config.aliases.utils}${quote}`;
      const alias = root === "lib" ? config.aliases.lib : config.aliases.ui;
      return `${quote}${alias}/${rest}${quote}`;
    },
  );
}

const readNormalized = (file: string) => fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");

export const exportedNames = (source: string) =>
  new Set([...source.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((m) => m[1]));

export function planFiles(config: ProjectConfig, items: RegistryItem[]): PlannedFile[] {
  const planned: PlannedFile[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const file of item.files) {
      const target = targetPath(config, file);
      const key = path.normalize(target).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const content = transformContent(file.content, file, config);
      const display = path.relative(config.root, target).replaceAll("\\", "/");
      const entry: PlannedFile = { item: item.name, target, display, content, status: "create" };
      if (fs.existsSync(target)) {
        const current = readNormalized(target);
        if (current === content) {
          entry.status = "identical";
        } else if (item.name === "icons") {
          // The icons module is shared by every component and users add their
          // own icons to it. A local copy that still exports everything this
          // registry version needs is kept as is.
          const local = exportedNames(current);
          const missing = [...exportedNames(content)].filter((name) => !local.has(name));
          if (missing.length === 0) {
            entry.status = "kept";
            entry.note = "has local edits, exports every icon the components need";
          } else {
            entry.status = "conflict";
            entry.note = `missing icons: ${missing.join(", ")}`;
          }
        } else {
          entry.status = "conflict";
        }
      }
      planned.push(entry);
    }
  }
  return planned;
}

export function applyPlan(files: PlannedFile[]): void {
  for (const file of files) {
    if (file.status === "create" || (file.status === "conflict" && file.overwrite)) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      fs.writeFileSync(file.target, file.content);
    }
  }
}

export interface CssPlan {
  /** Absolute stylesheet path, when the project has one configured and present. */
  file?: string;
  display?: string;
  /** New stylesheet content, when lines need adding. */
  content?: string;
  added: string[];
  /** Lines to add by hand when no stylesheet is configured. */
  manual: string[];
}

/** `@import` lines that style and theme items need in the project stylesheet. */
export function planCss(config: ProjectConfig, items: RegistryItem[], existingContent?: string): CssPlan {
  const stylesDir = path.resolve(config.root, config.paths.styles);
  const imports = items.flatMap((item) =>
    (item.css?.imports ?? []).map((file) => {
      const abs = path.resolve(stylesDir, file);
      checkInside(config.root, stylesDir, abs, file);
      return abs;
    }),
  );
  if (imports.length === 0) return { added: [], manual: [] };

  const lines = (fromDir: string) =>
    imports.map((abs) => {
      let rel = path.relative(fromDir, abs).replaceAll("\\", "/");
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return `@import "${rel}";`;
    });

  const cssFile = config.css ? path.resolve(config.root, config.css) : undefined;
  if (!cssFile || (existingContent === undefined && !fs.existsSync(cssFile))) {
    return { added: [], manual: ['@import "tailwindcss";', ...lines(config.root)] };
  }

  let css = existingContent ?? fs.readFileSync(cssFile, "utf-8");
  const missing = lines(path.dirname(cssFile)).filter((line) => !css.includes(line));
  if (!/@import\s+(?:url\()?["']tailwindcss["']/.test(css)) missing.unshift('@import "tailwindcss";');
  const display = path.relative(config.root, cssFile).replaceAll("\\", "/");
  if (missing.length === 0) return { file: cssFile, display, added: [], manual: [] };

  const importLines = [...css.matchAll(/^@import[^\n]*$/gm)];
  if (importLines.length > 0) {
    const last = importLines[importLines.length - 1];
    const at = (last.index ?? 0) + last[0].length;
    css = `${css.slice(0, at)}\n${missing.join("\n")}${css.slice(at)}`;
  } else {
    css = `${missing.join("\n")}\n${css.length > 0 ? `\n${css}` : ""}`;
  }
  return { file: cssFile, display, content: css, added: missing, manual: [] };
}
