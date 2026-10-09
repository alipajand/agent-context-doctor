import type { ContextIssue } from '../../types.js'
import type { PackageJsonScripts } from '../../fs/readPackageJson.js'
import { getLineEvidence } from '../evidence.js'
import { isNegated } from '../negation.js'
import type { ExpectedPackageManager, PackageManager } from '../packageManager.js'

// Package-manager commands that are not package.json scripts.
const BUILTINS: Record<PackageManager, ReadonlySet<string>> = {
  pnpm: new Set(
    'add i install remove rm uninstall un update up upgrade exec dlx create init import link ln unlink list ls outdated why audit publish pack version config store prune rebuild rb approve-builds self-update setup env fetch patch patch-commit dedupe licenses deploy doctor root bin help'.split(
      ' ',
    ),
  ),
  npm: new Set(
    'i install ci add remove rm uninstall un update up upgrade exec x init create link unlink ls list outdated why audit publish pack version config cache prune rebuild dedupe doctor fund help view info login logout whoami'.split(
      ' ',
    ),
  ),
  yarn: new Set(
    'add i install remove upgrade up why dlx exec info init pack publish config cache set node plugin bin constraints dedupe explain npm patch patch-commit rebuild search stage link unlink version import'.split(
      ' ',
    ),
  ),
  bun: new Set(
    'i install add a remove rm update x create c init pm link unlink upgrade outdated publish patch build test repl exec audit info why'.split(
      ' ',
    ),
  ),
}

// npm only resolves these as script shorthands; everything else needs `npm run`.
const NPM_SHORTHAND_SCRIPTS = new Set(['test', 'start', 'stop', 'restart'])

// Flags that take a value, so the next token is not the command.
const VALUE_FLAGS = new Set(['-C', '--dir', '--filter', '-F', '--prefix', '--workspace', '--cwd'])

// Flags and subcommands that target another package in a workspace: the
// script lives in that package's package.json, not the root one.
const WORKSPACE_TARGETING = new Set([
  '-C',
  '--dir',
  '--filter',
  '-F',
  '-r',
  '--recursive',
  '--prefix',
  '--workspace',
  '-w',
  '--workspaces',
  '--cwd',
  'workspace',
  'workspaces',
])

// Words that follow a package manager's name in prose ("use pnpm for
// everything") rather than naming a script.
const PROSE_WORDS = new Set(
  'a an and as at by for from if in instead is it not of on only or so than that the then to via when which will with commands scripts version versions workspace packages'.split(
    ' ',
  ),
)

const TOKEN = /^[\w:.@/-]+$/

// A version after a package manager's name ("pnpm 11", "npm v10.x") is prose
// about which release to use, not a script.
const VERSION = /^v?\d+(?:\.(?:\d+|x))*$/i

export type ExtractedCommand = {
  script: string
  raw: string
  line: number
}

type ParsedCommand = { command: string; viaRun: boolean; workspaceScoped: boolean }

function flagName(token: string): string {
  return token.split('=')[0]
}

function parseInvocation(tokens: string[]): ParsedCommand | null {
  let i = 0
  const nextPositional = (): string | undefined => {
    while (i < tokens.length) {
      const token = tokens[i++]
      if (!token.startsWith('-')) return token
      if (VALUE_FLAGS.has(token)) i++
    }
    return undefined
  }

  let command = nextPositional()
  if (!command) return null
  const viaRun = command === 'run' || command === 'run-script'
  if (viaRun) {
    command = nextPositional()
    if (!command) return null
  }

  // npm and pnpm read these flags anywhere before `--`, including after the script name.
  const flags = tokens.slice(0, tokens.includes('--') ? tokens.indexOf('--') : tokens.length)
  const workspaceScoped =
    WORKSPACE_TARGETING.has(command) || flags.some((t) => WORKSPACE_TARGETING.has(flagName(t)))

  return { command, viaRun, workspaceScoped }
}

// Text after a package manager's name up to the next command boundary: another
// package manager, a shell separator, or the end of an inline code span.
function commandSegment(rest: string): string[] {
  const end = rest.search(/[`'"]|;|&&|\|\||\||\b(?:pnpm|npm|yarn|bun)\b/)
  const segment = end === -1 ? rest : rest.slice(0, end)
  return segment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((token) => token.replace(/[.,;:)!?]+$/, ''))
}

function isCodeLine(line: string, inFence: boolean): boolean {
  return inFence || /^\s*(?:\$\s+)?(?:pnpm|npm|yarn|bun|make)\b/.test(line)
}

/**
 * Extract package-manager script references. Built-in commands, flags,
 * workspace-targeted invocations (whose scripts live in another package), and
 * prose such as "use pnpm for everything" are not reported as scripts.
 */
export function extractCommands(content: string): ExtractedCommand[] {
  const results: ExtractedCommand[] = []
  const seen = new Set<string>()

  content.split('\n').forEach((line, idx) => {
    for (const match of line.matchAll(/\b(pnpm|npm|yarn|bun)\b/g)) {
      const pm = match[1] as PackageManager
      const after = line.slice(match.index + match[0].length)
      // `pnpm@9.12.0` or `npm@latest` names a release, not a command.
      if (after.startsWith('@')) continue
      const tokens = commandSegment(after)
      const parsed = parseInvocation(tokens)
      if (!parsed || parsed.workspaceScoped) continue

      const { command, viaRun } = parsed
      if (!TOKEN.test(command) || PROSE_WORDS.has(command.toLowerCase())) continue
      if (!viaRun) {
        if (BUILTINS[pm].has(command) || VERSION.test(command)) continue
        if (pm === 'npm' && !NPM_SHORTHAND_SCRIPTS.has(command)) continue
      }

      const key = `${command}:${idx + 1}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        script: command,
        raw: `${pm} ${tokens.join(' ')}`.trim(),
        line: idx + 1,
      })
    }
  })

  return results
}

