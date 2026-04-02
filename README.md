# sibujs-cli

Command-line tool for creating and managing [SibuJS](https://github.com/hexplus/sibujs) projects.

## Installation

```bash
npm install -g sibujs-cli
```

Or use it directly with `npx`:

```bash
npx sibujs-cli create my-app
```

Once installed globally the CLI is available as `sibujs`.

## Commands

### `sibujscreate [name]`

Scaffold a new SibuJS project with Vite and TypeScript.

```bash
sibujs create my-app
```

Without flags the simplest possible app is created. Add flags to opt into features:

| Flag             | Description                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `--ui <theme>` | Add sibujs-ui with a theme color (includes Tailwind CSS). Themes: default, blue, green, red, orange, amber, yellow, teal, purple, violet, rose |
| `--router`     | Add routing with example pages                                                                          |
| `--tailwind`   | Add Tailwind CSS without sibujs-ui                                                                      |

Examples:

```bash
# Simplest app — no extras
sibujs create my-app

# With sibujs-ui using the blue theme (recommended)
sibujs create my-app --ui blue

# Full-featured project
sibujs create my-app --ui violet --router

# Tailwind only, no UI library
sibujs create my-app --tailwind
```

The generated project includes:

- `vite.config.ts` — Vite dev server with optional Tailwind plugin
- `tsconfig.json` — TypeScript with strict mode and bundler resolution
- `src/main.ts` — Entry point that mounts the root component
- `src/App.ts` — Starter app with a counter and todo list demo
- `src/app.css` — Tailwind imports or base reset styles

When `--router` is selected the project also includes:

- `src/router.ts` — Router setup with route definitions
- `src/auth.ts` — Simple auth state for the protected route example
- `src/pages/Home.ts` — Home page
- `src/pages/About.ts` — About page
- `src/pages/Login.ts` — Login page
- `src/pages/Dashboard.ts` — Protected dashboard with nested routes (Overview, Settings) using `Outlet`

When `--ui` is selected, `sibujs-ui` and the default theme are added automatically.

### `sibujsgenerate <type> <name>` (alias: `sibujsg`)

Generate a new component file.

```bash
sibujs generate component MyButton
sibujs gcomponent Navbar
```

Creates a component file in `src/components/` (if the directory exists) or `src/`. Names are converted to PascalCase automatically.

| Type          | Description                         |
| ------------- | ----------------------------------- |
| `component` | Creates a SibuJS component function |

### `sibujsdev`

Start the Vite development server with hot module replacement.

```bash
sibujs dev
sibujs dev --port 4000
sibujs dev --host              # expose on all interfaces
sibujs dev --host 0.0.0.0
```

| Flag                 | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `--port <port>`    | Port number                                           |
| `--host [address]` | Host address (bare `--host` exposes on `0.0.0.0`) |

### `sibujsbuild`

Build the project for production using Vite.

```bash
sibujs build
sibujs build --ssr
```

| Flag      | Description                     |
| --------- | ------------------------------- |
| `--ssr` | Build for server-side rendering |

### `sibujspreview`

Serve the production build locally for testing.

```bash
sibujs preview
sibujs preview --port 5000
```

| Flag                 | Description  |
| -------------------- | ------------ |
| `--port <port>`    | Port number  |
| `--host [address]` | Host address |

### `sibujslint [...files]`

Lint source files for SibuJS best practices. Scans `src/` by default, or specify files explicitly.

```bash
sibujs lint
sibujs lint src/App.ts src/components/Nav.ts
```

Built-in rules:

| Rule                         | Description                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `no-hooks-in-conditionals` | Prevents calling reactive primitives (`signal`, `effect`, `derived`, etc.) inside `if`/`else` blocks |
| `no-direct-dom-mutation`   | Warns against `.innerHTML =` mutations — use reactive bindings instead                                      |
| `each-requires-key`        | Ensures `each()` calls include a `key` option for efficient list updates                                   |

### `sibujsanalyze`

Analyze the bundle size impact of all SibuJS and sibujs-ui imports in your project.

```bash
sibujs analyze
```

Output shows each imported API, its usage count, and estimated tree-shaken size. Tag factories (`div`, `span`, `button`, etc.) share a single factory function so they add near-zero cost per additional tag.

## Typical workflow

```bash
sibujs create my-app --tailwind --router
cd my-app
sibujs dev          # develop with HMR
sibujs gcomponent MyHeader   # generate a component
sibujs lint         # check for common mistakes
sibujs analyze      # review bundle impact
sibujs build        # production build
sibujs preview      # test the production build locally
```

## Requirements

- Node.js >= 18.0.0

## License

MIT
