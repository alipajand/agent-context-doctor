import path from 'node:path'
import { readTextFile } from './readTextFile.js'

export type PackageJsonScripts = Record<string, string>

function toScripts(value: unknown): PackageJsonScripts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const scripts: PackageJsonScripts = {}
  for (const [name, command] of Object.entries(value)) {
    if (typeof command === 'string') scripts[name] = command
  }
  return scripts
}

export async function readPackageScripts(repoPath: string): Promise<PackageJsonScripts | null> {
  const raw = await readTextFile(path.join(repoPath, 'package.json'))
  if (raw === '') return null
  try {
    const pkg = JSON.parse(raw) as { scripts?: unknown } | null
    return toScripts(pkg?.scripts)
  } catch {
    return null
  }
}
