import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pc from "picocolors";

/**
 * Locating and running the project's own Vite.
 *
 * Vite is never launched through a shell. Every argument — including the
 * user-supplied `--host` and `--port` — is passed as a distinct element of an
 * argv array, so shell metacharacters (`;`, `&`, `|`, `$(...)`, backticks,
 * redirection, spaces) reach Vite as inert text instead of being interpreted as
 * commands.
 *
 * Vite is also never fetched on demand. The previous implementation ran
 * `npx vite`, which silently downloads Vite from the registry when the project
 * does not have it — arbitrary remote code, pulled in by a dev command. Only a
 * Vite already installed in the project is used.
 */

/** Maximum TCP port. */
const MAX_PORT = 65535;

export class ViteNotFoundError extends Error {
  constructor(readonly cwd: string) {
    super(`Could not find a local Vite installation in ${cwd}`);
    this.name = "ViteNotFoundError";
  }
}

/**
 * Absolute path to the project-local Vite CLI entry point.
 *
 * Resolution is package-based rather than path-based: guessing
 * `node_modules/.bin/vite` breaks on Windows (where the entry is `vite.CMD`, a
 * batch file that only a shell can execute) and misses pnpm/Yarn layouts and
 * hoisted monorepo installs. Node's own resolver handles all of those.
 *
 * @throws {ViteNotFoundError} when the project has no Vite installed.
 */
export function resolveViteBin(cwd: string = process.cwd()): string {
  // Resolve as the project would, not as this CLI would: a globally installed
  // sibujs-cli must still find the Vite sitting next to the user's app.
  const require = createRequire(path.join(path.resolve(cwd), "package.json"));

  // Preferred: read the package manifest and honour its declared `bin`.
  try {
    const manifestPath = require.resolve("vite/package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const relBin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.vite;
    if (relBin) {
      const binPath = path.join(path.dirname(manifestPath), relBin);
      if (fs.existsSync(binPath)) return binPath;
    }
  } catch {
    // Falls through to the entry-point strategy below.
  }

  // Fallback for packages whose `exports` map hides ./package.json: resolve the
  // main entry and walk up to the package root.
  try {
    let dir = path.dirname(require.resolve("vite"));
    for (let depth = 0; depth < 10; depth++) {
      const candidate = path.join(dir, "package.json");
      if (fs.existsSync(candidate)) {
        const manifest = JSON.parse(fs.readFileSync(candidate, "utf-8")) as {
          name?: string;
          bin?: string | Record<string, string>;
        };
        if (manifest.name === "vite") {
          const relBin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.vite;
          if (relBin) {
            const binPath = path.join(dir, relBin);
            if (fs.existsSync(binPath)) return binPath;
          }
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Falls through to the error below.
  }

  throw new ViteNotFoundError(path.resolve(cwd));
}

/**
 * Parse and validate a `--port` value.
 *
 * Accepts only a plain base-10 integer in 1-65535. Rejects empty strings,
 * `0`, negatives, decimals, `NaN`, out-of-range values, and anything carrying
 * extra characters (`8080;rm -rf /`, `8080 `, `0x1f90`, `1e4`, `+8080`).
 *
 * @returns the port number, or `null` when the value is not a valid port.
 */
export function parsePort(value: string | number): number | null {
  const raw = typeof value === "number" ? String(value) : value;
  // Deliberately strict: no sign, no whitespace, no separators, digits only.
  if (!/^[0-9]+$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isInteger(port)) return null;
  if (port < 1 || port > MAX_PORT) return null;
  return port;
}

/** Message shown when Vite cannot be found, kept next to the error it explains. */
export function viteNotFoundMessage(cwd: string): string {
  return [
    `${pc.red("✖")} Could not find Vite in this project.`,
    "",
    `  Looked for a local ${pc.cyan("vite")} package from ${pc.dim(cwd)}.`,
    "",
    "  Install it, then try again:",
    `    ${pc.cyan("npm install --save-dev vite")}`,
    "",
    `  ${pc.dim("sibujs never downloads Vite on the fly — the version your project")}`,
    `  ${pc.dim("builds with must be one you have declared and locked.")}`,
  ].join("\n");
}

export interface RunViteOptions {
  /** Working directory for the child. Defaults to the current directory. */
  cwd?: string;
  /** Forward SIGINT/SIGTERM to the child. */
  forwardSignals?: boolean;
  /** Called with the child's exit code once it closes. */
  onClose?: (code: number) => void;
  /** Injection seam for tests. Defaults to `child_process.spawn`. */
  spawnFn?: typeof spawn;
  /** Injection seam for tests. Defaults to `resolveViteBin`. */
  resolveBin?: (cwd: string) => string;
}

/**
 * Run the project's Vite with `args`, without a shell.
 *
 * The child is started as `process.execPath <vite-bin> ...args` so the same
 * Node that runs this CLI runs Vite. That avoids depending on a PATH lookup, on
 * executable bits, and on Windows shim resolution.
 */
export function runVite(args: string[], options: RunViteOptions = {}): ChildProcess | null {
  const cwd = options.cwd ?? process.cwd();
  const spawnImpl = options.spawnFn ?? spawn;
  const resolve = options.resolveBin ?? resolveViteBin;

  let viteBin: string;
  try {
    viteBin = resolve(cwd);
  } catch {
    console.error(viteNotFoundMessage(path.resolve(cwd)));
    options.onClose?.(1);
    return null;
  }

  const child = spawnImpl(process.execPath, [viteBin, ...args], {
    stdio: "inherit",
    cwd,
    // No shell. Arguments stay arguments.
    shell: false,
  });

  // Handlers are detached once the child is gone, so a long-lived host process
  // (or a test suite) does not accumulate one pair per invocation.
  const forwarders: Array<[NodeJS.Signals, () => void]> = [];
  if (options.forwardSignals) {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      const forward = () => {
        child.kill(signal);
      };
      forwarders.push([signal, forward]);
      process.on(signal, forward);
    }
  }

  child.on("close", (code) => {
    for (const [signal, forward] of forwarders) process.off(signal, forward);
    options.onClose?.(code ?? 0);
  });

  return child;
}

/**
 * Build the `--host` / `--port` argv shared by `dev` and `preview`.
 *
 * `host` is passed through verbatim as a single argv element: Vite decides what
 * is a valid interface, and no value of it can become executable syntax here.
 * An invalid port is a hard failure rather than something quietly dropped.
 */
export function buildServerArgs(
  options: { port?: number | string; host?: string | boolean },
  onInvalidPort: (value: string) => never,
): string[] {
  const args: string[] = [];

  if (options.port !== undefined && options.port !== null && options.port !== "") {
    const port = parsePort(options.port);
    if (port === null) onInvalidPort(String(options.port));
    args.push("--port", String(port));
  }

  if (options.host === true) {
    args.push("--host");
  } else if (typeof options.host === "string" && options.host.length > 0) {
    args.push("--host", options.host);
  }

  return args;
}
