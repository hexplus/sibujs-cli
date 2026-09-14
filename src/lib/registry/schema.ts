import { CliError } from "./errors.js";

/**
 * The sibujs-ui registry format, as published in `sibujs-ui/dist/registry/`.
 *
 * Everything read from a registry is untrusted input: it may come from any URL
 * the user points `--registry` at. Item names become URLs and file names, file
 * paths become write targets, and dependency specs reach a package manager
 * command line, so each is validated here before anything else sees it.
 */

export const ITEM_TYPES = ["registry:ui", "registry:lib", "registry:style", "registry:theme"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Same rule as the registry's JSON Schema: lowercase words joined by `-`. */
export const ITEM_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** First path segment of a registry file selects its install directory. */
export const FILE_ROOTS = ["ui", "lib", "styles"] as const;
export type FileRoot = (typeof FILE_ROOTS)[number];

export interface RegistryFile {
  path: string;
  type: ItemType;
  content: string;
}

export interface RegistryItem {
  name: string;
  type: ItemType;
  title?: string;
  description?: string;
  dependencies: string[];
  devDependencies: string[];
  registryDependencies: string[];
  files: RegistryFile[];
  css?: { imports?: string[]; requires?: string[] };
  tailwind?: { version: number; utilities: string[]; variants: string[] };
  categories?: string[];
  meta?: { version?: string };
}

export interface RegistryIndexItem extends Omit<RegistryItem, "files"> {
  files: { path: string; type: string }[];
}

export interface RegistryIndex {
  name: string;
  version: string;
  homepage?: string;
  aliases: { ui: string; lib: string };
  items: RegistryIndexItem[];
}

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
/**
 * Version ranges as the registry writes them (`^0.7.1`, `>=3.2.0 <5.0.0`).
 * Deliberately excludes every character a shell gives meaning to inside double
 * quotes (`"`, `%`, `$`, backtick, `!`, `\`), because on Windows the package
 * manager has to be started through a shell.
 */
const NPM_RANGE = /^[A-Za-z0-9.^~<>=*|+ -]*$/;

/** `name@range` → `[name, range]`; the name may itself start with `@`. */
export function splitDependency(spec: string): [string, string] {
  const at = spec.indexOf("@", 1);
  return at === -1 ? [spec, ""] : [spec.slice(0, at), spec.slice(at + 1)];
}

export function isSafeDependencySpec(spec: string): boolean {
  const [name, range] = splitDependency(spec);
  return NPM_NAME.test(name) && range.length <= 100 && NPM_RANGE.test(range);
}

/**
 * A registry-relative path: `ui/…`, `lib/…` or `styles/…`, made only of plain
 * segments. No traversal, no absolute or drive paths, no backslashes.
 */
export function isSafeRegistryPath(p: string, roots: readonly string[] = FILE_ROOTS): boolean {
  if (p.length === 0 || p.length > 200) return false;
  const segments = p.split("/");
  if (!roots.includes(segments[0])) return false;
  return segments.slice(1).length > 0 && segments.slice(1).every((s) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(s));
}

/** A `css.imports` entry: a plain relative path inside the styles directory. */
function isSafeStylePath(p: string): boolean {
  return p.length > 0 && p.split("/").every((s) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(s));
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

function fail(where: string, problem: string): never {
  throw new CliError(
    `The registry returned an invalid item (${where}): ${problem}.`,
    "Check that --registry points at a sibujs-ui registry.",
  );
}

function checkCommon(data: Json, where: string) {
  if (typeof data.name !== "string" || !ITEM_NAME.test(data.name)) fail(where, `"name" must match ${ITEM_NAME}`);
  if (!ITEM_TYPES.includes(data.type as ItemType)) fail(where, `"type" must be one of ${ITEM_TYPES.join(", ")}`);
  for (const key of ["dependencies", "devDependencies"]) {
    const list = data[key] ?? [];
    if (!isStringArray(list)) fail(where, `"${key}" must be an array of strings`);
    const bad = list.find((spec) => !isSafeDependencySpec(spec));
    if (bad !== undefined) fail(where, `"${key}" contains an invalid package spec ${JSON.stringify(bad)}`);
  }
  const deps = data.registryDependencies;
  if (!isStringArray(deps)) fail(where, `"registryDependencies" must be an array of strings`);
  const badDep = deps.find((d) => !ITEM_NAME.test(d));
  if (badDep !== undefined) fail(where, `"registryDependencies" contains an invalid name ${JSON.stringify(badDep)}`);
  if (data.css !== undefined) {
    if (!isObject(data.css)) fail(where, `"css" must be an object`);
    const imports = data.css.imports ?? [];
    if (!isStringArray(imports) || !imports.every(isSafeStylePath)) {
      fail(where, `"css.imports" must be relative paths inside the styles directory`);
    }
  }
}

export function parseItem(data: unknown, where: string): RegistryItem {
  if (!isObject(data)) fail(where, "expected a JSON object");
  checkCommon(data, where);
  if (!Array.isArray(data.files) || data.files.length === 0) fail(where, `"files" must be a non-empty array`);
  for (const file of data.files) {
    if (!isObject(file) || typeof file.path !== "string" || typeof file.content !== "string") {
      fail(where, `every file needs a string "path" and "content"`);
    }
    if (!isSafeRegistryPath(file.path)) {
      fail(where, `file path ${JSON.stringify(file.path)} must be a plain path under ui/, lib/ or styles/`);
    }
  }
  return {
    ...(data as unknown as RegistryItem),
    dependencies: (data.dependencies as string[] | undefined) ?? [],
    devDependencies: (data.devDependencies as string[] | undefined) ?? [],
  };
}

export function parseIndex(data: unknown, where: string): RegistryIndex {
  if (!isObject(data)) fail(where, "expected a JSON object");
  if (!Array.isArray(data.items)) fail(where, `"items" must be an array`);
  for (const item of data.items) {
    if (!isObject(item)) fail(where, 'every entry of "items" must be an object');
    checkCommon(item, where);
  }
  return {
    name: typeof data.name === "string" ? data.name : "registry",
    version: typeof data.version === "string" ? data.version : "unknown",
    homepage: typeof data.homepage === "string" ? data.homepage : undefined,
    aliases: isObject(data.aliases)
      ? (data.aliases as RegistryIndex["aliases"])
      : { ui: "@/components/ui", lib: "@/lib" },
    items: (data.items as Json[]).map((item) => ({
      ...(item as unknown as RegistryIndexItem),
      dependencies: (item.dependencies as string[] | undefined) ?? [],
      devDependencies: (item.devDependencies as string[] | undefined) ?? [],
      files: Array.isArray(item.files) ? (item.files as RegistryIndexItem["files"]) : [],
    })),
  };
}
