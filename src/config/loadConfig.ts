import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MAX_TEXT_FILE_BYTES } from '../fs/readTextFile.js'
import { AcdRcSchema } from './schema.js'
import type { AcdRc } from './schema.js'

export async function loadConfig(searchDir: string): Promise<AcdRc | null> {
  const configPath = path.join(searchDir, '.acdrc')

  let stat: Stats
  try {
    stat = await fs.stat(configPath)
  } catch {
    // No .acdrc present — not an error
    return null
  }

  if (!stat.isFile()) {
    throw new Error(`.acdrc at ${configPath} is not a regular file`)
  }
  if (stat.size > MAX_TEXT_FILE_BYTES) {
    throw new Error(`.acdrc at ${configPath} is larger than ${MAX_TEXT_FILE_BYTES} bytes`)
  }

  const raw = await fs.readFile(configPath, 'utf-8')

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
