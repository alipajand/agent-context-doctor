// Words that negate a directive when they appear earlier in the same clause:
// "Never skip tests", "Do not bypass auth", "Avoid force-pushing".
const NEGATION =
  /\b(?:not|never|no|don'?t|doesn'?t|cannot|can'?t|mustn'?t|shouldn'?t|won'?t|avoid|without|forbid(?:den)?|prohibit(?:ed)?|disallow(?:ed)?|refuse)\b/i

// Punctuation and connectives that start a new clause, so a negation before
// them does not carry over: "Don't worry about lint, just skip tests".
const CLAUSE_BREAK = /[.;!?:]|\b(?:but|however|instead|then|just|otherwise|unless)\b/i

/**
 * True when the text before `index` on `line`, within the same clause,
 * contains a negation. Used so that safety guidance such as "Never skip
 * tests" is not reported as the risky instruction it forbids.
 */
export function isNegated(line: string, index: number): boolean {
  const clauses = line.slice(0, index).split(CLAUSE_BREAK)
  const clause = clauses[clauses.length - 1] ?? ''
  return NEGATION.test(clause)
}
