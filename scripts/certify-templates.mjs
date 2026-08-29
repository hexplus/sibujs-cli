#!/usr/bin/env node
/**
 * Generated-project certification.
 *
 * Scaffolds every supported flag combination into a throwaway directory,
 * installs its dependencies, and then runs the same gates a user would:
 * TypeScript checking, the project's own lint script, and a production build.
 *
 * This is deliberately separate from `npm test`: it installs from the registry
 * and runs real builds, so it is slow and needs network access. The unit suite
 * must stay hermetic.
 *
 *   node scripts/certify-templates.mjs            # all combinations
 *   node scripts/certify-templates.mjs --only ui  # one, by name
 *   node scripts/certify-templates.mjs --keep     # leave the temp dir behind
 *
 * The generated package.json pins `sibujs-cli` at this package's own version,
 * which is not on the registry until release. Certification therefore packs the
 * local CLI and installs that tarball, which also exercises the published file
 * list rather than the working tree.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "index.js");

const COMBINATIONS = [
  { name: "plain", flags: [] },
  { name: "tailwind", flags: ["--tailwind"] },
  { name: "router", flags: ["--router"] },
  { name: "ui", flags: ["--ui", "blue"] },
  { name: "ui-router", flags: ["--ui", "violet", "--router"] },
];

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const keep = argv.includes("--keep");

const REQUIRED_NODE = [22, 12, 0];

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const [rMajor, rMinor] = REQUIRED_NODE;
  if (major > rMajor || (major === rMajor && minor >= rMinor)) return;
  console.error(
    `This certification needs Node >= ${REQUIRED_NODE.join(".")} (running ${process.versions.node}).\n` +
      "Vite 8 skips its native bundler binding below that, and the build fails with an unrelated error.",
  );
  process.exit(1);
}

function run(command, args, cwd, label) {
  try {
    const stdout = execFileSync(command, args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
    });
    return { ok: true, output: stdout };
  } catch (err) {
    return {
      ok: false,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}` || String(err),
      label,
    };
  }
}

/**
 * How to invoke npm without a shell.
 *
 * On Windows `npm` is a `.cmd` shim, and since Node 20 `execFile` refuses to
 * run batch files without a shell. Rather than reach for `shell: true` — the
 * very thing this task removed from the product code — npm's own JS entry point
 * is run with the current Node. `npm_execpath` is set when this script is
 * invoked through an npm script; otherwise it is resolved next to the Node
 * binary, with a last-resort fall back to the plain command name on POSIX.
 */
function resolveNpm() {
  const execpath = process.env.npm_execpath;
  if (execpath?.endsWith(".js") && fs.existsSync(execpath)) {
    return { command: process.execPath, prefix: [execpath] };
  }
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { command: process.execPath, prefix: [candidate] };
  }
  if (process.platform !== "win32") return { command: "npm", prefix: [] };
  throw new Error("Could not locate npm-cli.js to run npm without a shell.");
}

const NPM = resolveNpm();

/** Run an npm subcommand in `cwd`. */
function npm(args, cwd, label) {
  return run(NPM.command, [...NPM.prefix, ...args], cwd, label);
}

function packLocalCli(tmpRoot) {
  const result = execFileSync(NPM.command, [...NPM.prefix, "pack", "--pack-destination", tmpRoot], {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const file = result.trim().split("\n").pop().trim();
  return path.join(tmpRoot, file);
}

function assertNoPlaceholders(dir, failures) {
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      let text;
      try {
        text = fs.readFileSync(p, "utf-8");
      } catch {
        continue;
      }
      const match = text.match(/\{\{[A-Z_]+\}\}/);
      if (match) failures.push(`unresolved placeholder ${match[0]} in ${path.relative(dir, p)}`);
    }
  };
  walk(dir);
}

