# Refactor Prompt

Use this template when assigning a focused refactor task to a coding agent.

---

## Prompt

```
You are an implementation agent. Perform the refactor described below.

## Refactor goal

<describe what needs to change and why>

## Scope

**In scope:**
- <specific files or modules to change>

**Out of scope:**
- Do not change unrelated files or fix unrelated issues
- Do not alter the public API, CLI command names, or AuditResult JSON shape
- Do not add new dependencies without approval
- Do not change authentication, billing, or security logic

## Acceptance criteria

- All existing tests still pass
- No new linter or TypeScript errors
- No observable behavior change for end users

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

1. **Files changed** — list every file modified or created
2. **Summary** — what changed and why
3. **Commands run** — show output of the validation commands above
4. **Tests added or updated** — list changes to test files
5. **Known limitations** — anything intentionally deferred
```

---

## When to use

- Extracting a function into a shared utility
- Renaming a module and updating all imports
- Improving type safety without changing behavior
- Splitting a large file into smaller ones
