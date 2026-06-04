import type { ContextIssue } from '../../types.js'

const REPORTING_PATTERNS = [
  /final\s+report/i,
  /\bsummary\b/i,
  /files\s+changed/i,
  /commands\s+run/i,
  /\btests\b/i,
  /known\s+limitations/i,
]

export function checkFinalReporting(
  filePath: string,
  content: string,
): ContextIssue[] {
  const hasReporting = REPORTING_PATTERNS.some((p) => p.test(content))
  if (hasReporting) return []

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
