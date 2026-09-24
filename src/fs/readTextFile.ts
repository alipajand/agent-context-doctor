import { constants } from 'node:fs'
import fs from 'node:fs/promises'

/** Files above this size are never read into memory. */
export const MAX_TEXT_FILE_BYTES = 1024 * 1024

// O_NONBLOCK keeps open() from waiting on a FIFO with no writer; it has no
// effect on regular files. It is undefined on Windows, which has no FIFOs.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)

export type RegularFileRead =
  | { status: 'ok'; content: string }
  | { status: 'missing' }
  | { status: 'not-a-file' }
  | { status: 'too-large' }
  | { status: 'error'; error: unknown }

/**
 * Read a regular file as UTF-8. The type and size are checked on the opened
 * handle, not the path, so the file cannot be swapped for a FIFO, device, or
 * larger file between the check and the read.
 */
export async function readRegularFile(
  filePath: string,
  maxBytes: number = MAX_TEXT_FILE_BYTES,
): Promise<RegularFileRead> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(filePath, READ_FLAGS)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { status: 'missing' }
    if (code === 'EISDIR') return { status: 'not-a-file' }
    return { status: 'error', error }
  }

  try {
    const stat = await handle.stat()
    if (!stat.isFile()) return { status: 'not-a-file' }
    if (stat.size > maxBytes) return { status: 'too-large' }

    // Read at most the size seen above, even if the file grows meanwhile.
    const buffer = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return { status: 'ok', content: buffer.subarray(0, offset).toString('utf-8') }
  } catch (error) {
    return { status: 'error', error }
  } finally {
    await handle.close()
  }
}

/**
 * Read a regular file as UTF-8. Returns '' for missing files, non-regular files
 * (FIFOs, devices, directories) and files larger than `maxBytes`, so a hostile
 * repository cannot hang or exhaust memory during an audit.
 */
export async function readTextFile(
  filePath: string,
  maxBytes: number = MAX_TEXT_FILE_BYTES,
): Promise<string> {
  const result = await readRegularFile(filePath, maxBytes)
  return result.status === 'ok' ? result.content : ''
}

export async function getFileBytes(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath)
    return stat.size
  } catch {
    return 0
  }
}
