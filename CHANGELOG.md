# Changelog

All notable changes to sibujs-cli will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

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
