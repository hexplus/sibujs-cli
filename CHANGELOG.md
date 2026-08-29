# Changelog

All notable changes to sibujs-cli will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [1.4.0] — 2026-08-29

Scaffolds SibuJS 4.0 projects.

### Changed — template dependencies

- `sibujs ^4.0.0` (was `^3.2.0`). 4.0 is the stability release: the public API
  is still the 3.x API, so the templates needed no code changes for it, but a
  new project should not start on a major that is now behind.
- `sibujs-ui ^1.5.0` (was `^1.4.1`).
- `sibujs-cli ^1.4.0` in the generated `devDependencies`, matching this release.
- `--version` reported `1.3.0` while `package.json` said `1.3.3`. It had been
  stale since 1.3.0 and is now read off the same version this package publishes.

### Changed — Node floor is now 22.12.0, and generated projects declare it

Both this package's `engines` (was `>= 18.0.0`) and every scaffolded
`package.json` (which declared nothing at all) now require `>= 22.12.0`.

That number is an intersection, not a preference: `sibujs` 4.0 requires
`>= 22.3.0` — its SSR request isolation is built on `process.getBuiltinModule`,
added in 22.3 — and the Vite 8 the templates pin requires
`^20.19.0 || >= 22.12.0`. Only `>= 22.12.0` satisfies both.

This is worth declaring because the failure mode is otherwise unreadable. On
Node 22.3 — a version that satisfies `sibujs` itself — npm quietly skips Vite's
optional native bundler binding, `npm install` reports success, and the first
`sibujs build` dies with `Cannot find native binding` and a suggestion to delete
`node_modules`, which does not help. With `engines` declared, npm prints an
`EBADENGINE` warning naming the required and current versions at install time.

### Fixed — `sibujs analyze` was off by an order of magnitude

Its size table was written for an early 2.x and never re-measured. Every
entry-point row understated 4-10x (`sibujs/plugins` was listed at 3.5 KB and is
18.7 KB, `sibujs-ui` at 8.0 KB and is 126.5 KB for the full library), and there
was no base cost at all, so a scaffolded app that really ships 26.9 KB was
reported as 2.5 KB.

All rows are now measured against the published sibujs 4.0.0 / sibujs-ui 1.5.0
packages with esbuild (bundle + minify, gzip -9). Entry-point rows are the
*marginal* cost of adding that entry on top of the root package rather than the
standalone size, because the command adds them to the per-import estimates
instead of replacing them — publishing standalone sizes would count the shared
reactivity core once per entry point.

Three model bugs came out of re-measuring, all fixed:

- A module reached only through named imports was charged its whole entry-point
  size on top of the per-name estimates. For a large tree-shakeable package that
  is a severe double count; the whole-package cost is now charged only for
  `import * as X` / `import X`, which is the case that actually defeats
  tree-shaking.
- There was no base cost, but every SibuJS app pays for the reactivity core plus
  the rendering path on its first import. That base is 25.9 KB, and it is now
  charged once. Root-package names show as `in base` rather than as separate
  fractions of a kilobyte.
- Names from a sub-entry or from sibujs-ui are charged a marginal 1.35 KB each,
  calibrated against four scaffolded apps built with Vite 8.

Validated against those four real bundles rather than asserted:

| scaffold | real js gzip | reported | delta |
| --- | --- | --- | --- |
| plain | 26.9 KB | 25.9 KB | -1.0 |
| router | 33.1 KB | 32.7 KB | -0.4 |
| ui | 37.9 KB | 36.7 KB | -1.2 |
| full | 43.3 KB | 40.8 KB | -2.5 |

It runs slightly under across all four and is a heuristic, not a bundler, so it
is documented in the source as a floor.

### Verified

Every flag combination was scaffolded, installed against the real registry, type
checked, built, and driven in a browser — not just diffed:

| scaffold | flags | install | `tsc --noEmit` | `vite build` | browser |
| --- | --- | --- | --- | --- | --- |
| plain | *(none)* | ok | ok | 79 kB / 27 kB gzip | counter increments, no console errors |
| ui | `--ui blue` | ok | ok | 115 kB js + 117 kB css | counter increments, no console errors |
| router | `--router` | ok | ok | 101 kB / 33 kB gzip | full navigation, no console errors |
| full | `--ui violet --router` | ok | ok | 134 kB / 43 kB gzip | full navigation, no console errors |

All four resolved `sibujs 4.0.0`, `vite 8.2.2` and `typescript 6.0.3`; the two
`--ui` variants resolved `sibujs-ui 1.5.0` and emitted the themed stylesheet, so
the `sibujs-ui/themes/*` imports resolve through that package's exports map.

The routing scaffolds were exercised rather than merely loaded: navigating to
`/about` swaps the view, `/dashboard` while logged out redirects to `/login`
through the route's `beforeEnter` guard, and after logging in the same click
lands on `/dashboard`. `sibujs generate component` still emits code that type
checks inside a generated project.

