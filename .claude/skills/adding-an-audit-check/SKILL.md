---
name: adding-an-audit-check
description: Add a new audit check to agent-context-doctor end to end, including config, suppressions, the check catalog, tests, and docs. Use when asked to detect a new kind of problem in agent instruction files.
---

# Adding an audit check

1. **Write the check** in `src/audit/checks/<name>.ts` as a pure function
   `check<Name>(filePath: string, content: string): ContextIssue[]`. Use `getLineEvidence` for
   evidence so it is sanitized, and give each issue a stable `id`, a `category`, a severity, a
   message, and a recommendation.
2. **Decide where it runs** in `src/audit/auditRepo.ts`: every context file, only primary files
   (`isPrimaryInstructionFile`), or across files. Cross-file logic belongs in `auditRepo.ts`.
3. **Make it configurable**: add the ID to `VALID_CHECKS` in `src/config/schema.ts`, to
   `KNOWN_SUPPRESSION_CATEGORIES` in `src/audit/suppressions.ts`, and an entry to `CHECKS` in
   `src/audit/checkCatalog.ts` (a test fails if the catalog and schema disagree).
4. **Test it** in `tests/<name>.spec.ts`: at least one match, one non-match, one edge case, and
   a negated or placeholder case if the check reads prose.
5. **Dogfood it**: run `pnpm dev audit /path/to/another/repo` on real repositories and fix false
   positives before finishing.
6. **Document it**: the checks table and `disabledChecks` list in `README.md`, the check list in
   `docs/ROUTES.md`, the table in `docs/ARCHITECTURE.md`, and an entry in `CHANGELOG.md`.
7. Run `/verify`.
