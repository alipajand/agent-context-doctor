// `rules.ignoreFiles` comes from the audited repository's `.acdrc`, so it is
// untrusted. Brace patterns are expanded before matching, and both their
// nesting depth and the number of combinations of sibling groups (`{a,b}`
// repeated 20 times is over a million patterns) grow the work without bound.
// The `braces` expander fast-glob used could also exhaust the stack on deep
// nesting (GHSA-vfj7-8cjw-p6xm). Both are bounded here before a pattern
// reaches the glob.

/** Deepest brace nesting accepted in an ignore pattern. */
export const MAX_BRACE_DEPTH = 10

/** Most patterns one ignore pattern may expand to. */
export const MAX_BRACE_EXPANSIONS = 1000

type Group = {
  start: number
  commas: number
  /** Expansions counted so far, summed over finished alternatives. */
  sum: number
  /** Product of all alternatives, for groups that turn out to be unclosed. */
  product: number
  /** Expansions of the alternative being read. */
  current: number
}

const NUMERIC_RANGE = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/
const ALPHA_RANGE = /^([a-zA-Z])\.\.([a-zA-Z])(?:\.\.(-?\d+))?$/

/** Number of values a `{x..y}` or `{x..y..step}` body produces, or 1 if it is not a range. */
function rangeSize(body: string): number {
  const numeric = NUMERIC_RANGE.exec(body)
  const alpha = numeric ? null : ALPHA_RANGE.exec(body)
  const match = numeric ?? alpha
  if (!match) return 1
  const from = numeric ? Number(match[1]) : match[1].charCodeAt(0)
  const to = numeric ? Number(match[2]) : match[2].charCodeAt(0)
  const step = Math.abs(Number(match[3] ?? 1)) || 1
  return Math.floor(Math.abs(to - from) / step) + 1
}

/**
 * Why an ignore pattern is rejected, or `undefined` when it is safe to pass to
 * the glob. Reads the pattern once, without recursion, and counts an upper
 * bound of its brace expansions, so the check itself cannot be exhausted.
 */
export function unsafeIgnorePatternReason(pattern: string): string | undefined {
  const stack: Group[] = []
  let current = 1
  const tooMany = `expands to more than ${MAX_BRACE_EXPANSIONS} patterns`

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') {
      stack.push({ start: i, commas: 0, sum: 0, product: 1, current: 1 })
      if (stack.length > MAX_BRACE_DEPTH) {
        return `nests braces more than ${MAX_BRACE_DEPTH} levels deep`
      }
      continue
    }
    const group = stack[stack.length - 1]
    if (!group) continue
    if (ch === ',') {
      group.sum += group.current
      group.product *= group.current
      group.commas++
      group.current = 1
    } else if (ch === '}') {
      stack.pop()
      const size =
        group.commas > 0
          ? group.sum + group.current
          : group.current * rangeSize(pattern.slice(group.start + 1, i))
      const parent = stack[stack.length - 1]
      if (parent) parent.current *= size
      else current *= size
      if ((parent ? parent.current : current) > MAX_BRACE_EXPANSIONS) return tooMany
    }
    if (group.current > MAX_BRACE_EXPANSIONS || group.sum > MAX_BRACE_EXPANSIONS) return tooMany
  }

  // An unclosed `{` is literal text, but groups inside it still expand.
  // Multiplying every alternative keeps the count an upper bound.
  while (stack.length > 0) {
    const group = stack.pop()!
    const size = group.product * group.current
    const parent = stack[stack.length - 1]
    if (parent) parent.current *= size
    else current *= size
  }
  return current > MAX_BRACE_EXPANSIONS ? tooMany : undefined
}

/** Throw when any ignore pattern is unsafe to pass to the glob. */
export function assertSafeIgnorePatterns(patterns: readonly string[]): void {
  for (const [index, pattern] of patterns.entries()) {
    const reason = unsafeIgnorePatternReason(pattern)
    if (reason) throw new Error(`ignoreFiles[${index}] ${reason}`)
  }
}
