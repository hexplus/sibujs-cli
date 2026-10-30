import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prerenderCommand } from "../src/commands/prerender";

const TEMPLATES_ROOT = path.resolve(__dirname, "..", "templates");
const read = (rel: string) => fs.readFileSync(path.join(TEMPLATES_ROOT, rel), "utf-8");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("the --prerender overlay", () => {
  it("pre-renders from a server entry exporting the browser's route table", () => {
    const config = read("prerender/vite.config.ts");
    expect(config).toContain('server: "src/entry-server.ts"');
    expect(config).toContain('hydration: "adopt"');
    const entry = read("prerender/src/entry-server.ts");
    expect(entry).toMatch(/export \{ head, routes \} from "\.\/routes\.ts"/);
    expect(read("prerender/src/router.ts")).toContain('trailingSlash: "ignore"');
  });

  it("shows per-route head, render modes, getStaticPaths, a fetched-data page and ClientOnly", () => {
    const routes = read("prerender/src/routes.ts");
    expect(routes).toContain("titleTemplate");
    expect(routes).toContain('render: "client"');
    expect(routes).toContain("getStaticPaths");
    expect(routes).toContain("status: 404");
    expect(read("prerender/src/pages/Products.ts")).toContain("query(");
    expect(read("prerender/src/components/Swatch.ts")).toContain("ClientOnly(");
    expect(read("prerender/src/main.ts")).toContain('strategy: "adopt"');
    expect(JSON.parse(read("prerender/public/api/products.json")).length).toBeGreaterThan(0);
  });

  it("depends on sibujs 4.14 and keeps the template conventions", () => {
    expect(read("prerender/package.json.tpl")).toMatch(/"sibujs":\s*"\^4\.14\.0"/);
    expect(read("prerender/package.json.tpl")).toContain('"prerender": "sibujs prerender"');
    for (const file of tsFiles(path.join(TEMPLATES_ROOT, "prerender", "src"))) {
      expect(fs.readFileSync(file, "utf-8"), file).not.toMatch(/[{,\n]\s*nodes\s*:/);
    }
  });
});

describe("the --ssr overlay", () => {
  it("adds a per-request server built from the same server entry", () => {
    const pkg = read("ssr/package.json.tpl");
    expect(pkg).toContain("sibujs build --ssr src/entry-server.ts");
    expect(pkg).toContain('"start": "node server.mjs"');
    expect(read("ssr/src/entry-server.ts")).toContain('export { createRenderHandler } from "sibujs/ssr"');
    const server = read("ssr/server.mjs");
    expect(server).toContain("createRenderHandler(routes");
    expect(server).toContain('hydration: "adopt"');
  });
});

describe("sibujs prerender", () => {
  it("fails clearly outside a project with sibujs and vite installed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sibu-cli-prerender-"));
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const errors: string[] = [];
    const original = console.error;
    console.error = (msg: string) => errors.push(String(msg));
    try {
      expect(await prerenderCommand({ cwd: dir })).toBe(1);
    } finally {
      console.error = original;
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(errors.join("\n")).toMatch(/vite is not installed/);
  });
});
