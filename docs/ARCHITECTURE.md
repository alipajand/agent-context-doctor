# Architecture

## System context

`agent-context-doctor` (`acd`) solves a documentation quality problem: AI coding agents work correctly only when their instruction files are complete, consistent, and free of risky or placeholder content. This CLI reads those instruction files deterministically, runs a set of static checks, and reports issues with severity ratings.

The tool has no runtime server, no database, no network dependencies, and no LLM calls. All results are computed locally from the content of files on disk.

## Major components

| Path | Role |
| --- | --- |
| `src/cli.ts` | Commander entrypoint; routes `audit`, `list`, and `init` subcommands |
| `src/audit/auditRepo.ts` | Orchestrates all checks, applies suppressions, computes the final score |
| `src/audit/detectContextFiles.ts` | Discovers and classifies agent context files in a repo |
| `src/audit/checks/*` | Individual static checks — one pure function per check |
| `src/audit/score.ts` | Deduction-based scoring: starts at 100, subtracts per severity |
| `src/audit/evidence.ts` | Extracts line-level evidence snippets for check findings |
| `src/audit/suppressions.ts` | Parses `acd-disable` inline comments; filters suppressed issues |
| `src/config/loadConfig.ts` | Loads and validates `.acdrc` via Zod |
| `src/config/schema.ts` | Zod schema for `.acdrc` (audit options, rule overrides) |
| `src/report/terminalReport.ts` | Colored terminal output |
| `src/report/jsonReport.ts` | JSON serialization of `AuditResult` |
| `src/report/markdownReport.ts` | Markdown report writer |
| `src/fs/findFiles.ts` | `fast-glob`-backed file discovery for context files |
| `src/fs/readTextFile.ts` | UTF-8 text reader with byte counting |
| `src/fs/readPackageJson.ts` | Reads `package.json` scripts for command-alignment checks |
| `src/fs/writeReport.ts` | Writes Markdown report to disk (relative to audited repo root) |
| `src/init/initRepo.ts` | Safe-write scaffolder for `AGENTS.md` |
| `src/init/template.ts` | Starter `AGENTS.md` template string |
| `tests/*` | Vitest specs — one spec file per check plus CLI integration tests |

## Audit checks

All checks are pure functions in `src/audit/checks/`. Each accepts a file path and its text content (or a set of file entries for cross-file checks) and returns `ContextIssue[]`.

| Check | File | What it catches |
| --- | --- | --- |
| `checkPlaceholderContent` | `placeholderContent.ts` | TODO/TBD markers, lorem ipsum, blank template sections |
| `checkRiskyLanguage` | `riskyLanguage.ts` | High-risk directives (skip tests, commit secrets) and medium-risk ones (make product decisions) |
| `checkCommandAlignment` | `commandAlignment.ts` | Commands referenced in instruction files that are missing from `package.json` scripts |
| `checkSafetyBoundaries` | `safetyBoundaries.ts` | Primary files lacking "ask before / do not change / forbidden" language |
| `checkValidationCommands` | `validationCommands.ts` | Primary files that don't mention test/lint/typecheck/build |
| `checkFinalReporting` | `finalReporting.ts` | Primary files without final-report guidance (files changed, commands run, etc.) |
| `checkContradictions` | `contradictions.ts` | Cross-file directives that contradict each other (always run tests vs. skip tests) |

## Scoring model

Scoring is deduction-based: every repo starts at **100** and loses points for each issue found.

| Severity | Deduction |
| --- | --- |
| `high` | −20 |
| `medium` | −8 |
| `low` | −3 |

Score is floored at 0. Grades: ≥90 excellent · ≥75 good · ≥50 needs-work · <50 risky.

## Context file classification

`detectContextFiles` scans for known patterns and assigns a `ContextFileKind`:

| Kind | Files matched |
| --- | --- |
| `agents` | `AGENTS.md` |
| `claude` | `claude.md` |
| `cursor` | `.cursorrules`, `.cursor/rules/**` |
| `copilot` | `**/copilot-instructions*` |
| `codex` | `.codex/**` |
| `prompt` | `docs/prompts/**`, `.github/instructions/**` |
| `unknown` | anything else matched by the glob |

Only primary instruction files (`agents`, `claude`, `cursor`, `copilot`) are checked by `checkSafetyBoundaries`, `checkValidationCommands`, and `checkFinalReporting`.

## Report formats

| Format | Trigger | Module |
| --- | --- | --- |
| Terminal (colored) | default | `src/report/terminalReport.ts` |
| JSON | `--json` | `src/report/jsonReport.ts` |
| Markdown | `--output *.md` | `src/report/markdownReport.ts` |

## Suppression model

Inline suppressions use the comment syntax `<!-- acd-disable <category> -->`. The suppression applies to the entire file it appears in. Known categories are defined in `src/audit/suppressions.ts`. Cross-file contradiction suppressions require the same category to be suppressed in all involved files.

## Data flow

```
CLI command (audit / list / init)
  → load .acdrc from resolved repoPath (default: cwd)
  → detectContextFiles(repoPath, ignoreFiles)
  → for each context file:
      read content → run per-file checks → collect ContextIssue[]
  → checkContradictions(allFileContents)  [cross-file]
  → filterSuppressedIssues per file
  → computeScore(allIssues)
  → format output (terminal | JSON | Markdown)
  → exit 0 (or non-zero if --fail-on threshold met)
```

## Boundaries

- **Agent-editable:** `src/audit`, `src/report`, `src/config`, `src/fs`, `src/init`, `tests/`, and `docs/`.
- **Requires human review:** binary name (`acd`), existing command names (`audit`, `list`, `init`), `AuditResult` JSON shape, `.acdrc` schema breaking changes, and any external network or telemetry additions.

## Related docs

- `docs/ROUTES.md` — CLI command reference
- `docs/API.md` — module contracts and exported types
- `docs/DOGFOODING.md` — real-world audit results and false-positive history
- `docs/RELEASE.md` — publish checklist and version policy
