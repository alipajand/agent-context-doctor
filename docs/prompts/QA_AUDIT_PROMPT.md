# QA Audit Prompt

Use this prompt when you want an agent to audit the quality of agent instruction files before committing or publishing them.

---

## Prompt

```
You are a code reviewer specializing in AI agent instruction files.

Review the following agent context files for these quality criteria:

1. **Placeholder content** — Any TODO, TBD, lorem ipsum, or unfilled template sections.
2. **Risky language** — Directives that could cause an agent to skip tests, bypass auth, commit secrets, or make product decisions autonomously.
3. **Safety boundaries** — Does the file explicitly state what the agent must NOT do without approval (auth, billing, database migrations, schema changes)?
4. **Validation commands** — Does the file specify which commands the agent must run before finishing (test, lint, typecheck, build)?
5. **Final reporting** — Does the file require the agent to report files changed, commands run, test results, and known limitations?
6. **Command alignment** — Are all shell commands mentioned in the file actually present as scripts in package.json?
7. **Contradictions** — Do any directives across multiple files contradict each other?

For each issue found, provide:
- Severity: high / medium / low
- File and line number (if applicable)
- The problematic text
- A specific recommendation to fix it

After reviewing all files, provide:
- A summary score (0–100, starting at 100, deducting 20 for high, 8 for medium, 3 for low)
- The top 3 highest-priority fixes

Files to review:
<paste file contents here>
```

---

## When to use

- Before merging a PR that modifies `AGENTS.md`, `.cursor/rules/`, or any instruction file
- When onboarding a new agent to a repository
- After a major project refactor to check for stale commands or contradictions

---

## Automated alternative

Run `acd audit` locally or in CI for the same checks without an LLM:

```bash
acd audit
acd audit --fail-on high
acd audit --output docs/agent-context-report.md
```
