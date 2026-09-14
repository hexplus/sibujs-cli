import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";
import { parseJsonc } from "./jsonc.js";

/**
 * `components.json` — where copied components go and how they import each
 * other.
 *
 * Only `aliases` matters for a minimal file; everything else has a default.
 * Directories are derived from the aliases through the tsconfig `paths` the
 * aliases must be declared in anyway, and `paths` overrides that when a
 * project lays things out differently.
 *
 * The file `sibujs init` writes is also valid input for the `sibujs-ui` CLI
 * (`npx sibujs-ui diff` reads the same `paths` and `aliases.ui`/`aliases.lib`).
 */

export const CONFIG_FILE = "components.json";
export const CONFIG_SCHEMA_URL = "https://unpkg.com/sibujs-cli/schema/components.json";

/** Canonical import specifiers used inside registry files. */
export const CANONICAL_ALIASES = { ui: "@/components/ui", lib: "@/lib" } as const;

/** The file as written on disk. */
export interface ComponentsJson {
  $schema?: string;
  /** `default`, or a sibujs-ui theme color (`blue`, `violet`, …). */
  style?: string;
  tailwind?: {
    /** Tailwind CSS major version. sibujs-ui requires 4. */
    version?: number;
    /** Stylesheet that imports Tailwind; `null` prints the `@import` lines instead. */
    css?: string | null;
  };
  /** Accepted for compatibility with the sibujs-ui CLI; `tailwind.css` wins. */
  css?: string | null;
  registry?: string;
  aliases?: {
    components?: string;
    ui?: string;
    utils?: string;
    lib?: string;
  };
  paths?: {
    ui?: string;
    lib?: string;
    styles?: string;
  };
}

/** Fully resolved configuration, every path relative to `root` in POSIX form. */
export interface ProjectConfig {
  root: string;
  file: string;
  style: string;
  css: string | null;
  registry?: string;
  aliases: { components: string; ui: string; utils: string; lib: string };
  paths: {
    ui: string;
    lib: string;
    styles: string;
    /** The `cn()` module, without extension. */
    utils: string;
  };
}

const STYLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function configPath(root: string): string {
  return path.join(root, CONFIG_FILE);
}

/** The raw file, or `null` when the project has none. */
export function readConfigFile(root: string): ComponentsJson | null {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    throw new CliError(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`, `Fix or delete ${file}.`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new CliError(`${CONFIG_FILE} must contain a JSON object.`);
  }
  return data as ComponentsJson;
}

export function writeConfigFile(root: string, config: ComponentsJson): void {
  fs.writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`);
}

/** Load and resolve the project's components.json; `null` when it has none. */
export function loadConfig(root: string): ProjectConfig | null {
  const raw = readConfigFile(root);
  return raw ? resolveConfig(root, raw) : null;
}

/** Directory the alias root (`@/`) conventionally points at. */
export function sourceBase(root: string): string {
  return fs.existsSync(path.join(root, "src")) ? "src" : ".";
}

/** The defaults `sibujs init` writes. */
export function createDefaultConfig(
  root: string,
  options: { style?: string; css?: string | null; registry?: string } = {},
): ComponentsJson {
  const base = sourceBase(root);
  const join = (p: string) => (base === "." ? p : `${base}/${p}`);
  const config: ComponentsJson = {
    $schema: CONFIG_SCHEMA_URL,
    style: options.style ?? "default",
    tailwind: { version: 4, css: options.css ?? null },
    aliases: {
      components: "@/components",
      ui: CANONICAL_ALIASES.ui,
      utils: "@/lib/utils",
      lib: CANONICAL_ALIASES.lib,
    },
    paths: {
      ui: join("components/ui"),
      lib: join("lib"),
      styles: join("styles/sibujs-ui"),
    },
  };
  if (options.registry) config.registry = options.registry;
  return config;
}

function field(raw: Record<string, unknown> | undefined, key: string, where: string): string | undefined {
  const value = raw?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliError(`${CONFIG_FILE}: "${where}.${key}" must be a non-empty string.`);
  }
  return value.replace(/\/+$/, "");
}

