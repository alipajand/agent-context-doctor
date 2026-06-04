# Dogfooding — agent-context-doctor

This document tracks how `agent-context-doctor` (`acd`) has been used on real repositories, what it found, and where it needed tuning.

---

## Purpose

Dogfooding means running `acd` on the repositories of the people building and using it. This keeps the tool honest: if it produces too many false positives, we fix the checks. If it misses obvious problems, we add them.

---

## Repositories tested

### agent-context-doctor (this repo)

The tool is run against its own `AGENTS.md` and `.cursor/rules/project.mdc` on every change.

**Score:** 100 / 100 — excellent  
**Issues:** 0

**Notes:** Both files were written with `acd` in mind and cover all required checks. The `.cursor/rules/project.mdc` is intentionally kept in sync with `AGENTS.md`.

---

### agent-readiness-kit

A scaffolding repo that generates agent instruction files for new projects.

**Score:** to be filled after local run  
**Issues:** to be filled after local run

**Expected findings:** Likely placeholder content in generated template files. The tool should flag any unfilled `TODO`/`TBD` markers that ship in the default scaffold.

---

### agent-pr-reviewer-lite

A lightweight PR review agent driven by a `.github/copilot-instructions.md` file.

**Score:** to be filled after local run  
**Issues:** to be filled after local run

**Expected findings:** Copilot instruction files often omit validation commands (there is no `pnpm test` to run in a GitHub Actions context). This is a legitimate false positive — use `disabledChecks: ["validation-commands"]` or `allowedMissingScripts` to suppress it once confirmed.

---

### LedgerGuard

A financial data pipeline with multiple agent context files spread across `AGENTS.md`, a `.cursor/rules/` directory, and legacy `.cursorrules`.

**Score:** to be filled after local run  
**Issues:** to be filled after local run

**Expected findings:** Cross-file contradictions are likely given the number of context files. Safety-boundary language may be missing from cursor rule files if they were written before `acd` existed.

---

## Findings from agent-context-doctor itself

Running `pnpm dev audit .` on this repo produced no issues after all checks were reviewed and the instruction files were updated to satisfy them. Key improvements made in response to self-audit:

- Added explicit `Ask before` language for auth, billing, database, and production to `AGENTS.md`.
- Added `## Final report` section with required fields (`files changed`, `commands run`, `tests added`, `known limitations`).
- Confirmed all scripts referenced in `AGENTS.md` (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`) exist in `package.json`.

---

## False positives fixed

| Check | Pattern | Issue | Resolution |
|-------|---------|-------|-----------|
| `risky-language` | `make product decisions` | Fired on "do not make product decisions" | Added negative lookbehind so "do not X" is ignored |
| `risky-language` | `skip tests` | Fired on "do not skip tests" | Added negative lookbehind |
| `risky-language` | `bypass auth` | Fired on "do not bypass auth" | Added negative lookbehind |
| `contradictions` | product-decisions group | Fired on "do not make product decisions" in same file | Negative lookbehind added to opposing phrase regex |

---

## Current limitations

- **No per-line evidence for structural checks.** `safety-boundaries`, `validation-commands`, and `final-reporting` checks return file-level issues with no line number because they match the whole file. Evidence snippets are only available for line-level checks.
- **`validationCommands` false positive for GitHub Actions.** Repos where agents run via CI and cannot invoke `pnpm test` locally will be flagged. Use `disabledChecks: ["validation-commands"]` until a context-aware exception is added.
- **`finalReporting` and the word "tests".** If any other content in the file contains the word "tests" (e.g. "skip tests"), the final-reporting check passes even if no explicit final-report section exists. This is a known gap.
- **No partial-match deduplication.** If two files each define "tests must pass" the contradiction check does not deduplicate — it still only fires once per group, but the involved-file evidence may appear redundant.
- **Binary and generated files are not audited.** Only text files matching the known context-file patterns are read.

---

## Next checks to consider

| Check | Severity | Rationale |
|-------|---------|-----------|
| `file-size` | low | Instruction files over 10 KB are hard for agents to parse reliably |
| `duplicate-rules` | medium | The same directive repeated across multiple files increases drift risk |
| `ambiguous-scope` | medium | Detect "do whatever you think is best" or similar open-ended scope language |
| `missing-examples` | low | Instruction files with no code examples or sample commands may be less actionable |
| `stale-scripts` | medium | Commands mentioned in instruction files that no longer exist in `package.json` after a refactor |
| `no-rollback-guidance` | low | Primary files that don't mention what to do if a migration or schema change needs to be rolled back |
