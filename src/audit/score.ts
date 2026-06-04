import type { ContextIssue, AuditScore, ScoreGrade } from '../types.js'

const DEDUCTIONS: Record<string, number> = {
  high: 20,
  medium: 8,
  low: 3,
}

function toGrade(total: number): ScoreGrade {
  if (total >= 90) return 'excellent'
  if (total >= 75) return 'good'
  if (total >= 50) return 'needs-work'
  return 'risky'
}

export function computeScore(issues: ContextIssue[]): AuditScore {
  const deduction = issues.reduce((sum, issue) => sum + (DEDUCTIONS[issue.severity] ?? 0), 0)
  const total = Math.max(0, 100 - deduction)
  return { total, max: 100, grade: toGrade(total) }
}
