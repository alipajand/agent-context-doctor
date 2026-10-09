import { createLineContext } from './lineContext.js'

export type SkipValidationMatch = {
  /** Position of the match in the line. */
  index: number
  /** The sentence that gives the advice, for evidence. */
  sentence: string
}

const QUALIFIER = String.raw`(?:(?:slow|flaky|failing|long[- ]running|unit|integration|e2e|end-to-end)\s+)?`
const TESTS = String.raw`(?:tests?|test\s+suite|specs)`

// Advice that names the tests: "skip the tests", "skip slow tests", "tests can
// be skipped", "rely on CI instead of running them".
const DIRECT = [
  new RegExp(
    String.raw`\bskip(?:ping)?\s+(?:the\s+|all\s+|any\s+|your\s+)?${QUALIFIER}${TESTS}\b`,
    'gi',
  ),
  new RegExp(String.raw`\b${TESTS}\s+(?:can|may|could|should)\s+be\s+skipped\b`, 'gi'),
  /\brely\s+on\s+(?:the\s+)?CI\s+(?:instead|rather)\b/gi,
]

// "Skip them" counts only when the same sentence is about tests:
// "If the tests are slow, skip them", "Skip them if testing takes too long".
const PRONOUN = /\bskip(?:ping)?\s+(?:them|it|those|these)\b/gi
const TEST_CONTEXT = /\btest(?:s|ing)?\b|\btest\s+suite\b|\bspecs?\b/i

// A narrow, explicit scope is an exception rather than permission to stop
// validating: "skip the e2e tests for documentation-only changes".
const SCOPED_EXCEPTION = /\b(?:docs?|documentation|readme|comments?|typo)[- ]only\b/i

const MAX_EVIDENCE_LENGTH = 160

type Candidate = { index: number; needsTestContext: boolean }

/**
 * The first place in `line` that tells an agent to skip tests or leave them
 * to CI, or null. Negated advice ("Never skip tests"), quoted examples,
 * advice about something other than tests ("If the linter is slow, skip
 * it"), and narrow documentation-only exceptions do not count. Every match is
 * examined, each with a lookup into one pass over the line, so padding a line
 * with negated mentions neither hides later advice nor costs more than linear
 * time.
 */
export function findSkipValidation(line: string): SkipValidationMatch | null {
  const candidates: Candidate[] = []
  for (const pattern of DIRECT) {
    for (const m of line.matchAll(pattern))
      candidates.push({ index: m.index, needsTestContext: false })
  }
  for (const m of line.matchAll(PRONOUN))
    candidates.push({ index: m.index, needsTestContext: true })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.index - b.index)

  const context = createLineContext(line)
  const verdicts = new Map<number, { aboutTests: boolean; exception: boolean }>()
  for (const { index, needsTestContext } of candidates) {
    const { start, end } = context.sentenceAt(index)
    let verdict = verdicts.get(start)
    if (!verdict) {
      const sentence = line.slice(start, end)
      verdict = {
        aboutTests: TEST_CONTEXT.test(sentence),
        exception: SCOPED_EXCEPTION.test(sentence),
      }
      verdicts.set(start, verdict)
    }
    if (verdict.exception || (needsTestContext && !verdict.aboutTests)) continue
    if (context.quotedAt(index) || context.negatedAt(index)) continue
    const sentence = line.slice(start, Math.min(end, start + MAX_EVIDENCE_LENGTH * 4))
    return { index, sentence: sentence.replace(/^[\s>*+-]+/, '').trim() }
  }
  return null
}
