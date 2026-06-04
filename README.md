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

```bash
# From npm (once published)
npm install -g agent-context-doctor

# Or run locally
pnpm install
pnpm dev audit
```

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
  [medium] .cursor/rules/project.mdc — No safety-boundary language found
    Recommendation: Add explicit forbidden-change guidance.
  [low] AGENTS.md — No final reporting guidance found
    Recommendation: Add instructions about final report.
```

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

## Development

```bash
pnpm install
pnpm dev audit          # run against this repo
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
