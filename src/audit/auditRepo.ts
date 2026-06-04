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
} from './checks/commandAlignment.js'
import { checkContradictions } from './checks/contradictions.js'
import { computeScore } from './score.js'
import { readTextFile } from '../fs/readTextFile.js'
import { readPackageScripts } from '../fs/readPackageJson.js'
import {
  filterSuppressedIssues,
  parseSuppressions,
  KNOWN_SUPPRESSION_CATEGORIES,
} from './suppressions.js'
import type { AuditResult, ContextIssue } from '../types.js'

export type AuditOptions = {
  ignoreFiles?: string[]
  disabledChecks?: string[]
  allowedMissingScripts?: string[]
}

export async function auditRepo(repoPath: string, opts: AuditOptions = {}): Promise<AuditResult> {
  const absoluteRepo = path.resolve(repoPath)
  const disabled = new Set(opts.disabledChecks ?? [])
  const allowedScripts = new Set(opts.allowedMissingScripts ?? [])

  const contextFiles = await detectContextFiles(absoluteRepo, opts.ignoreFiles ?? [])
  const packageScripts = await readPackageScripts(absoluteRepo)

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

  const fileContents: Array<{ path: string; content: string }> = []

  for (const ctxFile of contextFiles) {
    const absolutePath = path.resolve(absoluteRepo, ctxFile.path)
    const content = await readTextFile(absolutePath)

    fileContents.push({ path: ctxFile.path, content })

    const fileIssues: ContextIssue[] = []

    if (!disabled.has('placeholder-content')) {
      fileIssues.push(...checkPlaceholderContent(ctxFile.path, content))
    }

    if (!disabled.has('risky-language')) {
      fileIssues.push(...checkRiskyLanguage(ctxFile.path, content))
    }

    if (!disabled.has('command-alignment')) {
      if (packageScripts !== null) {
        const cmdIssues = checkCommandAlignment(ctxFile.path, content, packageScripts).filter(
          (i) => {
            const scriptMatch = i.message.match(/missing package script: "(.+)"/)
            return !scriptMatch || !allowedScripts.has(scriptMatch[1])
          },
        )
        fileIssues.push(...cmdIssues)
      } else {
        fileIssues.push(...checkCommandsWithoutPackageJson(ctxFile.path, content))
      }
    }

    if (isPrimaryInstructionFile(ctxFile.path)) {
      if (!disabled.has('safety-boundaries')) {
        fileIssues.push(...checkSafetyBoundaries(ctxFile.path, content))
      }
      if (!disabled.has('validation-commands')) {
        fileIssues.push(...checkValidationCommands(ctxFile.path, content))
      }
      if (!disabled.has('final-reporting')) {
        fileIssues.push(...checkFinalReporting(ctxFile.path, content))
      }
    }

    issues.push(...filterSuppressedIssues(ctxFile.path, content, fileIssues))
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
