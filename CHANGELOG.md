# Changelog

All notable changes to sibujs-cli will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [1.1.1] — 2026-04-03

### Changed

- **Templates migrated to `each()` reactive getter API** — Both `default` and `ui` starter templates updated to use the new `each()` render signature where `item` is a getter (`item()`) instead of a plain value. Aligns with sibujs 1.0.8 breaking change.
