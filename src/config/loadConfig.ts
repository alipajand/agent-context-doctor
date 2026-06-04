import fs from 'node:fs/promises'
import path from 'node:path'
import { AcdRcSchema } from './schema.js'
import type { AcdRc } from './schema.js'

export async function loadConfig(searchDir: string): Promise<AcdRc | null> {
  const configPath = path.join(searchDir, '.acdrc')

  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf-8')
  } catch {
    // No .acdrc present — not an error
    return null
  }

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
