export const AGENTS_TEMPLATE = `# AGENTS.md

This repository uses AI coding agents for implementation support. Agents must follow these rules.

## Scope

You are an implementation agent. Make focused code changes requested by the user. Do not invent product requirements, change business logic, or expand scope without approval.

## Forbidden changes without approval

Do not make any of these changes unless the user explicitly asks:

- Authentication or authorization behavior
- Billing, pricing, or subscription logic
- Database migrations or destructive data changes
- Production configuration, deployment, or infrastructure settings
- Secrets, API keys, environment variables, or credential handling
- Public API contracts
- Security-sensitive code paths

## Required validation

Before finishing, run the relevant project checks. Prefer existing package scripts from \`package.json\`.

If available, run:

\`\`\`bash
pnpm typecheck
pnpm test
pnpm build
\`\`\`

If a command is missing, say so in the final report instead of inventing a replacement.

## Working rules

* Keep diffs focused and minimal.
* Do not skip tests to make work appear complete.
* Do not commit secrets.
* Do not bypass auth, validation, or safety checks.
* Do not edit generated files unless explicitly requested.
* Ask before adding new dependencies.

## Final report

Always include:

* Files changed
* Commands run and results
* Tests added or updated
* Known limitations
* Recommended next step
`
