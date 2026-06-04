import fs from 'node:fs/promises'
import path from 'node:path'

export type PackageJsonScripts = Record<string, string>

export async function readPackageScripts(repoPath: string): Promise<PackageJsonScripts | null> {
  const pkgPath = path.join(repoPath, 'package.json')
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { scripts?: PackageJsonScripts }
    return pkg.scripts ?? {}
  } catch {
    return null
  }
}
