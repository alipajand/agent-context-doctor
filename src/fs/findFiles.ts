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

export async function findContextFiles(repoPath: string): Promise<string[]> {
  const patterns = CONTEXT_PATTERNS.map((p) =>
    path.isAbsolute(p) ? p : p,
  )

  const files = await fg(patterns, {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: true,
    dot: true,
    caseSensitiveMatch: false,
  })

  return files.sort()
}
