import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** A small registry in the sibujs-ui format, written to a temp directory. */
export const FIXTURE_ITEMS = {
  base: {
    name: "base",
    type: "registry:style",
    description: "Theme tokens.",
    dependencies: [],
    devDependencies: ["tailwindcss@^4"],
    registryDependencies: [],
    files: [
      { path: "styles/base.css", type: "registry:style", content: ":root { --radius: 0.5rem; }\n" },
      { path: "styles/default.css", type: "registry:style", content: ":root { --primary: black; }\n" },
    ],
    css: { imports: ["base.css", "default.css"], requires: ["tailwindcss"] },
  },
  "theme-blue": {
    name: "theme-blue",
    type: "registry:theme",
    description: "Blue.",
    dependencies: [],
    devDependencies: [],
    registryDependencies: ["base"],
    files: [{ path: "styles/themes/blue.css", type: "registry:theme", content: ":root { --primary: blue; }\n" }],
    css: { imports: ["themes/blue.css"] },
  },
  utils: {
    name: "utils",
    type: "registry:lib",
    description: "cn()",
    dependencies: ["clsx@^2.1.1", "tailwind-merge@^3.0.1"],
    devDependencies: [],
    registryDependencies: [],
    files: [
      {
        path: "lib/utils.ts",
        type: "registry:lib",
        content: 'import { clsx } from "clsx";\nexport function cn(...a: string[]) {\n  return clsx(a);\n}\n',
      },
    ],
  },
  icons: {
    name: "icons",
    type: "registry:lib",
    description: "Icons.",
    dependencies: [],
    devDependencies: [],
    registryDependencies: [],
    files: [
      {
        path: "lib/icons.ts",
        type: "registry:lib",
        content: 'export const XIcon = "x";\nexport const CheckIcon = "check";\n',
      },
    ],
  },
  button: {
    name: "button",
    type: "registry:ui",
    description: "A button.",
    dependencies: ["class-variance-authority@^0.7.1", "sibujs@>=3.2.0 <5.0.0"],
    devDependencies: [],
    registryDependencies: ["base", "utils"],
    files: [
      {
        path: "ui/button.ts",
        type: "registry:ui",
        content:
          'import { cn } from "@/lib/utils";\nexport const buttonVariants = {};\nexport function Button() {\n  return cn("btn");\n}\n',
      },
    ],
  },
  dialog: {
    name: "dialog",
    type: "registry:ui",
    description: "A dialog.",
    dependencies: ["sibujs@>=3.2.0 <5.0.0"],
    devDependencies: [],
    registryDependencies: ["base", "button", "icons", "utils"],
    files: [
      {
        path: "ui/dialog.ts",
        type: "registry:ui",
        content:
          'import { Button } from "@/components/ui/button";\nimport { XIcon } from "@/lib/icons";\nimport { cn } from \'@/lib/utils\';\nexport function Dialog() {\n  return [Button, XIcon, cn];\n}\n',
      },
    ],
  },
} as const;

export function writeRegistry(dir: string, items: Record<string, unknown> = FIXTURE_ITEMS): string {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, item] of Object.entries(items)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(item));
  }
  const index = {
    name: "sibujs-ui",
    version: "9.9.9",
    aliases: { ui: "@/components/ui", lib: "@/lib" },
    items: Object.values(items).map((item) => {
      const { files, ...rest } = item as { files: { path: string; type: string }[] };
      return { ...rest, files: files.map((f) => ({ path: f.path, type: f.type })) };
    }),
  };
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index));
  return dir;
}

export function tempDir(prefix = "sibujs-registry-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A project shaped like `sibujs create` output, without Tailwind. */
export function writeProject(root: string, extra: Record<string, string> = {}): string {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "app", type: "module", dependencies: { sibujs: "^4.4.0" } }, null, 2),
    "package-lock.json": "{}",
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, lib: ["ES2020", "DOM"] }, include: ["src"] }, null, 2),
    "vite.config.ts": 'import { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [],\n});\n',
    "src/main.ts": 'import "./app.css";\nimport { mount } from "sibujs";\n',
    "src/app.css": "body { margin: 0; }\n",
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

export const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), "utf-8");
export const exists = (root: string, file: string) => fs.existsSync(path.join(root, file));
