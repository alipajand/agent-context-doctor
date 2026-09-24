import path from 'node:path'
import type { AuditResult, ContextIssue } from '../types.js'

/**
 * Files an issue points at, as paths relative to `baseDir` (normally the
 * working directory, which is the checkout root in CI). Repo-level issues
 * such as "no context files" have no file.
 */
export function issueLocations(
  result: AuditResult,
  issue: ContextIssue,
  baseDir: string,
): string[] {
  const files = issue.files && issue.files.length > 0 ? issue.files : [issue.file]
  return files
    .filter((f) => f !== 'multiple' && path.resolve(result.repoPath, f) !== result.repoPath)
    .map((f) => {
      const rel = path.relative(baseDir, path.resolve(result.repoPath, f))
      return rel.split(path.sep).join('/')
    })
}
