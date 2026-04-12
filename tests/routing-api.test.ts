import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Verifies that the `routing` template uses only APIs that exist in
// sibujs v1.5.0's router.

const ROUTER_TEMPLATE = path.resolve(__dirname, "..", "templates", "routing", "src", "router.ts");
const APP_TEMPLATE = path.resolve(__dirname, "..", "templates", "routing", "src", "App.ts");

describe("routing template — v1.5.0 API compliance", () => {
  it("router.ts imports only valid sibujs/plugins symbols", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");

    // Extract imports from "sibujs/plugins"
    const importMatch = content.match(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']sibujs\/plugins["']/g);
    expect(importMatch).toBeTruthy();

    const imported = new Set<string>();
    for (const m of importMatch ?? []) {
      const names = m
        .match(/\{([^}]+)\}/)?.[1]
        .split(",")
        .map((s) => s.trim().replace(/^type\s+/, ""))
        .filter(Boolean) ?? [];
      for (const n of names) imported.add(n);
    }

    // Valid public exports from sibujs v1.5 plugins.ts
    const validExports = new Set([
      "createRouter",
      "setRoutes",
      "route",
      "router",
      "navigate",
      "push",
      "replace",
      "go",
      "back",
      "forward",
      "beforeEach",
      "beforeResolve",
      "afterEach",
      "Route",
      "Outlet",
      "RouterLink",
      "KeepAliveRoute",
      "Suspense",
      "lazy",
      "preloadRoute",
      "addRoute",
      "removeRoute",
      "hasRoute",
      "getRouteInfo",
      "buildURL",
      "routerState",
      "getRouteTransition",
      "setRouteTransition",
      "routerPlugin",
      "destroyRouter",
      // Types
      "RouteDef",
      "RouterOptions",
      "RouteContext",
      "NavigationTarget",
      "NavigationGuard",
      "Component",
      "AsyncComponent",
      "LazyComponent",
    ]);

    for (const name of imported) {
      expect(validExports.has(name), `Unknown import from sibujs/plugins: "${name}"`).toBe(true);
    }
  });

  it("createRouter is called with routes array and optional options", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");
    expect(content).toMatch(/createRouter\s*\(\s*routes/);
  });

  it("uses valid RouterOptions fields only", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");
    // Grab the options object passed to createRouter
    const match = content.match(/createRouter\s*\(\s*routes\s*,\s*\{([^}]*)\}/);
    if (!match) return; // No options passed — nothing to check

    const validOptions = new Set([
      "mode",
      "base",
      "linkActiveClass",
      "linkExactActiveClass",
      "fallback",
      "scrollBehavior",
      "guardTimeout",
      "cacheSize",
      "errorRetryDelay",
      "preloadStrategy",
      "keepAlive",
    ]);

    const keys = match[1]
      .split(",")
      .map((kv) => kv.split(":")[0].trim())
      .filter(Boolean);

    for (const k of keys) {
      expect(validOptions.has(k), `Unknown RouterOptions field: "${k}"`).toBe(true);
    }
  });

  it("mode, when set, is 'history' or 'hash'", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");
    const modeMatch = content.match(/mode\s*:\s*["']([^"']+)["']/);
    if (modeMatch) {
      expect(["history", "hash"]).toContain(modeMatch[1]);
    }
  });

  it("beforeEnter returns true / false / string (redirect path)", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");
    // Find beforeEnter block and sanity check the return values.
    const match = content.match(/beforeEnter\s*:\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return;
    const body = match[1];
    // Guard must return either boolean or string (redirect path)
    const returns = [...body.matchAll(/return\s+([^;]+);/g)].map((r) => r[1].trim());
    for (const r of returns) {
      const isBoolean = r === "true" || r === "false";
      const isString = /^["']/.test(r);
      expect(isBoolean || isString, `Guard returned non-boolean/string: ${r}`).toBe(true);
    }
  });

  it("child routes with leading '/' concatenate correctly with parent path", () => {
    const content = fs.readFileSync(ROUTER_TEMPLATE, "utf-8");
    // sibujs router does `fullPath = parentPath + child.path`. An index
    // route must use path: "", and non-index children must start with "/".
    const childrenMatch = content.match(/children\s*:\s*\[([\s\S]*?)\]/);
    if (!childrenMatch) return;

    const childPaths = [...childrenMatch[1].matchAll(/path\s*:\s*["']([^"']*)["']/g)].map((m) => m[1]);

    for (const p of childPaths) {
      const validIndex = p === "";
      const validSubPath = p.startsWith("/");
      expect(validIndex || validSubPath, `Child path "${p}" must be "" or start with "/"`).toBe(true);
    }
  });

  it("App.ts uses Route() at the top level", () => {
    const content = fs.readFileSync(APP_TEMPLATE, "utf-8");
    expect(content).toMatch(/Route\s*\(\s*\)/);
  });

  it("Dashboard uses Outlet() for nested rendering", () => {
    const dash = path.resolve(__dirname, "..", "templates", "routing", "src", "pages", "Dashboard.ts");
    const content = fs.readFileSync(dash, "utf-8");
    expect(content).toMatch(/Outlet\s*\(\s*\)/);
    expect(content).toMatch(/from\s+["']sibujs\/plugins["']/);
  });

  it("navigate() is called with string targets (valid NavigationTarget)", () => {
    const content =
      fs.readFileSync(APP_TEMPLATE, "utf-8") +
      fs.readFileSync(path.resolve(__dirname, "..", "templates", "routing", "src", "pages", "Dashboard.ts"), "utf-8") +
      fs.readFileSync(path.resolve(__dirname, "..", "templates", "routing", "src", "pages", "Login.ts"), "utf-8");

    // Every navigate(...) call must either use a string literal or a variable.
    const calls = [...content.matchAll(/navigate\s*\(\s*([^)]+)\)/g)].map((m) => m[1].trim());
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) {
      const isStringLiteral = /^["']/.test(arg);
      const isObjectOrVar = /^[{\w]/.test(arg);
      expect(isStringLiteral || isObjectOrVar, `navigate() called with invalid target: ${arg}`).toBe(true);
    }
  });
});
