import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readTextFile, getFileBytes } from '../src/fs/readTextFile.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-readtext-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('readTextFile', () => {
  it('reads the contents of an existing file', async () => {
    const file = path.join(tmpDir, 'a.txt')
    await fs.writeFile(file, 'hello world', 'utf-8')
    expect(await readTextFile(file)).toBe('hello world')
  })

  it('returns an empty string for a missing file', async () => {
    expect(await readTextFile(path.join(tmpDir, 'nope.txt'))).toBe('')
  })

  it('preserves multi-line content', async () => {
    const file = path.join(tmpDir, 'multi.txt')
    await fs.writeFile(file, 'line1\nline2\n', 'utf-8')
    expect(await readTextFile(file)).toBe('line1\nline2\n')
  })
})

describe('getFileBytes', () => {
  it('returns the byte size of an existing file', async () => {
    const content = 'hello'
    const file = path.join(tmpDir, 'b.txt')
    await fs.writeFile(file, content, 'utf-8')
    expect(await getFileBytes(file)).toBe(Buffer.byteLength(content, 'utf-8'))
  })

  it('counts multi-byte characters correctly', async () => {
    const content = '日本語'
    const file = path.join(tmpDir, 'utf.txt')
    await fs.writeFile(file, content, 'utf-8')
    expect(await getFileBytes(file)).toBe(Buffer.byteLength(content, 'utf-8'))
  })

  it('returns 0 for a missing file', async () => {
    expect(await getFileBytes(path.join(tmpDir, 'missing.txt'))).toBe(0)
  })
})
