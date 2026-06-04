import fg from 'fast-glob'
import path from 'node:path'

const CONTEXT_PATTERNS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.cursor/rules/*.mdc',
  '.github/copilot-instructions.md',
  'docs/prompts/**/*.md',
  'prompts/**/*.md',
  '.codex/**/*.md',
  '.github/instructions/**/*.md',
]

const IGNORE_DIRS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
]

export async function findContextFiles(
  repoPath: string,
  extraIgnore: string[] = [],
): Promise<string[]> {
  const ignore = [...IGNORE_DIRS, ...extraIgnore]

  const files = await fg(CONTEXT_PATTERNS, {
    cwd: repoPath,
    ignore,
    absolute: true,
    dot: true,
    caseSensitiveMatch: false,
  })

  return files.sort()
}
