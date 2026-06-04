# agent-context-doctor

A deterministic CLI that audits repository agent context files for quality, safety, contradictions, stale commands, and generic placeholder content.

## What it does

`agent-context-doctor` (`acd`) scans your repository for agent instruction files (AGENTS.md, CLAUDE.md, .cursorrules, Copilot instructions, etc.) and checks each one for common problems:

- **Presence** — Are any agent context files present at all?
- **Placeholder content** — Are there unfilled template markers like `TODO`, `TBD`, `lorem ipsum`, or blank scope sections?
- **Safety boundaries** — Do primary instruction files include forbidden-change / ask-before language covering auth, billing, database, and production?
- **Validation commands** — Do instruction files tell agents to run tests, lint, or typecheck?
- **Final reporting** — Do instruction files tell agents what to include in their final summary?
- **Risky language** — Do instructions contain dangerous directives like "skip tests", "bypass auth", or "commit secrets"?

## What it does NOT do

- Does **not** call any LLM or AI API
- Does **not** collect telemetry or phone home
- Does **not** require authentication
- Does **not** guarantee that agent outputs will be correct
- Does **not** replace human code review

## Install

**From npm** (after npm release):

```bash
npm install -g agent-context-doctor # after npm release
```

**Local development install:**

```bash
git clone https://github.com/alipajand/agent-context-doctor.git
cd agent-context-doctor
pnpm install
pnpm dev audit        # run against the current directory
pnpm build            # compile to dist/
node dist/cli.js audit # run the compiled binary directly
```

## Initialize starter context

If your repository has no agent context file yet, `acd init` creates a safe, opinionated `AGENTS.md` in one command:

```bash
acd init                  # write AGENTS.md in the current directory
acd init /path/to/repo    # write AGENTS.md in a specific directory
acd init --force          # overwrite an existing AGENTS.md
acd init --print          # print the template to stdout without writing
```

**Safety behavior:**

- `acd init` will **not** overwrite an existing `AGENTS.md` unless you pass `--force`.
- If `AGENTS.md` already exists, the command exits non-zero with:
  `AGENTS.md already exists. Use --force to overwrite.`

**After running `acd init`, review and customize the generated file.** The starter template includes placeholder commands (`pnpm typecheck`, `pnpm test`, `pnpm build`) that may not exist in your project. Replace them with the actual commands from your `package.json`, or configure `allowedMissingScripts` in `.acdrc` to suppress false-positive command-alignment warnings.

## Commands

```bash
# Audit current directory
acd audit

# Audit a specific repo path
acd audit /path/to/repo

# Output as JSON
acd audit --json

# Write a Markdown report
acd audit --output docs/agent-context-report.md

# Combine JSON + Markdown
acd audit --json --output docs/agent-context-report.md

# Exit non-zero if high/medium/low issues exist
acd audit --fail-on high
acd audit --fail-on medium
acd audit --fail-on low

# List detected context files only
acd list
acd list /path/to/repo
```

## Audited file types

| Pattern | Kind |
|---------|------|
| `AGENTS.md` | agents |
| `CLAUDE.md` | claude |
| `.cursorrules` | cursor |
| `.cursor/rules/*.mdc` | cursor |
| `.github/copilot-instructions.md` | copilot |
| `docs/prompts/**/*.md` | prompt |
| `prompts/**/*.md` | prompt |
| `.codex/**/*.md` | codex |
| `.github/instructions/**/*.md` | prompt |

## Severity model

| Level | Meaning |
|-------|---------|
| `high` | Blocks or endangers correct agent behavior — fix immediately |
| `medium` | Weakens safety, completeness, or correctness |
| `low` | Missing guidance that would improve agent output quality |

Exit codes: `0` = clean (or issues below threshold), `1` = issues found at or above `--fail-on` threshold.

## Sample output

```
Agent Context Doctor
──────────────────────────────────────────────────
Repo:    /home/user/myproject
Files:   2
Issues:  3 total — 1 high, 1 medium, 1 low

Context Files:
  ✓ AGENTS.md (agents, 1234B)
  ✓ .cursor/rules/project.mdc (cursor, 567B)

Issues:
  [high] AGENTS.md:3 — Risky instruction: "skip tests"
    Recommendation: Remove language that lets agents bypass validation.
    Evidence: skip tests if the suite is too slow
  [medium] .cursor/rules/project.mdc — No safety-boundary language found
    Recommendation: Add explicit forbidden-change guidance.
  [low] AGENTS.md — No final reporting guidance found
    Recommendation: Add instructions about final report.
```

Evidence snippets are short local extracts from the audited files — nothing is uploaded or transmitted.

## Examples

The `examples/` directory contains ready-to-run fixtures to demonstrate the difference between a well-written and a poorly-written agent context file.

**Audit the bad example** — expect many issues:

```bash
pnpm dev audit examples/bad-context
```

`examples/bad-context` intentionally contains placeholder content (`TODO`/`TBD`), risky directives (`skip tests`), missing safety-boundary language, and contradictions between `AGENTS.md` and `.cursor/rules/project.mdc`. Running `acd` here produces a score of **0 / 100 — risky** with multiple high-severity issues.

**Audit the good example** — expect a clean result:

```bash
pnpm dev audit examples/good-context
```

`examples/good-context/AGENTS.md` follows every best practice: forbidden-change boundaries, required validation commands, a final-report section, and no risky language. Running `acd` here produces a score of **97 / 100 — excellent** with zero high or medium issues.