The templates already used the 4.0-correct router API (`beforeEnter`, not a
`guard` key) and the canonical positional shorthand, so no template source
changed in this release.

---

## [1.3.3] — 2026-06-01

### Changed — generated projects pin the latest sibujs / sibujs-ui

`sibujs create` now scaffolds `package.json` with:

- `sibujs ^3.2.0` (was `^3.0.0`). 3.2.0 is a security + bug-fix release (RouterLink/SSR sanitization, htm-parser fixes, disposal-correctness, the request-scoped SSR query cache), so flooring at `^3.2.0` ensures new projects can't resolve an older, vulnerable 3.0.x.
- `sibujs-ui ^1.4.1` (was `^1.3.0`), which fixes the portal-disposal leak in dropdown-menu / menubar / tooltip.
- `sibujs-cli ^1.3.3` (was `^1.3.0`) in devDependencies, matching this release.

Reviewed every template against the new versions: the `each()` usages correctly read the item/index **getters** (`todo()`, `key: (t) => t.id`), children are passed positionally, events use `on: { … }`, the router templates use current `sibujs/plugins` exports (`createRouter`, `route`, `navigate`, `Route`, `Outlet`), and the `sibujs-ui` theme imports (`sibujs-ui/themes/*.css`) still resolve. The `generate` command emits current-API code (`div("…")`). No CLI command, flag, or generated-source changes.

---

## [1.3.2] — 2026-04-19

### Fixed — generated projects install on sibujs 3.x

`sibujs create` was pinning `sibujs ^2.0.0` in the generated `package.json`, which is incompatible with the ecosystem after sibujs 3.0.0 shipped. Specifically, `sibujs-ui ^1.3.2` now peers on `sibujs ^3.0.0`, so `sibujs create --ui` would fail peer resolution on `npm install`.

Template `templates/default/package.json.tpl` now pins `sibujs ^3.0.0`. New projects scaffold cleanly with the current reactivity core and ErrorBoundary positional-children API.

No changes to the CLI's own commands, flags, generated source, or lint rules.

---

## [1.3.1] — 2026-04-18

### Fixed — generated-project dependencies align with current sibujs / sibujs-ui

`sibujs create` previously emitted `package.json` files pinning `sibujs ^1.5.0` and `sibujs-ui ^1.1.0`. Two problems:

- The sibujs pin was two major versions behind — new projects were scaffolded against a stale reactivity core missing every 2.x improvement.
- Combined with `--ui`, `npm install` on the generated project failed peer resolution: `sibujs-ui ^1.1.0` resolves to the latest 1.3.x, whose peer requires `sibujs ^2.0.0`, which the `^1.5.0` pin cannot satisfy.

Templates now pin `sibujs ^2.0.0` (in `templates/default/package.json.tpl`) and `sibujs-ui ^1.3.0` (in `src/commands/create.ts`). Newly scaffolded projects install cleanly on first try and pick up the current reactivity core.

No changes to the CLI's own API, commands, flags, or generated source code — only the version pins in the emitted `package.json`.

---

## [1.3.0] — 2026-04-12

### Added

- **Test suite** — New vitest-based test suite covering create/generate commands, lint rules, template structure, dependency versions, and router API compliance.
- **Active route highlighting in routing templates** — Generated `routing` and `ui-routing` templates now highlight the current page in the navigation bar and mark the active tab inside the Dashboard (Overview / Settings).

### Changed

- **Generated code uses shorthand canonical syntax** — All templates (`default`, `routing`, `ui`, `ui-routing`) and the `generate component` command emit positional tag-factory calls like `div("class", [children])` instead of the verbose `div({ class: "...", nodes: [...] })` object form.
- **Pinned dependency versions** — Generated `package.json` now pins `sibujs ^1.5.0` and `sibujs-ui ^1.1.0` (when `--ui` is used).
- **Tailwind-only template includes BASE_CSS** — `sibujs create --tailwind` (without `--ui`) now ships both Tailwind and the base CSS design tokens so the sample `App.ts` renders with proper styling out of the box.

---

## [1.2.0] — 2026-04-09

### Added

- **Inline lint disable comments for `no-direct-dom-mutation`** — The CLI `sibujs lint` command now respects `// sibujs-disable-next-line no-direct-dom-mutation` and `// sibujs-disable no-direct-dom-mutation` inline comments, allowing legitimate DOM mutations to be suppressed per-line.

---

## [1.1.1] — 2026-04-03

### Changed

- **Templates migrated to `each()` reactive getter API** — Both `default` and `ui` starter templates updated to use the new `each()` render signature where `item` is a getter (`item()`) instead of a plain value. Aligns with sibujs 1.0.8 breaking change.
