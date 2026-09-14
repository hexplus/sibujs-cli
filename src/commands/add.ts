import path from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import { CONFIG_FILE, type ProjectConfig, readConfigFile, resolveConfig } from "../lib/registry/config.js";
import { CliError } from "../lib/registry/errors.js";
import { canPrompt, importHint, installItems } from "../lib/registry/install.js";
import { ITEM_NAME } from "../lib/registry/schema.js";
import { createRegistry, pickRegistry } from "../lib/registry/source.js";
import { type CommandContext, init } from "./init.js";

export interface AddOptions {
  cwd?: string;
  registry?: string;
  /** Every component in the registry. */
  all?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
  install?: boolean;
  yes?: boolean;
  /** Install ui components into this directory instead of `paths.ui`. */
  path?: string;
}

/**
 * `sibujs add <component...>` — copy components, and every registry item they
 * depend on, into the project.
 */
export async function add(names: string[], options: AddOptions = {}, context: CommandContext = {}): Promise<void> {
  const log = context.log ?? console.log;
  const cwd = process.cwd();
  const root = path.resolve(cwd, options.cwd ?? ".");

  const requested = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const invalid = requested.filter((n) => !ITEM_NAME.test(n));
  if (invalid.length > 0) {
    throw new CliError(
      `Invalid component name${invalid.length > 1 ? "s" : ""}: ${invalid.map((n) => JSON.stringify(n)).join(", ")}.`,
      "Names are lowercase words joined by hyphens, e.g. button, dropdown-menu. Run `sibujs list` to see them all.",
    );
  }
  if (requested.length === 0 && !options.all) {
    throw new CliError(
      "No components given.",
      "Usage: sibujs add <component...>   (for example: sibujs add button card)\nRun `sibujs list` to see what is available, or pass --all.",
    );
  }

  let config = await loadOrInit(root, options, context);
  if (options.path) {
    const ui = path.relative(root, path.resolve(cwd, options.path)).replaceAll("\\", "/");
    if (ui === "" || ui.startsWith("..") || path.isAbsolute(ui)) {
      throw new CliError(`--path ${options.path} must be a directory inside the project (${root}).`);
    }
    config = { ...config, paths: { ...config.paths, ui } };
  }

  const source = pickRegistry({ flag: options.registry, config: config.registry, cwd, root });
  const registry = createRegistry(source.location, context.registry);

  let targets = requested;
  if (options.all) {
    const index = await registry.index();
    targets = index.items.filter((i) => i.type === "registry:ui").map((i) => i.name);
  }

  log(`${pc.bold("sibujs add")} ${targets.length > 8 ? `${targets.length} components` : targets.join(", ")}`);
  log(pc.dim(`registry: ${source.location}`));
  if (options.dryRun) log(pc.yellow("Dry run — nothing will be written."));

  const result = await installItems(config, registry, targets, {
    overwrite: options.overwrite,
    dryRun: options.dryRun,
    install: options.install,
    yes: options.yes,
    resolveConflict: context.resolveConflict,
    log,
  });

  const hints = result.items
    .filter((item) => targets.includes(item.name) && item.type === "registry:ui")
    .slice(0, 5)
    .map((item) => importHint(config, item))
    .filter((hint): hint is string => Boolean(hint));
  if (!options.dryRun && !options.all && hints.length > 0) {
    log(`\n${pc.green("✔")} Done. Import ${hints.length > 1 ? "them" : "it"} with:`);
    for (const hint of hints) log(`  ${pc.cyan(hint)}`);
  }
}

async function loadOrInit(root: string, options: AddOptions, context: CommandContext): Promise<ProjectConfig> {
  const raw = readConfigFile(root);
  if (raw) return resolveConfig(root, raw);

  let create = Boolean(options.yes);
  if (!create && canPrompt()) {
    const answer = await prompts({
      type: "confirm",
      name: "create",
      message: `No ${CONFIG_FILE} found. Set up this project with the defaults now (sibujs init)?`,
      initial: true,
    });
    create = answer.create === true;
  }
  if (!create) {
    throw new CliError(
      `No ${CONFIG_FILE} found in ${root}.`,
      "Run `sibujs init` first, or pass --yes to set the project up with the defaults.",
    );
  }
  return init(
    {
      cwd: root,
      registry: options.registry,
      yes: true,
      dryRun: options.dryRun,
      install: options.install,
    },
    context,
  ).then((config) => {
    (context.log ?? console.log)("");
    return config;
  });
}
