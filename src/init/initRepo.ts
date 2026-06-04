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

export async function initRepo(repoPath: string, opts: InitOptions = {}): Promise<InitResult> {
  const absoluteRepo = path.resolve(repoPath)
  const agentsPath = path.join(absoluteRepo, 'AGENTS.md')

  let exists = false
  try {
    await fs.access(agentsPath)
    exists = true
  } catch {
    exists = false
  }

  if (exists && !opts.force) {
    return { status: 'already-exists', path: agentsPath }
  }

  await fs.mkdir(absoluteRepo, { recursive: true })
  await fs.writeFile(agentsPath, AGENTS_TEMPLATE, 'utf-8')

  return { status: exists ? 'overwritten' : 'created', path: agentsPath }
}
