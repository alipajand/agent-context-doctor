import path from 'node:path'
import { detectContextFiles, isPrimaryInstructionFile } from './detectContextFiles.js'
import { checkPlaceholderContent } from './checks/placeholderContent.js'
import { checkSafetyBoundaries } from './checks/safetyBoundaries.js'
import { checkValidationCommands } from './checks/validationCommands.js'
import { checkFinalReporting } from './checks/finalReporting.js'
import { checkRiskyLanguage } from './checks/riskyLanguage.js'
import {
  checkCommandAlignment,
  checkCommandsWithoutPackageJson,
  checkMakeTargets,
  parseMakeTargets,
} from './checks/commandAlignment.js'
import { checkContradictions } from './checks/contradictions.js'
import { checkSkippedFile } from './checks/skippedFiles.js'
import { checkHiddenCharacters } from './checks/hiddenCharacters.js'
import { checkSecrets } from './checks/secrets.js'
import { fingerprintIssue } from './baseline.js'
import { checkBrokenReferences, extractFileReferences } from './checks/brokenReferences.js'
import { parseGitignore, type GitignoreMatcher } from './gitignore.js'
import { buildDelegationGraph, loadImportedFiles } from './delegation.js'
import fg from 'fast-glob'
import { checkFileSize, DEFAULT_MAX_FILE_BYTES } from './checks/fileSize.js'
import {
  AGENT_CONFIG_FILES,
  checkAgentConfig,
  claudeSettingsScripts,
} from './checks/agentConfig.js'
import { checkClaudeArtifact, checkClaudeScript } from './checks/claudeArtifacts.js'
import { checkFrontmatter } from './checks/frontmatter.js'
import { isWithin } from '../fs/safePath.js'
import fs from 'node:fs/promises'
import { computeScore } from './score.js'
import { readTextFile } from '../fs/readTextFile.js'
import { readPackageScripts } from '../fs/readPackageJson.js'
import {
  filterSuppressedIssues,
  parseSuppressions,
  KNOWN_SUPPRESSION_CATEGORIES,
} from './suppressions.js'
import type { AuditResult, ContextFileKind, ContextIssue } from '../types.js'

export type AuditOptions = {
  ignoreFiles?: string[]
  disabledChecks?: string[]
  allowedMissingScripts?: string[]
  maxFileBytes?: number
}

type LoadedFile = { path: string; kind: ContextFileKind; content: string }

type ReferenceContext = {
  gitignore: GitignoreMatcher
  /** True when a file or directory with this exact name exists anywhere in the repository. */
  nameExists: (name: string) => Promise<boolean>
}

// Extensions of the bare file names `broken-references` checks.
const BARE_NAME_PATTERNS = ['md', 'mdx', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'sh'].map(
  (ext) => `**/*.${ext}`,
)

/**
 * Lookup of bare file names (`RELEASING.md`) anywhere in the repository. The
 * first lookup walks the tree once, like context-file discovery does, and
 * later lookups use the collected names. Symlinked directories are not
 * traversed, so the walk stays inside the repository.
 */
function createNameLookup(repoPath: string): (name: string) => Promise<boolean> {
  let names: Promise<Set<string>> | null = null
  return async (name) => {
    names ??= fg(BARE_NAME_PATTERNS, {
      cwd: repoPath,
      dot: true,
      onlyFiles: false,
      followSymbolicLinks: false,
      suppressErrors: true,
      caseSensitiveMatch: false,
      deep: 12,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }).then((matches) => new Set(matches.map((match) => path.posix.basename(match))))
    return (await names).has(name)
  }
}

/**
 * References from `filePath` that resolve to nothing, trying the repository
 * root and then the file's own directory. Paths that would resolve outside
 * the repository are never probed. A missing directory that the root
 * .gitignore matches is expected to be absent, and a bare file name counts as
 * present when a file with that name exists anywhere in the repository.
 */
async function findMissingReferences(
  repoPath: string,
  filePath: string,
  content: string,
  context: ReferenceContext,
): Promise<Set<string>> {
  const missing = new Set<string>()
  const bases = [repoPath, path.resolve(repoPath, path.dirname(filePath))]

  for (const { target, bare } of extractFileReferences(content)) {
    // ESM TypeScript imports name `.js` files whose source is `.ts`.
    const names = /\.[cm]?js$/.test(target)
      ? [target, target.replace(/\.([cm]?)js$/, '.$1ts'), target.replace(/\.js$/, '.tsx')]
      : [target]
    const candidates = bases
      .flatMap((base) => names.map((name) => path.resolve(base, name)))
      .filter((candidate) => isWithin(repoPath, candidate))
    if (candidates.length === 0) continue

    let found = false
    for (const candidate of candidates) {
      if (
        await fs.stat(candidate).then(
          () => true,
          () => false,
        )
      ) {
        found = true
        break
      }
    }
    if (found) continue

    if (
      target.endsWith('/') &&
      candidates.some((candidate) =>
        context.gitignore.ignores(toPosix(path.relative(repoPath, candidate)), true),
      )
    ) {
      continue
    }
    if (bare && (await context.nameExists(target))) continue
    missing.add(target)
  }
  return missing
}

