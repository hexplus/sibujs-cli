import { spawn } from "node:child_process";
import pc from "picocolors";

export interface PreviewOptions {
  port?: number;
  /** String when `--host <addr>` is used, true when bare `--host` is used */
  host?: string | boolean;
}

export function preview(options: PreviewOptions) {
  const args = ["vite", "preview"];
  if (options.port) args.push("--port", String(options.port));
  if (options.host === true) {
    args.push("--host");
  } else if (options.host) {
    args.push("--host", options.host);
  }

  console.log(`${pc.cyan("sibujs")} ${pc.dim("previewing production build...")}\n`);

  const child = spawn("npx", args, {
    stdio: "inherit",
    cwd: process.cwd(),
    shell: true,
  });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}
