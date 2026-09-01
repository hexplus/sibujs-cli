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

cli.help();
cli.version("1.4.1");

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
