import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import type { ProjectConfig } from "./config.js";
import { type DependencyPlan, planDependencies, runDependencyInstall } from "./dependencies.js";
import { CliError, ItemNotFoundError } from "./errors.js";
import { applyPlan, type CssPlan, type PlannedFile, planCss, planFiles, targetPath } from "./files.js";
import { applySetup, type SetupPlan } from "./project.js";
import { isSafeRegistryPath, type RegistryItem } from "./schema.js";
import { type Registry, resolveTree, suggestNames } from "./source.js";

/**
 * The shared install pipeline behind `sibujs init` and `sibujs add`:
 * resolve → plan → settle conflicts → report → write → install packages.
 */

export type ConflictChoice = "overwrite" | "skip" | "overwrite-all" | "skip-all";

export interface InstallOptions {
  /** Replace files that exist and differ, without asking. */
  overwrite?: boolean;
  /** Plan and report only. */
  dryRun?: boolean;
  /** Run the package manager (default true); otherwise print the command. */
  install?: boolean;
  /** Never prompt. Conflicting files are skipped unless `overwrite` is set. */
  yes?: boolean;
  /** Setup edits planned by `init`, written in the same pass. */
  setup?: SetupPlan;
  /** Ask about one conflicting file. Defaults to an interactive prompt. */
  resolveConflict?: (file: PlannedFile) => Promise<ConflictChoice | undefined>;
  log?: (line: string) => void;
}

export interface InstallResult {
  items: RegistryItem[];
  requiredBy: Map<string, string>;
  files: PlannedFile[];
  css: CssPlan;
  dependencies: DependencyPlan;
}

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
}

async function promptConflict(file: PlannedFile): Promise<ConflictChoice | undefined> {
  const { choice } = await prompts({
    type: "select",
    name: "choice",
    message: `${file.display} already exists and differs from the registry${file.note ? ` (${file.note})` : ""}.`,
    choices: [
      { title: "Skip — keep my file", value: "skip" },
      { title: "Overwrite", value: "overwrite" },
      { title: "Skip all remaining conflicts", value: "skip-all" },
      { title: "Overwrite all remaining conflicts", value: "overwrite-all" },
    ],
    initial: 0,
  });
  return choice;
}

async function withSuggestions<T>(registry: Registry, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ItemNotFoundError)) throw error;
    let hint = "Run `sibujs list` to see every available component.";
    try {
      const index = await registry.index();
      const matches = suggestNames(
        error.item,
        index.items.map((i) => i.name),
      );
      if (matches.length > 0) hint = `Did you mean ${matches.map((m) => pc.cyan(m)).join(", ")}? ${hint}`;
    } catch {
      // No index to suggest from; the generic hint stands.
    }
    throw new CliError(error.message, hint);
  }
}

export async function installItems(
  config: ProjectConfig,
  registry: Registry,
  names: string[],
  options: InstallOptions = {},
): Promise<InstallResult> {
  const log = options.log ?? console.log;
  const setup: SetupPlan = options.setup ?? {
    changes: [],
    manual: [],
    warnings: [],
    dependencies: [],
    devDependencies: [],
  };

  const { items, requiredBy } = await withSuggestions(registry, () => resolveTree(registry, names));
  const files = planFiles(config, items);

  // Settle every conflict before anything is written, so a cancelled prompt
  // leaves the project untouched.
  const conflicts = files.filter((f) => f.status === "conflict");
  if (options.overwrite) {
    for (const file of conflicts) file.overwrite = true;
  } else if (!options.dryRun && !options.yes && conflicts.length > 0 && (options.resolveConflict || canPrompt())) {
    const ask = options.resolveConflict ?? promptConflict;
    let all: boolean | undefined;
    for (const file of conflicts) {
      if (all !== undefined) {
        file.overwrite = all;
        continue;
      }
      const choice = await ask(file);
      if (choice === undefined) throw new CliError("Cancelled. Nothing was written.");
      file.overwrite = choice === "overwrite" || choice === "overwrite-all";
      if (choice === "overwrite-all") all = true;
      if (choice === "skip-all") all = false;
    }
  }

  // Stylesheet `@import`s, applied on top of a stylesheet `init` may be creating.
  const cssAbs = config.css ? path.resolve(config.root, config.css) : undefined;
  const pendingCss = setup.changes.find((c) => c.file === cssAbs);
  const css = planCss(config, items, pendingCss?.content);
  if (css.file && css.content !== undefined) {
    const summary = `+${css.added.length} @import`;
    if (pendingCss) {
      pendingCss.content = css.content;
      pendingCss.summary = `${pendingCss.summary}; ${summary}`;
    } else {
      setup.changes.push({ file: css.file, display: css.display!, content: css.content, summary });
    }
  }

  const dependencies = planDependencies(config.root, {
    dependencies: [...setup.dependencies, ...items.flatMap((i) => i.dependencies)],
    devDependencies: [...setup.devDependencies, ...items.flatMap((i) => i.devDependencies)],
  });

  report({ config, files, setup, css, dependencies, requiredBy, requested: names, options, log });

  if (!options.dryRun) {
    applyPlan(files);
    applySetup(setup);
  }

  if (dependencies.commands.length > 0) {
    if (options.dryRun || options.install === false) {
      log(`\n${options.dryRun ? "Would install" : "Install the dependencies"}:`);
      for (const command of dependencies.commands) log(`  ${pc.cyan(command.display)}`);
    } else {
      log("");
      const failures = runDependencyInstall(config.root, dependencies, (line) => log(pc.dim(line)));
      // The files are already on disk and will not compile without their
      // packages; exiting 0 would let a script treat that as success.
      if (failures.length > 0) {
        throw new CliError(
          "Installing dependencies failed. The files were copied but will not build until you run:",
          failures.map((f) => `  ${f}`).join("\n"),
        );
      }
    }
  }

  return { items, requiredBy, files, css, dependencies };
}

