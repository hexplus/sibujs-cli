import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDefaultConfig, resolveConfig } from "../src/lib/registry/config";
import { detectProjectPackageManager, planDependencies } from "../src/lib/registry/dependencies";
import { CliError, ItemNotFoundError } from "../src/lib/registry/errors";
import { planCss, planFiles, targetPath, transformContent } from "../src/lib/registry/files";
import { formatJson, parseJsonc } from "../src/lib/registry/jsonc";
import { planAlias, planTailwind, type SetupPlan } from "../src/lib/registry/project";
import { isSafeDependencySpec, isSafeRegistryPath, parseItem } from "../src/lib/registry/schema";
import { createRegistry, pickRegistry, resolveTree, suggestNames } from "../src/lib/registry/source";
import { FIXTURE_ITEMS, read, tempDir, writeProject, writeRegistry } from "./helpers/registry-fixture";

const emptyPlan = (): SetupPlan => ({ changes: [], manual: [], warnings: [], dependencies: [], devDependencies: [] });

let tmp: string;
beforeEach(() => {
  tmp = tempDir();
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.SIBUJS_REGISTRY;
});

describe("registry schema validation", () => {
  it("accepts the dependency specs the registry publishes", () => {
    for (const spec of ["clsx@^2.1.1", "sibujs@>=3.2.0 <5.0.0", "@tailwindcss/vite@^4", "tailwindcss", "a@1 || 2"]) {
      expect(isSafeDependencySpec(spec), spec).toBe(true);
    }
  });

  it("rejects specs that could inject into a shell command line", () => {
    for (const spec of ['x@"1"', "x@1 & calc", "x@%PATH%", "x@$(id)", "x@`id`", "x@1!", "../x", "X@1", "x@1\\2"]) {
      expect(isSafeDependencySpec(spec), spec).toBe(false);
    }
  });

  it("only allows plain paths under ui/, lib/ and styles/", () => {
    expect(isSafeRegistryPath("ui/button.ts")).toBe(true);
    expect(isSafeRegistryPath("styles/themes/blue.css")).toBe(true);
    for (const p of ["ui/../../x.ts", "../x", "/etc/passwd", "src/x.ts", "ui\\x.ts", "ui/", "ui", "lib/.", "C:/x"]) {
      expect(isSafeRegistryPath(p), p).toBe(false);
    }
  });

  it("refuses an item whose file escapes its directory", () => {
    const item = { ...FIXTURE_ITEMS.button, files: [{ path: "ui/../../evil.ts", type: "registry:ui", content: "" }] };
    expect(() => parseItem(item, "button.json")).toThrow(/must be a plain path/);
  });

  it("refuses an item with an unsafe dependency or css import", () => {
    expect(() => parseItem({ ...FIXTURE_ITEMS.button, dependencies: ["x@1 & calc"] }, "b")).toThrow(/invalid package spec/);
    expect(() => parseItem({ ...FIXTURE_ITEMS.base, css: { imports: ["../../x.css"] } }, "b")).toThrow(/css.imports/);
  });
});

