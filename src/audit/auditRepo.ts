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
import { checkFileSize, DEFAULT_MAX_FILE_BYTES } from './checks/fileSize.js'
import { AGENT_CONFIG_FILES, checkAgentConfig } from './checks/agentConfig.js'
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

/**
 * References from `filePath` that resolve to nothing, trying the repository
 * root and then the file's own directory. Paths that would resolve outside
 * the repository are never probed.
 */
async function findMissingReferences(
  repoPath: string,
  filePath: string,
  content: string,
): Promise<Set<string>> {
  const missing = new Set<string>()
  const bases = [repoPath, path.resolve(repoPath, path.dirname(filePath))]

  for (const { target } of extractFileReferences(content)) {
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
    if (!found) missing.add(target)
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

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** True when `content` points at `target`, by repo path, `@path` import, or root file name. */
function references(content: string, target: string): boolean {
  const posix = toPosix(target)
  if (content.includes(posix)) return true
  return (
    !posix.includes('/') &&
    new RegExp(`(^|[\\s@(\\[\`'"/])${escapeRegExp(posix)}\\b`, 'i').test(content)
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Text the structural checks (safety, validation, final report) evaluate for a
 * primary file. Guidance often lives in one shared place: CLAUDE.md says
 * "Follow AGENTS.md", and a .cursor/rules set spreads it over several files.
 * A file therefore counts as covered by its own content, by context files it
 * references, and by other primary files for the same tool.
 */
function structuralContext(filePath: string, files: LoadedFile[]): string {
  const self = files.find((f) => f.path === filePath)
  if (!self) return ''
  const related = files.filter(
    (f) =>
      f.path !== filePath &&
      (references(self.content, f.path) ||
        (f.kind === self.kind && isPrimaryInstructionFile(f.path))),
  )
  return [self.content, ...related.map((f) => f.content)].join('\n')
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

    if (!disabled.has('placeholder-content')) {
      fileIssues.push(...checkPlaceholderContent(filePath, content))
    }

    if (!disabled.has('broken-references')) {
      const missing = await findMissingReferences(absoluteRepo, filePath, content)
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
      const structural = structuralContext(filePath, fileContents)
      if (!disabled.has('safety-boundaries')) {
        fileIssues.push(...checkSafetyBoundaries(filePath, structural))
      }
      if (!disabled.has('validation-commands')) {
        fileIssues.push(...checkValidationCommands(filePath, structural))
      }
      if (!disabled.has('final-reporting')) {
        fileIssues.push(...checkFinalReporting(filePath, structural))
      }
    }

    issues.push(...filterSuppressedIssues(filePath, content, fileIssues))
  }

  // Agent configuration (permissions, MCP servers) lives in JSON files that
  // are not instruction text, so it is read separately from context files.
  if (!disabled.has('agent-config')) {
    for (const rel of AGENT_CONFIG_FILES) {
      const content = await readRepoFile(absoluteRepo, rel)
      if (content !== '') issues.push(...checkAgentConfig(path.normalize(rel), content))
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
