import { createHash } from 'node:crypto'
import { readTextFile } from '../fs/readTextFile.js'
import type { AuditResult, ContextIssue } from '../types.js'

/**
 * Identity of an issue that survives edits elsewhere in the file: category,
 * file, message, and evidence, but not the line number.
 */
export function fingerprintIssue(issue: ContextIssue): string {
  const key = [issue.category, issue.file.replace(/\\/g, '/'), issue.message, issue.evidence ?? '']
  return createHash('sha256').update(key.join('\0')).digest('hex').slice(0, 16)
}

export class BaselineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BaselineError'
  }
}

type BaselineIssue = Pick<
  ContextIssue,
  'category' | 'file' | 'message' | 'evidence' | 'fingerprint'
>

function isBaselineIssue(value: unknown): value is BaselineIssue {
  if (typeof value !== 'object' || value === null) return false
  const issue = value as Record<string, unknown>
  return (
    typeof issue.category === 'string' &&
    typeof issue.file === 'string' &&
    typeof issue.message === 'string'
  )
}

/** Read fingerprints from a report written by `acd audit --json`. */
export async function loadBaseline(filePath: string): Promise<Set<string>> {
  const raw = await readTextFile(filePath)
  if (raw === '') {
    throw new BaselineError(`Baseline ${filePath} is missing, empty, or not a regular file`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new BaselineError(
      `Baseline ${filePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const issues = (parsed as { issues?: unknown } | null)?.issues
  if (!Array.isArray(issues)) {
    throw new BaselineError(
      `Baseline ${filePath} has no "issues" array; use acd audit --json output`,
    )
  }

  const fingerprints = new Set<string>()
  for (const issue of issues) {
    if (!isBaselineIssue(issue)) continue
    fingerprints.add(
      typeof issue.fingerprint === 'string'
        ? issue.fingerprint
        : fingerprintIssue({ ...issue, id: '', severity: 'low', recommendation: '' }),
    )
  }
  return fingerprints
}

/** Mark issues already present in the baseline and record the counts. */
export function applyBaseline(
  result: AuditResult,
  fingerprints: Set<string>,
  baselinePath: string,
): AuditResult {
  const issues = result.issues.map((issue) =>
    fingerprints.has(issue.fingerprint ?? fingerprintIssue(issue))
      ? { ...issue, inBaseline: true }
      : issue,
  )
  const known = issues.filter((i) => i.inBaseline).length
  return {
    ...result,
    issues,
    baseline: { path: baselinePath, known, new: issues.length - known },
  }
}
