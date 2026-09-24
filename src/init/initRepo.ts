import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileNoFollow } from '../fs/writeFileNoFollow.js'
import { AGENTS_TEMPLATE } from './template.js'

export type InitOptions = {
  force?: boolean
}

export type InitResult =
  | { status: 'created'; path: string }
  | { status: 'already-exists'; path: string }
  | { status: 'overwritten'; path: string }
  | { status: 'symlink'; path: string }

export async function initRepo(repoPath: string, opts: InitOptions = {}): Promise<InitResult> {
  const absoluteRepo = path.resolve(repoPath)
  const agentsPath = path.join(absoluteRepo, 'AGENTS.md')

  await fs.mkdir(absoluteRepo, { recursive: true })

  // A symlink, even a dangling one, is never written through: the template
  // would land wherever it points.
  const status = await writeFileNoFollow(agentsPath, AGENTS_TEMPLATE, opts.force === true)
  return { status: status === 'exists' ? 'already-exists' : status, path: agentsPath }
}
