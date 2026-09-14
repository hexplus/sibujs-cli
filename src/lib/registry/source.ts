import fs from "node:fs";
import path from "node:path";
import { CliError, ItemNotFoundError } from "./errors.js";
import { ITEM_NAME, parseIndex, parseItem, type RegistryIndex, type RegistryItem } from "./schema.js";

/**
 * Where component definitions come from.
 *
 * A registry source is one of:
 * - a directory (`../sibujs-ui/dist/registry`) — local development;
 * - a base URL (`https://unpkg.com/sibujs-ui@1.7.0/dist/registry`), read as
 *   `<base>/index.json` and `<base>/<name>.json`;
 * - a URL template containing `{name}` (`https://example.com/r/{name}.json`).
 *
 * The same forms the `sibujs-ui` CLI accepts, so one `components.json` works
 * with both.
 */

/** The official registry: the one published inside the sibujs-ui npm package. */
export const DEFAULT_REGISTRY = "https://unpkg.com/sibujs-ui@latest/dist/registry";

/** Environment variable that overrides the registry for every command. */
export const REGISTRY_ENV = "SIBUJS_REGISTRY";

const FETCH_TIMEOUT_MS = 15_000;
/** Extra attempts after a network error, timeout or 5xx. */
const RETRIES = 2;

export type RegistryOrigin = "flag" | "env" | "config" | "default";

export interface RegistrySource {
  location: string;
  origin: RegistryOrigin;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Pick the registry: `--registry`, then `$SIBUJS_REGISTRY`, then the
 * `registry` key of components.json, then the official registry. Relative
 * directories resolve against the working directory for the flag and the
 * variable, and against the project root for components.json.
 */
export function pickRegistry(options: { flag?: string; config?: string; cwd: string; root: string }): RegistrySource {
  const env = process.env[REGISTRY_ENV];
  const [location, origin, base]: [string | undefined, RegistryOrigin, string] = options.flag
    ? [options.flag, "flag", options.cwd]
    : env
      ? [env, "env", options.cwd]
      : options.config
        ? [options.config, "config", options.root]
        : [DEFAULT_REGISTRY, "default", options.root];
  const value = location!.trim();
  return { location: isUrl(value) ? value : path.resolve(base, value), origin };
}

export interface Registry {
  readonly location: string;
  index(): Promise<RegistryIndex>;
  item(name: string): Promise<RegistryItem>;
}

export interface RegistryOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createRegistry(location: string, options: RegistryOptions = {}): Registry {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const items = new Map<string, Promise<RegistryItem>>();
  let index: Promise<RegistryIndex> | undefined;

  // A base URL that redirects (`sibujs-ui@latest` → `sibujs-ui@1.7.0`) is
  // pinned to its target after the first response: later requests skip the
  // redirect, and every file of one run comes from the same version even if a
  // release lands mid-install.
  let base = location.replace(/\/+$/, "");
  const where = (file: string) => {
    if (location.includes("{name}")) return location.replaceAll("{name}", file);
    return isUrl(location) ? `${base}/${file}.json` : path.join(location, `${file}.json`);
  };

  async function request(url: string): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await doFetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        // CDNs answer transient failures with 5xx; those are worth one retry.
        if (response.status < 500 || attempt === RETRIES + 1) return response;
      } catch (error) {
        if (attempt === RETRIES + 1) {
          const cause = (error as { cause?: { code?: string } }).cause?.code;
          const reason =
            (error as Error).name === "TimeoutError"
              ? `timed out after ${timeoutMs / 1000}s`
              : (cause ?? (error as Error).message);
          throw new CliError(
            `Could not reach the registry at ${url} (${reason}).`,
            `Check your connection, or use a local registry: --registry <dir> or ${REGISTRY_ENV}=<dir>.`,
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  /** Load `<file>.json`; `undefined` when the registry has no such file. */
  async function load(file: string): Promise<{ data: unknown; at: string } | undefined> {
    const at = where(file);
    if (!isUrl(at)) {
      if (!fs.existsSync(location.includes("{name}") ? path.dirname(at) : location)) {
        throw new CliError(
          `Registry directory not found: ${location}`,
          "Pass --registry a directory holding index.json (for example ../sibujs-ui/dist/registry) or a URL.",
        );
      }
      if (!fs.existsSync(at)) return undefined;
      return { data: parseJson(fs.readFileSync(at, "utf-8"), at), at };
    }

    const response = await request(at);
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new CliError(`The registry responded ${response.status} ${response.statusText} for ${at}.`);
    }
    const suffix = `/${file}.json`;
    if (!location.includes("{name}") && response.redirected && response.url.endsWith(suffix)) {
      base = response.url.slice(0, -suffix.length);
    }
    return { data: parseJson(await response.text(), at), at };
  }

  return {
    location,
    index() {
      index ??= load("index").then((result) => {
        if (!result) {
          throw new CliError(
            `No registry index at ${where("index")}.`,
            "Is --registry pointing at a sibujs-ui registry (a directory or URL holding index.json)?",
          );
        }
        return parseIndex(result.data, result.at);
      });
      return index;
    },
    item(name) {
      if (!ITEM_NAME.test(name)) {
        return Promise.reject(
          new CliError(
            `Invalid component name ${JSON.stringify(name)}.`,
            "Names are lowercase words joined by hyphens, e.g. button, dropdown-menu.",
          ),
        );
      }
      let pending = items.get(name);
      if (!pending) {
        pending = load(name).then((result) => {
          if (!result) throw new ItemNotFoundError(name, location);
          const item = parseItem(result.data, result.at);
          if (item.name !== name) {
            throw new CliError(`The registry returned "${item.name}" when asked for "${name}" (${result.at}).`);
          }
          return item;
        });
        items.set(name, pending);
      }
      return pending;
    },
  };
}

function parseJson(text: string, at: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(`The registry returned invalid JSON (${at}).`);
  }
}

export interface ResolvedTree {
  /** Every item to install, each registry dependency before its dependents. */
  items: RegistryItem[];
  /** For each pulled-in dependency, the first item that required it. */
  requiredBy: Map<string, string>;
}

/** Resolve `registryDependencies` recursively into install order. */
export async function resolveTree(registry: Registry, names: string[]): Promise<ResolvedTree> {
  const items: RegistryItem[] = [];
  const requiredBy = new Map<string, string>();
  const state = new Map<string, "visiting" | "done">();

  const visit = async (name: string, trail: string[]) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      throw new CliError(`The registry has a dependency cycle: ${[...trail, name].join(" → ")}.`);
    }
    state.set(name, "visiting");
    const item = await registry.item(name);
    // Start every dependency download at once; the depth-first walk below
    // then finds them already cached.
    for (const dep of item.registryDependencies) registry.item(dep).catch(() => {});
    for (const dep of item.registryDependencies) {
      if (!requiredBy.has(dep) && !names.includes(dep)) requiredBy.set(dep, name);
      await visit(dep, [...trail, name]);
    }
    state.set(name, "done");
    items.push(item);
  };

  for (const name of names) await visit(name, []);
  return { items, requiredBy };
}

/** Up to three index names close to `name`, for "did you mean" hints. */
export function suggestNames(name: string, candidates: string[]): string[] {
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: candidate.includes(name) || name.includes(candidate) ? 0 : distance(name, candidate),
    }))
    .filter(({ score }) => score <= Math.max(2, Math.floor(name.length / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate));
  return scored.slice(0, 3).map(({ candidate }) => candidate);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
}
