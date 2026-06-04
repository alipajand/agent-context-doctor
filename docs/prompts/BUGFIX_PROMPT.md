# Bugfix Prompt

Use this template when assigning a bug fix task to a coding agent.

---

## Prompt

```
You are an implementation agent. Fix the bug described below.

## Bug description

<describe the bug here>

## Reproduction steps

1. <step 1>
2. <step 2>
3. Expected: <what should happen>
4. Actual: <what happens instead>

## Constraints

- Fix only the described bug. Do not refactor unrelated code.
- Do not change public API shapes or CLI command names.
- Do not add dependencies without approval.
- Do not modify authentication, billing, or security logic without explicit approval.

## Before finishing

Run and confirm all pass:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## Final report

Return:

1. **Files changed** — list every file modified
2. **Root cause** — one-sentence explanation of why the bug occurred
3. **Fix applied** — what you changed and why
4. **Commands run** — show output of the validation commands above
5. **Tests added** — list new test cases that cover the fix
6. **Known limitations** — anything deferred or not addressed
```

---

## When to use

- When a CI check is failing and you want an agent to investigate and fix it
- When a user reports a reproducible bug with clear steps
- When a known issue in `docs/DOGFOODING.md` needs resolution