export function checkCommandAlignment(
  filePath: string,
  content: string,
  scripts: PackageJsonScripts,
): ContextIssue[] {
  return extractCommands(content)
    .filter((cmd) => !Object.hasOwn(scripts, cmd.script))
    .map((cmd) => ({
      id: `command-alignment-${filePath}-${cmd.line}-${cmd.script}`,
      severity: 'medium' as const,
      category: 'command-alignment',
      file: filePath,
      line: cmd.line,
      evidence: getLineEvidence(content, cmd.line),
      message: `Instruction references missing package script: "${cmd.script}"`,
      recommendation: `Update the instruction file or add package.json script "${cmd.script}".`,
    }))
}

// Commands that install or change dependencies, and so write a lockfile.
const INSTALLS: Record<PackageManager, ReadonlySet<string>> = {
  pnpm: new Set(
    'add i install remove rm uninstall un update up upgrade dedupe import link ln unlink prune rebuild rb fetch'.split(
      ' ',
    ),
  ),
  npm: new Set(
    'i install ci add remove rm uninstall un update up upgrade dedupe link unlink prune rebuild'.split(
      ' ',
    ),
  ),
  yarn: new Set('add i install remove upgrade up dedupe import link unlink'.split(' ')),
  bun: new Set('i install add a remove rm update link unlink'.split(' ')),
}

// Text just before a command that offers it as an alternative or names it
// only to rule it out: "instead of `npm install`", "(not `yarn`)", "or `npm test`".
const ALTERNATIVE_BEFORE =
  /(?:\binstead\s+of|\brather\s+than|\bunlike|\bnot|\bvs\.?|\bversus|\bover|\bfrom|\bor|\be\.g\.|\bsuch\s+as)\s*[`'"(]*\s*$/i

const MAX_ALTERNATIVE_CONTEXT = 40

// Bounds that keep the work per line linear on hostile input: only the first
// matches on a line are examined, and negation is judged from a window
// before each match rather than everything before it.
const MAX_INVOCATIONS_PER_LINE = 64
const MAX_NEGATION_CONTEXT = 200

export type PackageManagerInvocation = {
  manager: PackageManager
  raw: string
  line: number
}

// A clause scoped to another manager: "If you use yarn, run `yarn install`".
function scopedToManager(line: string, pm: PackageManager): boolean {
  return new RegExp(
    `\\bif\\s+you(?:'re|\\s+are)?\\s+(?:use|using|prefer)\\s+${pm}\\b|\\b(?:for|with)\\s+${pm}(?:\\s+users)?\\s*[:,]`,
    'i',
  ).test(line)
}

/**
 * Package-manager invocations that commit to a manager: installs and script
 * runs. Version specs (`pnpm@9.12.0`), global installs, registry and one-off
 * commands (`npm publish`, `pnpm dlx`), negated or alternative mentions, and
 * prose are skipped. At most one invocation per manager and line.
 */
export function extractPackageManagerInvocations(content: string): PackageManagerInvocation[] {
  const results: PackageManagerInvocation[] = []

  content.split('\n').forEach((line, idx) => {
    const seen = new Set<PackageManager>()
    const scoped = new Map<PackageManager, boolean>()
    let examined = 0
    for (const match of line.matchAll(/(?<![\w@./-])(pnpm|npm|yarn|bun)(?=[ \t])/g)) {
      if (++examined > MAX_INVOCATIONS_PER_LINE) break
      const pm = match[1] as PackageManager
      if (seen.has(pm)) continue
      const tokens = commandSegment(line.slice(match.index + match[0].length))
      const parsed = parseInvocation(tokens)
      if (!parsed) continue
      const { command, viaRun } = parsed
      if (!TOKEN.test(command) || command === 'global') continue
      if (tokens.some((t) => t === '-g' || t === '--global')) continue

      const commits =
        INSTALLS[pm].has(command) ||
        viaRun ||
        (!BUILTINS[pm].has(command) &&
          !VERSION.test(command) &&
          !PROSE_WORDS.has(command.toLowerCase()) &&
          (pm !== 'npm' || NPM_SHORTHAND_SCRIPTS.has(command)))
      if (!commits) continue

      const before = line.slice(Math.max(0, match.index - MAX_ALTERNATIVE_CONTEXT), match.index)
      if (ALTERNATIVE_BEFORE.test(before)) continue
      const window = line.slice(Math.max(0, match.index - MAX_NEGATION_CONTEXT), match.index)
      if (isNegated(window, window.length)) continue
      if (!scoped.has(pm)) scoped.set(pm, scopedToManager(line, pm))
      if (scoped.get(pm)) continue

      seen.add(pm)
      results.push({ manager: pm, raw: `${pm} ${tokens.join(' ')}`.trim(), line: idx + 1 })
    }
  })

  return results
}

