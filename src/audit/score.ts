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

// With no instruction files there is nothing whose quality could earn points,
// so a single high deduction must not leave the repository graded "good".
const NO_FILES_ISSUE = 'presence-no-files'

export function computeScore(issues: ContextIssue[]): AuditScore {
  if (issues.some((issue) => issue.id === NO_FILES_ISSUE)) {
    return { total: 0, max: 100, grade: toGrade(0) }
  }
  const deduction = issues.reduce((sum, issue) => sum + (DEDUCTIONS[issue.severity] ?? 0), 0)
  const total = Math.max(0, 100 - deduction)
  return { total, max: 100, grade: toGrade(total) }
}
