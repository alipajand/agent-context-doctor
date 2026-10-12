import fs from 'node:fs/promises'
import path from 'node:path'
import { MAX_TEXT_FILE_BYTES, readRegularFile } from '../fs/readTextFile.js'
import { isWithin } from '../fs/safePath.js'
import { describeJsonError } from '../text/jsonError.js'
import { AcdRcSchema } from './schema.js'
import type { AcdRc } from './schema.js'

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export async function loadConfig(searchDir: string): Promise<AcdRc | null> {
  const configPath = path.join(searchDir, '.acdrc')

  // `.acdrc` comes from the audited repository, so a symlink must not let it
  // read a file elsewhere on disk, the same as context files.
  let realConfig: string
  try {
    realConfig = await fs.realpath(configPath)
  } catch (err) {
    // No .acdrc present (or a dangling link) — not an error
    if (isMissing(err)) return null
    throw err
  }
  const realDir = await fs.realpath(searchDir).catch(() => path.resolve(searchDir))
  if (!isWithin(realDir, realConfig)) {
    throw new Error(`.acdrc at ${configPath} links outside ${searchDir}; refusing to read it`)
  }

  const read = await readRegularFile(realConfig, MAX_TEXT_FILE_BYTES)
  if (read.status === 'missing') return null
  if (read.status === 'error') throw read.error
  if (read.status === 'not-a-file') {
    throw new Error(`.acdrc at ${configPath} is not a regular file`)
  }
  if (read.status === 'too-large') {
    throw new Error(`.acdrc at ${configPath} is larger than ${MAX_TEXT_FILE_BYTES} bytes`)
  }
  const raw = read.content

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`.acdrc at ${configPath} ${describeJsonError(raw, err)}`)
  }

  const result = AcdRcSchema.safeParse(parsed)
  if (!result.success) {
    // Zod v4 uses `issues`; v3 used `errors` — support both
    const issues =
      result.error.issues ?? (result.error as { errors?: typeof result.error.issues }).errors ?? []
    const messages = issues.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n')
    throw new Error(`.acdrc at ${configPath} failed validation:\n${messages}`)
  }

  return result.data
}
