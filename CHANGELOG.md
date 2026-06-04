# Changelog

All notable changes to `agent-context-doctor` are documented here.

This project follows [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

---

## [Unreleased]

### Added

- `docs/ARCHITECTURE.md` — system design and module boundary reference
- `docs/ROUTES.md` — CLI command reference with all flags and exit codes
- `docs/API.md` — module contracts and exported type reference
- `docs/prompts/` — reusable QA, bugfix, and refactor task prompt templates
- `.editorconfig` — consistent editor settings across contributors
- `.gitattributes` — LF normalization for all text files
- `.vscode/settings.json` and `.vscode/extensions.json` — recommended IDE setup

---

## [0.1.0] — 2026-06-04

### Added

- Initial release of `acd` CLI
- `acd audit` command with terminal, JSON, and Markdown output
- `acd list` command to enumerate detected context files
- `acd init` command to scaffold a starter `AGENTS.md`
- Seven audit checks: `placeholder-content`, `risky-language`, `command-alignment`, `safety-boundaries`, `validation-commands`, `final-reporting`, `contradictions`
- Deduction-based scoring (100 − severity deductions), graded excellent / good / needs-work / risky
- `.acdrc` configuration file with Zod validation
- Inline `<!-- acd-disable <category> -->` suppression comments
- `--fail-on <severity>` flag for CI integration
- `--output <path>` flag to write Markdown reports
- Negative lookbehind in risky-language patterns to avoid false positives on "do not X" directives
- `docs/DOGFOODING.md` tracking real-world audit results and false-positive fixes
- `docs/RELEASE.md` publish checklist
- Dependabot config for automated dependency updates
- GitHub Actions CI workflow

[Unreleased]: https://github.com/alipajand/agent-context-doctor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alipajand/agent-context-doctor/releases/tag/v0.1.0
