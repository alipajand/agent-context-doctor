import fs from 'node:fs'
import path from 'node:path'

/** True when `target` is `root` itself or a descendant of it (lexical check). */
export function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  if (rel === '') return true
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

/**
 * Resolve symlinks in the longest existing prefix of `target` and re-append the
 * components that do not exist yet. Used to see where a write would really land
 * before any directories are created.
 */
export function realpathOfExistingPrefix(target: string): string {
  const missing: string[] = []
  let current = path.resolve(target)

  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing)
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(target)
      missing.unshift(path.basename(current))
      current = parent
    }
  }
}

/** True when `target`, after resolving symlinks, stays inside `root`. */
export function isRealpathWithin(root: string, target: string): boolean {
  return isWithin(realpathOfExistingPrefix(root), realpathOfExistingPrefix(target))
}
