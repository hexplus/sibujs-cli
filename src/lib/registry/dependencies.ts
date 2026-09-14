import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";
import { isSafeDependencySpec, splitDependency } from "./schema.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const PACKAGE_MANAGERS = new Set<string>(["npm", "pnpm", "yarn", "bun"]);
const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

/**
 * The package manager the project is managed with: the nearest `packageManager`
 * field or lockfile, walking up to the repository root so a package inside a
 * pnpm or yarn workspace uses the workspace's tool. npm is the fallback.
 */
export function detectProjectPackageManager(root: string): PackageManager {
  let dir = path.resolve(root);
  for (;;) {
    const pkgFile = path.join(dir, "package.json");
    if (fs.existsSync(pkgFile)) {
      try {
        const field = (JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as { packageManager?: unknown }).packageManager;
        const name = typeof field === "string" ? field.split("@")[0] : "";
        if (PACKAGE_MANAGERS.has(name)) return name as PackageManager;
      } catch {
        // An unreadable package.json is not a signal either way.
      }
    }
    for (const [file, pm] of LOCKFILES) {
      if (fs.existsSync(path.join(dir, file))) return pm;
    }
    const parent = path.dirname(dir);
    if (parent === dir || fs.existsSync(path.join(dir, ".git"))) return "npm";
    dir = parent;
  }
}

export function readPackageJson(root: string): Record<string, any> | null {
  const file = path.join(root, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    throw new CliError(`package.json is not valid JSON: ${(error as Error).message}`);
  }
}

export function declaredDependencies(root: string): Map<string, string> {
  const pkg = readPackageJson(root) ?? {};
  return new Map(
    Object.entries({ ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies }).map(([k, v]) => [
      k,
      String(v),
    ]),
  );
}

export interface DependencyPlan {
  pm: PackageManager;
  dependencies: string[];
  devDependencies: string[];
  /** Printable commands, one per dependency kind. */
  commands: { args: string[]; display: string }[];
}

/** Packages the items import that package.json does not declare yet. */
export function planDependencies(
  root: string,
  wanted: { dependencies: string[]; devDependencies: string[] },
): DependencyPlan {
  const declared = declaredDependencies(root);
  const collect = (specs: string[], exclude: Set<string>) => {
    const byName = new Map<string, string>();
    for (const spec of specs) {
      if (!isSafeDependencySpec(spec))
        throw new CliError(`Refusing to install invalid package spec ${JSON.stringify(spec)}.`);
      const [name] = splitDependency(spec);
      if (!declared.has(name) && !exclude.has(name) && !byName.has(name)) byName.set(name, spec);
    }
    return [...byName.values()];
  };
  const dependencies = collect(wanted.dependencies, new Set());
  const devDependencies = collect(wanted.devDependencies, new Set(dependencies.map((d) => splitDependency(d)[0])));

  const pm = detectProjectPackageManager(root);
  const add = pm === "npm" ? "install" : "add";
  const commands: DependencyPlan["commands"] = [];
  const quote = (arg: string) => (/[\s<>|&^]/.test(arg) ? `"${arg}"` : arg);
  for (const [specs, flags] of [
    [dependencies, []],
    [devDependencies, ["-D"]],
  ] as const) {
    if (specs.length === 0) continue;
    const args = [add, ...flags, ...specs];
    commands.push({ args, display: `${pm} ${args.map(quote).join(" ")}` });
  }
  return { pm, dependencies, devDependencies, commands };
}

/**
 * Run the planned install commands in the project. Returns the commands that
 * failed. Every spec was validated against a character allowlist that excludes
 * shell metacharacters, which matters on Windows, where package managers are
 * `.cmd` shims that can only be started through a shell.
 */
export function runDependencyInstall(root: string, plan: DependencyPlan, log: (line: string) => void): string[] {
  const failures: string[] = [];
  for (const command of plan.commands) {
    log(`$ ${command.display}`);
    const result =
      process.platform === "win32"
        ? spawnSync([plan.pm, ...command.args.map((a) => `"${a}"`)].join(" "), {
            cwd: root,
            stdio: "inherit",
            shell: true,
          })
        : spawnSync(plan.pm, command.args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) {
      failures.push(`${command.display} (${result.error ? result.error.message : `exit code ${result.status}`})`);
    }
  }
  return failures;
}
