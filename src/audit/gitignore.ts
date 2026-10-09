// A subset of gitignore matching, enough to tell whether a path an instruction
// file mentions is one the repository deliberately keeps out of version
// control. The audited repository is untrusted, so patterns are matched by a
// wildcard matcher whose cost is bounded by pattern length times path length
// (patterns are never compiled to regular expressions), rule count and lengths
// are capped, and each matcher has a total step budget. When the budget runs
// out, paths count as not ignored, so the reference is reported rather than
// silently accepted.

const MAX_RULES = 1_000
const MAX_PATTERN_LENGTH = 256
const MAX_PATH_LENGTH = 512
const MAX_PATH_SEGMENTS = 32
const MAX_SEGMENT_LENGTH = 255
const MAX_MATCH_STEPS = 20_000_000

type Budget = { left: number }

type Token =
  | { kind: 'star' }
  | { kind: 'any' }
  | { kind: 'char'; ch: string }
  | { kind: 'class'; negated: boolean; ranges: Array<[string, string]> }

/** A path segment pattern, or `**` for any number of segments. */
type Segment = Token[] | 'globstar'

type Rule = { segments: Segment[]; anchored: boolean; negated: boolean; dirOnly: boolean }

export type GitignoreMatcher = {
  /** True when `relPath` (repo-relative, `/`-separated) is ignored. */
  ignores(relPath: string, isDir?: boolean): boolean
}

function parseClass(glob: string, start: number): { token: Token; end: number } | null {
  let i = start + 1
  const negated = glob[i] === '!' || glob[i] === '^'
  if (negated) i++
  const ranges: Array<[string, string]> = []
  // A `]` right after the opening bracket is a literal member.
  if (glob[i] === ']') {
    ranges.push([']', ']'])
    i++
  }
  while (i < glob.length && glob[i] !== ']') {
    const lo = glob[i]
    if (glob[i + 1] === '-' && i + 2 < glob.length && glob[i + 2] !== ']') {
      ranges.push([lo, glob[i + 2]])
      i += 3
    } else {
      ranges.push([lo, lo])
      i++
    }
  }
  if (i >= glob.length) return null
  return { token: { kind: 'class', negated, ranges }, end: i + 1 }
}

function tokenize(glob: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < glob.length) {
    const ch = glob[i]
    if (ch === '*') {
      while (glob[i] === '*') i++
      tokens.push({ kind: 'star' })
      continue
    }
    if (ch === '?') {
      tokens.push({ kind: 'any' })
    } else if (ch === '\\' && i + 1 < glob.length) {
      i++
      tokens.push({ kind: 'char', ch: glob[i] })
    } else if (ch === '[') {
      const cls = parseClass(glob, i)
      if (cls) {
        tokens.push(cls.token)
        i = cls.end
        continue
      }
      tokens.push({ kind: 'char', ch })
    } else {
      tokens.push({ kind: 'char', ch })
    }
    i++
  }
  return tokens
}

function tokenMatches(token: Token, ch: string): boolean {
  if (token.kind === 'any') return true
  if (token.kind === 'char') return token.ch === ch
  if (token.kind === 'class') {
    const inside = token.ranges.some(([lo, hi]) => ch >= lo && ch <= hi)
    return inside !== token.negated
  }
  return false
}

// Classic two-pointer wildcard match: on a mismatch, resume from the last `*`
// with it consuming one more character. Worst case O(pattern × text).
function matchSegment(tokens: Token[], text: string, budget: Budget): boolean {
  let t = 0
  let s = 0
  let starToken = -1
  let starText = 0
  while (s < text.length) {
    if (--budget.left < 0) return false
    const token = tokens[t]
    if (token && token.kind !== 'star' && tokenMatches(token, text[s])) {
      t++
      s++
    } else if (token?.kind === 'star') {
      starToken = t++
      starText = s
    } else if (starToken !== -1) {
      t = starToken + 1
      s = ++starText
    } else {
      return false
    }
  }
  while (tokens[t]?.kind === 'star') t++
  return t === tokens.length
}

