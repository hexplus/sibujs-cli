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
