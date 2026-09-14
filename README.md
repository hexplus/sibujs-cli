# sibujs-cli

Command-line tool for creating and managing [SibuJS](https://github.com/hexplus/sibujs) projects.

## Installation

```bash
npm install -g sibujs-cli
sibujs create my-app
```

Or use it directly with `npx` (no install needed):

```bash
npx sibujs create my-app
```

## Commands

### `sibujs create [name]`

Scaffold a new SibuJS project with Vite and TypeScript.

```bash
sibujs create my-app
```

Without flags the simplest possible app is created. Add flags to opt into features:

| Flag             | Description                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `--ui [theme]` | Add sibujs-ui with a theme color (includes Tailwind CSS). Themes: default, blue, green, red, orange, amber, yellow, teal, purple, violet, rose |
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

### `sibujs generate <type> <name>` (alias: `sibujs g`)

Generate a new component file.

```bash
sibujs generate component MyButton
sibujs g component Navbar
```

Creates a component file in `src/components/` (if the directory exists) or `src/`. Names are converted to PascalCase automatically.

| Type          | Description                         |
| ------------- | ----------------------------------- |
| `component` | Creates a SibuJS component function |

#### Component name rules

The name becomes both a filename and a `function` declaration, so it is
validated rather than coerced. A name is accepted when it is one or more
alphanumeric words separated by `-` or `_`, starting with a letter:

```bash
sibujs g component button        # -> src/Button.ts        export function Button()
sibujs g component my-card       # -> src/MyCard.ts        export function MyCard()
sibujs g component user_profile  # -> src/UserProfile.ts   export function UserProfile()
```

Anything else is refused with a nonzero exit code, and nothing is written:

| Rejected                     | Example                        |
| ---------------------------- | ------------------------------ |
| path separators              | `x/y`, `x\y`                   |
| traversal segments           | `../Outside`, `..`, `./x`      |
| absolute or drive paths      | `/abs/path`, `C:\outside`      |
| whitespace                   | `my button`                    |
| leading digits               | `123-widget`                   |
| dots                         | `component.name`               |
| quotes and template markers  | `component"`, ``component` ``  |
| control and NUL characters   | `comp\u0000onent`              |
| empty name                   | `""`                           |

The resolved path is additionally checked to be a direct child of the output
directory, on both POSIX and Windows path semantics, before any write happens.
An existing component is never overwritten.

Reserved words are accepted because normalization capitalizes them into legal
identifiers: `class` becomes `Class`, and `export function Class()` is valid.

## Copy-paste components

`init`, `add` and `list` copy [sibujs-ui](https://github.com/hexplus/sibujs-ui)
components into your project as source code you own and can edit. They are
read from the sibujs-ui registry, which is published inside the `sibujs-ui` npm
package, so every release of the components is also a release of the registry.

```bash
sibujs init                  # components.json, Tailwind CSS 4, the @/ alias, base styles, cn()
sibujs add button dialog     # copy components and everything they depend on
sibujs list                  # see what is available
```

```ts
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
```

You do not need the `sibujs-ui` package installed. Copied components can live
next to it, though: a project created with `sibujs create --ui` can copy the one
component it wants to change and keep importing the rest from the package.

### `sibujs init`

Prepares an existing project. Run it from the directory holding `package.json`.

```bash
sibujs init
sibujs init --style violet --yes
```

What it does, skipping anything already in place:

1. Writes [`components.json`](#componentsjson).
2. Sets up **Tailwind CSS 4**: adds `tailwindcss` and `@tailwindcss/vite`, and
   the plugin to `vite.config.ts`. A project that already uses Tailwind 4 (Vite
   plugin or PostCSS) is left alone; Tailwind 3 gets a warning, because the
   components need 4.
3. Makes sure there is a **stylesheet** (detected, or `src/app.css`, imported
   from `src/main.ts`) and adds the `@import` lines for the base styles and the
   theme after `@import "tailwindcss";`.
4. Declares the **`@/` import alias** in `tsconfig.json` (`tsconfig.app.json`
   when present) and in `resolve.alias` of the Vite config.
5. Copies the base items: `base` (theme tokens, animations, variants), `utils`
   (`cn()`, `cnReactive()`) and `theme-<style>` for a non-default style.
6. Installs the npm dependencies with the project's package manager.

Config files are only edited when the edit is unambiguous. The Vite config is
read with comments and strings masked out, so a commented-out `// plugins: []`
or a comment mentioning `@tailwindcss/vite` is never mistaken for the real
thing, and only top-level keys of the `defineConfig({ … })` or
`export default { … }` object are touched (never `build.rollupOptions.plugins`).
A tsconfig with comments, a function-form config, `plugins: somePlugins()`, or
an existing `resolve` block is left as it is, and `init` prints the exact lines
to add instead.

`--registry` is recorded in `components.json`, also when the file already
exists, so later `add` runs read from the same place. Without the flag, the
recorded value is kept, including through `--force`.

| Flag                  | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| `--style <name>`      | `default`, or a theme: blue, green, red, orange, amber, yellow, teal, purple, violet, rose. Prompted for when omitted in a terminal |
| `--css <file>`        | Stylesheet to wire (default: detected, or `src/app.css`)                            |
| `--force`             | Regenerate `components.json` even if it exists (otherwise it is kept)               |
| `--overwrite`         | Replace base files that exist and differ                                            |
| `-y, --yes`           | Use the defaults and never prompt                                                   |
| `--dry-run`           | Print what would change and write nothing                                           |
| `--no-install`        | Print the install command instead of running it                                     |
| `--registry <source>` | Registry to read from (see [Registries](#registries)); recorded in `components.json` |
| `--cwd <dir>`         | Project directory                                                                   |

```text
$ sibujs init --style violet
sibujs init · /home/me/my-app
registry: sibujs-ui 1.7.0 (https://unpkg.com/sibujs-ui@latest/dist/registry)

✔ created components.json (style: violet)
✔ updated vite.config.ts (add the @tailwindcss/vite plugin; alias "@" → ./src)
✔ updated tsconfig.json (add "@/*" to paths)
✔ updated src/app.css (+4 @import)
✔ wrote src/styles/sibujs-ui/base.css
✔ wrote src/styles/sibujs-ui/default.css
✔ wrote src/lib/utils.ts
✔ wrote src/styles/sibujs-ui/themes/violet.css

$ npm install "tailwindcss@^4" "@tailwindcss/vite@^4" "clsx@^2.1.1" "tailwind-merge@^3.0.1"

✔ Ready. Add components with sibujs add button
```

### `sibujs add <component...>`

Copies one or more components, and every registry item they depend on, into the
directories from `components.json`, then installs the npm packages they import
that `package.json` does not declare yet.

```bash
sibujs add button
sibujs add dialog dropdown-menu tabs
sibujs add --all
```

```text
$ sibujs add dialog
sibujs add dialog
registry: https://unpkg.com/sibujs-ui@latest/dist/registry

✔ wrote src/lib/lifecycle.ts (required by aria)
✔ wrote src/lib/aria.ts (required by dialog)
✔ wrote src/lib/types.ts (required by button)
✔ wrote src/components/ui/button.ts (required by dialog)
✔ wrote src/lib/controlled.ts (required by dialog)
✔ wrote src/lib/icons.ts (required by dialog)
✔ wrote src/lib/scroll-lock.ts (required by dialog)
✔ wrote src/components/ui/dialog.ts
= 3 dependency files already up to date

$ npm install "class-variance-authority@^0.7.1"

✔ Done. Import it with:
  import { Dialog } from "@/components/ui/dialog";
```

Registry files import each other as `@/components/ui/*` and `@/lib/*`. `add`
rewrites those imports to the aliases in your `components.json`, so custom
aliases work without editing anything by hand.

| Flag                  | Description                                                                          |
| --------------------- | ------------------------------------------------------------------------------------ |
| `--all`               | Add every component in the registry                                                  |
| `--overwrite`         | Replace files that exist and differ, without asking                                  |
| `-y, --yes`           | Never prompt: keep conflicting files, and run `init` with defaults if there is no `components.json` |
| `-p, --path <dir>`    | Put the components in this directory instead of `paths.ui` (see below)               |
| `--dry-run`           | Print what would be written and installed, and write nothing                         |
| `--no-install`        | Print the install command instead of running it                                      |
| `--registry <source>` | Registry to read from (see [Registries](#registries))                                |
| `--cwd <dir>`         | Project directory                                                                    |

#### Installing somewhere else with `--path`

Components import each other through the ui alias, so `--path` moves the alias
with the files. The directory must be reachable through an alias root the
project already has — the one in `components.json` (`@` ↔ `src`) or any
tsconfig `paths` wildcard:

```bash
sibujs add dialog --path src/widgets
# src/widgets/dialog.ts: import { Button } from "@/widgets/button";
```

A directory no alias reaches (for example `widgets/` at the project root, with
`@/*` pointing at `src/*`) is refused before anything is written. To use such a
directory permanently, set `aliases.ui` and `paths.ui` in `components.json`.

#### Existing files are never lost silently

A file identical to the registry version is left untouched. A file that exists
and **differs** — usually because you edited it — is a conflict:

- with `--overwrite`, it is replaced;
- in an interactive terminal, you are asked per file (skip, overwrite, skip all,
  overwrite all). Every question is answered before anything is written, so
  pressing Ctrl+C leaves the project exactly as it was;
- otherwise (CI, pipes, `--yes`), it is kept and reported:

```text
• skipped src/components/ui/button.ts (exists and differs; use --overwrite to replace)
```

`lib/icons.ts` is shared by every component and often extended by hand. A local
copy is kept, even when it differs, as long as it still exports every icon the
components need; otherwise the missing icons are named.

#### Errors

Every failure exits with status 1 and says what to do next:

```text
$ sibujs add dropdwn-menu
✖ Component "dropdwn-menu" was not found in the registry (https://unpkg.com/sibujs-ui@latest/dist/registry).
  Did you mean dropdown-menu? Run `sibujs list` to see every available component.

$ sibujs add button          # in a project without components.json, not in a terminal
✖ No components.json found in /home/me/my-app.
  Run `sibujs init` first, or pass --yes to set the project up with the defaults.

$ sibujs add button          # offline
✖ Could not reach the registry at https://unpkg.com/sibujs-ui@latest/dist/registry/button.json (ENOTFOUND).
  Check your connection, or use a local registry: --registry <dir> or SIBUJS_REGISTRY=<dir>.
```

If installing the npm packages fails, the command exits 1 and repeats the
install command: the files are already copied but will not build without them.

### `sibujs list` (alias: `sibujs ls`)

```bash
sibujs list                  # components, library helpers, styles and themes
sibujs list --type ui        # only components
sibujs list --json           # machine-readable, with "installed" when components.json exists
```

Inside a project with `components.json`, installed items are marked `✔`.

### `components.json`

`sibujs init` writes:

```json
{
  "$schema": "https://unpkg.com/sibujs-cli/schema/components.json",
  "style": "default",
  "tailwind": {
    "version": 4,
    "css": "src/app.css"
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib"
  },
  "paths": {
    "ui": "src/components/ui",
    "lib": "src/lib",
    "styles": "src/styles/sibujs-ui"
  }
}
```

Every key is optional. The smallest useful file is `{}`; values are derived in
this order:

| Key                  | Meaning                                                                  | Default                                  |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `style`              | `default` or a theme color; `init` installs `theme-<style>`              | `default`                                |
| `tailwind.version`   | Tailwind major version; only `4` is supported                            | `4`                                      |
| `tailwind.css`       | Stylesheet that receives the `@import` lines; `null` prints them instead | `null`                                   |
| `registry`           | Registry directory or URL                                                | the official registry                    |
| `aliases.components` | Root of your components                                                  | `@/components`                           |
| `aliases.ui`         | Import path of copied components                                         | `<components>/ui`                        |
| `aliases.utils`      | Module exporting `cn()`                                                  | `<lib>/utils`                            |
| `aliases.lib`        | Shared helpers, types and icons                                          | directory of `utils`, else `@/lib`       |
| `paths.ui`           | Directory for components                                                 | where `aliases.ui` points                |
| `paths.lib`          | Directory for helpers                                                    | where `aliases.lib` points               |
| `paths.styles`       | Directory for the base stylesheet and themes                             | `styles/sibujs-ui` next to `paths.lib`   |

An alias is mapped to a directory through your tsconfig `paths`
(`"~/*": ["./app/*"]` makes `~/components` mean `app/components`), falling back
to `@/`, `~/` and `#/` meaning `src/`. Setting `aliases.utils` to something other
than `<lib>/utils` (for example `@/utils/cn`) moves `cn()` there and rewrites
its imports to match. Every path must stay inside the project.

The file is also valid for the `sibujs-ui` package's own CLI, so
`npx sibujs-ui diff` works in a project set up with `sibujs init`. A top-level
`css` key, which that CLI writes, is read as `tailwind.css`.

The JSON Schema ships with this package at
[`schema/components.json`](schema/components.json).

### Registries

Items are read from, in order of precedence:

1. `--registry <source>`
2. the `SIBUJS_REGISTRY` environment variable
3. `registry` in `components.json`
4. the official registry, `https://unpkg.com/sibujs-ui@latest/dist/registry`

A source is a **directory** holding `index.json` and `<name>.json`, a **base
URL** (`<base>/<name>.json`), or a **URL template** containing `{name}`:

```bash
# Production: pin the registry to a sibujs-ui release
sibujs add button --registry https://unpkg.com/sibujs-ui@1.7.0/dist/registry
sibujs add button --registry "https://cdn.jsdelivr.net/npm/sibujs-ui@1.7.0/dist/registry/{name}.json"

# Local development: a sibujs-ui checkout after `npm run build:registry`
sibujs init --registry ../sibujs-ui/dist/registry
SIBUJS_REGISTRY=../sibujs-ui/dist/registry sibujs add button

# Offline, from the installed package
sibujs add button --registry node_modules/sibujs-ui/dist/registry
```

A base URL that redirects, as `@latest` does, is pinned to its target on the
first response, so every file of one run comes from the same release. Requests
time out after 15 seconds and are retried twice on network errors and 5xx
responses.

Registry content is treated as untrusted input: item names must be lowercase
words joined by hyphens, file paths must be plain paths under `ui/`, `lib/` or
`styles/` and are checked to land inside their configured directory, and npm
dependency specs are validated against a strict character allowlist before they
reach the package manager. Package names may not start with `-`, so an entry
such as `--ignore-scripts` can never act as a package-manager option; with npm,
the packages are additionally passed after `--`. An item that fails any check is refused before
anything is written.

### `sibujs dev`

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

### `sibujs build`

Build the project for production using Vite.

```bash
sibujs build
sibujs build --ssr
```

| Flag      | Description                     |
| --------- | ------------------------------- |
| `--ssr` | Build for server-side rendering |

### `sibujs preview`

Serve the production build locally for testing.

```bash
sibujs preview
sibujs preview --port 5000
```

| Flag                 | Description  |
| -------------------- | ------------ |
| `--port <port>`    | Port number  |
| `--host [address]` | Host address |

### Vite resolution and port validation

`dev`, `build` and `preview` run **the Vite installed in your project**. It is
resolved as a package, so pnpm, Yarn and hoisted monorepo layouts all work, and
it is executed directly with Node — never through a shell, and never through
`npx`, which would silently download Vite from the registry on a project that
does not have it. If Vite is missing, the command fails with a nonzero exit code
and tells you to install it.

Because no shell is involved, `--host` values are passed to Vite verbatim as a
single argument. Shell metacharacters in a host (`;`, `&`, `|`, `$(...)`,
backticks, redirection, spaces) are inert text, not commands. Any valid IPv4,
IPv6, hostname or wildcard value is accepted unchanged.

`--port` is validated before anything is spawned: it must be a plain integer
from 1 to 65535. `0`, negatives, decimals, values above 65535, empty values and
anything with extra characters are rejected with a clear message and a nonzero
exit code.

### `sibujs lint [...files]`

Lint source files for SibuJS best practices. Scans `src/` by default, or specify files explicitly.

```bash
sibujs lint
sibujs lint src/App.ts src/components/Nav.ts
```

Built-in rules:

| Rule                         | Description                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `no-hooks-in-conditionals` | Prevents calling reactive primitives (`signal`, `effect`, `derived`, etc.) inside `if`/`else` branches, ternaries and `&&`/`||`/`??` short-circuits |
| `no-direct-dom-mutation`   | Warns against `.innerHTML` / `.outerHTML` assignment — use reactive bindings instead                        |
| `each-requires-key`        | Ensures `each()` calls include a `key` option for efficient list updates                                   |

#### Exit behavior

**Violations fail the command with exit code 1.** Generated projects wire
`sibujs lint` into their `lint` script, and a lint step that always exits 0
gives CI false confidence.

```bash
sibujs lint              # exits 1 if anything is reported
sibujs lint --warn-only  # reports the same findings, exits 0
```

#### How the rules read your code

The linter parses with the TypeScript compiler rather than scanning text, so
comments, strings, template literals, regular expressions and property names are
never mistaken for real code. TypeScript is resolved at runtime from the project
being linted (every project `sibujs create` generates has it) and is declared as
an optional peer dependency; if it cannot be found, `sibujs lint` says so and
exits nonzero rather than guessing.

`each-requires-key` accepts a key only when it can establish one statically —
an object literal with a `key` property, either `{ key: fn }` or `{ key }`.
A missing third argument, `undefined`, an object without `key`, a spread, or an
options variable whose contents are unknown are all reported. The rule never
assumes an opaque value supplies a key, because a missing key degrades list
reconciliation silently at runtime. Suppress a known-good dynamic case with a
comment:

```ts
// sibujs-disable-next-line each-requires-key
each(items, renderItem, optionsBuiltElsewhere);
```

#### Suppressing a finding

Directives are read from **real comments only**. They are extracted from the
parser's comment trivia, so text that merely looks like a directive inside a
string, template literal, regular expression, JSX text or JSX attribute has no
effect — including text that also contains `//` or `/* */`.

```ts
const note = "sibujs-disable";   // just a string; suppresses nothing
const re = /sibujs-disable/;     // just a regex; suppresses nothing
```

The grammar is:

```text
<directive> [ <rule-name> ] [ "--" <reason> ]

<directive> ::= sibujs-disable | sibujs-disable-next-line
<rule-name> ::= no-hooks-in-conditionals
              | no-direct-dom-mutation
              | each-requires-key
```

```ts
element.innerHTML = html; // sibujs-disable
element.innerHTML = html; // sibujs-disable no-direct-dom-mutation

// sibujs-disable-next-line
element.innerHTML = html;

// sibujs-disable-next-line no-direct-dom-mutation -- markup is trusted here
element.innerHTML = html;
```

| Behavior | Rule |
| --- | --- |
| `sibujs-disable` | suppresses findings on the line the comment **ends** on, and only that line |
| `sibujs-disable-next-line` | suppresses findings on the **immediately following** physical line; blank lines are not skipped |
| a named rule | suppresses only that rule, never the others |
| no named rule | suppresses every rule on the targeted line |
| `--` | everything after it is a free-text reason and is ignored |

Matching is token-based, not substring-based. None of these is a directive:
`not-sibujs-disable`, `sibujs-disabled`, `sibujs-disable-something-else`,
`sibujs-disable-next-lines`.

**An unknown rule name makes the directive invalid, and it suppresses nothing** —
a typo must never silently switch off every rule.

Block comments work when the directive is the comment's only content, so both of
these are directives:

```ts
/* sibujs-disable-next-line */
element.innerHTML = html;

/*
 * sibujs-disable-next-line
 */
element.innerHTML = html;
```

A block comment that mixes the directive with prose — a JSDoc description, for
example — is **not** a directive, so documentation that mentions the syntax
cannot disable a rule by accident.

### `sibujs analyze`

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
sibujs g component MyHeader   # generate a component
sibujs init         # set up copy-paste components
sibujs add card     # copy a sibujs-ui component into src/components/ui
sibujs lint         # check for common mistakes
sibujs analyze      # review bundle impact
sibujs build        # production build
sibujs preview      # test the production build locally
```

## Requirements

- Node.js >= 22.12.0

  Scaffolded projects depend on `sibujs` 4.0, which needs >= 22.3.0 for its
  SSR request isolation, and on Vite 8, which needs `^20.19.0 || >= 22.12.0`.
  The intersection is 22.12.0, and that is what both this CLI and the generated
  `package.json` declare. Below it, npm silently skips Vite's native bundler
  binding and the first `build` fails with a "Cannot find native binding" error
  that says nothing about the real cause.

## Author

[hexplus](https://github.com/hexplus)

## License

MIT
