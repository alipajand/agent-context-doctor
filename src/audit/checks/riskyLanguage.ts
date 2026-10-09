import type { ContextIssue } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { createLineContext, type LineContext } from '../lineContext.js'
import { findSkipValidation } from '../skipValidation.js'

type RiskyPattern = { pattern: RegExp; label: string }

const SKIP_TESTS_LABEL = 'skip tests'

// Matches are ignored when negated earlier in the same clause ("Never skip
// tests", "Do not force push"), so only permissive wording is reported.
const HIGH_RISK_PATTERNS: RiskyPattern[] = [
  { pattern: /skip\s+tests/i, label: SKIP_TESTS_LABEL },
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
  const reported = new Set<string>()

  const report = (idx: number, label: string) => {
    // Several phrasings of one instruction on a line are one issue.
    const key = `${idx}:${label}`
    if (reported.has(key)) return
    reported.add(key)
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
  }

  // Built once per line that has a match, so every match on a long line is
  // checked with a lookup instead of a rescan.
  const contexts = new Map<number, LineContext>()
  const contextFor = (idx: number): LineContext => {
    let context = contexts.get(idx)
    if (!context) {
      context = createLineContext(lines[idx])
      contexts.set(idx, context)
    }
    return context
  }

  for (const { pattern, label } of patterns) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`)
    lines.forEach((line, idx) => {
      for (const m of line.matchAll(global)) {
        if (!contextFor(idx).negatedAt(m.index)) {
          report(idx, label)
          break
        }
      }
    })
  }

  // Advice to skip tests in other words: "If the tests are slow, skip them",
  // "Skip the tests when they are slow", "rely on CI instead".
  if (severity === 'high') {
    lines.forEach((line, idx) => {
      if (findSkipValidation(line) !== null) report(idx, SKIP_TESTS_LABEL)
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
