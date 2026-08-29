import pc from "picocolors";
import { buildServerArgs, type RunViteOptions, runVite } from "../lib/vite-runner.js";

export interface DevOptions {
  port?: number | string;
  /** String when `--host <addr>` is used, true when bare `--host` is used */
  host?: string | boolean;
}

export function dev(options: DevOptions, runnerOptions: RunViteOptions = {}) {
  const args = buildServerArgs(options, (value) => {
    console.error(`${pc.red("✖")} Invalid --port ${pc.yellow(JSON.stringify(value))}.`);
    console.error(`  Expected a whole number between 1 and 65535.`);
    process.exit(1);
  });

  console.log(`${pc.cyan("sibujs")} ${pc.dim("starting dev server...")}\n`);

  return runVite(args, {
    forwardSignals: true,
    onClose: (code) => process.exit(code),
    ...runnerOptions,
  });
}
