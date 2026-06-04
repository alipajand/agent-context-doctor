import type { ContextIssue } from '../types.js'

export const KNOWN_SUPPRESSION_CATEGORIES: ReadonlySet<string> = new Set([
  'placeholder-content',
  'safety-boundaries',
  'validation-commands',
  'final-reporting',
  'risky-language',
  'command-alignment',
  'contradictions',
])

export type SuppressionRule = {
  kind: 'next-line' | 'file'
  category: string
  line: number
}

const NEXT_LINE_RE = /<!--\s*acd-disable-next-line\s+(\S+)\s*-->/
const FILE_RE = /<!--\s*acd-disable-file\s+(\S+)\s*-->/

export function parseSuppressions(content: string): SuppressionRule[] {
  const rules: SuppressionRule[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]

    const nextLineMatch = NEXT_LINE_RE.exec(line)
    if (nextLineMatch) {
      rules.push({ kind: 'next-line', category: nextLineMatch[1], line: lineNum })
      continue
    }

    const fileMatch = FILE_RE.exec(line)
    if (fileMatch) {
      rules.push({ kind: 'file', category: fileMatch[1], line: lineNum })
    }
  }

  return rules
}

export function applySuppressions(issue: ContextIssue, rules: SuppressionRule[]): boolean {
  for (const rule of rules) {
    if (!KNOWN_SUPPRESSION_CATEGORIES.has(rule.category)) continue
    if (rule.category !== issue.category) continue
    if (rule.kind === 'file') return true
    if (rule.kind === 'next-line' && issue.line !== undefined && issue.line === rule.line + 1) {
      return true
    }
  }
  return false
}

export function filterSuppressedIssues(
  filePath: string,
  content: string,
  issues: ContextIssue[],
): ContextIssue[] {
  const rules = parseSuppressions(content)

  const warnings: ContextIssue[] = []
  const seenUnknown = new Set<string>()
  for (const rule of rules) {
    if (!KNOWN_SUPPRESSION_CATEGORIES.has(rule.category) && !seenUnknown.has(rule.category)) {
      seenUnknown.add(rule.category)
      warnings.push({
        id: `suppression-unknown-${rule.category}`,
        severity: 'low',
        category: 'suppressions',
        file: filePath,
        message: `Unknown acd suppression category: "${rule.category}"`,
        recommendation: `Valid suppression categories are: ${[...KNOWN_SUPPRESSION_CATEGORIES].join(', ')}.`,
      })
    }
  }

  const filtered = issues.filter((issue) => {
    if (issue.file !== filePath) return true
    return !applySuppressions(issue, rules)
  })

  return [...filtered, ...warnings]
}
