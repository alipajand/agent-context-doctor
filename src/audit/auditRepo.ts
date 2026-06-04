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
import { readTextFile } from '../fs/readTextFile.js'
import { readPackageScripts } from '../fs/readPackageJson.js'
import type { AuditResult, ContextIssue } from '../types.js'

export async function auditRepo(repoPath: string): Promise<AuditResult> {
  const absoluteRepo = path.resolve(repoPath)
  const contextFiles = await detectContextFiles(absoluteRepo)
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

  for (const ctxFile of contextFiles) {
    const absolutePath = path.resolve(absoluteRepo, ctxFile.path)
    const content = await readTextFile(absolutePath)

    const placeholderIssues = checkPlaceholderContent(ctxFile.path, content)
    issues.push(...placeholderIssues)

    const riskyIssues = checkRiskyLanguage(ctxFile.path, content)
    issues.push(...riskyIssues)

    if (packageScripts !== null) {
      const cmdIssues = checkCommandAlignment(ctxFile.path, content, packageScripts)
      issues.push(...cmdIssues)
    } else {
      const noPkgIssues = checkCommandsWithoutPackageJson(ctxFile.path, content)
      issues.push(...noPkgIssues)
    }

    if (isPrimaryInstructionFile(ctxFile.path)) {
      const safetyIssues = checkSafetyBoundaries(ctxFile.path, content)
      issues.push(...safetyIssues)

      const validationIssues = checkValidationCommands(ctxFile.path, content)
      issues.push(...validationIssues)

      const reportingIssues = checkFinalReporting(ctxFile.path, content)
      issues.push(...reportingIssues)
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
    issues,
  }
}
