import path from 'node:path'
import { isRealpathWithin, isWithin } from './safePath.js'

export class OutputPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutputPathError'
  }
}

export type ResolveOutputPathOptions = {
  /** Permit the resolved path to land outside the audited repository. */
  allowOutside?: boolean
}

/**
 * Resolve a report path against the audited repository root.
 *
 * Relative paths resolve under `repoPath`; absolute paths are used as given. The
 * result must stay inside the repository — both lexically and after resolving
 * symlinks in the existing part of the path — unless `allowOutside` is set, so a
 * `.acdrc` in an untrusted repository cannot direct the report elsewhere.
 */
export function resolveOutputPath(
  repoPath: string,
  outputPath: string,
  opts: ResolveOutputPathOptions = {},
): string {
  const root = path.resolve(repoPath)
  const resolved = path.resolve(root, outputPath)

  if (opts.allowOutside) return resolved

  if (resolved !== root && isWithin(root, resolved) && isRealpathWithin(root, resolved)) {
    return resolved
  }

  throw new OutputPathError(
    `Report path must resolve inside the audited repository.\n` +
      `  given:    ${outputPath}\n` +
      `  resolved: ${resolved}\n` +
      `  repo:     ${root}\n` +
      `Pass --allow-outside to write outside the repository.`,
  )
}
