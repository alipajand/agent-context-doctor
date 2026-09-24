import fs from 'node:fs/promises'
import path from 'node:path'
import { findContextFiles } from '../fs/findFiles.js'
import { MAX_TEXT_FILE_BYTES } from '../fs/readTextFile.js'
import { isWithin } from '../fs/safePath.js'
import type { ContextFile, ContextFileKind, ContextFileSkipReason } from '../types.js'

function classifyFile(filePath: string): ContextFileKind {
  const base = path.basename(filePath).toLowerCase()
  const rel = filePath.replace(/\\/g, '/')

  if (base === 'agents.md') return 'agents'
  if (base === 'claude.md' || rel.includes('.claude/')) return 'claude'
  if (base === '.cursorrules' || rel.includes('.cursor/rules/')) return 'cursor'
  if (rel.includes('copilot-instructions')) return 'copilot'
  if (rel.includes('.codex/')) return 'codex'
  if (rel.includes('prompts/') || rel.includes('docs/prompts/')) return 'prompt'
  if (rel.includes('.github/instructions/')) return 'prompt'
  return 'unknown'
}

async function inspectFile(
  realRepo: string,
  filePath: string,
): Promise<{ bytes: number; skipped?: ContextFileSkipReason }> {
  let realPath: string
  try {
    realPath = await fs.realpath(filePath)
  } catch {
    return { bytes: 0, skipped: 'not-a-file' }
  }

  // Never stat or read link targets outside the audited directory: their size
  // and contents could otherwise leak into reports and CI logs.
  if (!isWithin(realRepo, realPath)) return { bytes: 0, skipped: 'outside-repo' }

  const stat = await fs.stat(realPath).catch(() => null)
  if (!stat?.isFile()) return { bytes: 0, skipped: 'not-a-file' }
  if (stat.size > MAX_TEXT_FILE_BYTES) return { bytes: stat.size, skipped: 'too-large' }
  return { bytes: stat.size }
}

export async function detectContextFiles(
  repoPath: string,
  ignoreFiles: string[] = [],
): Promise<ContextFile[]> {
  const filePaths = await findContextFiles(repoPath, ignoreFiles)
  const realRepo = await fs.realpath(repoPath).catch(() => path.resolve(repoPath))

  const results: ContextFile[] = []
  for (const filePath of filePaths) {
    const { bytes, skipped } = await inspectFile(realRepo, filePath)
    results.push({
      path: path.relative(repoPath, filePath),
      kind: classifyFile(filePath),
      bytes,
      ...(skipped ? { skipped } : {}),
    })
  }

  return results
}

export function isPrimaryInstructionFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase()
  const rel = filePath.replace(/\\/g, '/')

  return (
    base === 'agents.md' ||
    base === 'claude.md' ||
    base === '.cursorrules' ||
    rel.includes('.cursor/rules/') ||
    rel.includes('copilot-instructions')
  )
}