export function resolveConfig(root: string, raw: ComponentsJson): ProjectConfig {
  const style = raw.style ?? "default";
  if (typeof style !== "string" || !STYLE_NAME.test(style)) {
    throw new CliError(`${CONFIG_FILE}: "style" must be "default" or a theme name such as "blue".`);
  }
  if (raw.tailwind !== undefined && (typeof raw.tailwind !== "object" || raw.tailwind === null)) {
    throw new CliError(`${CONFIG_FILE}: "tailwind" must be an object.`);
  }
  if (raw.tailwind?.version !== undefined && raw.tailwind.version !== 4) {
    throw new CliError(
      `${CONFIG_FILE}: "tailwind.version" is ${JSON.stringify(raw.tailwind.version)}, but sibujs-ui components require Tailwind CSS 4.`,
    );
  }
  const css = raw.tailwind && "css" in raw.tailwind ? raw.tailwind.css : raw.css;
  if (css !== undefined && css !== null && typeof css !== "string") {
    throw new CliError(`${CONFIG_FILE}: "tailwind.css" must be a file path or null.`);
  }
  if (raw.registry !== undefined && typeof raw.registry !== "string") {
    throw new CliError(`${CONFIG_FILE}: "registry" must be a directory or URL string.`);
  }

  const rawAliases = raw.aliases as Record<string, unknown> | undefined;
  const rawPaths = raw.paths as Record<string, unknown> | undefined;
  for (const [name, value] of [
    ["aliases", rawAliases],
    ["paths", rawPaths],
  ] as const) {
    if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
      throw new CliError(`${CONFIG_FILE}: "${name}" must be an object.`);
    }
  }

  const uiAlias = field(rawAliases, "ui", "aliases");
  const libAlias = field(rawAliases, "lib", "aliases");
  const components =
    field(rawAliases, "components", "aliases") ??
    (uiAlias?.includes("/") ? path.posix.dirname(uiAlias) : (uiAlias ?? "@/components"));
  const ui = uiAlias ?? `${components}/ui`;
  const utils = field(rawAliases, "utils", "aliases") ?? `${libAlias ?? "@/lib"}/utils`;
  const lib = libAlias ?? (utils.includes("/") ? path.posix.dirname(utils) : utils);
  for (const [key, alias] of Object.entries({ components, ui, utils, lib })) {
    if (alias.startsWith(".") || alias.startsWith("/") || /^[A-Za-z]:/.test(alias)) {
      throw new CliError(
        `${CONFIG_FILE}: "aliases.${key}" must be a bare import specifier such as "@/components", not a path.`,
      );
    }
  }

  const resolver = createAliasResolver(root);
  const uiPath = field(rawPaths, "ui", "paths") ?? resolver(ui, "ui");
  const libPath = field(rawPaths, "lib", "paths") ?? resolver(lib, "lib");
  const stylesPath =
    field(rawPaths, "styles", "paths") ??
    normalizeRel(path.posix.join(path.posix.dirname(libPath), "styles/sibujs-ui"));
  const utilsPath = utils === `${lib}/utils` ? `${libPath}/utils` : resolver(utils, "lib");

  const paths = {
    ui: normalizeRel(uiPath),
    lib: normalizeRel(libPath),
    styles: normalizeRel(stylesPath),
    utils: normalizeRel(utilsPath),
  };
  for (const [key, value] of Object.entries(paths)) assertInsideRoot(root, value, `paths.${key}`);
  if (typeof css === "string") assertInsideRoot(root, css, "tailwind.css");

  return {
    root,
    file: configPath(root),
    style,
    css: typeof css === "string" ? normalizeRel(css) : null,
    registry: raw.registry,
    aliases: { components, ui, utils, lib },
    paths,
  };
}

/**
 * The import specifier that reaches `dir` (relative to the root), using the
 * alias roots the project already has: each configured alias/path pair
 * (`@/components/ui` ↔ `src/components/ui` means `@` ↔ `src`) and every
 * tsconfig `paths` wildcard. `undefined` when no alias reaches it.
 */
