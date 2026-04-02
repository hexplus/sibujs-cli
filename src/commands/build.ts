import { spawn } from "node:child_process";
import pc from "picocolors";

export interface BuildOptions {
  ssr?: boolean;
}

export function build(options: BuildOptions) {
  const args = ["vite", "build"];
  if (options.ssr) args.push("--ssr");

  console.log(`${pc.cyan("sibujs")} ${pc.dim("building for production...")}\n`);

  const child = spawn("npx", args, {
    stdio: "inherit",
    cwd: process.cwd(),
    shell: true,
  });

  child.on("close", (code) => {
    if (code === 0) {
      console.log(`\n${pc.green("✔")} Build complete.`);
    } else {
      console.error(`\n${pc.red("✖")} Build failed.`);
    }
    process.exit(code ?? 1);
  });
}
