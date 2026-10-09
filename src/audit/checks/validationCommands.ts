import type { ContextIssue } from '../../types.js'

const VALIDATION_PATTERNS = [
  /\btest\b/i,
  /\blint\b/i,
  /typecheck/i,
  /\bbuild\b/i,
  /\bformat\b/i,
  // Validation tools whose names do not contain one of the words above.
  // Bare words such as "check" or "run" are not enough on their own.
  /\b(?:pytest|unittest|mypy|pyright|ruff|flake8|tox)\b/i,
  /\bgo\s+vet\b/i,
  /\b(?:golangci-lint|staticcheck)\b/i,
  /\bcargo\s+(?:check|clippy|fmt|nextest)\b/i,
  /\bmake\s+(?:check|verify|ci)\b/i,
  /\b(?:mvnw?|gradlew?)\s+(?:verify|check)\b/i,
]

export function checkValidationCommands(filePath: string, content: string): ContextIssue[] {
  const hasValidation = VALIDATION_PATTERNS.some((p) => p.test(content))
  if (hasValidation) return []

  return [
    {
      id: `validation-missing-${filePath}`,
      severity: 'medium',
      category: 'validation-commands',
      file: filePath,
      message: 'No validation commands mentioned',
      recommendation:
        'Add guidance on running tests, lint, typecheck, or build commands (for example `pnpm test`, `pytest`, `go test ./...`, or `cargo test`) so agents can verify their work before finishing.',
    },
  ]
}