export function aliasForDirectory(config: ProjectConfig, dir: string): string | undefined {
  const target = normalizeRel(dir);
  const roots: [alias: string, dir: string][] = [];
  for (const [alias, where] of [
    [config.aliases.ui, config.paths.ui],
    [config.aliases.lib, config.paths.lib],
  ]) {
    const a = alias.split("/");
    const d = where === "." ? [] : where.split("/");
    // Drop the trailing segments both share; what remains is the alias root.
    while (a.length > 1 && d.length > 0 && a[a.length - 1] === d[d.length - 1]) {
      a.pop();
      d.pop();
    }
    roots.push([a.join("/"), d.length === 0 ? "." : d.join("/")]);
  }
  const tsPaths = readTsconfigPaths(config.root);
  for (const [pattern, targets] of Object.entries(tsPaths?.paths ?? {})) {
    const first = Array.isArray(targets) ? targets[0] : undefined;
    if (pattern.endsWith("/*") && typeof first === "string" && first.endsWith("/*")) {
      roots.push([pattern.slice(0, -2), normalizeRel(path.posix.join(tsPaths!.baseDir, first.slice(0, -2)))]);
    }
  }
  for (const [alias, base] of roots) {
    if (base === ".") return target === "." ? alias : `${alias}/${target}`;
    if (target === base) return alias;
    if (target.startsWith(`${base}/`)) return `${alias}/${target.slice(base.length + 1)}`;
  }
  return undefined;
}

function normalizeRel(p: string): string {
  const normalized = path.posix.normalize(p.replaceAll("\\", "/")).replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === "" ? "." : normalized;
}

function assertInsideRoot(root: string, rel: string, key: string) {
  const abs = path.resolve(root, rel);
  const relative = path.relative(root, abs);
  if (path.isAbsolute(rel) || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CliError(`${CONFIG_FILE}: "${key}" (${rel}) must be a directory inside the project.`);
  }
}

interface TsPaths {
  baseDir: string;
  paths: Record<string, string[]>;
}

/** tsconfig `paths` of the project, from tsconfig.app.json or tsconfig.json. */
export function readTsconfigPaths(root: string): TsPaths | null {
  for (const name of ["tsconfig.app.json", "tsconfig.json", "jsconfig.json"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const { data } = parseJsonc(fs.readFileSync(file, "utf-8"));
      const options = (data as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } })
        .compilerOptions;
      if (options?.paths && typeof options.paths === "object") {
        return { baseDir: path.posix.normalize(options.baseUrl ?? "."), paths: options.paths };
      }
    } catch {
      // An unparseable tsconfig simply contributes no aliases.
    }
  }
  return null;
}

/**
 * Map an import alias to a project directory: first through tsconfig `paths`
 * (`"@/*": ["./src/*"]` makes `@/components` → `src/components`), then by the
 * common convention that `@/`, `~/` and `#/` point at `src/`.
 */
function createAliasResolver(root: string) {
  const tsPaths = readTsconfigPaths(root);
  return (alias: string, key: string): string => {
    if (tsPaths) {
      for (const [pattern, targets] of Object.entries(tsPaths.paths)) {
        const target = Array.isArray(targets) ? targets[0] : undefined;
        if (typeof target !== "string") continue;
        if (pattern.endsWith("/*") && target.endsWith("/*")) {
          const prefix = pattern.slice(0, -1);
          if (alias.startsWith(prefix)) {
            return path.posix.join(tsPaths.baseDir, target.slice(0, -1), alias.slice(prefix.length));
          }
        } else if (pattern === alias) {
          return path.posix.join(tsPaths.baseDir, target.replace(/\.[cm]?[jt]sx?$/, ""));
        }
      }
    }
    const match = /^[@~#]\/(.*)$/.exec(alias);
    if (match) {
      const base = sourceBase(root);
      return base === "." ? match[1] : `${base}/${match[1]}`;
    }
    throw new CliError(
      `${CONFIG_FILE}: cannot tell which directory the alias "${alias}" points at.`,
      `Declare it in tsconfig "paths", or set "paths.${key}" in ${CONFIG_FILE}.`,
    );
  };
}
