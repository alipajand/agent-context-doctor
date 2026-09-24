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
- `--allow-outside` flag for `acd audit` to write `--output` outside the audited repository
- `file-access` and `file-size` issues for context files that were detected but not read
- `skipped` field on `ContextFile` explaining why a detected file was not read

### Changed

- Node.js 22.12 or later is now required. `commander` 15 already required it, so the old `>=18` range was inaccurate.
- CI runs on Node 22 and 24 with SHA-pinned actions and a read-only token; Dependabot now groups updates and also covers GitHub Actions.

### Security

- `--output` and `.acdrc` `audit.output` must resolve inside the audited repository, including after following symlinks. Previously a `.acdrc` in an untrusted repository could make `acd audit` overwrite any file the user could write, with partly attacker-controlled content.
- `.acdrc` `audit.repoPath` must stay inside the directory that contains `.acdrc`.
- Reports and `AGENTS.md` from `acd init` are never written through a symlink, including dangling ones.
- Symlinked directories are no longer traversed. Symlinked context files that point outside the audited directory are reported without being read, so an audited repo cannot pull files such as `/proc/self/environ` into reports or CI logs.
- Only regular files up to 1 MiB are read, so FIFOs, devices, or very large files cannot hang an audit or exhaust memory.
- Control characters and invisible Unicode are neutralized in terminal and Markdown output, and Markdown reports escape HTML. Excerpts such as `<!-- describe -->` no longer turn the rest of a report into an HTML comment.
- Bumped `vitest` to 4.1.11 for the `@vitest/mocker` path-traversal advisory.

### Fixed

- `command-alignment` no longer treats `Object.prototype` members such as `constructor` as existing scripts, and ignores malformed `scripts` fields instead of crashing.

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
