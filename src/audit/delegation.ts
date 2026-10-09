import path from 'node:path'
import { isPrimaryInstructionFile } from './detectContextFiles.js'
import type { ContextFileKind } from '../types.js'

export type InstructionFile = { path: string; kind: ContextFileKind; content: string }

// Claude Code follows imports up to five hops. Only text files are followed,
// and both the files loaded and the read attempts are capped so a hostile
// repository cannot make the audit read an unbounded number of files.
export const MAX_IMPORT_DEPTH = 5
export const MAX_IMPORTED_FILES = 50
const MAX_IMPORT_ATTEMPTS = 200
const MAX_IMPORTS_PER_FILE = 100
const IMPORTABLE = /\.(?:md|mdc|mdx|txt)$/i

// Path-like tokens. Longer tokens are never file paths, and skipping them
// keeps the per-token suffix lookups below linear in the file size.
const PATH_TOKEN = /[\w.@/-]+/g
const MAX_TOKEN_LENGTH = 512

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Claude-style `@path` imports in `content`, as repo-relative paths resolved
 * against the importing file's directory. Imports that would leave the
 * repository, absolute paths, and non-text files are dropped.
 */
export function importTargets(filePath: string, content: string): string[] {
  const dir = path.posix.dirname(toPosix(filePath))
  const targets: string[] = []
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(/(?:^|\s)@([\w./-]+\.\w+)/g)) {
      if (targets.length >= MAX_IMPORTS_PER_FILE) return targets
      if (m[1].startsWith('/') || !IMPORTABLE.test(m[1])) continue
      const rel = path.posix.normalize(path.posix.join(dir, m[1]))
      if (rel === '..' || rel.startsWith('../')) continue
      targets.push(path.normalize(rel))
    }
  }
  return targets
}

/**
 * Follow `@imports` from the primary instruction files to in-repository files
 * that are not context files themselves (for example `@docs/agent-guide.md`),
 * breadth first. `read` must return '' for anything missing or outside the
 * repository; such targets are not loaded.
 */
export async function loadImportedFiles(
  files: InstructionFile[],
  read: (rel: string) => Promise<string>,
): Promise<{ imported: InstructionFile[]; imports: Map<string, string[]> }> {
  const known = new Set(files.map((f) => f.path))
  const imported: InstructionFile[] = []
  const imports = new Map<string, string[]>()
  let attempts = 0

  let frontier = files.filter((f) => isPrimaryInstructionFile(f.path))
  for (let depth = 0; depth < MAX_IMPORT_DEPTH && frontier.length > 0; depth++) {
    const next: InstructionFile[] = []
    for (const file of frontier) {
      const targets = importTargets(file.path, file.content)
      imports.set(file.path, targets)
      for (const rel of targets) {
        if (known.has(rel)) continue
        if (imported.length >= MAX_IMPORTED_FILES || attempts >= MAX_IMPORT_ATTEMPTS) continue
        known.add(rel)
        attempts++
        const content = await read(rel)
        if (content === '') continue
        const loaded: InstructionFile = { path: rel, kind: 'unknown', content }
        imported.push(loaded)
        next.push(loaded)
      }
    }
    frontier = next
  }
  return { imported, imports }
}

export type DelegationGraph = {
  /** Loaded files that `filePath` points at by path, root file name, or `@import`. */
  targets(filePath: string): string[]
  /**
   * `filePath`, other primary files for the same tool, and every loaded file
   * reachable from those through references, in breadth-first order. Cycles
   * are visited once. Primary files of one kind get the same object.
   */
  closure(filePath: string): ReadonlySet<string>
}

export function buildDelegationGraph(
  files: InstructionFile[],
  imports: ReadonlyMap<string, readonly string[]>,
): DelegationGraph {
  const byPath = new Map(files.map((f) => [f.path, f]))

  // A file is referenced by its repo path anywhere in a token ("docs/a.md",
  // "./docs/a.md", "@docs/a.md"), and a root-level file also by its name in
  // any case ("Follow agents.md").
  const byRepoPath = new Map<string, string>()
  const byRootName = new Map<string, string>()
  let longestPath = 0
  for (const f of files) {
    const posix = toPosix(f.path)
    byRepoPath.set(posix, f.path)
    if (!posix.includes('/')) byRootName.set(posix.toLowerCase(), f.path)
    longestPath = Math.max(longestPath, posix.length)
  }

  const lookup = (candidate: string, found: Set<string>) => {
    const exact = byRepoPath.get(candidate)
    if (exact) found.add(exact)
    if (!candidate.includes('/')) {
      const root = byRootName.get(candidate.toLowerCase())
      if (root) found.add(root)
    }
  }

  const targetCache = new Map<string, string[]>()
  const closureCache = new Map<string, ReadonlySet<string>>()
  // Every primary file of a kind starts from the same set (itself and its
  // siblings), so they share one closure object rather than one each.
  const primaryClosures = new Map<ContextFileKind, ReadonlySet<string>>()

  const targets = (filePath: string): string[] => {
    const cached = targetCache.get(filePath)
    if (cached) return cached
    const found = new Set<string>()
    const self = byPath.get(filePath)
    if (self) {
      for (const [raw] of self.content.matchAll(PATH_TOKEN)) {
        if (raw.length > MAX_TOKEN_LENGTH) continue
        let start = raw.startsWith('@') ? 1 : 0
        if (raw.startsWith('./', start)) start += 2
        let end = raw.length
        while (end > start && (raw[end - 1] === '.' || raw[end - 1] === '-')) end--
        // Only candidates no longer than the longest known path can match,
        // which bounds the slicing per token.
        if (end - start <= longestPath) lookup(raw.slice(start, end), found)
        for (let i = raw.indexOf('/', start); i !== -1 && i < end; i = raw.indexOf('/', i + 1)) {
          if (end - i - 1 <= longestPath) lookup(raw.slice(i + 1, end), found)
        }
      }
      for (const rel of imports.get(filePath) ?? []) {
        if (byPath.has(rel)) found.add(rel)
      }
      found.delete(filePath)
    }
    const result = [...found]
    targetCache.set(filePath, result)
    return result
  }

  const closure = (filePath: string): ReadonlySet<string> => {
    const self = byPath.get(filePath)
    const primary = self !== undefined && isPrimaryInstructionFile(self.path)
    const cached = primary ? primaryClosures.get(self.kind) : closureCache.get(filePath)
    if (cached) return cached
    const seen = new Set<string>([filePath])
    // A .cursor/rules or .claude/rules set is loaded together, so its files
    // count as one source of guidance.
    if (primary) {
      for (const f of files) {
        if (f.kind === self.kind && isPrimaryInstructionFile(f.path)) seen.add(f.path)
      }
    }
    const queue = [...seen]
    for (let i = 0; i < queue.length; i++) {
      for (const next of targets(queue[i])) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    if (primary) primaryClosures.set(self.kind, seen)
    else closureCache.set(filePath, seen)
    return seen
  }

  return { targets, closure }
}
