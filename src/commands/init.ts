import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import {
  CONFIG_FILE,
  type ComponentsJson,
  configPath,
  createDefaultConfig,
  type ProjectConfig,
  readConfigFile,
  resolveConfig,
} from "../lib/registry/config.js";
import { CliError } from "../lib/registry/errors.js";
import { canPrompt, type InstallOptions, installItems } from "../lib/registry/install.js";
import { planAlias, planStylesheet, planTailwind, type SetupPlan } from "../lib/registry/project.js";
import { createRegistry, pickRegistry, type RegistryOptions } from "../lib/registry/source.js";

export interface InitOptions {
  cwd?: string;
  /** `default` or a theme color. */
  style?: string;
  css?: string;
  registry?: string;
  /** Regenerate components.json even if it exists. */
  force?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  install?: boolean;
  overwrite?: boolean;
}

export interface CommandContext {
  registry?: RegistryOptions;
  resolveConflict?: InstallOptions["resolveConflict"];
  log?: (line: string) => void;
}

/**
 * The `registry` value to record in components.json: nothing for the default,
 * URLs as given, and directories relative to the project when they are nearby
 * (a sibling checkout in a monorepo) or absolute otherwise.
 */
function storedRegistry(root: string, flag: string | undefined, resolved: string): string | undefined {
  if (!flag || /^https?:\/\//i.test(flag)) return flag;
  const rel = path.relative(root, resolved).replaceAll("\\", "/");
  if (path.isAbsolute(rel) || rel.split("/").filter((s) => s === "..").length > 2) {
    return resolved.replaceAll("\\", "/");
  }
  return rel || ".";
}

/**
 * `sibujs init` — prepare a project for copied sibujs-ui components:
 * components.json, Tailwind CSS 4, the `@/` import alias, the base styles and
 * `cn()`.
 */
export async function init(options: InitOptions = {}, context: CommandContext = {}): Promise<ProjectConfig> {
  const log = context.log ?? console.log;
  const cwd = process.cwd();
  const root = path.resolve(cwd, options.cwd ?? ".");

  if (!fs.existsSync(path.join(root, "package.json"))) {
    throw new CliError(
      `No package.json found in ${root}.`,
      "Run `sibujs init` from your project root, or create a project first: `sibujs create my-app`.",
    );
  }

  const existing = readConfigFile(root);
  const keep = existing !== null && !options.force;
  const source = pickRegistry({ flag: options.registry, config: existing?.registry, cwd, root });
  const registry = createRegistry(source.location, context.registry);
  const index = await registry.index();

  const styles = [
    "default",
    ...index.items.filter((i) => i.type === "registry:theme").map((i) => i.name.replace(/^theme-/, "")),
  ];
  let style = options.style ?? (keep ? existing?.style : undefined);
  if (style === undefined && !options.yes && canPrompt()) {
    const answer = await prompts({
      type: "select",
      name: "style",
      message: "Which style (color theme)?",
      choices: styles.map((s) => ({ title: s, value: s })),
      initial: 0,
    });
    if (answer.style === undefined) throw new CliError("Cancelled. Nothing was written.");
    style = answer.style;
  }
  style ??= "default";
  if (!styles.includes(style)) {
    throw new CliError(`Unknown style "${style}".`, `Available styles: ${styles.join(", ")}.`);
  }

  log(`${pc.bold("sibujs init")} ${pc.dim(`· ${root}`)}`);
  log(pc.dim(`registry: ${index.name} ${index.version} (${source.location})`));
  if (options.dryRun) log(pc.yellow("Dry run — nothing will be written."));

  const setup: SetupPlan = { changes: [], manual: [], warnings: [], dependencies: [], devDependencies: [] };
  let raw: ComponentsJson;
  if (keep) {
    raw = { ...existing };
    if (options.style && options.style !== existing?.style) raw.style = options.style;
    log(pc.dim(`= ${CONFIG_FILE} exists; keeping it (--force to regenerate)`));
  } else {
    const css = planStylesheet(root, options.css, setup);
    raw = createDefaultConfig(root, { style, css, registry: storedRegistry(root, options.registry, source.location) });
  }

  const config = resolveConfig(root, raw);
  if (keep && config.css && !fs.existsSync(path.join(root, config.css))) planStylesheet(root, config.css, setup);
  planTailwind(root, setup);
  planAliasFor(config, setup);

  if (!keep || raw.style !== existing?.style) {
    setup.changes.unshift({
      file: configPath(root),
      display: CONFIG_FILE,
      content: `${JSON.stringify(raw, null, 2)}\n`,
      created: !existing,
      summary: `style: ${config.style}`,
    });
  }

  const names = ["base", "utils"];
  if (config.style !== "default") names.push(`theme-${config.style}`);
  await installItems(config, registry, names, {
    ...options,
    setup,
    resolveConflict: context.resolveConflict,
    log,
  });

  if (!options.dryRun) {
    log(`\n${pc.green("✔")} Ready. Add components with ${pc.cyan("sibujs add button")}`);
  }
  return config;
}

/**
 * Declare the alias root the config uses (`@` in `@/components/ui`) when the
 * project does not already resolve it.
 */
function planAliasFor(config: ProjectConfig, setup: SetupPlan) {
  const match = /^([@~#][^/]*)\/(.+)$/.exec(config.aliases.ui);
  if (!match) return;
  const [, prefix, rest] = match;
  // `@/components/ui` living at `src/components/ui` means `@` is `src`.
  if (config.paths.ui !== rest && !config.paths.ui.endsWith(`/${rest}`)) {
    setup.manual.push(
      `Make the "${prefix}/*" import alias resolve so that "${config.aliases.ui}" points at ${config.paths.ui} (tsconfig "paths" and your bundler).`,
    );
    return;
  }
  const dir = config.paths.ui === rest ? "." : config.paths.ui.slice(0, -rest.length - 1);
  planAlias(config.root, prefix, dir, setup);
}
