import path from 'node:path'
import { MAX_TEXT_FILE_BYTES, readRegularFile } from '../fs/readTextFile.js'
import { AcdRcSchema } from './schema.js'
import type { AcdRc } from './schema.js'

export async function loadConfig(searchDir: string): Promise<AcdRc | null> {
  const configPath = path.join(searchDir, '.acdrc')

  const read = await readRegularFile(configPath, MAX_TEXT_FILE_BYTES)
  // No .acdrc present — not an error
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
    throw new Error(
      `.acdrc at ${configPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
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
