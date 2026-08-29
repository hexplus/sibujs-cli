import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  // Matches the engines floor in package.json. Downleveling further would
  // emit transforms for runtimes this package already refuses to run on.
  target: "node22",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
