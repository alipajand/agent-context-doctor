import fs from 'node:fs/promises'
import path from 'node:path'
import { findContextFiles } from '../fs/findFiles.js'
import { MAX_TEXT_FILE_BYTES } from '../fs/readTextFile.js'
import { isWithin } from '../fs/safePath.js'
import type { ContextFile, ContextFileKind, ContextFileSkipReason } from '../types.js'

function classifyFile(filePath: string): ContextFileKind {
  const base = path.basename(filePath).toLowerCase()
  const rel = `/${filePath.replace(/\\/g, '/').toLowerCase()}`

  if (base === 'agents.md' || base === 'agent.md') return 'agents'
  if (base === 'claude.md' || rel.includes('/.claude/')) return 'claude'
  if (base === 'gemini.md' || rel.includes('/.gemini/')) return 'gemini'
  if (base === '.cursorrules' || rel.includes('/.cursor/rules/')) return 'cursor'
  if (
    rel.includes('copilot-instructions') ||
    rel.includes('/.github/prompts/') ||
    rel.includes('/.github/chatmodes/') ||
    rel.includes('/.github/agents/')
  ) {
    return 'copilot'
  }
  if (rel.includes('/.codex/')) return 'codex'
  if (base === '.windsurfrules' || rel.includes('/.windsurf/')) return 'windsurf'
  if (base === '.clinerules' || rel.includes('/.clinerules/')) return 'cline'
  if (base === '.roorules' || rel.includes('/.roo/')) return 'roo'
  if (rel.includes('/.kiro/')) return 'kiro'
  if (rel.includes('/.junie/')) return 'junie'
  if (base === '.augment-guidelines' || rel.includes('/.augment/')) return 'augment'
  if (rel.includes('/.continue/')) return 'continue'
  if (base === '.goosehints') return 'goose'
  if (rel.includes('prompts/') || rel.includes('/.github/instructions/')) return 'prompt'
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

// Files a tool loads as its main standing instructions. Nested AGENTS.md /
// CLAUDE.md files are scoped addenda, so the structural checks (safety,
// validation, final report) only apply to root-level files.
const PRIMARY_ROOT_FILES = new Set([
  'agents.md',
  'agent.md',
  'claude.md',
  'gemini.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.roorules',
  '.augment-guidelines',
  '.goosehints',
])

const PRIMARY_FILES = new Set([
  '.claude/claude.md',
  '.github/copilot-instructions.md',
  '.gemini/styleguide.md',
  '.junie/guidelines.md',
])

const PRIMARY_DIRECTORIES = [
  '.cursor/rules/',
  '.windsurf/rules/',
  '.clinerules/',
  '.roo/rules',
  '.kiro/steering/',
  '.augment/rules/',
  '.continue/rules/',
]

/** `relativePath` is relative to the audited repository root. */
export function isPrimaryInstructionFile(relativePath: string): boolean {
  const lower = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()

  if (!lower.includes('/')) return PRIMARY_ROOT_FILES.has(lower)
  if (PRIMARY_FILES.has(lower)) return true
  return PRIMARY_DIRECTORIES.some((dir) => lower.startsWith(dir))
}
