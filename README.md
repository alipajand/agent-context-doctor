# agent-context-doctor

`agent-context-doctor` checks whether your agent instruction files are specific, safe, and usable. It catches placeholder content, risky language, contradictions, stale commands, and missing validation guidance before those instructions guide an AI coding agent.

## What it is

A small, deterministic CLI (`acd`) that reads the instruction files in your repository — `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, and similar — and reports quality and safety problems with a severity rating and a 0–100 score.

It runs locally, makes no network calls, and is meant to complement human review, not replace it.

## Why it exists

AI coding agents follow whatever their instruction files tell them. A file full of `TODO` placeholders, a stray "skip tests if they're slow," or two files that contradict each other will quietly steer an agent toward unsafe or low-quality changes — and nobody notices until the diff lands.

`acd` makes those problems visible in CI or on your machine, deterministically, so you can fix the instructions before they cause trouble.

## What it checks

| Check | Looks for |
|-------|-----------|
| **Presence** | Whether any agent context file exists at all |
| **Placeholder content** | Unfilled markers like `TODO`, `TBD`, `lorem ipsum`, or blank scope sections |
| **Risky language** | Directives like "skip tests", "bypass auth", or "commit secrets" |
| **Safety boundaries** | Whether primary files include ask-before / forbidden-change language for auth, billing, database, and production |
| **Validation commands** | Whether instructions tell agents to run tests, lint, or typecheck |
| **Final reporting** | Whether instructions describe what to include in a final summary |
| **Command alignment** | Commands referenced in instructions that don't match `package.json` scripts |
| **Contradictions** | Conflicting directives across two or more files |

### Severity and score

| Level | Meaning |
|-------|---------|
| `high` | Blocks or endangers correct agent behavior — fix immediately |
| `medium` | Weakens safety, completeness, or correctness |
| `low` | Missing guidance that would improve agent output quality |

Every run produces a 0–100 score: start at 100, subtract **20** per high issue, **8** per medium, **3** per low (floor 0).

| Score | Grade |
|-------|-------|
| 90–100 | `excellent` |
| 75–89 | `good` |
| 50–74 | `needs-work` |
| 0–49 | `risky` |

## Quick start

Install from npm (after release):

```bash
npm install -g agent-context-doctor
```

Or run from source:

```bash
git clone https://github.com/alipajand/agent-context-doctor.git
cd agent-context-doctor
pnpm install
pnpm dev audit          # audit the current directory
```

Audit a repo and list the files it found:

```bash
acd audit
acd list
```

No instruction file yet? `acd init` writes a safe, opinionated `AGENTS.md`:

```bash
acd init                # write AGENTS.md in the current directory
acd init /path/to/repo  # write it in a specific directory
acd init --force        # overwrite an existing AGENTS.md
acd init --print        # print the template without writing
```

`acd init` will not overwrite an existing `AGENTS.md` unless you pass `--force`. The starter template references `pnpm typecheck`, `pnpm test`, and `pnpm build` — replace those with your project's real commands, or list them under `allowedMissingScripts` in `.acdrc`.

## Common examples

```bash
acd audit                                  # audit the current directory
acd audit /path/to/repo                    # audit a specific path
acd audit --json                           # machine-readable output
acd audit --output docs/report.md          # write a Markdown report
acd audit --json --output docs/report.md   # both at once
acd audit --fail-on high                   # exit non-zero on high issues (also: medium, low)
acd list                                   # list detected context files only
```

### Auditing a repo with Claude files

`acd` audits Claude Code instructions wherever they live — a root `CLAUDE.md`, a `.claude/CLAUDE.md`, or command files such as `.claude/commands/review.md`:

```bash
acd audit
acd list
```

### A risky instruction, and a safer rewrite

`acd` flags language that lets an agent quietly bypass validation. For example:

**Risky:**

```md
Skip tests if they are slow.
```

**Safer:**

```md
Run the smallest relevant test first. If the full suite is too slow or broken,
report that clearly and explain what was run instead.
```

The point is not "always run everything" — it's that an agent should never be given permission to skip validation *silently*. If something can't be run, the instructions should require the agent to say so.

### Try the bundled fixtures

The `examples/` directory has ready-to-run fixtures. Clone the repo first.

```bash
pnpm dev audit examples/bad-context    # ~0 / 100 — risky, multiple high issues
pnpm dev audit examples/good-context   # 97 / 100 — excellent, zero high/medium
```

`examples/bad-context` intentionally contains placeholders, risky directives, missing safety language, and a contradiction between `AGENTS.md` and `.cursor/rules/project.mdc`. `examples/good-context/AGENTS.md` follows every best practice. Use them as a starting point for your own files.

### Sample output

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

## Audited file types

```text
AGENTS.md
CLAUDE.md
claude.md
.claude/CLAUDE.md
.claude/claude.md
.claude/commands/*.md
.cursorrules
.cursor/rules/*.mdc
.github/copilot-instructions.md
docs/prompts/**/*.md
prompts/**/*.md
.codex/**/*.md
.github/instructions/**/*.md
```

| Pattern | Kind |
|---------|------|
| `AGENTS.md` | agents |
| `CLAUDE.md`, `claude.md` | claude |
| `.claude/CLAUDE.md`, `.claude/claude.md` | claude |
| `.claude/commands/*.md` | claude |
| `.cursorrules` | cursor |
| `.cursor/rules/*.mdc` | cursor |
| `.github/copilot-instructions.md` | copilot |
| `docs/prompts/**/*.md` | prompt |
| `prompts/**/*.md` | prompt |
| `.codex/**/*.md` | codex |
| `.github/instructions/**/*.md` | prompt |

Matching is case-insensitive, so `claude.md` and `CLAUDE.md` are both detected. `node_modules`, `dist`, `build`, `coverage`, and `.git` are skipped.

## Configuration

Add an optional `.acdrc` file at the repo root to set defaults without changing CLI commands. It is JSON, validated strictly on load — invalid config exits non-zero with a clear message.

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
| `repoPath` | `string` | Default repo to audit (relative to `.acdrc`). Overridden by the CLI `[repoPath]` arg. |
| `output` | `string` | Default Markdown output path. Overridden by `--output`. |
| `json` | `boolean` | Default JSON mode. Overridden by `--json`. |
| `failOn` | `"low" \| "medium" \| "high"` | Default fail threshold. Overridden by `--fail-on`. |

### `rules` options

| Key | Type | Description |
|-----|------|-------------|
| `ignoreFiles` | `string[]` | Glob patterns (relative to repo root) of context files to skip entirely. |
| `disabledChecks` | `string[]` | Checks to disable: `placeholder-content`, `safety-boundaries`, `validation-commands`, `final-reporting`, `risky-language`, `command-alignment`, `contradictions`. Unknown values fail validation. |
| `allowedMissingScripts` | `string[]` | Script names allowed to be absent from `package.json` without raising a `command-alignment` issue. |

Precedence is `CLI flags > .acdrc > defaults`. Config is loaded from the resolved repo path (or `cwd` if no path is given).

## Suppressions

When a check fires on content you've already reviewed and accepted, silence that single finding with an inline comment instead of disabling the whole check.

> Do not suppress high-severity issues without first understanding them. Suppressions are for confirmed false positives only.

**Suppress the next line** — place the comment immediately before the flagged content:

```md
<!-- acd-disable-next-line risky-language -->
You may skip tests only in the emergency hotfix workflow.
```

**Suppress a whole category in a file** — place the comment anywhere in the file:

```md
<!-- acd-disable-file placeholder-content -->
```

Valid categories: `risky-language`, `placeholder-content`, `command-alignment`, `contradictions`, `safety-boundaries`, `validation-commands`, `final-reporting`.

Contradiction issues span two or more files, so a file-level suppression in **all** involved files is required to silence them:

```md
<!-- File: AGENTS.md -->
<!-- acd-disable-file contradictions -->

