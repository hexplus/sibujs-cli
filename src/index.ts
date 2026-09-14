import cac from "cac";
import pc from "picocolors";

const cli = cac("sibujs");

cli
  .command("create [name]", "Create a new Sibu project")
  .option(
    "--ui [theme]",
    "Add sibujs-ui with a theme color (default, blue, green, red, orange, amber, yellow, teal, purple, violet, rose)",
  )
  .option("--router", "Add routing with example pages")
  .option("--tailwind", "Add Tailwind CSS without sibujs-ui")
  .action(async (name?: string, options?: { tailwind?: boolean; ui?: string; router?: boolean }) => {
    const { create } = await import("./commands/create.js");
    await create(name, { tailwind: options?.tailwind, ui: options?.ui, router: options?.router });
  });

cli
  .command("generate <type> <name>", "Generate a component")
  .alias("g")
  .action(async (type: string, name: string) => {
    const { generate } = await import("./commands/generate.js");
    generate(type, name);
  });

cli
  .command("dev", "Start Vite dev server")
  .option("--port <port>", "Port number")
  .option("--host [host]", "Host address")
  .action(async (options: { port?: number | string; host?: string | boolean }) => {
    const { dev } = await import("./commands/dev.js");
    dev(options);
  });

cli
  .command("build", "Build for production")
  .option("--ssr", "Build for server-side rendering")
  .action(async (options: { ssr?: boolean }) => {
    const { build } = await import("./commands/build.js");
    build(options);
  });

cli
  .command("preview", "Preview production build locally")
  .option("--port <port>", "Port number")
  .option("--host [host]", "Host address")
  .action(async (options: { port?: number | string; host?: string | boolean }) => {
    const { preview } = await import("./commands/preview.js");
    preview(options);
  });

cli
  .command("lint [...files]", "Lint source files for Sibu best practices")
  .option("--warn-only", "Report findings but exit 0 (default: violations fail the command)")
  .action(async (files: string[], options?: { warnOnly?: boolean }) => {
    const { lint } = await import("./commands/lint.js");
    lint(files, { warnOnly: options?.warnOnly });
  });

cli.command("analyze", "Analyze Sibu bundle size impact").action(async () => {
  const { analyze } = await import("./commands/analyze.js");
  analyze();
});

/** Run a registry command, printing actionable failures without a stack trace. */
async function runRegistryCommand(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    const { CliError } = await import("./lib/registry/errors.js");
    if (error instanceof CliError) {
      console.error(`\n${pc.red("✖")} ${error.message}`);
      if (error.hint) console.error(pc.dim(error.hint.replace(/^/gm, "  ")));
    } else {
      console.error(`\n${pc.red("✖")} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
    process.exit(1);
  }
}

cli
  .command("init", "Set up a project for sibujs-ui components (components.json, Tailwind, aliases, cn)")
  .option("--style <name>", "Color theme: default, blue, green, red, orange, amber, yellow, teal, purple, violet, rose")
  .option("--css <file>", "Project stylesheet to add the style @imports to (default: detected, or src/app.css)")
  .option("--force", "Regenerate components.json even if it exists")
  .option("--overwrite", "Replace base files that exist and differ")
  .option("-y, --yes", "Use defaults and never prompt")
  .option("--dry-run", "Show what would be written, write nothing")
  .option("--no-install", "Print the package install command instead of running it")
  .option("--registry <source>", "Registry directory or URL (default: the sibujs-ui registry on unpkg)")
  .option("--cwd <dir>", "Project directory (default: current directory)")
  .example("sibujs init")
  .example("sibujs init --style violet --yes")
  .example("sibujs init --registry ../sibujs-ui/dist/registry")
  .action((options: Record<string, any>) =>
    runRegistryCommand(async () => {
      const { init } = await import("./commands/init.js");
      await init({
        cwd: options.cwd,
        style: options.style,
        css: options.css,
        registry: options.registry,
        force: options.force,
        overwrite: options.overwrite,
        yes: options.yes,
        dryRun: options.dryRun,
        install: options.install,
      });
    }),
  );

cli
  .command("add [...components]", "Copy sibujs-ui components and their dependencies into the project")
  .option("--all", "Add every component in the registry")
  .option("--overwrite", "Replace files that exist and differ (default: ask, or skip when not interactive)")
  .option("-y, --yes", "Never prompt: skip conflicting files, create components.json with defaults if missing")
  .option("-p, --path <dir>", "Install components into this directory instead of paths.ui")
  .option("--dry-run", "Show what would be written, write nothing")
  .option("--no-install", "Print the package install command instead of running it")
  .option("--registry <source>", "Registry directory or URL (default: components.json, then the sibujs-ui registry)")
  .option("--cwd <dir>", "Project directory (default: current directory)")
  .example("sibujs add button")
  .example("sibujs add dialog dropdown-menu --dry-run")
  .example("sibujs add card --overwrite")
  .action((components: string[], options: Record<string, any>) =>
    runRegistryCommand(async () => {
      const { add } = await import("./commands/add.js");
      await add(components, {
        cwd: options.cwd,
        registry: options.registry,
        all: options.all,
        overwrite: options.overwrite,
        yes: options.yes,
        path: options.path,
        dryRun: options.dryRun,
        install: options.install,
      });
    }),
  );

cli
  .command("list", "List the components available in the registry")
  .alias("ls")
  .option("--type <type>", "Only one kind: ui, lib, style, theme (default: all)")
  .option("--json", "Print machine-readable JSON")
  .option("--registry <source>", "Registry directory or URL")
  .option("--cwd <dir>", "Project directory (default: current directory)")
  .example("sibujs list --type ui")
  .action((options: Record<string, any>) =>
    runRegistryCommand(async () => {
      const { list } = await import("./commands/list.js");
      await list({ cwd: options.cwd, registry: options.registry, type: options.type, json: options.json });
    }),
  );

cli.help();
cli.version("1.5.0");

cli.on("command:*", () => {
  console.error(pc.red(`Unknown command: ${cli.args.join(" ")}`));
  cli.outputHelp();
  process.exit(1);
});

try {
  cli.parse();
} catch (error) {
  // An argument-parsing failure is a user error, not a crash. `--port -1`, for
  // example, is read as an unknown `-1` flag before any command runs; printing
  // a stack trace for that helps nobody.
  console.error(`${pc.red("✖")} ${error instanceof Error ? error.message : String(error)}`);
  console.error(`  ${pc.dim("Run `sibujs --help` to see the available commands and options.")}`);
  process.exit(1);
}
