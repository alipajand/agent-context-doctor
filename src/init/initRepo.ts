import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { AGENTS_TEMPLATE } from './template.js'

export type InitOptions = {
  force?: boolean
}

export type InitResult =
  | { status: 'created'; path: string }
  | { status: 'already-exists'; path: string }
  | { status: 'overwritten'; path: string }
  | { status: 'symlink'; path: string }

// O_NOFOLLOW is undefined on Windows; the lstat check below still covers it there.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0
// O_EXCL fails when anything, including a dangling symlink, is already there.
const CREATE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW
const OVERWRITE_FLAGS = constants.O_WRONLY | constants.O_TRUNC | NO_FOLLOW

async function writeHandle(handle: fs.FileHandle): Promise<void> {
  try {
    await handle.writeFile(AGENTS_TEMPLATE, 'utf-8')
  } finally {
    await handle.close()
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

export async function initRepo(repoPath: string, opts: InitOptions = {}): Promise<InitResult> {
  const absoluteRepo = path.resolve(repoPath)
  const agentsPath = path.join(absoluteRepo, 'AGENTS.md')

  await fs.mkdir(absoluteRepo, { recursive: true })

  try {
    await writeHandle(await fs.open(agentsPath, CREATE_FLAGS, 0o666))
    return { status: 'created', path: agentsPath }
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }

  // Something is already there. A symlink, even a dangling one, is never
  // written through: the template would land wherever it points.
  const existing: Stats | null = await fs.lstat(agentsPath).catch(() => null)
  if (existing?.isSymbolicLink()) return { status: 'symlink', path: agentsPath }
  if (!opts.force) return { status: 'already-exists', path: agentsPath }

  try {
    await writeHandle(await fs.open(agentsPath, OVERWRITE_FLAGS))
  } catch (error) {
    // The path became a symlink after the lstat above.
    if (errorCode(error) === 'ELOOP') return { status: 'symlink', path: agentsPath }
    throw error
  }
  return { status: 'overwritten', path: agentsPath }
}
