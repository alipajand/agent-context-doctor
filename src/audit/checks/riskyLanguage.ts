import type { ContextIssue } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { isNegated } from '../negation.js'

type RiskyPattern = { pattern: RegExp; label: string }

// Matches are ignored when negated earlier in the same clause ("Never skip
// tests", "Do not force push"), so only permissive wording is reported.
const HIGH_RISK_PATTERNS: RiskyPattern[] = [
  { pattern: /skip\s+tests/i, label: 'skip tests' },
  { pattern: /ignore\s+failing\s+tests/i, label: 'ignore failing tests' },
  { pattern: /disable\s+tests/i, label: 'disable tests' },
  {
    pattern: /(?:delete|remove)\s+(?:the\s+)?failing\s+tests/i,
    label: 'delete failing tests',
  },
  { pattern: /bypass\s+auth/i, label: 'bypass auth' },
  { pattern: /disable\s+auth/i, label: 'disable auth' },
  { pattern: /ignore\s+security/i, label: 'ignore security' },
  { pattern: /commit\s+secrets/i, label: 'commit secrets' },
  { pattern: /hardcode\s+(?:the\s+)?api\s+keys?/i, label: 'hardcode api key' },
  { pattern: /--no-verify\b/i, label: '--no-verify' },
  {
    pattern: /\bforce[\s-]push|\bpush\s+(?:--force\b|-f\b)/i,
    label: 'force push',
  },
  {
    pattern: /--dangerously-skip-permissions|\bbypassPermissions\b|\byolo\s+mode\b/i,
    label: 'skip agent permission prompts',
  },
  {
    pattern: /\b(?:disable|skip|turn\s+off)\s+(?:ssl|tls|certificate)\s+(?:verification|checks?)/i,
    label: 'disable TLS verification',
  },
  { pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/, label: 'disable TLS verification' },
]

const MEDIUM_RISK_PATTERNS: RiskyPattern[] = [
  { pattern: /make\s+product\s+decisions/i, label: 'make product decisions' },
  { pattern: /decide\s+the\s+strategy/i, label: 'decide the strategy' },
  { pattern: /refactor\s+everything/i, label: 'refactor everything' },
  { pattern: /rewrite\s+the\s+app/i, label: 'rewrite the app' },
  { pattern: /delete\s+unused\s+code/i, label: 'delete unused code' },
  {
    pattern: /\b(?:commit|push)\s+directly\s+to\s+(?:main|master)\b/i,
    label: 'push directly to main',
  },
  { pattern: /merge\s+without\s+(?:a\s+)?review/i, label: 'merge without review' },
  {
    pattern: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/i,
    label: 'pipe a remote script to the shell',
  },
  { pattern: /chmod\s+(?:-R\s+)?777\b/i, label: 'chmod 777' },
  {
    pattern: /\b(?:add|use)\s+(?:an?\s+)?(?:@ts-ignore|@ts-nocheck|eslint-disable)/i,
    label: 'suppress type or lint errors',
  },
  {
    pattern:
      /\b(?:disable|turn\s+off)\s+(?:the\s+)?(?:linter|lint(?:ing)?|eslint|type\s*check(?:ing)?)/i,
    label: 'disable lint or type checks',
  },
]

const HIGH_RECOMMENDATION =
  'Remove language that lets agents bypass validation, security, or testing. Agents should never skip tests, bypass auth, or commit secrets.'

const MEDIUM_RECOMMENDATION =
  'Avoid open-ended or unsafe instructions. Be specific about what is in and out of scope, and route risky operations through human review.'

function findRisky(
  filePath: string,
  content: string,
  patterns: RiskyPattern[],
  severity: 'high' | 'medium',
): ContextIssue[] {
  const issues: ContextIssue[] = []
  const lines = content.split('\n')

  for (const { pattern, label } of patterns) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`)
    lines.forEach((line, idx) => {
      const permissive = [...line.matchAll(global)].some((m) => !isNegated(line, m.index))
      if (!permissive) return
      issues.push({
        id: `risky-${severity}-${filePath}-${idx}-${label}`,
        severity,
        category: 'risky-language',
        file: filePath,
        line: idx + 1,
        evidence: getLineEvidence(content, idx + 1),
        message: `Risky instruction: "${label}"`,
        recommendation: severity === 'high' ? HIGH_RECOMMENDATION : MEDIUM_RECOMMENDATION,
      })
    })
  }

  return issues
}

export function checkRiskyLanguage(filePath: string, content: string): ContextIssue[] {
  return [
    ...findRisky(filePath, content, HIGH_RISK_PATTERNS, 'high'),
    ...findRisky(filePath, content, MEDIUM_RISK_PATTERNS, 'medium'),
  ]
}
