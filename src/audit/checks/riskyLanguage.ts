import type { ContextIssue } from '../../types.js'

const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /skip\s+tests/i, label: 'skip tests' },
  { pattern: /ignore\s+failing\s+tests/i, label: 'ignore failing tests' },
  { pattern: /disable\s+tests/i, label: 'disable tests' },
  { pattern: /bypass\s+auth/i, label: 'bypass auth' },
  { pattern: /disable\s+auth/i, label: 'disable auth' },
  { pattern: /ignore\s+security/i, label: 'ignore security' },
  { pattern: /commit\s+secrets/i, label: 'commit secrets' },
  { pattern: /hardcode\s+api\s+key/i, label: 'hardcode api key' },
]

const MEDIUM_RISK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /make\s+product\s+decisions/i, label: 'make product decisions' },
  { pattern: /decide\s+the\s+strategy/i, label: 'decide the strategy' },
  { pattern: /refactor\s+everything/i, label: 'refactor everything' },
  { pattern: /rewrite\s+the\s+app/i, label: 'rewrite the app' },
  { pattern: /delete\s+unused\s+code/i, label: 'delete unused code' },
]

export function checkRiskyLanguage(
  filePath: string,
  content: string,
): ContextIssue[] {
  const issues: ContextIssue[] = []
  const lines = content.split('\n')

  for (const { pattern, label } of HIGH_RISK_PATTERNS) {
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        issues.push({
          id: `risky-high-${filePath}-${idx}-${label}`,
          severity: 'high',
          category: 'risky-language',
          file: filePath,
          line: idx + 1,
          message: `Risky instruction: "${label}"`,
          recommendation:
            'Remove language that lets agents bypass validation, security, or testing. Agents should never skip tests, bypass auth, or commit secrets.',
        })
      }
    })
  }

  for (const { pattern, label } of MEDIUM_RISK_PATTERNS) {
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        issues.push({
          id: `risky-medium-${filePath}-${idx}-${label}`,
          severity: 'medium',
          category: 'risky-language',
          file: filePath,
          line: idx + 1,
          message: `Risky instruction: "${label}"`,
          recommendation:
            'Avoid open-ended instructions that let agents make large unscoped changes. Be specific about what is in and out of scope.',
        })
      }
    })
  }

  return issues
}
