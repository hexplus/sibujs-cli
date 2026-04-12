import { describe, expect, it } from "vitest";
import { detectPackageManager, isValidPackageName, toValidPackageName } from "../src/commands/create";

describe("isValidPackageName", () => {
  it("accepts simple lowercase names", () => {
    expect(isValidPackageName("my-app")).toBe(true);
    expect(isValidPackageName("myapp")).toBe(true);
    expect(isValidPackageName("my_app")).toBe(true); // underscore allowed in body
  });

  it("accepts scoped names", () => {
    expect(isValidPackageName("@scope/my-app")).toBe(true);
    expect(isValidPackageName("@my-org/pkg")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidPackageName("My-App")).toBe(false);
    expect(isValidPackageName("APP")).toBe(false);
  });

  it("rejects leading dot or underscore", () => {
    expect(isValidPackageName(".hidden")).toBe(false);
    expect(isValidPackageName("_internal")).toBe(false);
  });

  it("rejects spaces and special chars", () => {
    expect(isValidPackageName("my app")).toBe(false);
    expect(isValidPackageName("my/app")).toBe(false);
    expect(isValidPackageName("my app!")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPackageName("")).toBe(false);
  });
});

describe("toValidPackageName", () => {
  it("lowercases input", () => {
    expect(toValidPackageName("MyApp")).toBe("myapp");
  });

  it("replaces spaces with hyphens", () => {
    expect(toValidPackageName("My App")).toBe("my-app");
    expect(toValidPackageName("hello   world")).toBe("hello-world");
  });

  it("replaces invalid chars with hyphens", () => {
    expect(toValidPackageName("my@app")).toBe("my-app");
    expect(toValidPackageName("a/b/c")).toBe("a-b-c");
  });

  it("strips leading dots and underscores", () => {
    expect(toValidPackageName(".hidden")).toBe("hidden");
    expect(toValidPackageName("_internal")).toBe("internal");
    expect(toValidPackageName("..dotfile")).toBe("dotfile");
  });

  it("collapses consecutive hyphens", () => {
    expect(toValidPackageName("my---app")).toBe("my-app");
    expect(toValidPackageName("my  @  app")).toBe("my-app");
  });

  it("trims whitespace", () => {
    expect(toValidPackageName("  my-app  ")).toBe("my-app");
  });

  it("produces valid output for valid-looking input", () => {
    const cases = ["My App", "weird@Name!", "  spaces  ", "CamelCase"];
    for (const input of cases) {
      const out = toValidPackageName(input);
      expect(isValidPackageName(out)).toBe(true);
    }
  });
});

describe("detectPackageManager", () => {
  const original = process.env.npm_config_user_agent;

  afterEach(() => {
    process.env.npm_config_user_agent = original;
  });

  it("detects pnpm", () => {
    process.env.npm_config_user_agent = "pnpm/8.0.0 npm/? node/v20.0.0";
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("detects yarn", () => {
    process.env.npm_config_user_agent = "yarn/1.22.0 npm/? node/v20.0.0";
    expect(detectPackageManager()).toBe("yarn");
  });

  it("detects bun", () => {
    process.env.npm_config_user_agent = "bun/1.0.0";
    expect(detectPackageManager()).toBe("bun");
  });

  it("defaults to npm when no UA", () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBe("npm");
  });

  it("defaults to npm for unknown UA", () => {
    process.env.npm_config_user_agent = "npm/10.0.0 node/v20.0.0";
    expect(detectPackageManager()).toBe("npm");
  });
});

// Local helper since we don't import vitest globals
import { afterEach } from "vitest";
