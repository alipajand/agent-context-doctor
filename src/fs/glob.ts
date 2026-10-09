import { lstat, lstatSync, type PathLike } from 'node:fs'
import type { FileSystemAdapter } from 'tinyglobby'

/**
 * tinyglobby either follows symlinks or drops them. Resolving each link to
 * itself and stat-ing it with lstat makes the walker report every symlink as
 * an entry without entering it: `CLAUDE.md -> AGENTS.md` is listed, and a
 * link such as `.codex -> /` is not walked. Pass it with
 * `followSymbolicLinks: true`, which is what makes tinyglobby consult it.
 */
export const reportSymlinksWithoutFollowing: FileSystemAdapter = {
  realpath: ((p: PathLike, callback: (error: null, resolved: string) => void) =>
    callback(null, String(p))) as unknown as FileSystemAdapter['realpath'],
  realpathSync: ((p: PathLike) => String(p)) as unknown as FileSystemAdapter['realpathSync'],
  stat: lstat as unknown as FileSystemAdapter['stat'],
  statSync: lstatSync as unknown as FileSystemAdapter['statSync'],
}
