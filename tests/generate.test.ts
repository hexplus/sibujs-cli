import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "../src/commands/generate";

describe("generate component", () => {
  let tmpDir: string;
  let origCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sibujs-cli-test-"));
    process.chdir(tmpDir);
    // generate() calls process.exit(1) on error; prevent that from killing the test.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates component file in src/ when no components dir exists", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    generate("component", "button");

    const filePath = path.join(tmpDir, "src", "Button.ts");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import { div } from "sibujs"');
    expect(content).toContain("export function Button()");
    expect(content).toContain('div("Button works!")');
  });

  it("creates component file in src/components/ when it exists", () => {
    fs.mkdirSync(path.join(tmpDir, "src", "components"), { recursive: true });

    generate("component", "my-card");

    const filePath = path.join(tmpDir, "src", "components", "MyCard.ts");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function MyCard()");
  });

  it("converts kebab-case to PascalCase", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    generate("component", "user-profile-card");

    expect(fs.existsSync(path.join(tmpDir, "src", "UserProfileCard.ts"))).toBe(true);
  });

  it("converts snake_case to PascalCase", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    generate("component", "user_profile");

    expect(fs.existsSync(path.join(tmpDir, "src", "UserProfile.ts"))).toBe(true);
  });

  it("exits when src/ does not exist", () => {
    expect(() => generate("component", "foo")).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when file already exists", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "Existing.ts"), "// already here");

    expect(() => generate("component", "existing")).toThrow("process.exit(1)");
  });

  it("rejects unknown types", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    expect(() => generate("service", "foo")).toThrow("process.exit(1)");
  });

  it("generated code uses shorthand syntax (no `nodes:` object)", () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    generate("component", "widget");

    const content = fs.readFileSync(path.join(tmpDir, "src", "Widget.ts"), "utf-8");
    expect(content).not.toContain("nodes:");
    expect(content).toContain('div("Widget works!")');
  });
});
