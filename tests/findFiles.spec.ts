import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { findContextFiles } from '../src/fs/findFiles.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-findfiles-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('findContextFiles', () => {
  it('finds AGENTS.md and returns absolute paths', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents')
    const files = await findContextFiles(tmpDir)
    expect(files).toHaveLength(1)
    expect(path.isAbsolute(files[0])).toBe(true)
    expect(files[0].endsWith('AGENTS.md')).toBe(true)
  })

  it('finds multiple known context patterns', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# A')
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# C')
    await fs.writeFile(path.join(tmpDir, '.cursorrules'), '# R')
    const files = await findContextFiles(tmpDir)
    expect(files).toHaveLength(3)
  })

  it('matches case-insensitively', async () => {
    await fs.writeFile(path.join(tmpDir, 'agents.md'), '# lower')
    const files = await findContextFiles(tmpDir)
    expect(files.some((f) => f.toLowerCase().endsWith('agents.md'))).toBe(true)
  })

  it('finds top-level prompts/**/*.md', async () => {
    const promptsDir = path.join(tmpDir, 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(path.join(promptsDir, 'task.md'), '# Task')
    const files = await findContextFiles(tmpDir)
    expect(files.some((f) => f.includes('task.md'))).toBe(true)
  })

  it('finds nested prompt files', async () => {
    const promptsDir = path.join(tmpDir, 'docs', 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(path.join(promptsDir, 'review.md'), '# Prompt')
    const files = await findContextFiles(tmpDir)
    expect(files.some((f) => f.includes('review.md'))).toBe(true)
  })

  it('returns results sorted', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# C')
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# A')
    const files = await findContextFiles(tmpDir)
    const sorted = [...files].sort()
    expect(files).toEqual(sorted)
  })

  it('ignores node_modules and dist by default', async () => {
    for (const dir of ['node_modules', 'dist']) {
      const nested = path.join(tmpDir, dir)
      await fs.mkdir(nested, { recursive: true })
      await fs.writeFile(path.join(nested, 'AGENTS.md'), '# Not real')
    }
    const files = await findContextFiles(tmpDir)
    expect(files).toHaveLength(0)
  })

  it('respects extra ignore patterns', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# A')
    const files = await findContextFiles(tmpDir, ['**/AGENTS.md'])
    expect(files).toHaveLength(0)
  })

  it('returns an empty array when no context files exist', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Readme')
    const files = await findContextFiles(tmpDir)
    expect(files).toHaveLength(0)
  })
})