function report(context: {
  config: ProjectConfig;
  files: PlannedFile[];
  setup: SetupPlan;
  css: CssPlan;
  dependencies: DependencyPlan;
  requiredBy: Map<string, string>;
  requested: string[];
  options: InstallOptions;
  log: (line: string) => void;
}) {
  const { config, files, setup, css, requiredBy, requested, options, log } = context;
  const dry = options.dryRun;
  const via = (item: string) => (requiredBy.has(item) ? pc.dim(` (required by ${requiredBy.get(item)})`) : "");

  log("");
  for (const change of setup.changes) {
    if (change.content === undefined) continue;
    const verb = change.created ? (dry ? "would create" : "created") : dry ? "would update" : "updated";
    log(`${pc.green("✔")} ${verb} ${pc.cyan(change.display)} ${pc.dim(`(${change.summary})`)}`);
  }
  // Up-to-date files of items that were only pulled in as dependencies are
  // counted rather than listed; they are the bulk of every repeat `add`.
  let upToDate = 0;
  for (const file of files) {
    if ((file.status === "identical" || file.status === "kept") && !requested.includes(file.item)) {
      upToDate++;
      continue;
    }
    switch (file.status) {
      case "create":
        log(`${pc.green("✔")} ${dry ? "would write" : "wrote"} ${pc.cyan(file.display)}${via(file.item)}`);
        break;
      case "identical":
        log(pc.dim(`= unchanged ${file.display}`));
        break;
      case "kept":
        log(pc.dim(`= kept ${file.display} (${file.note})`));
        break;
      case "conflict":
        if (file.overwrite) {
          log(`${pc.yellow("✔")} ${dry ? "would overwrite" : "overwrote"} ${pc.cyan(file.display)}${via(file.item)}`);
        } else {
          log(
            `${pc.yellow("•")} ${dry ? "would skip" : "skipped"} ${file.display} ${pc.dim(`(exists and differs${file.note ? `; ${file.note}` : ""}; use --overwrite to replace)`)}`,
          );
        }
        break;
    }
  }
  if (upToDate > 0) log(pc.dim(`= ${upToDate} dependency file${upToDate > 1 ? "s" : ""} already up to date`));

  for (const warning of setup.warnings) log(`\n${pc.yellow("!")} ${warning}`);

  const wroteStyles = files.some((f) => f.target.endsWith(".css") && (f.status === "create" || f.overwrite));
  if (css.manual.length > 0 && wroteStyles) {
    const where = config.css
      ? `${config.css} does not exist. Create it and add`
      : "No stylesheet is configured. Add to your main stylesheet";
    log(`\n${pc.yellow("!")} ${where}:`);
    for (const line of css.manual) log(`    ${line}`);
    log(
      pc.dim(
        `  (paths relative to the project root; set "tailwind.css" in components.json to wire this automatically)`,
      ),
    );
  }
  for (const note of setup.manual) log(`\n${pc.yellow("!")} ${note}`);
}

/** Exported names of an installed ui file, for the "import it like this" hint. */
export function importHint(config: ProjectConfig, item: RegistryItem): string | undefined {
  const file = item.files.find((f) => f.path.startsWith("ui/"));
  if (!file) return undefined;
  const expected = item.name.replace(/(^|-)([a-z0-9])/g, (_m, _s, c: string) => c.toUpperCase());
  const names = [...file.content.matchAll(/^export (?:function|const|class) (\w+)/gm)].map((m) => m[1]);
  const pick = names.find((n) => n.toLowerCase() === expected.toLowerCase()) ?? names[0];
  if (!pick) return undefined;
  const module = `${config.aliases.ui}/${file.path.slice(3).replace(/\.[cm]?[jt]sx?$/, "")}`;
  return `import { ${pick} } from "${module}";`;
}

/** Whether every file of an index item exists in the project. */
export function isInstalled(config: ProjectConfig, item: { files: { path: string }[] }): boolean {
  if (item.files.length === 0) return false;
  return item.files.every((file) => {
    if (!isSafeRegistryPath(file.path)) return false;
    return fs.existsSync(targetPath(config, { path: file.path, type: "registry:ui", content: "" }));
  });
}
