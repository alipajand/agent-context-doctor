import type { ContextIssue } from '../../types.js'
import { getLineEvidence } from '../evidence.js'

export type FileReference = {
  target: string
  line: number
  /** A file name with no directory (`RELEASING.md`), taken from inline code. */
  bare?: boolean
}

const PATH_EXTENSIONS =
  /\.(?:md|mdc|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|py|go|rs|rb|java|kt|swift|sh|sql|css|scss|html|vue|svelte|prisma|graphql|proto)$/i

// Obvious placeholders and generated or dependency paths.
const IGNORED =
  /path\/to\/|your[-_]|<|>|\{|\}|\*|\?|\$|xxx|(?:^|\/)(?:foo|bar|baz)\.|^(?:node_modules|dist|build|coverage)\//i

const MAX_REFERENCES_PER_FILE = 200

// Longer targets are never real paths; rejecting them first also keeps the
// trailing-punctuation strip below linear on hostile input.
const MAX_TARGET_LENGTH = 512

// A bare name in inline code is a file only with a documentation or config
// extension (`RELEASING.md`, `pyproject.toml`); `index.ts` or `config.get`
// could be anything.
const BARE_FILE = /^\.?[A-Za-z0-9][\w.-]*\.(?:md|mdx|json|jsonc|ya?ml|toml|sh)$/i

// A sentence saying paths are ignored or excluded ("`.gitignore` excludes
// `.idea/`", "`out/` is ignored by git") describes what a checkout leaves
// out, not files to read. "Ignored" alone is often an unrelated verb ("the
// menu ignored `hidden`"), so it only counts in the passive or with "by".
const DESCRIBES_EXCLUDED =
  /\.gitignore\b|\bgit-?ignored\b|\b(?:is|are|be|being|stays?|remains?|kept)\s+(?:\w+\s+)?ignored\b|\bignored\s+by\b|\bexclude[sd]?\b|\bexcluding\b|\buntracked\b|\bnot\s+(?:checked\s+in|committed|tracked)\b/i

// Sentence boundaries within a line; a period inside `docs/a.md` is not one.
const SENTENCE_BREAK = /(?<=[.!?])\s+/

function normalizeTarget(raw: string): string | null {
  if (raw.length > MAX_TARGET_LENGTH) return null
  const withoutFragment = raw.replace(/[#?].*$/, '')
  let end = withoutFragment.length
  while (end > 0 && '.,;:)'.includes(withoutFragment[end - 1])) end--
  const target = withoutFragment.slice(0, end)
  if (!target || target.includes('://') || /^(?:mailto:|#|\/|~|-)/.test(target)) return null
  if (IGNORED.test(target)) return null
  return target
}

// Inline code counts as a path only when it clearly is one: it has a
// directory component and a known extension, a ./ prefix, or a trailing slash.
// Bare names such as `index.ts` could live anywhere, `../x.js` is usually an
// import specifier, and `owner/repo` or package names have no extension.
function looksLikePath(token: string): boolean {
  if (!token.includes('/') || token.startsWith('../') || token.startsWith('@')) return false
  return PATH_EXTENSIONS.test(token) || token.startsWith('./') || token.endsWith('/')
}

/**
 * Paths the text points at: Markdown link targets, inline-code paths, and
 * Claude-style `@path` imports. Fenced code blocks are skipped because they
 * usually hold example commands and output, not references, and so is inline
 * code in sentences that describe paths as ignored or excluded.
 */
export function extractFileReferences(content: string): FileReference[] {
  const refs: FileReference[] = []
  const seen = new Set<string>()
  let inFence = false

  const add = (raw: string, line: number, bare = false) => {
    if (refs.length >= MAX_REFERENCES_PER_FILE) return
    const target = normalizeTarget(raw)
    if (!target) return
    const key = `${line}:${target}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push(bare ? { target, line, bare } : { target, line })
  }

  content.split('\n').forEach((text, idx) => {
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const line = idx + 1

    // Link text, target, and title are bounded so a line of unclosed
    // brackets, parentheses, or quotes cannot make each match attempt scan
    // the rest of the line.
    for (const m of text.matchAll(
      /\[[^[\]]{0,500}\]\(\s*([^)\s]{1,512})(?:\s+"[^"]{0,500}")?\s*\)/g,
    )) {
      add(m[1], line)
    }
    for (const sentence of text.split(SENTENCE_BREAK)) {
      if (DESCRIBES_EXCLUDED.test(sentence)) continue
      for (const m of sentence.matchAll(/`([^`\s]+)`/g)) {
        if (looksLikePath(m[1])) add(m[1], line)
        else if (BARE_FILE.test(m[1])) add(m[1], line, true)
      }
    }
    for (const m of text.matchAll(/(?:^|\s)@([\w./-]+\.\w+)/g)) add(m[1], line)
  })

  return refs
}

export function checkBrokenReferences(
  filePath: string,
  content: string,
  missingTargets: ReadonlySet<string>,
): ContextIssue[] {
  return extractFileReferences(content)
    .filter((ref) => missingTargets.has(ref.target))
    .map((ref) => ({
      id: `broken-references-${filePath}-${ref.line}-${ref.target}`,
      severity: 'medium' as const,
      category: 'broken-references',
      file: filePath,
      line: ref.line,
      evidence: getLineEvidence(content, ref.line),
      message: `Instruction references a file that does not exist: "${ref.target}"`,
      recommendation:
        'Update or remove the reference. Agents follow stale paths and waste time looking for files that moved or were deleted.',
    }))
}
