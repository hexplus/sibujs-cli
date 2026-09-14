import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { add } from "../src/commands/add";
import { init } from "../src/commands/init";
import { list } from "../src/commands/list";
import { CliError } from "../src/lib/registry/errors";
import { exists, FIXTURE_ITEMS, read, tempDir, writeProject, writeRegistry } from "./helpers/registry-fixture";

let tmp: string;
let root: string;
let registry: string;
let lines: string[];
const log = (line: string) => lines.push(line);
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI colors
const output = () => lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");

/** Every file under the project, for "nothing was written" assertions. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, file)] = fs.readFileSync(file, "utf-8");
  }
  return out;
}

beforeEach(() => {
  tmp = tempDir();
  root = writeProject(path.join(tmp, "app"));
  registry = writeRegistry(path.join(tmp, "registry"));
  lines = [];
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const base = () => ({ cwd: root, registry, install: false, yes: true });

describe("sibujs init", () => {
  it("writes components.json, wires Tailwind, the alias and the stylesheet, and installs base + utils", async () => {
    await init({ ...base(), style: "blue" }, { log });

    const config = JSON.parse(read(root, "components.json"));
    expect(config).toMatchObject({
      style: "blue",
      tailwind: { version: 4, css: "src/app.css" },
      aliases: { components: "@/components", ui: "@/components/ui", utils: "@/lib/utils", lib: "@/lib" },
      paths: { ui: "src/components/ui", lib: "src/lib", styles: "src/styles/sibujs-ui" },
      registry: "../registry",
    });
    expect(JSON.parse(read(root, "tsconfig.json")).compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
    expect(read(root, "vite.config.ts")).toContain('import tailwindcss from "@tailwindcss/vite";');
    expect(read(root, "vite.config.ts")).toContain("plugins: [tailwindcss()]");
    expect(read(root, "vite.config.ts")).toContain('alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }');
    expect(read(root, "src/app.css")).toBe(
      '@import "tailwindcss";\n@import "./styles/sibujs-ui/base.css";\n@import "./styles/sibujs-ui/default.css";\n@import "./styles/sibujs-ui/themes/blue.css";\n\nbody { margin: 0; }\n',
    );
    expect(exists(root, "src/lib/utils.ts")).toBe(true);
    expect(exists(root, "src/styles/sibujs-ui/themes/blue.css")).toBe(true);
    expect(output()).toContain('npm install "tailwindcss@^4" "@tailwindcss/vite@^4" "clsx@^2.1.1" "tailwind-merge@^3.0.1"');
  });

  it("is idempotent", async () => {
    await init(base(), { log });
    const before = snapshot(root);
    lines = [];
    await init(base(), { log });
    expect(snapshot(root)).toEqual(before);
    expect(output()).toContain("components.json exists; keeping it");
  });

  it("writes nothing on --dry-run", async () => {
    const before = snapshot(root);
    await init({ ...base(), dryRun: true }, { log });
    expect(snapshot(root)).toEqual(before);
    expect(output()).toContain("would create components.json");
    expect(output()).toContain("would write src/lib/utils.ts");
  });

  it("creates and imports a stylesheet when the project has none", async () => {
    fs.rmSync(path.join(root, "src/app.css"));
    fs.writeFileSync(path.join(root, "src/main.ts"), 'import { mount } from "sibujs";\n');
    await init(base(), { log });
    expect(read(root, "src/app.css")).toMatch(/^@import "tailwindcss";\n@import "\.\/styles\/sibujs-ui\/base\.css";/);
    expect(read(root, "src/main.ts")).toBe('import { mount } from "sibujs";\nimport "./app.css";\n');
  });

  it("rejects an unknown style and a folder without package.json", async () => {
    await expect(init({ ...base(), style: "neon" }, { log })).rejects.toThrow(/Unknown style "neon"/);
    fs.rmSync(path.join(root, "package.json"));
    await expect(init(base(), { log })).rejects.toThrow(/No package.json/);
  });

  it("keeps an existing components.json unless --force", async () => {
    fs.writeFileSync(path.join(root, "components.json"), JSON.stringify({ aliases: {}, registry: "../registry" }));
    await init({ cwd: root, install: false, yes: true }, { log });
    expect(JSON.parse(read(root, "components.json"))).toEqual({ aliases: {}, registry: "../registry" });
    await init({ ...base(), force: true }, { log });
    expect(JSON.parse(read(root, "components.json")).style).toBe("default");
  });

  it("records an explicit --registry in an existing components.json", async () => {
    await init(base(), { log });
    const second = writeRegistry(path.join(tmp, "registry-2"));
    await init({ ...base(), registry: second }, { log });
    const config = JSON.parse(read(root, "components.json"));
    expect(config.registry).toBe("../registry-2");
    expect(config.style).toBe("default");
    expect(output()).toContain("updated components.json (style: default, registry: ../registry-2)");
  });

  it("keeps the recorded registry through --force when no --registry is given", async () => {
    await init(base(), { log });
    await init({ cwd: root, install: false, yes: true, force: true, style: "blue" }, { log });
    const config = JSON.parse(read(root, "components.json"));
    expect(config.registry).toBe("../registry");
    expect(config.style).toBe("blue");
  });
});

describe("sibujs add", () => {
  beforeEach(async () => {
    await init(base(), { log });
    lines = [];
  });

  it("copies a component with its registry dependencies and rewrites nothing it need not", async () => {
    await add(["dialog"], base(), { log });
    expect(read(root, "src/components/ui/dialog.ts")).toBe(FIXTURE_ITEMS.dialog.files[0].content);
    expect(exists(root, "src/components/ui/button.ts")).toBe(true);
    expect(exists(root, "src/lib/icons.ts")).toBe(true);
    const out = output();
    expect(out).toContain("wrote src/components/ui/button.ts (required by dialog)");
    expect(out).toContain("= 3 dependency files already up to date");
    expect(out).toContain('"class-variance-authority@^0.7.1"');
    expect(out).not.toContain("sibujs@");
    expect(out).toContain('import { Dialog } from "@/components/ui/dialog";');
  });

  it("uses custom aliases from components.json", async () => {
    const config = JSON.parse(read(root, "components.json"));
    config.aliases = { components: "~/ui", ui: "~/ui/kit", utils: "~/utils/cn", lib: "~/shared" };
    config.paths = { ui: "src/ui/kit", lib: "src/shared", styles: "src/styles/sibujs-ui" };
    fs.writeFileSync(path.join(root, "components.json"), JSON.stringify(config));
    await add(["dialog"], base(), { log });
    const dialog = read(root, "src/ui/kit/dialog.ts");
    expect(dialog).toContain('from "~/ui/kit/button"');
    expect(dialog).toContain('from "~/shared/icons"');
    expect(dialog).toContain("from '~/utils/cn'");
    expect(exists(root, "src/utils/cn.ts")).toBe(true);
  });

  it("never replaces a locally edited file without --overwrite", async () => {
    await add(["button"], base(), { log });
    const file = path.join(root, "src/components/ui/button.ts");
    fs.writeFileSync(file, "// my edit\n");
    lines = [];
    await add(["button"], base(), { log });
    expect(fs.readFileSync(file, "utf-8")).toBe("// my edit\n");
    expect(output()).toContain("skipped src/components/ui/button.ts (exists and differs; use --overwrite to replace)");

    await add(["button"], { ...base(), overwrite: true }, { log });
    expect(fs.readFileSync(file, "utf-8")).toBe(FIXTURE_ITEMS.button.files[0].content);
  });

  it("asks about each conflict when interactive, and a cancel writes nothing", async () => {
    await add(["dialog"], base(), { log });
    for (const f of ["src/components/ui/button.ts", "src/components/ui/dialog.ts"]) {
      fs.writeFileSync(path.join(root, f), "// edit\n");
    }
    const asked: string[] = [];
    await add(["dialog"], { ...base(), yes: false }, {
      log,
      resolveConflict: async (file) => {
        asked.push(file.display);
        return "overwrite-all";
      },
    });
    expect(asked).toEqual(["src/components/ui/button.ts"]);
    expect(read(root, "src/components/ui/dialog.ts")).toBe(FIXTURE_ITEMS.dialog.files[0].content);

    fs.writeFileSync(path.join(root, "src/components/ui/dialog.ts"), "// edit\n");
    fs.rmSync(path.join(root, "src/lib/icons.ts"));
    const before = snapshot(root);
    await expect(
      add(["dialog"], { ...base(), yes: false }, { log, resolveConflict: async () => undefined }),
    ).rejects.toThrow(/Cancelled/);
    expect(snapshot(root)).toEqual(before);
  });

  it("writes nothing on --dry-run", async () => {
    const before = snapshot(root);
    await add(["dialog"], { ...base(), dryRun: true }, { log });
    expect(snapshot(root)).toEqual(before);
    expect(output()).toContain("would write src/components/ui/dialog.ts");
    expect(output()).toContain("Would install:");
  });

  it("suggests a name for a typo", async () => {
    const error = await add(["buton"], base(), { log }).catch((e) => e);
    expect(error).toBeInstanceOf(CliError);
    expect(error.message).toContain('Component "buton" was not found');
    expect(error.hint).toContain("button");
  });

  it("rejects invalid names and an empty list before touching the registry", async () => {
    await expect(add(["../../etc"], base(), { log })).rejects.toThrow(/Invalid component name/);
    await expect(add([], base(), { log })).rejects.toThrow(/No components given/);
  });

  it("adds every component with --all", async () => {
    await add([], { ...base(), all: true }, { log });
    expect(exists(root, "src/components/ui/button.ts")).toBe(true);
    expect(exists(root, "src/components/ui/dialog.ts")).toBe(true);
  });

  it("installs into --path with imports that resolve there", async () => {
    await add(["dialog"], { ...base(), path: path.join(root, "src/widgets") }, { log });
    expect(exists(root, "src/widgets/button.ts")).toBe(true);
    const dialog = read(root, "src/widgets/dialog.ts");
    expect(dialog).toContain('import { Button } from "@/widgets/button";');
    expect(dialog).not.toContain("@/components/ui");
    // Library files still come from their own alias.
    expect(dialog).toContain('from "@/lib/icons"');
    expect(output()).toContain('import { Dialog } from "@/widgets/dialog";');
  });

  it("resolves a relative --path against --cwd, not the process directory", async () => {
    // Both relative, exactly as typed: `sibujs add dialog --cwd <app> --path src/widgets`.
    const cwd = path.relative(process.cwd(), root);
    expect(path.isAbsolute(cwd)).toBe(false);
    await add(["dialog"], { ...base(), cwd, path: "src/widgets" }, { log });
    expect(read(root, "src/widgets/dialog.ts")).toContain('import { Button } from "@/widgets/button";');
    expect(fs.existsSync(path.join(process.cwd(), "src/widgets"))).toBe(false);
  });

  it("never invents an alias from the shape of aliases.ui", async () => {
    const config = JSON.parse(read(root, "components.json"));
    config.aliases = { ui: "@acme/ui", lib: "@/lib", utils: "@/lib/utils" };
    fs.writeFileSync(path.join(root, "components.json"), JSON.stringify(config));

    // With the "@/*" wildcard init declared, the declared alias is used…
    await add(["dialog"], { ...base(), path: "src/components/widgets" }, { log });
    const dialog = read(root, "src/components/widgets/dialog.ts");
    expect(dialog).toContain('from "@/components/widgets/button"');
    expect(dialog).not.toContain("@acme/widgets");

    // …and without any wildcard, nothing reaches the directory.
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    const before = snapshot(root);
    await expect(add(["dialog"], { ...base(), path: "src/elsewhere" }, { log })).rejects.toThrow(
      /not reachable through an import alias/,
    );
    expect(snapshot(root)).toEqual(before);
  });

  it("rejects a --path no import alias reaches, or one outside the project", async () => {
    const before = snapshot(root);
    const error = await add(["dialog"], { ...base(), path: path.join(root, "widgets") }, { log }).catch((e) => e);
    expect(error.message).toMatch(/not reachable through an import alias/);
    expect(snapshot(root)).toEqual(before);
    await expect(add(["button"], { ...base(), path: tmp }, { log })).rejects.toThrow(/inside the project/);
  });

  it("refuses a registry item that tries to write outside the project, writing nothing", async () => {
    const evil = { ...FIXTURE_ITEMS.button, name: "evil", files: [{ path: "ui/../../../x.ts", type: "registry:ui", content: "" }] };
    fs.writeFileSync(path.join(registry, "evil.json"), JSON.stringify(evil));
    const before = snapshot(root);
    await expect(add(["evil"], base(), { log })).rejects.toThrow(/must be a plain path/);
    expect(snapshot(root)).toEqual(before);
  });
});

describe("sibujs add without components.json", () => {
  it("explains how to initialise", async () => {
    const error = await add(["button"], { ...base(), yes: false }, { log }).catch((e) => e);
    expect(error.message).toContain("No components.json found");
    expect(error.hint).toContain("sibujs init");
  });

  it("initialises with defaults under --yes", async () => {
    await add(["button"], base(), { log });
    expect(exists(root, "components.json")).toBe(true);
    expect(exists(root, "src/components/ui/button.ts")).toBe(true);
  });
});

describe("sibujs list", () => {
  it("groups items and marks installed ones", async () => {
    await init(base(), { log });
    await add(["button"], base(), { log });
    lines = [];
    await list({ cwd: root }, { log });
    const out = output();
    expect(out).toContain("sibujs-ui 9.9.9");
    expect(out).toMatch(/Components \(2\)/);
    expect(out).toMatch(/✔ button\s+A button\./);
    expect(out).toMatch(/\n {4}dialog\s+A dialog\./);
  });

  it("prints JSON filtered by type", async () => {
    await list({ cwd: root, registry, type: "ui", json: true }, { log });
    const items = JSON.parse(lines.join("\n"));
    expect(items.map((i: { name: string }) => i.name)).toEqual(["button", "dialog"]);
    expect(items[0]).not.toHaveProperty("installed");
    await expect(list({ cwd: root, registry, type: "widgets" }, { log })).rejects.toThrow(/Unknown --type/);
  });
});
