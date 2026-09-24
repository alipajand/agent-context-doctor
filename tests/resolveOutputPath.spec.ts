import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { OutputPathError, resolveOutputPath } from '../src/fs/resolveOutputPath.js'
import { isWithin } from '../src/fs/safePath.js'

let tmpDir: string
let repo: string

beforeEach(async () => {
  tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outpath-test-')))
  repo = path.join(tmpDir, 'repo')
  await fs.mkdir(repo)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('isWithin', () => {
  it('accepts the root itself and descendants', () => {
    expect(isWithin('/repo', '/repo')).toBe(true)
    expect(isWithin('/repo', '/repo/docs/report.md')).toBe(true)
  })

  it('rejects parents and siblings', () => {
    expect(isWithin('/repo', '/')).toBe(false)
    expect(isWithin('/repo', '/repo-other/report.md')).toBe(false)
    expect(isWithin('/repo', '/other/report.md')).toBe(false)
  })

  it('accepts names that merely start with two dots', () => {
    expect(isWithin('/repo', '/repo/..notes.md')).toBe(true)
  })
})

describe('resolveOutputPath', () => {
  it('resolves a relative path under the repo', () => {
    expect(resolveOutputPath(repo, 'docs/report.md')).toBe(path.join(repo, 'docs', 'report.md'))
  })

  it('accepts an absolute path inside the repo', () => {
    const abs = path.join(repo, 'report.md')
    expect(resolveOutputPath(repo, abs)).toBe(abs)
  })

  it('rejects ../ escapes', () => {
    expect(() => resolveOutputPath(repo, '../escape.md')).toThrow(OutputPathError)
  })

  it('rejects an absolute path outside the repo', () => {
    expect(() => resolveOutputPath(repo, path.join(tmpDir, 'escape.md'))).toThrow(OutputPathError)
  })

  it('rejects the repo root itself', () => {
    expect(() => resolveOutputPath(repo, '.')).toThrow(OutputPathError)
  })

  it('rejects a path that escapes through a symlinked directory', async () => {
    const outside = path.join(tmpDir, 'outside')
    await fs.mkdir(outside)
    await fs.symlink(outside, path.join(repo, 'docs'))
    expect(() => resolveOutputPath(repo, 'docs/report.md')).toThrow(OutputPathError)
  })

  it('accepts a symlinked directory that stays inside the repo', async () => {
    await fs.mkdir(path.join(repo, 'real'))
    await fs.symlink(path.join(repo, 'real'), path.join(repo, 'alias'))
    expect(resolveOutputPath(repo, 'alias/report.md')).toBe(path.join(repo, 'alias', 'report.md'))
  })

  it('allows outside paths when allowOutside is set', () => {
    const outside = path.join(tmpDir, 'outside.md')
    expect(resolveOutputPath(repo, outside, { allowOutside: true })).toBe(outside)
  })

  it('names --allow-outside in the error message', () => {
    expect(() => resolveOutputPath(repo, '../escape.md')).toThrow(/--allow-outside/)
  })
})
