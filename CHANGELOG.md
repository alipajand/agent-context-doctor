# Changelog

All notable changes to `agent-context-doctor` are documented here.

This project follows [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

---

## [Unreleased]

### Added

- `agent-config` check for committed agent settings. Claude Code: `bypassPermissions` and unrestricted `Bash` allow rules (high), `enableAllProjectMcpServers` (medium). MCP configs (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `.roo/mcp.json`): hardcoded credentials in `env`/headers (high, redacted), `npx`/`uvx` packages without a pinned version and plain-HTTP remote servers (medium). JSONC is supported, and config files that resolve outside the repository are not read.
- `acd checks` lists every check ID with its severity and description (`--json` for machine output).
- Library entry point: `import { auditRepo } from 'agent-context-doctor'` (`main`, `types`, and `exports` in `package.json`).
- `broken-references` check: Markdown links, inline-code paths, and Claude `@imports` that point at files that no longer exist. Targets are only probed inside the repository; `.js` references match their `.ts` sources.
- `file-size` budget: primary instruction files over 40 KB (configurable with `rules.maxFileBytes`) get a low issue, since agents load them into every session.
- `command-alignment` also checks `make <target>` references against the Makefile.
- `--format terminal|json|markdown|sarif|github` (and `audit.format` in `.acdrc`). SARIF 2.1.0 uploads to GitHub code scanning; `github` prints workflow annotations that appear inline on pull requests. `--json` still works.
- `--min-score <n>` (and `audit.minScore`) to fail when the score drops below a threshold.
- `--baseline <file>` (and `audit.baseline`): issues already listed in an earlier `acd audit --json` report are marked known and do not trigger `--fail-on`, so existing repositories can adopt `acd` without fixing everything first. Issues carry a line-independent `fingerprint`.
- Detection for GEMINI.md, AGENT.md, Windsurf, Cline, Roo Code, Kiro, Junie, Augment, Continue, and Goose instruction files; Claude subagents, skills, and nested commands; Copilot prompt, chat mode, and agent files; nested Cursor rules; and nested `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` in monorepo packages. New `ContextFileKind` values: `gemini`, `windsurf`, `cline`, `roo`, `kiro`, `junie`, `augment`, `continue`, `goose`.
- `vendor/`, test fixture directories, virtualenvs, `target/`, `.next/`, and `.turbo/` are skipped during discovery.
- `hidden-characters` check: flags invisible Unicode in instruction files — tag characters (high, with the hidden text decoded), bidirectional controls (high), and zero-width characters (medium). Legitimate ZWJ in emoji and ZWNJ in scripts such as Persian are not flagged.
- `secrets` check: flags AWS, GitHub, Anthropic, OpenAI, Stripe, Slack, and npm tokens, private keys (high), and credential-looking assignments (medium). Evidence is redacted and obvious placeholders are ignored.
- `risky-language` now also flags `--no-verify`, force pushes, skipped agent permission prompts, disabled TLS verification, deleting failing tests (high), and pushing directly to main, merging without review, `curl | sh`, `chmod 777`, and suppressing type or lint errors (medium).
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

- Install docs point to GitHub (`npm install -g github:alipajand/agent-context-doctor`). The npm package named `agent-context-doctor` belongs to an unrelated project, and the previous instructions would have installed it. A `prepare` script now builds `dist/` for git installs.
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

- `command-alignment` reported prose such as "use pnpm for everything" (`for`), flags such as `pnpm -C dir test` (`-C`) and `--filter`, built-ins such as `pnpm exec`, `pnpm dlx`, `yarn workspace`, and `bun test`, and a second command on the same line was swallowed by the first. Workspace-targeted runs are now skipped, since their scripts live in another package.
- The structural checks (safety boundaries, validation commands, final reporting) flagged every primary file on its own. A `CLAUDE.md` that just says "Follow AGENTS.md" lost up to 19 points, and each file in a `.cursor/rules/` set had to repeat every section. Guidance now counts when it appears in the file, in a context file it references, or in another primary file for the same tool. Nested `AGENTS.md` files get content checks only.
- `risky-language` and `contradictions` treated safety guidance such as "Never skip tests" or "You should never bypass auth" as the risky instruction it forbids. Only "not" directly before the phrase was recognized as negation; the check now looks for negation anywhere earlier in the same clause.
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
