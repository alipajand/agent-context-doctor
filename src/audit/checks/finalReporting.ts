import type { ContextIssue } from '../../types.js'

const STRONG_SECTION_PATTERNS = [
  /#+\s*final\s+report/i,
  /#+\s*completion\s+report/i,
  /#+\s*handoff/i,
]

const STRONG_FIELD_PATTERNS = [
  /files\s+changed/i,
  /commands\s+run/i,
  /tests\s+(added|updated|run|result|results)/i,
  /known\s+limitations/i,
  /recommended\s+next\s+steps?/i,
]

export function checkFinalReporting(filePath: string, content: string): ContextIssue[] {
  const hasStrongSection = STRONG_SECTION_PATTERNS.some((p) => p.test(content))
  if (hasStrongSection) return []

  const matchedFields = STRONG_FIELD_PATTERNS.filter((p) => p.test(content))
  if (matchedFields.length >= 2) return []

  return [
    {
      id: `reporting-missing-${filePath}`,
      severity: 'low',
      category: 'final-reporting',
      file: filePath,
      message: 'No final reporting guidance found',
      recommendation:
        'Add instructions telling the agent what to include in its final report: files changed, commands run, test results, and known limitations.',
    },
  ]
}
