import { constants } from 'node:fs'
import fs from 'node:fs/promises'

// O_NOFOLLOW and O_NONBLOCK are undefined on Windows. There, the check after
// opening an existing file still refuses symlinks.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0
// O_EXCL fails when anything, including a dangling symlink, is already there.
const CREATE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW
// No O_CREAT or O_TRUNC: nothing changes until the opened file is verified.
// O_NONBLOCK makes a FIFO fail to open instead of waiting for a reader.
const EXISTING_FLAGS = constants.O_WRONLY | NO_FOLLOW | (constants.O_NONBLOCK ?? 0)

export type WriteNoFollowStatus = 'created' | 'overwritten' | 'exists' | 'symlink'

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

async function writeAndClose(handle: fs.FileHandle, content: string): Promise<void> {
  try {
    await handle.writeFile(content, 'utf-8')
  } finally {
    await handle.close()
  }
}

/**
 * Write `content` to `filePath` without following a symlink at the final
 * component and without a gap between a check and the write. A new file is
 * created exclusively. An existing file is opened without truncation, and it
 * is only truncated after confirming the path still names that same regular
 * file, not a symlink. Returns `exists` when the file exists and `overwrite`
 * is false, and `symlink` when the path is a symlink.
 */
export async function writeFileNoFollow(
  filePath: string,
  content: string,
  overwrite: boolean,
): Promise<WriteNoFollowStatus> {
  try {
    await writeAndClose(await fs.open(filePath, CREATE_FLAGS, 0o666), content)
    return 'created'
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }

  if (!overwrite) {
    const existing = await fs.lstat(filePath).catch(() => null)
    return existing?.isSymbolicLink() ? 'symlink' : 'exists'
  }

  let handle: fs.FileHandle
  try {
    handle = await fs.open(filePath, EXISTING_FLAGS)
  } catch (error) {
    if (errorCode(error) === 'ELOOP') return 'symlink'
    throw error
  }

  try {
    const opened = await handle.stat()
    const named = await fs.lstat(filePath)
    if (named.isSymbolicLink() || opened.ino !== named.ino || opened.dev !== named.dev) {
      return 'symlink'
    }
    if (!opened.isFile()) throw new Error(`Not a regular file: ${filePath}`)
    await handle.truncate(0)
    await handle.writeFile(content, 'utf-8')
  } finally {
    await handle.close()
  }
  return 'overwritten'
}
