import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileNoFollow } from './writeFileNoFollow.js'
import { OutputPathError, resolveOutputPath } from './resolveOutputPath.js'
import type { ResolveOutputPathOptions } from './resolveOutputPath.js'

export async function writeReport(
  outputPath: string,
  content: string,
  repoPath: string,
  opts: ResolveOutputPathOptions = {},
): Promise<string> {
  const resolved = resolveOutputPath(repoPath, outputPath, opts)

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  if ((await writeFileNoFollow(resolved, content, true)) === 'symlink') {
    throw new OutputPathError(`Refusing to write report through a symbolic link: ${resolved}`)
  }
  return resolved
}
