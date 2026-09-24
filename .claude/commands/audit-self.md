---
description: Run acd against this repository and explain the findings
allowed-tools: Bash(pnpm dev audit:*)
---

Run `pnpm dev audit . --format json` and summarize the result: the score, then each issue
with its file, line, and a one-line explanation of why it matters. If an issue is a false
positive, say which check produced it and what change to the check would avoid it, instead
of suppressing it. Do not change any files.
