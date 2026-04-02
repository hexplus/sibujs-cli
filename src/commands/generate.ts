import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

function toPascalCase(name: string): string {
  return name
    .replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

const COMPONENT_TEMPLATE = (name: string) =>
  `import { div } from "sibujs";

export function ${name}() {
  return div({
    nodes: ["${name} works!"],
  });
}
`;

export function generate(type: string, rawName: string) {
  if (type !== "component") {
    console.error(pc.red(`Unknown type "${type}". Supported: component`));
    process.exit(1);
  }

  const componentName = toPascalCase(rawName);

  // Determine output directory: use src/components/ if it exists, otherwise src/
  const srcDir = path.resolve(process.cwd(), "src");
  if (!fs.existsSync(srcDir)) {
    console.error(pc.red(`No src/ directory found. Are you in a Sibu project?`));
    process.exit(1);
  }

  const componentsDir = path.join(srcDir, "components");
  const outDir = fs.existsSync(componentsDir) ? componentsDir : srcDir;
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, `${componentName}.ts`);
  if (fs.existsSync(filePath)) {
    console.error(pc.red(`File already exists: ${path.relative(process.cwd(), filePath)}`));
    process.exit(1);
  }

  fs.writeFileSync(filePath, COMPONENT_TEMPLATE(componentName));
  console.log(`${pc.green("✔")} Created ${pc.cyan(path.relative(process.cwd(), filePath))}`);
}