const MAX_LISTED_LINES = 10

/**
 * One issue per file and package manager the repository does not use,
 * anchored at its first use, so a block of `npm run` lines in a pnpm
 * repository is one mistake to fix rather than one per line.
 */
export function checkPackageManagerAlignment(
  filePath: string,
  content: string,
  expected: ExpectedPackageManager | null,
): ContextIssue[] {
  if (expected === null) return []
  const linesByManager = new Map<PackageManager, number[]>()
  for (const cmd of extractPackageManagerInvocations(content)) {
    if (cmd.manager === expected.manager) continue
    linesByManager.set(cmd.manager, [...(linesByManager.get(cmd.manager) ?? []), cmd.line])
  }

  return [...linesByManager].map(([manager, lines]) => {
    const listed = lines.slice(0, MAX_LISTED_LINES).join(', ')
    const more =
      lines.length > MAX_LISTED_LINES ? ` and ${lines.length - MAX_LISTED_LINES} more` : ''
    const where = lines.length > 1 ? ` on lines ${listed}${more}` : ''
    return {
      id: `command-alignment-pm-${filePath}-${manager}`,
      severity: 'medium' as const,
      category: 'command-alignment',
      file: filePath,
      line: lines[0],
      evidence: getLineEvidence(content, lines[0]),
      message: `Instruction uses ${manager}, but this repository uses ${expected.manager}`,
      recommendation:
        `Use ${expected.manager} commands instead of ${manager}${where} (${expected.evidence.join(', ')}). ` +
        `Running ${manager} here can write a second lockfile and install different dependency versions.`,
    }
  })
}

export function checkCommandsWithoutPackageJson(filePath: string, content: string): ContextIssue[] {
  if (extractCommands(content).length === 0) return []

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

/** `make` targets referenced in the text, with their line numbers. */
export function extractMakeTargets(content: string): ExtractedCommand[] {
  const results: ExtractedCommand[] = []
  let inFence = false

  content.split('\n').forEach((line, idx) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (!isCodeLine(line, inFence) && !line.includes('`make ')) return

    for (const match of line.matchAll(/\bmake((?:\s+[^\s`'"]+){1,4})/g)) {
      const tokens = match[1].trim().split(/\s+/)
      let i = 0
      while (i < tokens.length && tokens[i].startsWith('-')) {
        i += ['-C', '-f', '--directory', '--file'].includes(tokens[i]) ? 2 : 1
      }
      const target = tokens[i]
      if (!target || target.includes('=') || !TOKEN.test(target)) continue
      if (tokens.slice(0, i).some((t) => t === '-C' || t === '--directory')) continue
      results.push({ script: target, raw: match[0].trim(), line: idx + 1 })
    }
  })

  return results
}

/** Targets defined in a Makefile (`name:` rules, excluding special targets and assignments). */
export function parseMakeTargets(makefile: string): Set<string> {
  const targets = new Set<string>()
  for (const line of makefile.split('\n')) {
    // Names and the blanks between them cannot overlap, which keeps matching
    // linear on long lines of blanks that end without a colon.
    const match = /^ *([A-Za-z0-9_.\/-]+(?:[ \t]+[A-Za-z0-9_.\/-]+)*)[ \t]*::?(?![:=])/.exec(line)
    if (!match) continue
    for (const name of match[1].split(/\s+/)) {
      if (name && !name.startsWith('.')) targets.add(name)
    }
  }
  return targets
}

export function checkMakeTargets(
  filePath: string,
  content: string,
  targets: ReadonlySet<string> | null,
): ContextIssue[] {
  const referenced = extractMakeTargets(content)
  if (referenced.length === 0) return []

  if (targets === null) {
    return [
      {
        id: `command-alignment-no-makefile-${filePath}`,
        severity: 'low',
        category: 'command-alignment',
        file: filePath,
        line: referenced[0].line,
        evidence: getLineEvidence(content, referenced[0].line),
        message: 'Instruction references make targets but no Makefile was found',
        recommendation: 'Add a Makefile at the repo root or update the instruction file.',
      },
    ]
  }

  return referenced
    .filter((ref) => !targets.has(ref.script))
    .map((ref) => ({
      id: `command-alignment-make-${filePath}-${ref.line}-${ref.script}`,
      severity: 'medium' as const,
      category: 'command-alignment',
      file: filePath,
      line: ref.line,
      evidence: getLineEvidence(content, ref.line),
      message: `Instruction references missing make target: "${ref.script}"`,
      recommendation: `Update the instruction file or add a "${ref.script}" target to the Makefile.`,
    }))
}
