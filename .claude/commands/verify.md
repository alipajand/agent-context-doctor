---
description: Run the required checks (format, typecheck, lint, test, build) and report the results
allowed-tools: Bash(pnpm format:check), Bash(pnpm typecheck), Bash(pnpm lint), Bash(pnpm test), Bash(pnpm build)
---

Run these commands in order and stop at the first failure:

1. `pnpm format:check`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`

Report each command with pass or fail. For a failure, show the relevant error lines and the
file and line to fix. Do not change any files.
