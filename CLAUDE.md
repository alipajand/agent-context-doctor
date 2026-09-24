@AGENTS.md

## Claude Code

AGENTS.md above is the source of truth. This file only adds what is specific to Claude Code.

- `/verify` runs the five required checks and reports the results.
- `/audit-self` runs `acd` against this repository and explains any findings.
- The `security-reviewer` subagent reviews a diff against the safety rules in AGENTS.md
  (confined writes, no symlink following, no network, escaped output). Use it before
  finishing any change under `src/fs/`, `src/report/`, or `src/cli.ts`.
- The `adding-an-audit-check` skill walks through adding a check end to end.
- `.claude/settings.json` allows the project's pnpm scripts and read-only git commands,
  asks before pushing, and denies reading `.env` files and running network or
  destructive commands. Personal overrides go in `.claude/settings.local.json`, which is
  not committed.
