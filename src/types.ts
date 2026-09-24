export type Severity = 'low' | 'medium' | 'high'

export type ContextIssue = {
  id: string
  severity: Severity
  category: string
  file: string
  message: string
  recommendation: string
  line?: number
  endLine?: number
  evidence?: string
  files?: string[]
}

export type ContextFileKind =
  'agents' | 'claude' | 'cursor' | 'copilot' | 'codex' | 'prompt' | 'unknown'

/**
 * Why a detected file was not read:
 * - `outside-repo`: a symlink whose target resolves outside the audited directory
 * - `not-a-file`: a broken symlink, or a link to a directory or device
 * - `too-large`: larger than the maximum auditable size
 */
export type ContextFileSkipReason = 'outside-repo' | 'not-a-file' | 'too-large'

export type ContextFile = {
  path: string
  kind: ContextFileKind
  bytes: number
  skipped?: ContextFileSkipReason
}

export type ScoreGrade = 'excellent' | 'good' | 'needs-work' | 'risky'

export type AuditScore = {
  total: number
  max: 100
  grade: ScoreGrade
}

export type AuditResult = {
  repoPath: string
  files: ContextFile[]
  summary: {
    fileCount: number
    issueCount: number
    high: number
    medium: number
    low: number
  }
  score: AuditScore
  issues: ContextIssue[]
}
