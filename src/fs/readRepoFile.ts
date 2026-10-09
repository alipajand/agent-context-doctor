import fs from 'node:fs/promises'
import path from 'node:path'
import { isWithin } from './safePath.js'
import { readTextFile } from './readTextFile.js'

/**
 * Read a file by its repo-relative path, or '' when it is missing or resolves
 * outside the repository (a symlink), so its contents never reach evidence.
 */
export async function readRepoFile(repoPath: string, rel: string): Promise<string> {
  const realRepo = await fs.realpath(repoPath).catch(() => repoPath)
  const realFile = await fs.realpath(path.join(repoPath, rel)).catch(() => null)
  if (realFile === null || !isWithin(realRepo, realFile)) return ''
  return readTextFile(realFile)
}
