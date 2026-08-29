import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "../src/commands/build";
import { dev } from "../src/commands/dev";
import { preview } from "../src/commands/preview";
import { buildServerArgs, parsePort, resolveViteBin, runVite, ViteNotFoundError } from "../src/lib/vite-runner";

/**
 * Regression tests for the shell-injection defect.
 *
 * Nothing here executes a real payload. A fake spawn captures the executable
 * and the argv array, and the assertions prove that hostile input arrives as
 * one inert argument rather than as shell syntax.
 */

interface SpawnCall {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

type FakeChild = EventEmitter & { kill: ReturnType<typeof vi.fn>; closed?: boolean };

/** Every child created during a test, so the suite can close them afterwards. */
const liveChildren: FakeChild[] = [];

function makeFakeSpawn() {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];

  const spawnFn = vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ command, args, options });
    const child: FakeChild = Object.assign(new EventEmitter(), { kill: vi.fn() });
    children.push(child);
    liveChildren.push(child);
    return child as never;
  });

  return { calls, children, spawnFn: spawnFn as never };
}

// Closing the children lets the runner detach its signal forwarders, which
// keeps the suite from accumulating process listeners across tests.
afterEach(() => {
  for (const child of liveChildren.splice(0)) {
    if (!child.closed) {
      child.closed = true;
      child.emit("close", 0);
    }
  }
});

const FAKE_VITE = "/fake/node_modules/vite/bin/vite.js";
const resolveBin = () => FAKE_VITE;

/** Payloads that a shell would interpret but an argv array must not. */
const HOSTILE_HOSTS = [
  "$(touch /tmp/pwned)",
  "`touch /tmp/pwned`",
  "127.0.0.1; touch /tmp/pwned",
  "127.0.0.1 && touch /tmp/pwned",
  "127.0.0.1 | tee /tmp/pwned",
  "127.0.0.1 > /tmp/pwned",
  "host with spaces",
  "a&b",
  "$IFS$(id)",
  "'; rm -rf / #",
];

describe("vite-runner: no shell, ever", () => {
  it("never passes shell: true", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj" });
    expect(calls).toHaveLength(1);
    expect(calls[0].options.shell).toBe(false);
  });

  it("runs vite through the current Node executable, not a PATH lookup", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj" });
    expect(calls[0].command).toBe(process.execPath);
    expect(calls[0].args[0]).toBe(FAKE_VITE);
  });

  it("never invokes npx, which could download vite from the registry", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj" });
    expect(calls[0].command).not.toContain("npx");
    expect(calls[0].args.join(" ")).not.toContain("npx");
  });

  it("inherits stdio and preserves the working directory", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/some/project" });
    expect(calls[0].options.stdio).toBe("inherit");
    expect(calls[0].options.cwd).toBe("/some/project");
  });
});

describe("dev --host: hostile values stay inert arguments", () => {
  for (const host of HOSTILE_HOSTS) {
    it(`keeps ${JSON.stringify(host)} as exactly one argv element`, () => {
      const { calls, spawnFn } = makeFakeSpawn();
      dev({ host }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });

      const args = calls[0].args;
      // The payload is present verbatim, as its own element...
      expect(args).toContain(host);
      expect(args.filter((a) => a === host)).toHaveLength(1);
      // ...immediately after --host, and never merged into a command string.
      expect(args[args.indexOf("--host") + 1]).toBe(host);
      expect(calls[0].options.shell).toBe(false);
      // The executable is Node, so nothing can reinterpret the payload.
      expect(calls[0].command).toBe(process.execPath);
    });
  }

  it("does not execute a literal $(...) host", () => {
    const marker = path.join(os.tmpdir(), `sibujs-cli-should-not-exist-${process.pid}`);
    const { calls, spawnFn } = makeFakeSpawn();
    dev({ host: `$(node -e "require('fs').writeFileSync('${marker}','x')")` }, {
      spawnFn,
      resolveBin,
      cwd: "/proj",
      onClose: () => {},
    });
    expect(fs.existsSync(marker)).toBe(false);
    expect(calls[0].options.shell).toBe(false);
  });
});

