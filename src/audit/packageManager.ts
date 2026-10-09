import fs from 'node:fs/promises'
import path from 'node:path'
import { isWithin } from '../fs/safePath.js'
import { readTextFile } from '../fs/readTextFile.js'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type ExpectedPackageManager = {
  manager: PackageManager
  /** What the expectation rests on, for the report: `packageManager: pnpm@9.12.0`, `pnpm-lock.yaml`. */
  evidence: string[]
}

export const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]

// What Corepack accepts, including a `+sha512.<hex>` suffix. Anything else,
// including control characters or a very long value, is not evidence.
const DECLARED = /^(npm|pnpm|yarn|bun)@[0-9A-Za-z.+-]{1,200}$/

/**
 * The package manager a repository uses, from the `packageManager` field and
 * the lockfiles present. Returns null when the evidence is missing or
 * disagrees, so no finding is made on a guess.
 */
export function resolveExpectedPackageManager(
  declared: string | null,
  lockfiles: string[],
): ExpectedPackageManager | null {
  const fromLockfiles = new Set(
    lockfiles.flatMap((name) => LOCKFILES.filter(([file]) => file === name).map(([, pm]) => pm)),
  )

  if (declared !== null) {
    const match = DECLARED.exec(declared)
    if (!match) return null
    const manager = match[1] as PackageManager
    if ([...fromLockfiles].some((pm) => pm !== manager)) return null
    return { manager, evidence: [`packageManager: ${declared}`, ...lockfiles] }
  }

  if (fromLockfiles.size !== 1) return null
  return { manager: [...fromLockfiles][0], evidence: lockfiles }
}

/**
 * The resolved path of `target` when it is a regular file that, after
 * resolving symlinks, stays inside the repository; otherwise null. Callers
 * read the resolved path, so the file checked is the file read.
 */
async function resolveInside(realRepo: string, target: string): Promise<string | null> {
  const real = await fs.realpath(target).catch(() => null)
  if (real === null || !isWithin(realRepo, real)) return null
  const stat = await fs.stat(real).catch(() => null)
  return stat?.isFile() ? real : null
}

async function lockfilesIn(realRepo: string, dir: string): Promise<string[]> {
  const found: string[] = []
  for (const [name] of LOCKFILES) {
    if ((await resolveInside(realRepo, path.join(dir, name))) !== null) found.push(name)
  }
  return found
}

async function declaredIn(realRepo: string, dir: string): Promise<string | null> {
  const file = await resolveInside(realRepo, path.join(dir, 'package.json'))
  if (file === null) return null
  try {
    const pkg = JSON.parse(await readTextFile(file)) as { packageManager?: unknown } | null
    return typeof pkg?.packageManager === 'string' ? pkg.packageManager : null
  } catch {
    return null
  }
}

export type PackageManagerLookup = {
  /**
   * The package manager expected for commands in the instruction file at
   * `relativePath`, or null when unknown. A file inside a nested project with
   * its own lockfile or `packageManager` gets null: that project may use a
   * different manager on purpose. Workspace packages that share the root
   * lockfile get the root's answer.
   */
  expectedFor(relativePath: string): Promise<ExpectedPackageManager | null>
}

export async function createPackageManagerLookup(repoPath: string): Promise<PackageManagerLookup> {
  const realRepo = await fs.realpath(repoPath).catch(() => path.resolve(repoPath))
  const root = resolveExpectedPackageManager(
    await declaredIn(realRepo, repoPath),
    await lockfilesIn(realRepo, repoPath),
  )
  const separate = new Map<string, Promise<boolean>>()

  const isSeparateProject = (dir: string): Promise<boolean> => {
    let pending = separate.get(dir)
    if (!pending) {
      const abs = path.join(repoPath, dir)
      pending = (async () =>
        (await lockfilesIn(realRepo, abs)).length > 0 ||
        (await declaredIn(realRepo, abs)) !== null)()
      separate.set(dir, pending)
    }
    return pending
  }

  return {
    async expectedFor(relativePath) {
      if (root === null) return null
      for (let dir = path.dirname(relativePath); dir !== '.' && dir !== '';) {
        if (await isSeparateProject(dir)) return null
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
      return root
    },
  }
}
