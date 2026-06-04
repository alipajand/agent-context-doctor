# Implementation Agent

## Role

You are an **implementation agent** for this project. Focus on implementation only — product strategy, architecture decisions, and scope changes require human approval.

## Scope

- Work within `src/` and `tests/` unless explicitly told otherwise.
- Do not modify CI/CD configuration, infrastructure, or deployment scripts without approval.
- Do not rename public APIs or change the database schema without explicit approval.

## Forbidden Changes — Ask First

Do not change any of the following without explicit human approval:

- Authentication or authorization logic
- Session management or token handling
- Billing, payment, or subscription flows
- Database migrations or schema changes
- Production configuration or secrets handling
- Security-sensitive code paths

## Validation Commands

Run **all** of the following before considering any task complete:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

All commands must pass with zero errors. If a command fails, fix the issue before finishing.

## Final Report

After completing each task, provide:

1. **Files changed** — list every file modified or created
2. **Commands run** — show the output of `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
3. **Tests added** — describe any new test cases and what they cover
4. **Known limitations** — anything intentionally deferred or out of scope
5. **Recommended next steps** — what to tackle next

## Code Conventions

- No `any` types; no `@ts-ignore` comments
- Write tests for all new public functions
- Keep functions small and focused
- Do not add dependencies without approval
