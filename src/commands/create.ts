import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import prompts from "prompts";

// Resolve template directory relative to the package root (one level up from dist/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");

const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; margin: 0; }

:root {
  --bg: #f9fafb;
  --bg-card: #ffffff;
  --text: #111827;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --border: #e5e7eb;
  --primary: #4f46e5;
  --primary-fg: #ffffff;
  --danger: #dc2626;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

/* Layout */
.container { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
.header { background: var(--bg-card); border-bottom: 1px solid var(--border); }
.footer { border-top: 1px solid var(--border); background: var(--bg-card); margin-top: auto; }
.footer .container { text-align: center; font-size: 14px; color: var(--text-muted); }
.page { min-height: 100vh; display: flex; flex-direction: column; }

/* Typography */
.title { font-size: 28px; font-weight: 700; }
.subtitle { color: var(--text-secondary); margin-top: 8px; }
.heading { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.desc { font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }
.muted { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.text-sm { font-size: 14px; }

/* Card */
.card { padding: 24px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 24px; }
.card:last-child { margin-bottom: 0; }

/* Flexbox */
.row { display: flex; align-items: center; gap: 8px; }
.row-lg { display: flex; align-items: center; gap: 12px; }

/* Button */
.btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: #f3f4f6; cursor: pointer; font-size: 14px; font-weight: 500; }
.btn:hover { background: #e5e7eb; }
.btn-primary { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); }
.btn-primary:hover { background: #4338ca; }
.btn-active { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); }
.btn-active:hover { background: var(--primary); filter: brightness(1.1); }
.btn-ghost { background: transparent; border: none; color: var(--primary); }
.btn-ghost:hover { background: #eef2ff; }
.btn-link { background: transparent; border: none; cursor: pointer; font-size: 14px; padding: 6px 12px; border-radius: 8px; color: var(--text); }
.btn-link:hover { background: #f3f4f6; }
.btn-link-active { background: var(--primary); color: var(--primary-fg); }
.btn-link-active:hover { background: var(--primary); filter: brightness(1.1); }
.btn-danger { color: var(--danger); }
.ml-auto { margin-left: auto; }

/* Input */
.input { padding: 8px 12px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 14px; outline: none; flex: 1; }
.input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(79,70,229,0.15); }

/* Counter */
.count { font-size: 24px; font-weight: 700; width: 48px; text-align: center; font-variant-numeric: tabular-nums; }

/* Todo */
.todo-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; }
.todo-item:hover { background: #f3f4f6; }
.todo-text { flex: 1; font-size: 14px; color: var(--text); }
.todo-done { text-decoration: line-through; color: var(--text-muted); }
.checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary); }

/* Page heading */
.page-title { font-size: 28px; font-weight: 700; margin: 0 0 16px; }
.page-text { color: var(--text-secondary); margin: 0; }

/* Nav */
.nav { background: var(--bg-card); border-bottom: 1px solid var(--border); }
.nav .container { display: flex; align-items: center; gap: 8px; padding-top: 12px; padding-bottom: 12px; }
.nav-brand { font-weight: 700; margin-right: 16px; }

/* Nested content */
.panel { border: 1px solid var(--border); border-radius: 12px; padding: 24px; background: var(--bg-card); }
.section-title { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
`;

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
]);

export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

export function toValidPackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-._~]/g, "-")
    .replace(/^[._]+/, "")
    .replace(/-+/g, "-");
}

export function detectPackageManager(): string {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("yarn")) return "yarn";
  return "npm";
}

function copyTemplate(srcDir: string, destDir: string, replacements: Record<string, string>) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destName = entry.name.replace(/\.tpl$/, "");
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, replacements);
    } else {
      const ext = path.extname(entry.name.replace(/\.tpl$/, "")).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        // Copy binary files as-is
        fs.copyFileSync(srcPath, destPath);
      } else {
        let content = fs.readFileSync(srcPath, "utf-8");
        for (const [key, value] of Object.entries(replacements)) {
          content = content.replaceAll(`{{${key}}}`, value);
        }
        fs.writeFileSync(destPath, content);
      }
    }
  }
}

const VALID_THEMES = [
  "default",
  "blue",
  "green",
  "red",
  "orange",
  "amber",
  "yellow",
  "teal",
  "purple",
  "violet",
  "rose",
] as const;

export interface CreateOptions {
  tailwind?: boolean;
  ui?: string;
  router?: boolean;
}

export async function create(name?: string, options: CreateOptions = {}) {
  let projectName: string;

  if (name) {
    projectName = name;
  } else {
    const response = await prompts(
      {
        type: "text",
        name: "name",
        message: "Project name:",
        initial: "my-sibujs-app",
        validate: (v: string) => v.trim().length > 0 || "Name is required",
      },
      { onCancel: () => process.exit(0) },
    );
    projectName = response.name;
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  const dirName = path.basename(targetDir);
  const pkgName = isValidPackageName(dirName) ? dirName : toValidPackageName(dirName);

  // --ui with no value passes true, --ui blue passes "blue"
  const rawUi = options.ui;
  const useUi = rawUi !== undefined;
  const theme = useUi ? (typeof rawUi === "string" ? rawUi : "default") : undefined;

  if (useUi && !VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])) {
    console.error(pc.red(`Invalid theme "${theme}". Available themes: ${VALID_THEMES.join(", ")}`));
    process.exit(1);
  }

  const useTailwind = (options.tailwind ?? false) || useUi;
  const useRouter = options.router ?? false;

  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0) {
      const { overwrite } = await prompts({
        type: "confirm",
        name: "overwrite",
        message: `Directory ${pc.yellow(dirName)} is not empty. Remove existing files and continue?`,
        initial: false,
      });
      if (!overwrite) {
        console.log(pc.red("Cancelled."));
        return;
      }
      // Remove contents but keep the directory itself
      for (const entry of entries) {
        fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
      }
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const replacements: Record<string, string> = {
    NAME: pkgName,
    SIBUJS_UI_DEP: useUi ? `,\n    "sibujs-ui": "^1.1.0"` : "",
    TAILWIND_DEPS: useTailwind ? `,\n    "@tailwindcss/vite": "^4.2.1",\n    "tailwindcss": "^4.2.1"` : "",
    TAILWIND_IMPORT: useTailwind ? `import tailwindcss from "@tailwindcss/vite";\n` : "",
    TAILWIND_PLUGIN: useTailwind ? "\n    tailwindcss(),\n  " : "",
    TAILWIND_CSS: useTailwind
      ? useUi
        ? [
            `@import "tailwindcss";`,
            `@import "sibujs-ui/themes/base.css";`,
            `@import "sibujs-ui/themes/default.css";`,
            ...(theme !== "default" ? [`@import "sibujs-ui/themes/${theme}.css";`] : []),
            `@source "../node_modules/sibujs-ui/dist";`,
          ].join("\n")
        : `@import "tailwindcss";\n\n${BASE_CSS}`
      : BASE_CSS,
  };

  // Copy base template
  copyTemplate(path.join(TEMPLATES_DIR, "default"), targetDir, replacements);

  // Apply feature overlays (each overwrites files from the base as needed)
  if (useUi && useRouter) {
    // routing overlay provides main.ts, router.ts, auth.ts; ui-routing provides App.ts + pages with UI components
    copyTemplate(path.join(TEMPLATES_DIR, "routing"), targetDir, replacements);
    copyTemplate(path.join(TEMPLATES_DIR, "ui-routing"), targetDir, replacements);
  } else if (useRouter) {
    copyTemplate(path.join(TEMPLATES_DIR, "routing"), targetDir, replacements);
  } else if (useUi) {
    copyTemplate(path.join(TEMPLATES_DIR, "ui"), targetDir, replacements);
  }

  const features: string[] = [];
  if (useTailwind) features.push("Tailwind CSS");
  if (useUi) features.push(`sibujs-ui (${theme})`);
  if (useRouter) features.push("Router");

  console.log(`\n${pc.green("✔")} Project created in ${pc.cyan(targetDir)}`);
  if (features.length > 0) {
    console.log(`  Features: ${features.join(", ")}`);
  }
  console.log();

  // Install dependencies
  const pm = detectPackageManager();
  console.log(`${pc.dim(`$ ${pm} install`)}\n`);
  try {
    execSync(`${pm} install`, { cwd: targetDir, stdio: "inherit" });
    console.log();
  } catch {
    console.log(pc.yellow("\nDependency install failed. Run it manually.\n"));
  }

  const relPath = path.relative(process.cwd(), targetDir) || dirName;
  console.log(pc.bold("Get started:\n"));
  console.log(`  cd ${relPath}`);
  console.log(`  ${pm === "npm" ? "npm run" : pm} dev\n`);
}
