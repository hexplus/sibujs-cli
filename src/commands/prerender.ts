import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pc from "picocolors";

/**
 * `sibujs prerender` — render an EXISTING build again, without rebuilding the
 * client bundle. For when data changed (an admin edit, a webhook): run it with
 * `--routes` to refresh only the pages that show that data.
 *
 * The options come from the project's own `sibuVitePlugin({ prerender })`, read
 * through Vite's config resolution, and the pre-renderer is the project's own
 * `sibujs/build` — the same code `vite build` runs.
 */

export interface PrerenderCommandOptions {
  /** Comma-separated routes to render instead of the configured list. */
  routes?: string;
  /** Vite config file (default: Vite's lookup). */
  config?: string;
  /** Project directory (default: the current directory). */
  cwd?: string;
}

interface SibuPluginLike {
  name?: string;
  api?: { prerender?: Record<string, unknown> };
}

interface ResolvedViteConfig {
  root: string;
  configFile?: string;
  mode: string;
  build: { outDir: string };
  plugins: readonly SibuPluginLike[];
}

/** The ESM entry of a package's export map, followed through conditions. */
function esmEntry(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return undefined;
  const map = entry as Record<string, unknown>;
  for (const key of ["import", "module-sync", "default"]) {
    const found = esmEntry(map[key]);
    if (found) return found;
  }
  return undefined;
}

/** `import()` a package subpath the way the project resolves it. */
async function importFromProject(cwd: string, pkg: string, subpath = "."): Promise<Record<string, unknown>> {
  const require = createRequire(path.join(cwd, "package.json"));
  // Found through Node's lookup paths rather than `require.resolve("pkg/package.json")`:
  // a package whose export map does not list `./package.json` refuses that.
  const manifestPath = (require.resolve.paths(pkg) ?? [])
    .map((dir) => path.join(dir, pkg, "package.json"))
    .find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) throw new Error(`${pkg} is not installed in ${cwd}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { exports?: Record<string, unknown> };
  const entry = esmEntry(manifest.exports?.[subpath]);
  const target = entry
    ? path.join(path.dirname(manifestPath), entry)
    : require.resolve(subpath === "." ? pkg : `${pkg}/${subpath.replace(/^\.\//, "")}`);
  return (await import(pathToFileURL(target).href)) as Record<string, unknown>;
}

/**
 * Run the pre-renderer against the project's built `dist/`.
 *
 * @returns The process exit code.
 */
export async function prerenderCommand(options: PrerenderCommandOptions = {}): Promise<number> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let vite: Record<string, unknown>;
  let build: Record<string, unknown>;
  try {
    vite = await importFromProject(cwd, "vite");
    build = await importFromProject(cwd, "sibujs", "./build");
  } catch (err) {
    console.error(pc.red(`✖ ${(err as Error).message}`));
    return 1;
  }

  const resolveConfig = vite.resolveConfig as (
    inline: Record<string, unknown>,
    command: "build",
    mode: string,
    defaultNodeEnv: string,
  ) => Promise<ResolvedViteConfig>;
  const config = await resolveConfig(
    { root: cwd, configFile: options.config ? path.resolve(cwd, options.config) : undefined, logLevel: "warn" },
    "build",
    "production",
    "production",
  );

  const plugin = config.plugins.find((p) => p?.name === "sibu-vite-plugin");
  const configured = plugin?.api?.prerender;
  if (!configured) {
    console.error(
      pc.red("✖ No pre-render configuration: add sibuVitePlugin({ prerender: { … } }) to the Vite config."),
    );
    return 1;
  }

  const outDir = path.resolve(config.root, config.build.outDir);
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    console.error(pc.red(`✖ ${path.relative(cwd, outDir) || outDir} has no build. Run \`sibujs build\` first.`));
    return 1;
  }

  const only = options.routes
    ?.split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  // A partial run refreshes pages; the site-wide files keep what the last full
  // run wrote.
  const run = only
    ? { ...configured, routes: only, sitemap: false, robots: false, notFound: false, shell: false }
    : configured;

  const prerender = build.prerender as (
    o: Record<string, unknown>,
    ctx: Record<string, unknown>,
  ) => Promise<Array<{ route: string; file: string; ms: number; kind?: string; status?: number }>>;
  console.log(
    `${pc.cyan("sibujs")} ${pc.dim(only ? `pre-rendering ${only.length} route(s)...` : "pre-rendering...")}\n`,
  );
  try {
    const results = await prerender(run, {
      root: config.root,
      outDir,
      configFile: config.configFile ?? false,
      mode: config.mode,
    });
    for (const r of results) {
      const what =
        r.kind === "redirect" ? `redirect ${r.status}` : r.kind === "skipped" ? `skipped (${r.status})` : r.file;
      console.log(`  ${r.route} ${pc.dim("→")} ${what} ${pc.dim(`(${r.ms} ms)`)}`);
    }
    console.log(
      `\n${pc.green("✔")} ${results.length} route(s) pre-rendered into ${path.relative(cwd, outDir) || outDir}.`,
    );
    return 0;
  } catch (err) {
    console.error(pc.red(`\n✖ ${(err as Error).message}`));
    return 1;
  }
}