describe("components.json resolution", () => {
  it("fills everything from an empty file, using src/ when it exists", () => {
    fs.mkdirSync(path.join(tmp, "src"));
    const config = resolveConfig(tmp, {});
    expect(config.style).toBe("default");
    expect(config.aliases).toEqual({
      components: "@/components",
      ui: "@/components/ui",
      utils: "@/lib/utils",
      lib: "@/lib",
    });
    expect(config.paths).toEqual({
      ui: "src/components/ui",
      lib: "src/lib",
      styles: "src/styles/sibujs-ui",
      utils: "src/lib/utils",
    });
  });

  it("accepts the shadcn-style shape with components/utils aliases", () => {
    fs.mkdirSync(path.join(tmp, "src"));
    const config = resolveConfig(tmp, {
      style: "default",
      tailwind: { css: "src/index.css" },
      aliases: { components: "@/components", utils: "@/lib/utils" },
    });
    expect(config.aliases.ui).toBe("@/components/ui");
    expect(config.aliases.lib).toBe("@/lib");
    expect(config.css).toBe("src/index.css");
    expect(config.paths.ui).toBe("src/components/ui");
  });

  it("accepts the sibujs-ui CLI shape (paths, aliases.ui/lib, top-level css)", () => {
    const config = resolveConfig(tmp, {
      css: "src/style.css",
      paths: { ui: "app/ui", lib: "app/lib", styles: "app/styles" },
      aliases: { ui: "~/ui", lib: "~/lib" },
    });
    expect(config.css).toBe("src/style.css");
    expect(config.aliases.utils).toBe("~/lib/utils");
    expect(config.paths).toEqual({ ui: "app/ui", lib: "app/lib", styles: "app/styles", utils: "app/lib/utils" });
  });

  it("derives directories from tsconfig paths", () => {
    fs.writeFileSync(
      path.join(tmp, "tsconfig.json"),
      '{\n  // comment\n  "compilerOptions": { "paths": { "~/*": ["./app/*"], }, },\n}',
    );
    const config = resolveConfig(tmp, { aliases: { components: "~/components", utils: "~/utils/cn" } });
    expect(config.paths.ui).toBe("app/components/ui");
    expect(config.paths.lib).toBe("app/utils");
    expect(config.paths.utils).toBe("app/utils/cn");
  });

  it("explains an alias it cannot map", () => {
    expect(() => resolveConfig(tmp, { aliases: { components: "components" } })).toThrow(/cannot tell which directory/);
  });

  it("rejects paths outside the project, relative aliases and Tailwind 3", () => {
    expect(() => resolveConfig(tmp, { paths: { ui: "../elsewhere" } })).toThrow(/inside the project/);
    expect(() => resolveConfig(tmp, { aliases: { ui: "./components/ui" } })).toThrow(/bare import specifier/);
    expect(() => resolveConfig(tmp, { tailwind: { version: 3 } })).toThrow(/Tailwind CSS 4/);
    expect(() => resolveConfig(tmp, { style: "Not Valid" })).toThrow(/"style"/);
  });

  it("writes defaults that resolve to themselves", () => {
    fs.mkdirSync(path.join(tmp, "src"));
    const raw = createDefaultConfig(tmp, { style: "blue", css: "src/app.css" });
    expect(raw.$schema).toContain("sibujs-cli/schema/components.json");
    expect(resolveConfig(tmp, raw).paths.ui).toBe("src/components/ui");
  });
});

