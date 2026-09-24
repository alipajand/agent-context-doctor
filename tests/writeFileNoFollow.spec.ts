import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeFileNoFollow } from '../src/fs/writeFileNoFollow.js'

describe('writeFileNoFollow', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-nofollow-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('creates, keeps, and overwrites regular files', async () => {
    const file = path.join(dir, 'a.md')
    expect(await writeFileNoFollow(file, 'one', false)).toBe('created')
    expect(await writeFileNoFollow(file, 'two', false)).toBe('exists')
    expect(await fs.readFile(file, 'utf-8')).toBe('one')
    expect(await writeFileNoFollow(file, '3', true)).toBe('overwritten')
    expect(await fs.readFile(file, 'utf-8')).toBe('3')
  })

  it.each([false, true])('never writes through a symlink (overwrite: %s)', async (overwrite) => {
    const target = path.join(dir, 'target.md')
    await fs.writeFile(target, 'keep')
    await fs.symlink(target, path.join(dir, 'link.md'))
    expect(await writeFileNoFollow(path.join(dir, 'link.md'), 'x', overwrite)).toBe('symlink')
    expect(await fs.readFile(target, 'utf-8')).toBe('keep')
  })

  it('does not create the target of a dangling symlink', async () => {
    const target = path.join(dir, 'missing.md')
    await fs.symlink(target, path.join(dir, 'link.md'))
    expect(await writeFileNoFollow(path.join(dir, 'link.md'), 'x', true)).toBe('symlink')
    await expect(fs.access(target)).rejects.toThrow()
  })

  it.skipIf(process.platform === 'win32')('does not wait on a FIFO', async () => {
    const fifo = path.join(dir, 'pipe.md')
    execFileSync('mkfifo', [fifo])
    await expect(writeFileNoFollow(fifo, 'x', true)).rejects.toThrow()
  })
})
