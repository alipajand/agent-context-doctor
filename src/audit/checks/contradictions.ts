import type { ContextIssue, Severity } from '../../types.js'
import { isNegated } from '../negation.js'

type ContradictionGroup = {
  name: string
  severity: Severity
  strictPhrases: RegExp[]
  opposingPhrases: RegExp[]
}

const CONTRADICTION_GROUPS: ContradictionGroup[] = [
  {
    name: 'tests',
    severity: 'high',
    strictPhrases: [
      /always\s+run\s+tests/i,
      /run\s+tests\s+before\s+finishing/i,
      /tests\s+must\s+pass/i,
    ],
    opposingPhrases: [
      /skip\s+tests/i,
      /do\s+not\s+run\s+tests/i,
      /tests\s+are\s+optional/i,
      /ignore\s+failing\s+tests/i,
    ],
  },
  {
    name: 'refactors',
    severity: 'medium',
    strictPhrases: [
      /avoid\s+unrelated\s+refactors/i,
      /no\s+unrelated\s+refactors/i,
      /minimal\s+diff/i,
      /focused\s+diff/i,
    ],
    opposingPhrases: [
      /refactor\s+everything/i,
      /rewrite\s+the\s+app/i,
      /clean\s+up\s+everything/i,
      /large\s+refactor/i,
    ],
  },
  {
    name: 'product-decisions',
    severity: 'medium',
    strictPhrases: [
      /do\s+not\s+make\s+product\s+decisions/i,
      /implementation\s+agent/i,
      /not\s+a\s+product\s+strategist/i,
      /ask\s+before\s+scope\s+changes/i,
    ],
    opposingPhrases: [
      // Negative lookbehind so "do not make product decisions" is not matched
      /(?<!not\s)make\s+product\s+decisions/i,
      /decide\s+the\s+strategy/i,
      /choose\s+the\s+product\s+direction/i,
      /expand\s+scope\s+as\s+needed/i,
    ],
  },
  {
    name: 'security',
    severity: 'high',
    strictPhrases: [
      /ask\s+before\s+auth\s+changes/i,
      /ask\s+before\s+security\s+changes/i,
      /do\s+not\s+change\s+authentication/i,
      /do\s+not\s+change\s+authorization/i,
    ],
    opposingPhrases: [
      /bypass\s+auth/i,
      /disable\s+auth/i,
      /ignore\s+security/i,
      /skip\s+authorization/i,
    ],
  },
]

export type FileContent = {
  path: string
  content: string
}

type PhraseMatch = {
  phrase: string
  file: string
}

// Opposing phrases only count when permissive: "Never skip tests" agrees with
// "always run tests" rather than contradicting it.
function findMatches(
  files: FileContent[],
  patterns: RegExp[],
  ignoreNegated = false,
): PhraseMatch[] {
  const matches: PhraseMatch[] = []
  for (const { path, content } of files) {
    for (const pattern of patterns) {
      const global = new RegExp(pattern.source, `${pattern.flags}g`)
      for (const line of content.split('\n')) {
        const match = [...line.matchAll(global)].find(
          (m) => !ignoreNegated || !isNegated(line, m.index),
        )
        if (match) {
          matches.push({ phrase: match[0], file: path })
          break
        }
      }
    }
  }
  return matches
}

export function checkContradictions(files: FileContent[]): ContextIssue[] {
  const issues: ContextIssue[] = []

  for (const group of CONTRADICTION_GROUPS) {
    const strictMatches = findMatches(files, group.strictPhrases)
    const opposingMatches = findMatches(files, group.opposingPhrases, true)

    if (strictMatches.length === 0 || opposingMatches.length === 0) continue

    const strictMatch = strictMatches[0]
    const opposingMatch = opposingMatches[0]
    const strictExample = strictMatch.phrase
    const opposingExample = opposingMatch.phrase
    const involvedFiles = [
      ...new Set([...strictMatches.map((m) => m.file), ...opposingMatches.map((m) => m.file)]),
    ]

    const fileLabel = involvedFiles.length > 1 ? 'multiple' : involvedFiles[0]
    const evidence = `${strictMatch.file}: "${strictExample}" vs ${opposingMatch.file}: "${opposingExample}"`

    issues.push({
      id: `contradiction-${group.name}`,
      severity: group.severity,
      category: 'contradictions',
      file: fileLabel,
      files: involvedFiles,
      evidence,
      message: `Contradictory agent instructions detected: ${group.name}`,
      recommendation:
        `Remove one side of the contradiction so agents receive a single clear rule. ` +
        `Found "${strictExample}" and "${opposingExample}".`,
    })
  }

  return issues
}
