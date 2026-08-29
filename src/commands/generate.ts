import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { isDirectChild, normalizeComponentName } from "../lib/component-name.js";

const COMPONENT_TEMPLATE = (name: string) =>
  `import { div } from "sibujs";

export function ${name}() {
  return div("${name} works!");
}
`;

export function generate(type: string, rawName: string) {
  if (type !== "component") {
    console.error(pc.red(`Unknown type "${type}". Supported: component`));
    process.exit(1);
  }

  // Validate before touching the filesystem, so a rejected name cannot leave a
  // directory or a partial file behind.
  const result = normalizeComponentName(rawName);
  if (!result.ok) {
    console.error(`${pc.red("✖")} Invalid component name ${pc.yellow(JSON.stringify(rawName))}.`);
    console.error(`  ${result.reason}`);
    console.error(`  ${pc.dim("Expected something like: button, my-card, user_profile")}`);
    process.exit(1);
  }
  const componentName = result.name;

  // Determine output directory: use src/components/ if it exists, otherwise src/
  const srcDir = path.resolve(process.cwd(), "src");
  if (!fs.existsSync(srcDir)) {
    console.error(pc.red(`No src/ directory found. Are you in a Sibu project?`));
    process.exit(1);
  }

  const componentsDir = path.join(srcDir, "components");
  const outDir = fs.existsSync(componentsDir) ? componentsDir : srcDir;

  const filePath = path.join(outDir, `${componentName}.ts`);

  // Second, independent gate: whatever the name rules allowed, the resolved
  // path must still land directly inside the output directory. Defence in
  // depth — the name policy and the containment check would both have to be
  // wrong for a write to escape.
  if (!isDirectChild(outDir, filePath)) {
    console.error(`${pc.red("✖")} Refusing to write outside ${pc.cyan(path.relative(process.cwd(), outDir))}.`);
    process.exit(1);
  }

  if (fs.existsSync(filePath)) {
    console.error(pc.red(`File already exists: ${path.relative(process.cwd(), filePath)}`));
    process.exit(1);
  }

  // Only now is it safe to create anything.
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(filePath, COMPONENT_TEMPLATE(componentName));
  console.log(`${pc.green("✔")} Created ${pc.cyan(path.relative(process.cwd(), filePath))}`);
}