Use these examples as a starting point when writing your own instruction files or when explaining the tool to your team.

## Configuration — `.acdrc`

Add an optional `.acdrc` file at the repo root to customize audit behavior without changing CLI commands. It is a JSON file validated strictly on load — invalid config exits non-zero with a clear message.

### Schema

```json
{
  "audit": {
    "repoPath": "packages/app",
    "output": "docs/agent-context-report.md",
    "json": false,
    "failOn": "high"
  },
  "rules": {
    "ignoreFiles": ["docs/prompts/legacy/**"],
    "disabledChecks": ["placeholder-content"],
    "allowedMissingScripts": ["validate"]
  }
}
```

### `audit` options

| Key | Type | Description |
|-----|------|-------------|
| `repoPath` | `string` | Default repo to audit (relative to `.acdrc` location). Overridden by CLI `[repoPath]` arg. |
| `output` | `string` | Default Markdown output path. Overridden by `--output`. |
| `json` | `boolean` | Default JSON mode. Overridden by `--json`. |
| `failOn` | `"low" \| "medium" \| "high"` | Default fail threshold. Overridden by `--fail-on`. |

### `rules` options

| Key | Type | Description |
|-----|------|-------------|
| `ignoreFiles` | `string[]` | Glob patterns (relative to repo root) of context files to skip entirely. |
| `disabledChecks` | `string[]` | Check categories to disable. Valid values: `placeholder-content`, `safety-boundaries`, `validation-commands`, `final-reporting`, `risky-language`, `command-alignment`, `contradictions`. Unknown values fail validation. |
| `allowedMissingScripts` | `string[]` | Package script names that are allowed to be absent from `package.json` without raising a `command-alignment` issue. |

### CLI precedence

`CLI flags > .acdrc > defaults`

If you pass `--fail-on medium` on the CLI, it overrides `failOn` in `.acdrc`. Config is loaded from the resolved repo path (or `cwd` if no path is given).

### Examples

**Ignore legacy prompt files:**

```json
{
  "rules": {
    "ignoreFiles": ["docs/prompts/legacy/**", "prompts/archive/**"]
  }
}
```

**Allow a known missing CI script:**

```json
{
  "rules": {
    "allowedMissingScripts": ["validate", "ci"]
  }
}
```

**Always write a Markdown report and fail on high issues:**

```json
{
  "audit": {
    "output": "docs/agent-context-report.md",
    "failOn": "high"
  }
}
```

## Suppressing known false positives

Sometimes a check fires on content that you have already reviewed and accepted. You can silence individual findings with inline suppression comments without disabling the entire check for every file.

> **Warning:** Do not suppress high-severity issues without first reading and understanding them. Suppressions are for confirmed false positives only.

### Suppress the next line

Place the comment on the line **immediately before** the flagged content:

```md
<!-- acd-disable-next-line risky-language -->
You may skip tests only in the emergency hotfix workflow.
```

The suppression applies only to issues whose `line` equals the line directly after the comment. It does not affect issues on any other line.

### Suppress all issues of a category in a file

Place the comment anywhere in the file (typically near the top):

```md
<!-- acd-disable-file placeholder-content -->
```

This suppresses every issue of that category reported for that file.

### Supported categories

| Category | What it covers |
|----------|----------------|
| `risky-language` | Dangerous directives (skip tests, bypass auth, etc.) |
| `placeholder-content` | TODO, TBD, lorem ipsum, blank sections |
| `command-alignment` | Commands that don't match `package.json` scripts |
| `contradictions` | Conflicting instructions across files |
| `safety-boundaries` | Missing forbidden-change language |
| `validation-commands` | Missing test/lint/typecheck guidance |
| `final-reporting` | Missing final summary guidance |

### Cross-file contradictions

Contradiction issues involve two or more files. A file-level suppression in **one** file is not enough — **all** involved files must suppress that category:

```md
<!-- File: AGENTS.md -->
<!-- acd-disable-file contradictions -->

<!-- File: .cursor/rules/overrides.mdc -->
<!-- acd-disable-file contradictions -->
```

### Unknown categories

If you typo a category name, `acd` emits a low-severity `suppressions` issue to alert you:

```
[low] AGENTS.md — Unknown acd suppression category: "risky-languag"
```

## Quality score

Every audit run produces a 0–100 score shown in the terminal and included in JSON and Markdown output.

| Score | Grade |
|-------|-------|
| 90–100 | `excellent` |
| 75–89 | `good` |
| 50–74 | `needs-work` |
| 0–49 | `risky` |

Deductions: **−20** per high issue, **−8** per medium, **−3** per low. Floor is 0.

## Development

```bash
pnpm install
pnpm dev audit          # run against this repo
pnpm format             # auto-format
pnpm format:check       # check formatting (runs in CI)
pnpm test               # run tests
pnpm typecheck          # type check
pnpm build              # compile to dist/
```

## Non-goals

- No LLM calls — all checks are deterministic pattern matching
- No telemetry — nothing is sent anywhere
- No web UI — terminal and file output only
- No guarantee of correctness — this tool gives you signals, not certainty
- No replacement for human review — agents still need human oversight

## Security

See [SECURITY.md](./SECURITY.md). To report a vulnerability, use [GitHub Security Advisories](https://github.com/alipajand/agent-context-doctor/security/advisories/new) — do not open a public issue.

## License

[MIT](./LICENSE) © 2026 Ali Pajand
