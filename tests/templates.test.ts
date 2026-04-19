import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TEMPLATES_ROOT = path.resolve(__dirname, "..", "templates");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const TEMPLATE_NAMES = ["default", "routing", "ui", "ui-routing"];

describe("templates structure", () => {
  it("all expected templates exist", () => {
    for (const name of TEMPLATE_NAMES) {
      const dir = path.join(TEMPLATES_ROOT, name);
      expect(fs.existsSync(dir), `template ${name} missing`).toBe(true);
    }
  });

  it("each template has an App.ts", () => {
    for (const name of TEMPLATE_NAMES) {
      const app = path.join(TEMPLATES_ROOT, name, "src", "App.ts");
      expect(fs.existsSync(app), `${name}/src/App.ts missing`).toBe(true);
    }
  });
});

describe("templates use shorthand canonical syntax", () => {
  // All generated templates should use positional tag-factory style
  // like `div("class", [...])` or `button({ on: {...} }, "text")` — not
  // the verbose object form `div({ class: "...", nodes: [...] })`.

  for (const templateName of TEMPLATE_NAMES) {
    it(`${templateName} template: no "nodes:" property in TS files`, () => {
      const files = collectTsFiles(path.join(TEMPLATES_ROOT, templateName, "src"));
      expect(files.length).toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        // Look for `nodes:` as an object key. A leading `{` or `,` or newline + whitespace is the tell.
        if (/[{,\n]\s*nodes\s*:/.test(content)) {
          offenders.push(path.relative(TEMPLATES_ROOT, file));
        }
      }
      expect(offenders, `files still using nodes: ${offenders.join(", ")}`).toEqual([]);
    });
  }
});

describe("templates dependency versions", () => {
  const pkgTpl = fs.readFileSync(path.join(TEMPLATES_ROOT, "default", "package.json.tpl"), "utf-8");

  it("sibujs dependency is pinned to ^3.0.0", () => {
    expect(pkgTpl).toMatch(/"sibujs":\s*"\^3\.0\.0"/);
  });

  it("sibujs-ui placeholder resolves to ^1.3.0", () => {
    // The value is interpolated from create.ts — check the source.
    const createSrc = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "commands", "create.ts"),
      "utf-8",
    );
    expect(createSrc).toMatch(/"sibujs-ui":\s*"\^1\.3\.0"/);
  });
});

describe("templates placeholder substitution", () => {
  it("App.ts files contain the {{NAME}} placeholder where expected", () => {
    // At least default, routing, ui, ui-routing App.ts must have the placeholder
    for (const name of TEMPLATE_NAMES) {
      const app = path.join(TEMPLATES_ROOT, name, "src", "App.ts");
      const content = fs.readFileSync(app, "utf-8");
      expect(content.includes("{{NAME}}"), `${name}/src/App.ts missing {{NAME}}`).toBe(true);
    }
  });
});
