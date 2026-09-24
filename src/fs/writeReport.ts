import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { OutputPathError, resolveOutputPath } from './resolveOutputPath.js'
import type { ResolveOutputPathOptions } from './resolveOutputPath.js'

// O_NOFOLLOW is undefined on Windows; the lstat check below still covers it there.
const WRITE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0)

async function assertNotSymlink(filePath: string): Promise<void> {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isSymbolicLink()) {
      throw new OutputPathError(`Refusing to write report through a symbolic link: ${filePath}`)
    }
  } catch (err) {
    if (err instanceof OutputPathError) throw err
  }
}

export async function writeReport(
  outputPath: string,
  content: string,
  repoPath: string,
  opts: ResolveOutputPathOptions = {},
): Promise<string> {
  const resolved = resolveOutputPath(repoPath, outputPath, opts)

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await assertNotSymlink(resolved)

  let handle: fs.FileHandle
  try {
    handle = await fs.open(resolved, WRITE_FLAGS, 0o666)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new OutputPathError(`Refusing to write report through a symbolic link: ${resolved}`)
    }
    throw err
  }

  try {
    await handle.writeFile(content, 'utf-8')
  } finally {
    await handle.close()
  }
  return resolved
}
