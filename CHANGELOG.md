# Changelog

All notable changes to sibujs-cli will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

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