function certify(combo, tmpRoot, tarball) {
  const projectDir = path.join(tmpRoot, combo.name);
  const failures = [];
  const steps = [];

  const record = (label, result) => {
    steps.push(`${result.ok ? "ok  " : "FAIL"} ${label}`);
    if (!result.ok) failures.push(`${label}:\n${result.output.slice(-1500)}`);
    return result.ok;
  };

  // 1. Scaffold into an isolated directory. The CLI creates it; nothing outside
  //    tmpRoot is touched.
  const created = run(process.execPath, [CLI, "create", combo.name, ...combo.flags], tmpRoot, "create");
  if (!record("scaffold", created)) return { combo, failures, steps };

  // 2. The generated manifest must be valid JSON with the expected shape.
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf-8"));
    if (!pkg.name) failures.push("generated package.json has no name");
    if (!pkg.dependencies?.sibujs) failures.push("generated package.json does not depend on sibujs");
    steps.push("ok   package.json parses");
  } catch (err) {
    failures.push(`generated package.json is not valid JSON: ${err.message}`);
    return { combo, failures, steps };
  }

  // 3. No template placeholder may survive into a generated project.
  const before = failures.length;
  assertNoPlaceholders(projectDir, failures);
  steps.push(failures.length === before ? "ok   no placeholders" : "FAIL no placeholders");

  // 4. Install, substituting the packed local CLI for the unpublished version.
  pkg.devDependencies["sibujs-cli"] = `file:${tarball.replace(/\\/g, "/")}`;
  fs.writeFileSync(path.join(projectDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  if (!record("npm install", npm(["install", "--no-audit", "--no-fund"], projectDir, "install"))) {
    return { combo, failures, steps };
  }

  // 5-7. The gates a user would run.
  record("tsc --noEmit", run(process.execPath, [path.join(projectDir, "node_modules", "typescript", "bin", "tsc"), "--noEmit"], projectDir, "typecheck"));
  record("sibujs lint", npm(["run", "lint"], projectDir, "lint"));
  const built = record("npm run build", npm(["run", "build"], projectDir, "build"));

  // 8. The build must actually have produced something.
  if (built) {
    const indexHtml = path.join(projectDir, "dist", "index.html");
    const assetsDir = path.join(projectDir, "dist", "assets");
    if (!fs.existsSync(indexHtml)) failures.push("dist/index.html was not produced");
    if (!fs.existsSync(assetsDir) || fs.readdirSync(assetsDir).length === 0) {
      failures.push("dist/assets is missing or empty");
    }
    steps.push("ok   build output present");
  }

  return { combo, failures, steps };
}

function main() {
  checkNode();

  if (!fs.existsSync(CLI)) {
    console.error(`Built CLI not found at ${CLI}. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-certify-"));
  let exitCode = 0;

  try {
    const tarball = packLocalCli(tmpRoot);
    console.log(`Packed local CLI: ${path.basename(tarball)}`);
    console.log(`Workspace: ${tmpRoot}\n`);

    const selected = only ? COMBINATIONS.filter((c) => c.name === only) : COMBINATIONS;
    if (selected.length === 0) {
      console.error(`Unknown combination "${only}". Known: ${COMBINATIONS.map((c) => c.name).join(", ")}`);
      process.exit(1);
    }

    const results = [];
    for (const combo of selected) {
      const label = combo.flags.length ? combo.flags.join(" ") : "(no flags)";
      console.log(`── ${combo.name}  ${label}`);
      const result = certify(combo, tmpRoot, tarball);
      for (const step of result.steps) console.log(`   ${step}`);
      if (result.failures.length > 0) {
        exitCode = 1;
        for (const failure of result.failures) console.log(`   ! ${failure}`);
      }
      console.log();
      results.push(result);
    }

    console.log("─".repeat(60));
    for (const r of results) {
      console.log(`  ${r.failures.length === 0 ? "PASS" : "FAIL"}  ${r.combo.name}`);
    }
    console.log(exitCode === 0 ? "\nAll combinations certified." : "\nCertification failed.");
  } finally {
    // Always clean up, including on failure.
    if (keep) {
      console.log(`\nWorkspace kept at ${tmpRoot}`);
    } else {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  process.exit(exitCode);
}

main();