// Match pattern segments against path segments, `**` spanning zero or more.
// Memoised, so the cost is bounded by pattern segments × path segments.
function matchSegments(pattern: Segment[], parts: string[], budget: Budget): boolean {
  const memo = new Map<number, boolean>()
  const go = (p: number, s: number): boolean => {
    if (--budget.left < 0) return false
    if (p === pattern.length) return s === parts.length
    const key = p * (parts.length + 1) + s
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    const seg = pattern[p]
    const result =
      seg === 'globstar'
        ? go(p + 1, s) || (s < parts.length && go(p, s + 1))
        : s < parts.length && matchSegment(seg, parts[s], budget) && go(p + 1, s + 1)
    memo.set(key, result)
    return result
  }
  return go(0, 0)
}

// Trailing spaces and tabs are dropped unless escaped with a backslash. A
// loop rather than a regex, whose cost on long whitespace runs is quadratic.
function trimTrailingWhitespace(line: string): string {
  let end = line.length
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--
  if (end < line.length && end > 0 && line[end - 1] === '\\') end++
  return line.slice(0, end)
}

function parseRule(line: string): Rule | null {
  if (line.length > MAX_PATTERN_LENGTH * 2) return null
  let pattern = trimTrailingWhitespace(line)
  if (pattern === '' || pattern.startsWith('#') || pattern.length > MAX_PATTERN_LENGTH) return null

  const negated = pattern.startsWith('!')
  if (negated) pattern = pattern.slice(1)
  else if (pattern.startsWith('\\!') || pattern.startsWith('\\#')) pattern = pattern.slice(1)

  const dirOnly = pattern.endsWith('/')
  if (dirOnly) pattern = pattern.slice(0, -1)

  // A slash anywhere but the end anchors the pattern to the .gitignore's directory.
  const anchored = pattern.includes('/')
  if (pattern.startsWith('/')) pattern = pattern.slice(1)
  if (pattern === '') return null

  const segments: Segment[] = []
  for (const part of pattern.split('/')) {
    if (part === '**') {
      if (segments[segments.length - 1] !== 'globstar') segments.push('globstar')
    } else {
      segments.push(tokenize(part))
    }
  }
  return { segments, anchored, negated, dirOnly }
}

export function parseGitignore(content: string): GitignoreMatcher {
  const rules: Rule[] = []
  for (const line of content.split(/\r?\n/)) {
    if (rules.length >= MAX_RULES) break
    const rule = parseRule(line)
    if (rule) rules.push(rule)
  }

  const budget: Budget = { left: MAX_MATCH_STEPS }
  const cache = new Map<string, boolean>()

  const ruleMatches = (rule: Rule, parts: string[], isDir: boolean): boolean => {
    if (rule.dirOnly && !isDir) return false
    // An unanchored pattern matches a name at any depth. Every ancestor is
    // checked separately, so comparing against the last segment is enough.
    if (!rule.anchored) {
      const [segment] = rule.segments
      return segment !== 'globstar' && matchSegment(segment, parts[parts.length - 1], budget)
    }
    return matchSegments(rule.segments, parts, budget)
  }

  // The last matching rule wins, so a later `!pattern` can re-include a path.
  const isIgnored = (parts: string[], isDir: boolean): boolean => {
    let ignored = false
    for (const rule of rules) {
      if (budget.left < 0) return false
      if (rule.negated === ignored && ruleMatches(rule, parts, isDir)) ignored = !rule.negated
    }
    return ignored
  }

  return {
    ignores(relPath: string, isDir = false): boolean {
      if (rules.length === 0 || budget.left < 0 || relPath.length > MAX_PATH_LENGTH) return false
      const parts = relPath
        .replace(/\\/g, '/')
        .split('/')
        .filter((part, i) => part !== '' && !(i === 0 && part === '.'))
      if (parts.length === 0 || parts.length > MAX_PATH_SEGMENTS) return false
      if (parts.some((part) => part.length > MAX_SEGMENT_LENGTH)) return false

      const key = `${isDir ? 'd' : 'f'}:${parts.join('/')}`
      const cached = cache.get(key)
      if (cached !== undefined) return cached

      // Git does not descend into an ignored directory, so nothing below it
      // can be re-included by a later negation.
      let result = false
      for (let k = 1; k < parts.length && !result; k++) {
        result = isIgnored(parts.slice(0, k), true)
      }
      if (!result) result = isIgnored(parts, isDir)
      if (budget.left < 0) result = false
      cache.set(key, result)
      return result
    },
  }
}