<!-- File: .cursor/rules/overrides.mdc -->
<!-- acd-disable-file contradictions -->
```

If you typo a category name, `acd` emits a low-severity `suppressions` issue so the mistake doesn't pass silently:

```
[low] AGENTS.md — Unknown acd suppression category: "risky-languag"
```

## CI usage

Use `--fail-on` to gate a pipeline. Exit codes: `0` = clean (or issues below threshold), `1` = issues at or above the `--fail-on` threshold.

```yaml
# .github/workflows/agent-context.yml
name: agent-context
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx agent-context-doctor audit --fail-on high
```

To produce a report artifact, add `--output docs/agent-context-report.md` (and `--json` if you also want machine-readable output).

## Limitations

`acd` matches patterns; it does not understand meaning. Treat its output as signals, not certainty.

- Structural checks (`safety-boundaries`, `validation-commands`, `final-reporting`) match against the whole file, so they report file-level issues with no line number.
- Files where agents legitimately can't run `pnpm test` locally (e.g. a Copilot file used only in CI) will still be flagged by `validation-commands`. Suppress it with `disabledChecks` or a per-file comment once confirmed.
- Only text files matching the known patterns above are read. Binary and generated files are skipped.
- It checks how instructions are *written*, not whether an agent will follow them or whether the resulting code is correct. Human review still matters.

## Related tools

Part of a small, deterministic, local-first suite for making repositories safer for AI coding agents:

- [agent-readiness-kit](https://github.com/alipajand/agent-readiness-kit) — audits whether a repository is ready for AI coding agents.
- [agent-pr-reviewer-lite](https://github.com/alipajand/agent-pr-reviewer-lite) — flags risky PR diffs before merge.
- [agent-readiness-action](https://github.com/alipajand/agent-readiness-action) — runs readiness audits in GitHub Actions.

## Development

```bash
pnpm install
pnpm dev audit          # run against this repo
pnpm test               # run tests
pnpm typecheck          # type check
pnpm build              # compile to dist/
pnpm format             # auto-format
pnpm format:check       # check formatting (runs in CI)
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the module layout, [docs/ROUTES.md](./docs/ROUTES.md) for the full CLI reference, and [CONTRIBUTING.md](./CONTRIBUTING.md) to add a new check.

## Security

`acd` reads files from disk and writes only the report file you ask for. It makes no network calls, runs no commands found in the files it audits, and collects no telemetry. Markdown reports may contain short excerpts of your instruction files, so review them before sharing.

See [SECURITY.md](./SECURITY.md) to report a vulnerability — use [GitHub Security Advisories](https://github.com/alipajand/agent-context-doctor/security/advisories/new), not a public issue.

## License

[MIT](./LICENSE) © 2026 Ali Pajand
