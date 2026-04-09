# Changelog

All notable changes to sibujs-cli will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — 2026-04-09

### Added

- **Inline lint disable comments for `no-direct-dom-mutation`** — The CLI `sibujs lint` command now respects `// sibujs-disable-next-line no-direct-dom-mutation` and `// sibujs-disable no-direct-dom-mutation` inline comments, allowing legitimate DOM mutations to be suppressed per-line.

---

## [1.1.1] — 2026-04-03

### Changed

- **Templates migrated to `each()` reactive getter API** — Both `default` and `ui` starter templates updated to use the new `each()` render signature where `item` is a getter (`item()`) instead of a plain value. Aligns with sibujs 1.0.8 breaking change.
