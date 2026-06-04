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
  | 'agents'
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'codex'
  | 'prompt'
  | 'unknown'

export type ContextFile = {
  path: string
  kind: ContextFileKind
  bytes: number
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
