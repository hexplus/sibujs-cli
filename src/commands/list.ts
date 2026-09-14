import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../lib/registry/config.js";
import { CliError } from "../lib/registry/errors.js";
import { isInstalled } from "../lib/registry/install.js";
import type { ItemType } from "../lib/registry/schema.js";
import { createRegistry, pickRegistry } from "../lib/registry/source.js";
import type { CommandContext } from "./init.js";

export interface ListOptions {
  cwd?: string;
  registry?: string;
  /** ui, lib, style, theme or all. */
  type?: string;
  json?: boolean;
}

const GROUPS: [string, ItemType][] = [
  ["Components", "registry:ui"],
  ["Library", "registry:lib"],
  ["Styles", "registry:style"],
  ["Themes", "registry:theme"],
];

/** `sibujs list` — what the registry offers, and what is already installed. */
export async function list(options: ListOptions = {}, context: CommandContext = {}): Promise<void> {
  const log = context.log ?? console.log;
  const cwd = process.cwd();
  const root = path.resolve(cwd, options.cwd ?? ".");
  const type = options.type ?? "all";
  if (!["all", "ui", "lib", "style", "theme"].includes(type)) {
    throw new CliError(`Unknown --type "${type}".`, "Use one of: ui, lib, style, theme, all.");
  }

  const config = loadConfig(root);
  const source = pickRegistry({ flag: options.registry, config: config?.registry, cwd, root });
  const registry = createRegistry(source.location, context.registry);
  const index = await registry.index();
  const items = index.items.filter((i) => type === "all" || i.type === `registry:${type}`);

  if (options.json) {
    log(
      JSON.stringify(
        items.map((i) => ({
          name: i.name,
          type: i.type,
          description: i.description ?? "",
          registryDependencies: i.registryDependencies,
          ...(config ? { installed: isInstalled(config, i) } : {}),
        })),
        null,
        2,
      ),
    );
    return;
  }

  log(`${pc.bold(index.name)} ${index.version} ${pc.dim(`(${source.location})`)}`);
  for (const [label, itemType] of GROUPS) {
    const group = items.filter((i) => i.type === itemType);
    if (group.length === 0) continue;
    log(`\n${pc.bold(label)} ${pc.dim(`(${group.length})`)}`);
    const width = Math.max(...group.map((i) => i.name.length));
    for (const item of group) {
      const mark = config && isInstalled(config, item) ? pc.green("✔") : " ";
      log(`  ${mark} ${item.name.padEnd(width)}  ${pc.dim(item.description ?? "")}`);
    }
  }
  log(`\nAdd components with ${pc.cyan("sibujs add <name...>")}${config ? pc.dim("   ✔ = installed") : ""}`);
}
