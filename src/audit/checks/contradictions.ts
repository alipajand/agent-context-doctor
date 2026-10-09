import type { ContextIssue, Severity } from '../../types.js'
import { createLineContext, type LineContext } from '../lineContext.js'
import { findSkipValidation } from '../skipValidation.js'
import { isPrimaryInstructionFile } from '../detectContextFiles.js'
import { toDisplayText } from '../../text/displayText.js'

type ContradictionGroup = {
  name: string
  severity: Severity
  strictPhrases: RegExp[]
  opposingPhrases: RegExp[]
  /** Opposing advice found by a matcher rather than a phrase, with its sentence as evidence. */
  findOpposing?: (line: string) => { sentence: string } | null
}

const CONTRADICTION_GROUPS: ContradictionGroup[] = [
  {
    name: 'tests',
    severity: 'high',
    strictPhrases: [
      /always\s+run\s+tests/i,
      /run\s+tests\s+before\s+finishing/i,
      /tests\s+must\s+pass/i,
      /always\s+run\s+(?:the\s+)?(?:test\s+suite|`[^`\n]{0,80}\btest\b[^`\n]{0,80}`)/i,
      /tests\s+must\s+always\s+pass/i,
      /(?:never|do\s+not|don'?t)\s+skip\s+(?:the\s+|any\s+)?(?:\w+\s+)?tests\b/i,
    ],
    opposingPhrases: [
      /do\s+not\s+run\s+tests/i,
      /tests\s+are\s+optional/i,
      /ignore\s+failing\s+tests/i,
    ],
    // "skip tests" in any wording ("If the tests are slow, skip them"),
    // without narrow exceptions such as documentation-only changes.
    findOpposing: findSkipValidation,
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
const MAX_PHRASE_LENGTH = 160

// Phrases come from audited files and go into evidence and recommendations,
// so they are shown the way line evidence is: one line, visible characters,
// bounded length.
function toPhrase(text: string): string {
  return toDisplayText(text.replace(/\s+/g, ' ').trim()).slice(0, MAX_PHRASE_LENGTH)
}

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
        let match: RegExpExecArray | null = null
        let context: LineContext | null = null
        for (const m of line.matchAll(global)) {
          if (ignoreNegated) context ??= createLineContext(line)
          if (!context?.negatedAt(m.index)) {
            match = m
            break
          }
        }
        if (match) {
          matches.push({ phrase: toPhrase(match[0]), file: path })
          break
        }
      }
    }
  }
  return matches
}

function findWithMatcher(
  files: FileContent[],
  find: (line: string) => { sentence: string } | null,
): PhraseMatch[] {
  const matches: PhraseMatch[] = []
  for (const { path, content } of files) {
    for (const line of content.split('\n')) {
      const found = find(line)
      if (found) {
        matches.push({ phrase: toPhrase(found.sentence), file: path })
        break
      }
    }
  }
  return matches
}

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

// An instruction to use one package manager: "Use pnpm.", "- Use npm for
// everything", "We use yarn", "Always use bun", "Package manager: pnpm".
// The verb must start a sentence or list item or follow we/always/only/please,
// so "if you use yarn" and "the docs site uses npm" are not preferences, and
// generic phrases such as "use npm scripts" are excluded.
const PREFERENCES = [
  /(?:^|[.;:!?]\s+|^\s*(?:[-*+]|\d+\.)\s+|\b(?:we|always|only|please)\s+)use\s+`?(pnpm|npm|yarn|bun)\b(?!\s+(?:scripts?|packages?|registry|modules?|workspaces?|cache|link|audit|version|publish)\b)/gi,
  /\bpackage\s+manager\s*(?:is|:)\s*`?(pnpm|npm|yarn|bun)\b/gi,
]

type Preference = { manager: PackageManager; phrase: string; file: string }

function findPreferences(files: FileContent[]): Preference[] {
  const found: Preference[] = []
  for (const { path, content } of files) {
    // Only standing instructions: a nested AGENTS.md, a command, or a prompt
    // may describe a sub-project that uses another manager on purpose.
    if (!isPrimaryInstructionFile(path)) continue
    const seen = new Set<PackageManager>()
    for (const line of content.split('\n')) {
      let context: LineContext | null = null
      for (const pattern of PREFERENCES) {
        for (const m of line.matchAll(pattern)) {
          context ??= createLineContext(line)
          const manager = m[1].toLowerCase() as PackageManager
          // Judge negation and quotes from the instruction itself, not from
          // the punctuation that ends the previous sentence.
          const start =
            m.index + Math.max(0, m[0].search(/\b(?:we|always|only|please|use|package)\b/i))
          if (seen.has(manager) || context.negatedAt(start) || context.quotedAt(start)) continue
          seen.add(manager)
          const phrase = toPhrase(m[0].replace(/^[\s.;:!?*+-]+|^\d+\.\s+/g, '').replace(/`/g, ''))
          found.push({ manager, phrase, file: path })
        }
      }
    }
  }
  return found
}

function packageManagerContradiction(files: FileContent[]): ContextIssue | null {
  const preferences = findPreferences(files)
  const first = preferences[0]
  const other = preferences.find((p) => p.manager !== first?.manager)
  if (!first || !other) return null

  const involvedFiles = [...new Set(preferences.map((p) => p.file))]
  return {
    id: 'contradiction-package-manager',
    severity: 'medium',
    category: 'contradictions',
    file: involvedFiles.length > 1 ? 'multiple' : involvedFiles[0],
    files: involvedFiles,
    evidence: `${first.file}: "${first.phrase}" vs ${other.file}: "${other.phrase}"`,
    message: 'Contradictory agent instructions detected: package-manager',
    recommendation:
      `Name one package manager in every instruction file, the one the lockfile belongs to. ` +
      `Found "${first.phrase}" and "${other.phrase}".`,
  }
}

export function checkContradictions(files: FileContent[]): ContextIssue[] {
  const issues: ContextIssue[] = []

  for (const group of CONTRADICTION_GROUPS) {
    const strictMatches = findMatches(files, group.strictPhrases)
    const opposingMatches = [
      ...findMatches(files, group.opposingPhrases, true),
      ...(group.findOpposing ? findWithMatcher(files, group.findOpposing) : []),
    ]

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

  const packageManager = packageManagerContradiction(files)
  if (packageManager) issues.push(packageManager)

  return issues
}
