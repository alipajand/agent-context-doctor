import type { ContextIssue } from '../../types.js'

const SAFETY_PATTERNS = [
  /ask\s+before/i,
  /do\s+not\s+change/i,
  /forbidden/i,
  /without\s+approval/i,
  /\bauth\b/i,
  /authentication/i,
  /authorization/i,
  /billing/i,
  /security/i,
  /database/i,
  /migration/i,
  /\bschema\b/i,
  /secrets/i,
  /production/i,
]

export function checkSafetyBoundaries(filePath: string, content: string): ContextIssue[] {
  const hasSafety = SAFETY_PATTERNS.some((p) => p.test(content))
  if (hasSafety) return []

  return [
    {
      id: `safety-missing-${filePath}`,
      severity: 'medium',
      category: 'safety-boundaries',
      file: filePath,
      message: 'No safety-boundary language found',
      recommendation:
        'Add explicit forbidden-change guidance covering areas like auth, billing, database, security, and production systems. Instruct the agent to ask before making changes to these areas.',
    },
  ]
}
