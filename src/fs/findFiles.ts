import fg from 'fast-glob'
import path from 'node:path'

export const CONTEXT_PATTERNS = [
  // Cross-tool and model-specific root files, plus nested copies in monorepos
  'AGENTS.md',
  'AGENT.md',
  'CLAUDE.md',
  'claude.md',
  'GEMINI.md',
  '**/AGENTS.md',
  '**/CLAUDE.md',
  '**/GEMINI.md',
  // Claude Code
  '.claude/CLAUDE.md',
  '.claude/claude.md',
  '.claude/commands/**/*.md',
  '.claude/agents/**/*.md',
  '.claude/skills/**/SKILL.md',
  // Cursor
  '.cursorrules',
  '.cursor/rules/**/*.mdc',
  '.cursor/rules/**/*.md',
  // GitHub Copilot
  '.github/copilot-instructions.md',
  '.github/instructions/**/*.md',
  '.github/prompts/**/*.prompt.md',
  '.github/chatmodes/**/*.chatmode.md',
  '.github/agents/**/*.md',
  // Gemini Code Assist
  '.gemini/styleguide.md',
  // Windsurf, Cline, Roo, Kiro, Junie, Augment, Continue, Goose
  '.windsurfrules',
  '.windsurf/rules/**/*.md',
  '.clinerules',
  '.clinerules/**/*.md',
  '.roorules',
  '.roo/rules*/**/*.md',
  '.kiro/steering/**/*.md',
  '.junie/guidelines.md',
  '.augment-guidelines',
  '.augment/rules/**/*.md',
  '.continue/rules/**/*.md',
  '.goosehints',
  // Codex and shared prompt libraries
  '.codex/**/*.md',
  'docs/prompts/**/*.md',
  'prompts/**/*.md',
]

const IGNORE_DIRS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  // Vendored code and test fixtures carry other projects' instructions.
  '**/vendor/**',
  '**/fixtures/**',
  '**/__fixtures__/**',
  '**/testdata/**',
  '**/.venv/**',
  '**/venv/**',
  '**/target/**',
  '**/.next/**',
  '**/.turbo/**',
]

// Nested copies only count with the exact names tools look for, so a file such
// as docs/agents.md (documentation about support agents) is not picked up.
const NESTED_EXACT_NAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'])
const NESTED_LOWERCASE_NAMES = new Set(['agents.md', 'claude.md', 'gemini.md'])

function isUnwantedNestedMatch(relativePath: string): boolean {
  const parts = relativePath.split('/')
  if (parts.length < 2) return false
  const base = parts[parts.length - 1]
  const parent = parts[parts.length - 2]
  if (parent === '.claude') return false
  return NESTED_LOWERCASE_NAMES.has(base.toLowerCase()) && !NESTED_EXACT_NAMES.has(base)
}

/**
 * Find context files under `repoPath`. Symlinked directories are not traversed,
 * so a link such as `.codex -> /` cannot walk the audit outside the repository.
 * Symlinked files are still returned; callers decide whether their targets are
 * safe to read.
 */
export async function findContextFiles(
  repoPath: string,
  extraIgnore: string[] = [],
): Promise<string[]> {
  const ignore = [...IGNORE_DIRS, ...extraIgnore]

  const entries = await fg(CONTEXT_PATTERNS, {
    cwd: repoPath,
    ignore,
    absolute: false,
    dot: true,
    caseSensitiveMatch: false,
    followSymbolicLinks: false,
    onlyFiles: false,
    objectMode: true,
    // A pattern such as `.clinerules/**/*.md` makes fast-glob scan
    // `.clinerules` as a directory; when it is a file that can throw ENOTDIR.
    suppressErrors: true,
  })

  return entries
    .filter((entry) => !entry.dirent.isDirectory())
    .filter((entry) => !isUnwantedNestedMatch(entry.path))
    .map((entry) => path.resolve(repoPath, entry.path))
    .sort()
}
