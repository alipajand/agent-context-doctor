import type { ContextIssue } from '../../types.js'
import { getLineEvidence } from '../evidence.js'

export type FileReference = { target: string; line: number }

const PATH_EXTENSIONS =
  /\.(?:md|mdc|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|py|go|rs|rb|java|kt|swift|sh|sql|css|scss|html|vue|svelte|prisma|graphql|proto)$/i

// Obvious placeholders and generated or dependency paths.
const IGNORED =
  /path\/to\/|your[-_]|<|>|\{|\}|\*|\?|\$|xxx|(?:^|\/)(?:foo|bar|baz)\.|^(?:node_modules|dist|build|coverage)\//i

const MAX_REFERENCES_PER_FILE = 200

function normalizeTarget(raw: string): string | null {
  const target = raw.replace(/[#?].*$/, '').replace(/[.,;:)]+$/, '')
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
 * usually hold example commands and output, not references.
 */
export function extractFileReferences(content: string): FileReference[] {
  const refs: FileReference[] = []
  const seen = new Set<string>()
  let inFence = false

  const add = (raw: string, line: number) => {
    const target = normalizeTarget(raw)
    if (!target || refs.length >= MAX_REFERENCES_PER_FILE) return
    const key = `${line}:${target}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push({ target, line })
  }

  content.split('\n').forEach((text, idx) => {
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const line = idx + 1

    for (const m of text.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) add(m[1], line)
    for (const m of text.matchAll(/`([^`\s]+)`/g)) {
      if (looksLikePath(m[1])) add(m[1], line)
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
