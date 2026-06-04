# AGENTS — agent-context-doctor

This is a **TypeScript Node.js CLI** project. You are an implementation agent.

## What this project is

`agent-context-doctor` (`acd`) is a deterministic CLI that audits agent instruction files
for quality, safety, contradictions, and stale commands. It is **not** an AI product.

## Absolute constraints

**Do not** do any of the following without explicit approval:

- Add LLM or AI API calls of any kind
- Add telemetry, analytics, or any outbound network calls
- Add authentication or credential handling
- Build a web server, web app, or browser UI
- Change the binary name (`acd`) or existing command names (`audit`, `list`)
- Modify `.acdrc` schema in a breaking way
- Change the `AuditResult` JSON shape in a backward-incompatible way
- Write to any file outside the audited repo path (only `--output` writes are allowed)
- Add dependencies that make external network requests

## Tech stack

- TypeScript, ESM, Node.js ≥ 18
- pnpm
- `commander`, `fast-glob`, `zod`, `picocolors`
- `vitest` for tests, `tsx` for dev, `prettier` for formatting

## Commands to run before finishing

```bash
pnpm format:check   # formatting
pnpm typecheck      # TypeScript
pnpm lint           # also TypeScript (same as typecheck)
pnpm test           # vitest — all tests must pass
pnpm build          # tsc compilation to dist/
```

All five must pass with zero errors before you consider work complete.

## Code conventions

- All source files live under `src/`; tests under `tests/`
- Each audit check is a pure function in `src/audit/checks/`
- Cross-file logic goes in `auditRepo.ts`, not in individual checks
- No `any` types; no `ts-ignore` comments
- Do not add comments that narrate what the code does — only explain non-obvious intent

## Safe-write behavior

The only file the tool writes is the optional Markdown report via `--output`. Paths are
resolved relative to the audited repo root. Do not add any other file-write operations
without approval.

## Final report

After completing work, provide:

1. **Files changed** — list every file modified or created
2. **Commands run** — show the output of `pnpm test`, `pnpm typecheck`, `pnpm build`
3. **Tests added** — list new test cases and their purpose
4. **Known limitations** — anything intentionally deferred
5. **Recommended next steps** — what to improve next