/**
 * Read a file by its repo-relative path, or '' when it is missing or resolves
 * outside the repository (a symlink), so its contents never reach evidence.
 */
async function readRepoFile(repoPath: string, rel: string): Promise<string> {
  const realRepo = await fs.realpath(repoPath).catch(() => repoPath)
  const realFile = await fs.realpath(path.join(repoPath, rel)).catch(() => null)
  if (realFile === null || !isWithin(realRepo, realFile)) return ''
  return readTextFile(realFile)
}

async function readMakeTargets(repoPath: string): Promise<Set<string> | null> {
  for (const name of ['GNUmakefile', 'makefile', 'Makefile']) {
    const content = await readTextFile(path.join(repoPath, name))
    if (content !== '') return parseMakeTargets(content)
  }
  return null
}

// Guidance a file delegates to is read up to this many characters in total,
// which keeps the joined text far below the engine's string length limit.
const MAX_STRUCTURAL_CHARS = 4 * 1024 * 1024

function joinWithinBudget(contents: string[]): string {
  const parts: string[] = []
  let size = 0
  for (const content of contents) {
    if (size + content.length > MAX_STRUCTURAL_CHARS) continue
    parts.push(content)
    size += content.length + 1
  }
  return parts.join('\n')
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

export async function auditRepo(repoPath: string, opts: AuditOptions = {}): Promise<AuditResult> {
  const absoluteRepo = path.resolve(repoPath)
  const disabled = new Set(opts.disabledChecks ?? [])
  const allowedScripts = new Set(opts.allowedMissingScripts ?? [])

  const contextFiles = await detectContextFiles(absoluteRepo, opts.ignoreFiles ?? [])
  const packageScripts = await readPackageScripts(absoluteRepo)
  const makeTargets = await readMakeTargets(absoluteRepo)

  const issues: ContextIssue[] = []

  if (contextFiles.length === 0) {
    issues.push({
      id: 'presence-no-files',
      severity: 'high',
      category: 'presence',
      file: absoluteRepo,
      message: 'No agent context files found',
      recommendation:
        'Add AGENTS.md or a tool-specific instruction file before relying on coding agents.',
    })
  }

  const fileContents: LoadedFile[] = []

  for (const ctxFile of contextFiles) {
    if (ctxFile.skipped) {
      issues.push(...checkSkippedFile(ctxFile))
      continue
    }
    const content = await readTextFile(path.resolve(absoluteRepo, ctxFile.path))
    fileContents.push({ path: ctxFile.path, kind: ctxFile.kind, content })
  }

  const referenceContext: ReferenceContext = {
    gitignore: parseGitignore(await readRepoFile(absoluteRepo, '.gitignore')),
    nameExists: createNameLookup(absoluteRepo),
  }

  // Structural checks see a file together with everything it delegates to
  // ("Follow AGENTS.md", `@docs/guide.md`), so a pointer file is not told to
  // copy guidance it already inherits.
  const { imported, imports } = await loadImportedFiles(fileContents, (rel) =>
    readRepoFile(absoluteRepo, rel),
  )
  const instructionFiles = [...fileContents, ...imported]
  const contentByPath = new Map(instructionFiles.map((f) => [f.path, f.content]))
  const delegation = buildDelegationGraph(instructionFiles, imports)

  const runStructuralChecks = (filePath: string, text: string): ContextIssue[] => [
    ...(disabled.has('safety-boundaries') ? [] : checkSafetyBoundaries(filePath, text)),
    ...(disabled.has('validation-commands') ? [] : checkValidationCommands(filePath, text)),
    ...(disabled.has('final-reporting') ? [] : checkFinalReporting(filePath, text)),
  ]

  // Files with the same closure (every file in a rules directory) share one
  // closure object and one evaluation, so the work grows with the number of
  // distinct closures, not with the number of files times their combined size.
  const gapsByClosure = new Map<ReadonlySet<string>, Set<string>>()
  const structuralFindings = new Map<string, ContextIssue[]>()
  for (const { path: filePath } of fileContents) {
    if (!isPrimaryInstructionFile(filePath)) continue
    const closure = delegation.closure(filePath)
    let gaps = gapsByClosure.get(closure)
    if (!gaps) {
      const text = joinWithinBudget([...closure].map((p) => contentByPath.get(p) ?? ''))
      gaps = new Set(runStructuralChecks(filePath, text).map((issue) => issue.category))
      gapsByClosure.set(closure, gaps)
    }
    // Each structural check reports at most one file-level issue whose fields
    // do not depend on the text, so empty text yields the issue for each gap.
    const missing = gaps
    structuralFindings.set(
      filePath,
      runStructuralChecks(filePath, '').filter((issue) => missing.has(issue.category)),
    )
  }

  // A file that delegates to a primary file with the same gap leaves the
  // finding to that file, the single source of truth, unless the target
  // delegates back (a cycle), where every file in it keeps its finding.
  const reportedByTarget = (filePath: string, category: string): boolean =>
    delegation
      .targets(filePath)
      .some(
        (target) =>
          (structuralFindings.get(target) ?? []).some((i) => i.category === category) &&
          !delegation.closure(target).has(filePath),
      )

  for (const { path: filePath, content } of fileContents) {
    const fileIssues: ContextIssue[] = []

    if (!disabled.has('hidden-characters')) {
      fileIssues.push(...checkHiddenCharacters(filePath, content))
    }

    if (!disabled.has('secrets')) {
      fileIssues.push(...checkSecrets(filePath, content))
    }

    if (!disabled.has('frontmatter')) {
      fileIssues.push(...checkFrontmatter(filePath, content))
    }

    if (!disabled.has('agent-config')) {
      fileIssues.push(...checkClaudeArtifact(filePath, content))
    }

    if (!disabled.has('placeholder-content')) {
      fileIssues.push(...checkPlaceholderContent(filePath, content))
    }

    if (!disabled.has('broken-references')) {
      const missing = await findMissingReferences(absoluteRepo, filePath, content, referenceContext)
      fileIssues.push(...checkBrokenReferences(filePath, content, missing))
    }

    if (!disabled.has('risky-language')) {
      fileIssues.push(...checkRiskyLanguage(filePath, content))
    }

    if (!disabled.has('command-alignment')) {
      if (packageScripts !== null) {
        const cmdIssues = checkCommandAlignment(filePath, content, packageScripts).filter((i) => {
          const scriptMatch = i.message.match(/missing package script: "(.+)"/)
          return !scriptMatch || !allowedScripts.has(scriptMatch[1])
        })
        fileIssues.push(...cmdIssues)
      } else {
        fileIssues.push(...checkCommandsWithoutPackageJson(filePath, content))
      }
      fileIssues.push(...checkMakeTargets(filePath, content, makeTargets))
    }

    if (isPrimaryInstructionFile(filePath)) {
      if (!disabled.has('file-size')) {
        fileIssues.push(
          ...checkFileSize(filePath, content, opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES),
        )
      }
      fileIssues.push(
        ...(structuralFindings.get(filePath) ?? []).filter(
          (issue) => !reportedByTarget(filePath, issue.category),
        ),
      )
    }

    issues.push(...filterSuppressedIssues(filePath, content, fileIssues))
  }

  // Agent configuration (permissions, MCP servers) lives in JSON files that
  // are not instruction text, so it is read separately from context files.
  if (!disabled.has('agent-config')) {
    for (const rel of AGENT_CONFIG_FILES) {
      const content = await readRepoFile(absoluteRepo, rel)
      if (content === '') continue
      issues.push(...checkAgentConfig(path.normalize(rel), content))
      if (rel !== '.claude/settings.json') continue
      for (const script of claudeSettingsScripts(content)) {
        const scriptContent = await readRepoFile(absoluteRepo, script)
        if (scriptContent !== '') {
          issues.push(...checkClaudeScript(path.normalize(script), scriptContent))
        }
      }
    }
  }

  // Cross-file contradiction check runs after all files are collected
  if (!disabled.has('contradictions')) {
    const contradictionIssues = checkContradictions(fileContents)
    const fileSuppressionRules = new Map(
      fileContents.map((fc) => [fc.path, parseSuppressions(fc.content)]),
    )

    for (const issue of contradictionIssues) {
      const involvedFiles =
        issue.files && issue.files.length > 0
          ? issue.files
          : issue.file !== 'multiple'
            ? [issue.file]
            : []

      if (involvedFiles.length === 0) {
        issues.push(issue)
        continue
      }

      const allSuppressed = involvedFiles.every((f) => {
        const rules = fileSuppressionRules.get(f) ?? []
        return rules.some(
          (r) =>
            r.kind === 'file' &&
            r.category === issue.category &&
            KNOWN_SUPPRESSION_CATEGORIES.has(r.category),
        )
      })

      if (!allSuppressed) issues.push(issue)
    }
  }

  const high = issues.filter((i) => i.severity === 'high').length
  const medium = issues.filter((i) => i.severity === 'medium').length
  const low = issues.filter((i) => i.severity === 'low').length

  for (const issue of issues) {
    issue.fingerprint = fingerprintIssue(issue)
  }

  return {
    repoPath: absoluteRepo,
    files: contextFiles,
    summary: {
      fileCount: contextFiles.length,
      issueCount: issues.length,
      high,
      medium,
      low,
    },
    score: computeScore(issues),
    issues,
  }
}
