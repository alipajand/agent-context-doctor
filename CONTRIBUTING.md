# Contributing

Thank you for your interest in contributing to `agent-context-doctor`.

---

## Setup

```bash
git clone https://github.com/alipajand/agent-context-doctor.git
cd agent-context-doctor
pnpm install
```

## Development workflow

```bash
pnpm dev audit .         # run the CLI against this repo
pnpm test                # run the full test suite
pnpm test:watch          # run tests in watch mode
pnpm typecheck           # TypeScript type-check
pnpm format              # format all files with Prettier
pnpm format:check        # check formatting without writing
pnpm build               # compile to dist/
```

All five of the following must pass before opening a PR:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## Adding a new audit check

1. Create `src/audit/checks/<checkName>.ts` exporting a pure function `checkSomething(filePath, content): ContextIssue[]`.
2. Register it in `src/audit/auditRepo.ts`.
3. Add a spec at `tests/<checkName>.spec.ts` with at least three cases: pass, fail, and one edge case.
4. Add the new check ID to `KNOWN_SUPPRESSION_CATEGORIES` in `src/audit/suppressions.ts` if it is suppressible.
5. Document the check in `docs/ARCHITECTURE.md` and `docs/ROUTES.md` (under `disabledChecks`).

## Commit style

Lowercase conventional commits, ≤ 72 chars summary, no emoji:

```
feat: add file-size check for oversized instruction files
fix: avoid false positive on "do not skip tests" patterns
docs: document suppression syntax in ROUTES.md
test: add edge cases for contradictions check
```

## Forbidden without approval

- Adding LLM calls, telemetry, or external API integrations
- Renaming the `acd` binary or existing commands (`audit`, `list`, `init`)
- Breaking the `AuditResult` JSON shape or `.acdrc` schema backward compatibility
- Changing authentication, billing, or security-related logic

## Opening a pull request

- Keep PRs small and focused on a single concern.
- Reference the issue number if one exists.
- The PR description should explain *why* the change is needed, not just what changed.
- All CI checks must pass before requesting review.

## Reporting issues

Open a GitHub issue with:

- The version of `acd` you are using (`acd --version`)
- The command you ran
- The full output (use `--json` for detailed output)
- The relevant section of the context file that triggered (or failed to trigger) the issue
