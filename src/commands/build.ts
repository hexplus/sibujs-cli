import pc from "picocolors";
import { type RunViteOptions, runVite } from "../lib/vite-runner.js";

export interface BuildOptions {
  ssr?: boolean;
}

export function build(options: BuildOptions, runnerOptions: RunViteOptions = {}) {
  const args = ["build"];
  if (options.ssr) args.push("--ssr");

  console.log(`${pc.cyan("sibujs")} ${pc.dim("building for production...")}\n`);

  return runVite(args, {
    onClose: (code) => {
      if (code === 0) {
        console.log(`\n${pc.green("✔")} Build complete.`);
      } else {
        console.error(`\n${pc.red("✖")} Build failed.`);
      }
      process.exit(code === 0 ? 0 : (code ?? 1));
    },
    ...runnerOptions,
  });
}
