import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { writeReport } from '../src/fs/writeReport.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-writereport-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('writeReport', () => {
  it('writes content to a relative path resolved against the repo', async () => {
    const resolved = await writeReport('report.md', '# Report', tmpDir)
    expect(resolved).toBe(path.resolve(tmpDir, 'report.md'))
    expect(await fs.readFile(resolved, 'utf-8')).toBe('# Report')
  })

  it('creates intermediate directories as needed', async () => {
    const resolved = await writeReport('docs/nested/report.md', 'hi', tmpDir)
    expect(await fs.readFile(resolved, 'utf-8')).toBe('hi')
    expect(resolved).toContain(path.join('docs', 'nested'))
  })

  it('honors an absolute output path', async () => {
    const abs = path.join(tmpDir, 'absolute.md')
    const resolved = await writeReport(abs, 'content', tmpDir)
    expect(resolved).toBe(abs)
    expect(await fs.readFile(abs, 'utf-8')).toBe('content')
  })

  it('overwrites an existing file', async () => {
    const file = path.join(tmpDir, 'out.md')
    await fs.writeFile(file, 'old', 'utf-8')
    await writeReport('out.md', 'new', tmpDir)
    expect(await fs.readFile(file, 'utf-8')).toBe('new')
  })

  it('returns an absolute path', async () => {
    const resolved = await writeReport('r.md', 'x', tmpDir)
    expect(path.isAbsolute(resolved)).toBe(true)
  })
})
