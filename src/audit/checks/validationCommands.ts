import type { ContextIssue } from '../../types.js'

const VALIDATION_PATTERNS = [
  /\btest\b/i,
  /\blint\b/i,
  /typecheck/i,
  /\bbuild\b/i,
  /\bformat\b/i,
]

export function checkValidationCommands(
  filePath: string,
  content: string,
): ContextIssue[] {
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
        'Add guidance on running tests, lint, typecheck, or build commands so agents can verify their work before finishing.',
    },
  ]
}
