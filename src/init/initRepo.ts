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
const WRITE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0)

export async function initRepo(repoPath: string, opts: InitOptions = {}): Promise<InitResult> {
  const absoluteRepo = path.resolve(repoPath)
  const agentsPath = path.join(absoluteRepo, 'AGENTS.md')

  // lstat, not access/stat: a dangling AGENTS.md symlink must not look absent,
  // or writing the template would create the link target wherever it points.
  const existing: Stats | null = await fs.lstat(agentsPath).catch(() => null)

  if (existing?.isSymbolicLink()) {
    return { status: 'symlink', path: agentsPath }
  }

  if (existing && !opts.force) {
    return { status: 'already-exists', path: agentsPath }
  }

  await fs.mkdir(absoluteRepo, { recursive: true })
  const handle = await fs.open(agentsPath, WRITE_FLAGS, 0o666)
  try {
    await handle.writeFile(AGENTS_TEMPLATE, 'utf-8')
  } finally {
    await handle.close()
  }

  return { status: existing ? 'overwritten' : 'created', path: agentsPath }
}
