import path from 'node:path'
import { findContextFiles } from '../fs/findFiles.js'
import { getFileBytes } from '../fs/readTextFile.js'
import type { ContextFile, ContextFileKind } from '../types.js'

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

export async function detectContextFiles(
  repoPath: string,
  ignoreFiles: string[] = [],
): Promise<ContextFile[]> {
  const filePaths = await findContextFiles(repoPath, ignoreFiles)

  const results: ContextFile[] = []
  for (const filePath of filePaths) {
    const rel = path.relative(repoPath, filePath)
    const bytes = await getFileBytes(filePath)
    results.push({
      path: rel,
      kind: classifyFile(filePath),
      bytes,
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