describe("file planning", () => {
  const config = () => {
    fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
    return resolveConfig(tmp, { tailwind: { css: "src/app.css" } });
  };

  it("rewrites canonical aliases to the project's, in both quote styles", () => {
    const custom = resolveConfig(tmp, {
      aliases: { ui: "#/ui", lib: "#/shared", utils: "#/helpers/cn" },
      paths: { ui: "ui", lib: "shared" },
    });
    const file = FIXTURE_ITEMS.dialog.files[0];
    const out = transformContent(file.content, { ...file }, custom);
    expect(out).toContain('from "#/ui/button"');
    expect(out).toContain('from "#/shared/icons"');
    expect(out).toContain("from '#/helpers/cn'");
  });

  it("leaves stylesheets untouched", () => {
    const css = { path: "styles/base.css", type: "registry:style" as const, content: '@import "@/lib/x";' };
    expect(transformContent(css.content, css, config())).toBe(css.content);
  });

  it("places lib/utils.ts at the utils alias", () => {
    fs.mkdirSync(path.join(tmp, "src"));
    const custom = resolveConfig(tmp, { aliases: { utils: "@/helpers/cn" } });
    const target = targetPath(custom, { path: "lib/utils.ts", type: "registry:lib", content: "" });
    expect(path.relative(tmp, target).replaceAll("\\", "/")).toBe("src/helpers/cn.ts");
  });

  it("classifies new, identical and conflicting files", () => {
    const cfg = config();
    const items = [parseItem(FIXTURE_ITEMS.utils, "u"), parseItem(FIXTURE_ITEMS.button, "b")];
    fs.mkdirSync(path.join(tmp, "src/lib"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src/lib/utils.ts"), FIXTURE_ITEMS.utils.files[0].content.replace(/\n/g, "\r\n"));
    fs.mkdirSync(path.join(tmp, "src/components/ui"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src/components/ui/button.ts"), "// mine\n");
    const plan = planFiles(cfg, items);
    expect(plan.map((f) => [f.display, f.status])).toEqual([
      ["src/lib/utils.ts", "identical"],
      ["src/components/ui/button.ts", "conflict"],
    ]);
  });

  it("keeps a customised icons file that still exports every icon", () => {
    const cfg = config();
    fs.mkdirSync(path.join(tmp, "src/lib"), { recursive: true });
    const icons = path.join(tmp, "src/lib/icons.ts");
    fs.writeFileSync(icons, 'export const XIcon = "x";\nexport const CheckIcon = "c";\nexport const MyIcon = "m";\n');
    expect(planFiles(cfg, [parseItem(FIXTURE_ITEMS.icons, "i")])[0].status).toBe("kept");
    fs.writeFileSync(icons, 'export const XIcon = "x";\n');
    const [entry] = planFiles(cfg, [parseItem(FIXTURE_ITEMS.icons, "i")]);
    expect(entry.status).toBe("conflict");
    expect(entry.note).toContain("CheckIcon");
  });

  it("adds @import lines after the existing imports, adding tailwindcss when missing", () => {
    const cfg = config();
    fs.writeFileSync(path.join(tmp, "src/app.css"), '@import url("font.css");\n\nbody {}\n');
    const css = planCss(cfg, [parseItem(FIXTURE_ITEMS.base, "b"), parseItem(FIXTURE_ITEMS["theme-blue"], "t")]);
    expect(css.content).toBe(
      '@import url("font.css");\n@import "tailwindcss";\n@import "./styles/sibujs-ui/base.css";\n@import "./styles/sibujs-ui/default.css";\n@import "./styles/sibujs-ui/themes/blue.css";\n\nbody {}\n',
    );
    fs.writeFileSync(path.join(tmp, "src/app.css"), css.content!);
    expect(planCss(cfg, [parseItem(FIXTURE_ITEMS.base, "b")]).content).toBeUndefined();
  });
});

describe("registry sources", () => {
  it("prefers --registry, then $SIBUJS_REGISTRY, then components.json, then the default", () => {
    const base = { cwd: tmp, root: tmp };
    expect(pickRegistry({ ...base }).origin).toBe("default");
    expect(pickRegistry({ ...base, config: "reg" })).toEqual({ location: path.join(tmp, "reg"), origin: "config" });
    process.env.SIBUJS_REGISTRY = "https://example.com/r";
    expect(pickRegistry({ ...base, config: "reg" }).origin).toBe("env");
    expect(pickRegistry({ ...base, flag: "http://localhost:4000/r" })).toEqual({
      location: "http://localhost:4000/r",
      origin: "flag",
    });
  });

  it("reads a local directory and reports unknown items", async () => {
    const registry = createRegistry(writeRegistry(path.join(tmp, "reg")));
    expect((await registry.index()).items).toHaveLength(Object.keys(FIXTURE_ITEMS).length);
    expect((await registry.item("button")).name).toBe("button");
    await expect(registry.item("nope")).rejects.toBeInstanceOf(ItemNotFoundError);
    await expect(registry.item("../button")).rejects.toThrow(/Invalid component name/);
  });

  it("explains a missing registry directory", async () => {
    await expect(createRegistry(path.join(tmp, "missing")).index()).rejects.toThrow(/Registry directory not found/);
  });

  it("resolves dependencies before dependents, once each", async () => {
    const registry = createRegistry(writeRegistry(path.join(tmp, "reg")));
    const { items, requiredBy } = await resolveTree(registry, ["dialog", "button"]);
    expect(items.map((i) => i.name)).toEqual(["base", "utils", "button", "icons", "dialog"]);
    expect(requiredBy.get("icons")).toBe("dialog");
    expect(requiredBy.has("button")).toBe(false);
  });

  it("detects dependency cycles", async () => {
    const a = { ...FIXTURE_ITEMS.utils, name: "a", registryDependencies: ["b"] };
    const b = { ...FIXTURE_ITEMS.utils, name: "b", registryDependencies: ["a"] };
    const registry = createRegistry(writeRegistry(path.join(tmp, "reg"), { a, b }));
    await expect(resolveTree(registry, ["a"])).rejects.toThrow("a → b → a");
  });

  it("suggests close names", () => {
    const names = Object.keys(FIXTURE_ITEMS);
    expect(suggestNames("buton", names)).toEqual(["button"]);
    expect(suggestNames("dialogue", names)).toContain("dialog");
    expect(suggestNames("zzzzzzzz", names)).toEqual([]);
  });
});

describe("registry over HTTP", () => {
  let server: http.Server;
  let url: string;
  let hits: string[] = [];
  let failNext = 0;
  const dir = tempDir("sibujs-http-registry-");
  writeRegistry(dir);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const reqPath = req.url ?? "";
      hits.push(reqPath);
      if (reqPath.startsWith("/latest/")) {
        res.writeHead(302, { location: reqPath.replace("/latest/", "/9.9.9/") }).end();
        return;
      }
      if (failNext > 0) {
        failNext--;
        res.writeHead(503).end();
        return;
      }
      if (reqPath === "/9.9.9/broken.json") {
        res.writeHead(200, { "content-type": "application/json" }).end("{nope");
        return;
      }
      const file = path.join(dir, path.basename(reqPath));
      if (!reqPath.startsWith("/9.9.9/") || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(fs.readFileSync(file));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    hits = [];
    failNext = 0;
  });
  afterAll(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fetches items from a base URL and pins a redirecting base to its target", async () => {
    const registry = createRegistry(`${url}/latest/`);
    const { items } = await resolveTree(registry, ["button"]);
    expect(items.map((i) => i.name)).toEqual(["base", "utils", "button"]);
    expect(hits[0]).toBe("/latest/button.json");
    expect(hits.slice(1).every((h) => h.startsWith("/9.9.9/"))).toBe(true);
  });

  it("supports {name} URL templates", async () => {
    const registry = createRegistry(`${url}/9.9.9/{name}.json`);
    expect((await registry.item("utils")).name).toBe("utils");
    expect((await registry.index()).version).toBe("9.9.9");
  });

  it("retries transient server errors", async () => {
    failNext = 1;
    expect((await createRegistry(`${url}/9.9.9`).item("utils")).name).toBe("utils");
  });

  it("maps 404 to an unknown item and bad JSON to a clear error", async () => {
    const registry = createRegistry(`${url}/9.9.9`);
    await expect(registry.item("missing")).rejects.toBeInstanceOf(ItemNotFoundError);
    await expect(registry.item("broken")).rejects.toThrow(/invalid JSON/);
  });

  it("reports an unreachable registry with a local-registry hint", async () => {
    const registry = createRegistry("http://127.0.0.1:9/r", { timeoutMs: 500 });
    const error = await registry.index().catch((e) => e);
    expect(error).toBeInstanceOf(CliError);
    expect(error.message).toMatch(/Could not reach the registry/);
    expect(error.hint).toMatch(/--registry <dir>/);
  });
});

describe("dependencies", () => {
  it("skips packages package.json already declares and picks the package manager from the lockfile", () => {
    writeProject(tmp);
    fs.rmSync(path.join(tmp, "package-lock.json"));
    fs.writeFileSync(path.join(tmp, "pnpm-lock.yaml"), "");
    fs.mkdirSync(path.join(tmp, ".git"));
    const plan = planDependencies(tmp, {
      dependencies: ["sibujs@>=3.2.0 <5.0.0", "clsx@^2.1.1", "clsx@^2.1.1"],
      devDependencies: ["tailwindcss@^4", "clsx@^2"],
    });
    expect(detectProjectPackageManager(tmp)).toBe("pnpm");
    expect(plan.dependencies).toEqual(["clsx@^2.1.1"]);
    expect(plan.devDependencies).toEqual(["tailwindcss@^4"]);
    expect(plan.commands.map((c) => c.display)).toEqual(['pnpm add "clsx@^2.1.1"', 'pnpm add -D "tailwindcss@^4"']);
  });
});

describe("project setup", () => {
  it("adds the Tailwind plugin next to existing plugins", () => {
    writeProject(tmp, {
      "vite.config.ts":
        'import { defineConfig } from "vite";\nimport {\n  thing,\n} from "x";\n\nexport default defineConfig({\n  plugins: [thing()],\n});\n',
    });
    const plan = emptyPlan();
    planTailwind(tmp, plan);
    expect(plan.dependencies).toEqual(["tailwindcss@^4", "@tailwindcss/vite@^4"]);
    expect(plan.changes[0].content).toBe(
      'import { defineConfig } from "vite";\nimport {\n  thing,\n} from "x";\nimport tailwindcss from "@tailwindcss/vite";\n\nexport default defineConfig({\n  plugins: [tailwindcss(), thing()],\n});\n',
    );
  });

  it("leaves projects that already use Tailwind 4 alone and warns on Tailwind 3", () => {
    writeProject(tmp, {
      "package.json": JSON.stringify({ devDependencies: { tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" } }),
      "vite.config.ts": 'import tailwindcss from "@tailwindcss/vite";\nexport default { plugins: [tailwindcss()] };\n',
    });
    const plan = emptyPlan();
    planTailwind(tmp, plan);
    expect(plan).toEqual(emptyPlan());

    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ devDependencies: { tailwindcss: "^3.4.0" } }));
    planTailwind(tmp, plan);
    expect(plan.warnings[0]).toMatch(/need Tailwind CSS 4/);
  });

  it("gives instructions instead of rewriting a tsconfig with comments", () => {
    writeProject(tmp, { "tsconfig.json": '{\n  // keep me\n  "compilerOptions": {}\n}\n' });
    const plan = emptyPlan();
    planAlias(tmp, "@", "src", plan);
    expect(plan.changes.map((c) => c.display)).toEqual(["vite.config.ts"]);
    expect(plan.manual[0]).toContain('"@/*": ["./src/*"]');
    expect(read(tmp, "tsconfig.json")).toContain("keep me");
  });

  it("does not touch an alias that is already declared", () => {
    writeProject(tmp, {
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      "vite.config.ts": 'export default defineConfig({ resolve: { alias: { "@": "/src" } } });\n',
    });
    const plan = emptyPlan();
    planAlias(tmp, "@", "src", plan);
    expect(plan.changes).toEqual([]);
    expect(plan.manual).toEqual([]);
  });

  it("parses JSONC and formats JSON like a hand-written tsconfig", () => {
    const { data, hasComments } = parseJsonc('{ /* a */ "s": "http://x//y", "l": [1, 2,], // b\n }');
    expect(hasComments).toBe(true);
    expect(data).toEqual({ s: "http://x//y", l: [1, 2] });
    expect(formatJson({ lib: ["a", "b"], o: { p: ["./src/*"] } })).toBe(
      '{\n  "lib": ["a", "b"],\n  "o": {\n    "p": ["./src/*"]\n  }\n}\n',
    );
  });
});

describe("components.json schema", () => {
  it("documents every key sibujs init writes", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "../schema/components.json"), "utf-8"));
    const raw = createDefaultConfig(tmp, { style: "blue", css: "src/app.css", registry: "../registry" });
    for (const key of Object.keys(raw)) expect(schema.properties, key).toHaveProperty(key);
    for (const group of ["tailwind", "aliases", "paths"] as const) {
      for (const key of Object.keys(raw[group] ?? {})) expect(schema.properties[group].properties, `${group}.${key}`).toHaveProperty(key);
    }
  });
});