describe("preview --host: hostile values stay inert arguments", () => {
  for (const host of HOSTILE_HOSTS.slice(0, 5)) {
    it(`keeps ${JSON.stringify(host)} as exactly one argv element`, () => {
      const { calls, spawnFn } = makeFakeSpawn();
      preview({ host }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
      const args = calls[0].args;
      expect(args[1]).toBe("preview");
      expect(args[args.indexOf("--host") + 1]).toBe(host);
      expect(calls[0].options.shell).toBe(false);
    });
  }
});

describe("port validation", () => {
  it.each([
    ["1", 1],
    ["80", 80],
    ["3000", 3000],
    ["65535", 65535],
    [3000, 3000],
  ])("accepts %s", (input, expected) => {
    expect(parsePort(input as string | number)).toBe(expected);
  });

  it.each([
    "0",
    "-1",
    "65536",
    "99999",
    "3000.5",
    "NaN",
    "",
    " ",
    "abc",
    "3000abc",
    "3000 ",
    " 3000",
    "+3000",
    "0x1f90",
    "1e4",
    "3000;rm -rf /",
    "$(id)",
    "3000|whoami",
    "8080&&touch /tmp/pwned",
  ])("rejects %j", (input) => {
    expect(parsePort(input)).toBeNull();
  });

  it("rejects a malicious port before anything is spawned", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    const onInvalid = vi.fn(() => {
      throw new Error("invalid port");
    });
    expect(() => buildServerArgs({ port: "3000; touch /tmp/pwned" }, onInvalid as never)).toThrow("invalid port");
    expect(onInvalid).toHaveBeenCalledWith("3000; touch /tmp/pwned");
    expect(calls).toHaveLength(0);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("forwards a valid port as its own argument", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    dev({ port: 4321 }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    const args = calls[0].args;
    expect(args[args.indexOf("--port") + 1]).toBe("4321");
  });
});

describe("argument forwarding is preserved", () => {
  it("dev with no options", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    dev({}, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE]);
  });

  it("dev --host (bare) stays a flag with no value", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    dev({ host: true }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "--host"]);
  });

  it("dev --host <address>", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    dev({ host: "0.0.0.0" }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "--host", "0.0.0.0"]);
  });

  it("dev --port and --host together", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    dev({ port: 3000, host: "::1" }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "--port", "3000", "--host", "::1"]);
  });

  it("accepts valid IPv4, IPv6, hostname and wildcard hosts unchanged", () => {
    for (const host of ["127.0.0.1", "0.0.0.0", "::1", "::", "localhost", "my-host.local", "true"]) {
      const { calls, spawnFn } = makeFakeSpawn();
      dev({ host }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
      expect(calls[0].args).toEqual([FAKE_VITE, "--host", host]);
    }
  });

  it("preview --host (bare)", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    preview({ host: true }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "preview", "--host"]);
  });

  it("preview --port", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    preview({ port: 5000 }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "preview", "--port", "5000"]);
  });

  it("build", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    build({}, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "build"]);
  });

  it("build --ssr", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    build({ ssr: true }, { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    expect(calls[0].args).toEqual([FAKE_VITE, "build", "--ssr"]);
  });
});

describe("exit-code propagation and signal forwarding", () => {
  it("propagates the child's exit code", () => {
    const { children, spawnFn } = makeFakeSpawn();
    const onClose = vi.fn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj", onClose });
    children[0].emit("close", 3);
    expect(onClose).toHaveBeenCalledWith(3);
  });

  it("treats a null exit code as 0", () => {
    const { children, spawnFn } = makeFakeSpawn();
    const onClose = vi.fn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj", onClose });
    children[0].emit("close", null);
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it("forwards SIGINT and SIGTERM to the child when requested", () => {
    const { children, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj", forwardSignals: true, onClose: () => {} });
    process.emit("SIGINT");
    process.emit("SIGTERM");
    expect(children[0].kill).toHaveBeenCalledWith("SIGINT");
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not register signal handlers when not requested", () => {
    const { children, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj", onClose: () => {} });
    process.emit("SIGINT");
    expect(children[0].kill).not.toHaveBeenCalled();
  });

  it("detaches its signal handlers once the child closes", () => {
    const before = process.listenerCount("SIGINT");
    const { children, spawnFn } = makeFakeSpawn();
    runVite(["build"], { spawnFn, resolveBin, cwd: "/proj", forwardSignals: true, onClose: () => {} });
    expect(process.listenerCount("SIGINT")).toBe(before + 1);
    children[0].emit("close", 0);
    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});

describe("invalid ports at the CLI boundary", () => {
  const CLI = path.resolve(__dirname, "..", "dist", "index.js");
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-port-"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "port-fixture" }));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function runDev(args: string[]) {
    try {
      execFileSync(process.execPath, [CLI, "dev", ...args], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output: "" };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  it.each([
    "--port=0",
    "--port=-1",
    "--port=65536",
    "--port=99999",
    "--port=3000.5",
    "--port=abc",
    "--port=3000;rm -rf /",
    "--port=$(id)",
  ])("rejects %s with a clear message and no stack trace", (arg) => {
    const result = runDev([arg]);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Invalid --port");
    expect(result.output).not.toContain("at Object.");
  });

  it("rejects a separated negative port without crashing", () => {
    // cac reads `-1` as an unknown flag before the command runs; that must
    // still be a clean message rather than an unhandled CACError stack.
    const result = runDev(["--port", "-1"]);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Unknown option");
    expect(result.output).not.toContain("at Command.checkUnknownOptions");
  });
});

describe("missing local vite", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-novite-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "no-vite" }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolveViteBin throws ViteNotFoundError", () => {
    expect(() => resolveViteBin(tmpDir)).toThrow(ViteNotFoundError);
  });

  it("runVite reports an actionable error, spawns nothing and yields a nonzero code", () => {
    const { calls, spawnFn } = makeFakeSpawn();
    const onClose = vi.fn();
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
      errors.push(String(msg));
    });

    const child = runVite(["build"], { spawnFn, cwd: tmpDir, onClose });

    spy.mockRestore();
    expect(child).toBeNull();
    expect(calls).toHaveLength(0);
    expect(onClose).toHaveBeenCalledWith(1);
    const output = errors.join("\n");
    expect(output).toContain("Could not find Vite");
    expect(output).toContain("npm install --save-dev vite");
  });

  it("resolves a real vite installation from a project directory", () => {
    // This repository has no vite; the sibling docs site does. Resolution is
    // package-based, so it must work from that project's directory.
    const sibling = path.resolve(__dirname, "..", "..", "sibujs-web");
    if (!fs.existsSync(path.join(sibling, "node_modules", "vite"))) {
      // Nothing to assert against in this checkout.
      expect(true).toBe(true);
      return;
    }
    const bin = resolveViteBin(sibling);
    expect(fs.existsSync(bin)).toBe(true);
    expect(bin.replace(/\\/g, "/")).toContain("/vite/");
    // Never the platform-specific shim, which needs a shell on Windows.
    expect(bin.endsWith(".CMD")).toBe(false);
    expect(bin.endsWith(".cmd")).toBe(false);
  });
});
