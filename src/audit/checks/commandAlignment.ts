import type { ContextIssue } from '../../types.js'
import type { PackageJsonScripts } from '../../fs/readPackageJson.js'

const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun']

// Built-in lifecycle commands that don't need a package.json script entry
const BUILTIN_COMMANDS = new Set(['install', 'i', 'add', 'remove', 'uninstall', 'update', 'upgrade'])

// Pattern: `pnpm run <script>`, `npm run <script>`, `yarn run <script>`, `bun run <script>`
const RUN_PATTERN = /\b(pnpm|npm|yarn|bun)\s+run\s+([\w:.-]+)/g

// Pattern: shorthand `pnpm <script>`, `yarn <script>`, `bun <script>`
// npm shorthand only works for a few known built-ins, but we'll handle npm test / npm start too
const SHORTHAND_PATTERN = /\b(pnpm|npm|yarn|bun)\s+([\w:.-]+)/g

export type ExtractedCommand = {
  script: string
  raw: string
  line: number
}

export function extractCommands(content: string): ExtractedCommand[] {
  const results: ExtractedCommand[] = []
  const seen = new Set<string>()

  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    // Process `run <script>` form first
    for (const match of line.matchAll(RUN_PATTERN)) {
      const script = match[2]
      const raw = match[0]
      const key = `${script}:${lineNum}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ script, raw, line: lineNum })
      }
    }

    // Process shorthand form, but skip tokens already captured by run pattern
    for (const match of line.matchAll(SHORTHAND_PATTERN)) {
      const pm = match[1]
      const token = match[2]
      const raw = match[0]

      // Skip if this is actually a `run <script>` pattern (already handled above)
      if (token === 'run') continue

      // Skip package manager sub-commands that aren't scripts
      if (BUILTIN_COMMANDS.has(token)) continue

      // npm shorthand only works for test, start, stop, restart — treat others as skipped
      // unless it was explicitly `npm run <x>` which was already handled
      if (pm === 'npm' && !['test', 'start', 'stop', 'restart'].includes(token)) continue

      const key = `${token}:${lineNum}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ script: token, raw, line: lineNum })
      }
    }
  }

  return results
}

export function checkCommandAlignment(
  filePath: string,
  content: string,
  scripts: PackageJsonScripts,
): ContextIssue[] {
  const commands = extractCommands(content)
  const issues: ContextIssue[] = []

  for (const cmd of commands) {
    if (!(cmd.script in scripts)) {
      issues.push({
        id: `command-alignment-${filePath}-${cmd.line}-${cmd.script}`,
        severity: 'medium',
        category: 'command-alignment',
        file: filePath,
        line: cmd.line,
        message: `Instruction references missing package script: "${cmd.script}"`,
        recommendation: `Update the instruction file or add package.json script "${cmd.script}".`,
      })
    }
  }

  return issues
}

export function checkCommandsWithoutPackageJson(
  filePath: string,
  content: string,
): ContextIssue[] {
  const hasPackageManagerRef = PACKAGE_MANAGERS.some((pm) =>
    new RegExp(`\\b${pm}\\s+`).test(content),
  )

  if (!hasPackageManagerRef) return []

  return [
    {
      id: `command-alignment-no-pkgjson-${filePath}`,
      severity: 'low',
      category: 'command-alignment',
      file: filePath,
      message: 'Instruction references package manager commands but no package.json was found',
      recommendation:
        'Ensure a package.json exists at the repo root so command references can be validated.',
    },
  ]
}
