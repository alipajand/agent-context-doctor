import fs from 'node:fs/promises'

/** Files above this size are never read into memory. */
export const MAX_TEXT_FILE_BYTES = 1024 * 1024

/**
 * Read a regular file as UTF-8. Returns '' for missing files, non-regular files
 * (FIFOs, devices, directories) and files larger than `maxBytes`, so a hostile
 * repository cannot hang or exhaust memory during an audit.
 */
export async function readTextFile(
  filePath: string,
  maxBytes: number = MAX_TEXT_FILE_BYTES,
): Promise<string> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > maxBytes) return ''
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export async function getFileBytes(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath)
    return stat.size
  } catch {
    return 0
  }
}
