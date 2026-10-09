import { CLAUSE_BREAK, NEGATION } from './negation.js'

type Span = { start: number; end: number }

export type LineContext = {
  /** Same answer as `isNegated(line, index)`: a negation earlier in the same clause. */
  negatedAt(index: number): boolean
  /**
   * True when `index` sits inside a quoted part of its sentence ("…" or “…”).
   * A sentence that is quoted from start to end is a quoted rule, not an
   * example inside one, so it does not count.
   */
  quotedAt(index: number): boolean
  /** The sentence containing `index`, as offsets into the line. */
  sentenceAt(index: number): Span
}

type Spans = { starts: number[]; ends: number[] }

// Quoted parts of one sentence, sorted by start, with the furthest end so far,
// so "is this index quoted" is one binary search.
type QuotedIndex = { starts: number[]; maxEnds: number[] }

function collectSpans(line: string, pattern: RegExp): Spans {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)
  const starts: number[] = []
  const ends: number[] = []
  for (let m = global.exec(line); m !== null; m = global.exec(line)) {
    starts.push(m.index)
    ends.push(m.index + m[0].length)
    if (m[0].length === 0) global.lastIndex++
  }
  return { starts, ends }
}

/** Index of the first value greater than or equal to `target`, or `values.length`. */
function lowerBound(values: readonly number[], target: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (values[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

const WORD = /\w/
const WHOLE_BREAK = new RegExp(`^(?:${CLAUSE_BREAK.source})$`, 'i')
const WHOLE_NEGATION = new RegExp(`^(?:${NEGATION.source})$`, 'i')
// Longer than any break or negation word, so a longer partial word is neither.
const MAX_KEYWORD_LENGTH = 16

// A straight quote opens after the start of the sentence, a space, or an
// opening bracket, and closes before the end, a space, or punctuation. An
// inch mark such as 27" therefore neither opens nor closes a quote.
const OPENS_AFTER = /[\s([{]/
const CLOSES_BEFORE = /[\s.,;:!?)\]}]/
// List markers, emphasis, and closing punctuation around a quoted sentence.
const LEADING_NOISE = /[\s>*+_~`-]/
const TRAILING_NOISE = /[\s.!?*_~`)\]]/
// A short label before a quoted sentence ("Rule: "…"") is part of the rule.
const LABEL = /^[\w ]{1,40}:/
const WORD_OR_APOSTROPHE = /[\w']/

function quotedRanges(line: string, start: number, end: number): Span[] {
  const ranges: Span[] = []
  let straightOpen = -1
  let curlyOpen = -1
  for (let i = start; i < end; i++) {
    const ch = line[i]
    if (ch === '“' && curlyOpen === -1) curlyOpen = i
    else if (ch === '”' && curlyOpen !== -1) {
      ranges.push({ start: curlyOpen, end: i })
      curlyOpen = -1
    } else if (ch === '"') {
      const before = i === start ? ' ' : line[i - 1]
      const after = i + 1 >= end ? ' ' : line[i + 1]
      if (straightOpen === -1 && OPENS_AFTER.test(before)) straightOpen = i
      else if (straightOpen !== -1 && CLOSES_BEFORE.test(after)) {
        ranges.push({ start: straightOpen, end: i })
        straightOpen = -1
      }
    }
  }
  // A quote that spans the whole sentence is the sentence itself. Trimmed
  // with loops: a trailing-class regex is quadratic on long whitespace runs.
  let first = start
  while (first < end && LEADING_NOISE.test(line[first])) first++
  const label = LABEL.exec(line.slice(first, Math.min(end, first + 42)))
  if (label) {
    first += label[0].length
    while (first < end && LEADING_NOISE.test(line[first])) first++
  }
  let last = end - 1
  while (last > first && TRAILING_NOISE.test(line[last])) last--
  return ranges.filter((r) => !(r.start <= first && r.end >= last))
}

/**
 * Facts about one line, gathered in one pass, so that checking any number of
 * matches on it costs a binary search each rather than a rescan of the line.
 * Hostile lines with many matches therefore stay linear in time, with no caps
 * or windows that padding could push real advice past.
 */
export function createLineContext(line: string): LineContext {
  const breaks = collectSpans(line, CLAUSE_BREAK)
  const negations = collectSpans(line, NEGATION)
  const sentenceEnds = collectSpans(line, /[.!?](?=\s|$)/)
  const quotedBySentence = new Map<number, QuotedIndex>()

  const sentenceAt = (index: number): Span => {
    const next = lowerBound(sentenceEnds.starts, index)
    return {
      start: next > 0 ? sentenceEnds.ends[next - 1] : 0,
      end: next < sentenceEnds.ends.length ? sentenceEnds.ends[next] : line.length,
    }
  }

  return {
    negatedAt(index) {
      // `isNegated` cuts the line at `index`, which ends a word there. When
      // the match starts inside a word, the part before it can be a whole
      // break or negation word in that view: "then|skip", "not|skip".
      if (index > 0 && WORD.test(line[index - 1]) && WORD.test(line[index] ?? '')) {
        let wordStart = index
        while (
          wordStart > 0 &&
          index - wordStart <= MAX_KEYWORD_LENGTH &&
          // Apostrophes belong to the word too, as in "don't|skip".
          WORD_OR_APOSTROPHE.test(line[wordStart - 1])
        ) {
          wordStart--
        }
        const partial = line.slice(wordStart, index)
        if (partial.length <= MAX_KEYWORD_LENGTH) {
          if (WHOLE_BREAK.test(partial)) return false
          if (WHOLE_NEGATION.test(partial)) return true
        }
      }
      // The clause starts after the last break that ends at or before `index`.
      const lastBreak = lowerBound(breaks.ends, index + 1) - 1
      const clauseStart = lastBreak >= 0 ? breaks.ends[lastBreak] : 0
      const first = lowerBound(negations.starts, clauseStart)
      return first < negations.starts.length && negations.ends[first] <= index
    },
    quotedAt(index) {
      const { start, end } = sentenceAt(index)
      let quoted = quotedBySentence.get(start)
      if (!quoted) {
        const ranges = quotedRanges(line, start, end).sort((a, b) => a.start - b.start)
        const maxEnds: number[] = []
        for (const r of ranges) maxEnds.push(Math.max(r.end, maxEnds[maxEnds.length - 1] ?? -1))
        quoted = { starts: ranges.map((r) => r.start), maxEnds }
        quotedBySentence.set(start, quoted)
      }
      const before = lowerBound(quoted.starts, index) - 1
      return before >= 0 && quoted.maxEnds[before] > index
    },
    sentenceAt,
  }
}
