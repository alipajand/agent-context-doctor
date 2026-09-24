import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { readTextFile, readRegularFile, getFileBytes } from '../src/fs/readTextFile.js'

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

  it('returns an empty string for a directory', async () => {
    expect(await readTextFile(tmpDir)).toBe('')
  })

  it('returns an empty string for a file above the size limit', async () => {
    const file = path.join(tmpDir, 'big.md')
    await fs.writeFile(file, 'x'.repeat(64), 'utf-8')
    expect(await readTextFile(file, 32)).toBe('')
    expect(await readTextFile(file, 64)).toBe('x'.repeat(64))
  })

  it('preserves multi-line content', async () => {
    const file = path.join(tmpDir, 'multi.txt')
    await fs.writeFile(file, 'line1\nline2\n', 'utf-8')
    expect(await readTextFile(file)).toBe('line1\nline2\n')
  })
})

describe('readRegularFile', () => {
  it('reports why a file was not read', async () => {
    const file = path.join(tmpDir, 'a.md')
    await fs.writeFile(file, 'abc', 'utf-8')
    expect(await readRegularFile(file)).toEqual({ status: 'ok', content: 'abc' })
    expect(await readRegularFile(file, 2)).toEqual({ status: 'too-large' })
    expect(await readRegularFile(tmpDir)).toEqual({ status: 'not-a-file' })
    expect(await readRegularFile(path.join(tmpDir, 'nope'))).toEqual({ status: 'missing' })
    expect(await readRegularFile(path.join(file, 'child'))).toEqual({ status: 'missing' })
  })

  it.skipIf(process.platform === 'win32')('does not wait on a FIFO', async () => {
    const fifo = path.join(tmpDir, 'pipe.md')
    execFileSync('mkfifo', [fifo])
    expect(await readRegularFile(fifo)).toEqual({ status: 'not-a-file' })
    expect(await readTextFile(fifo)).toBe('')
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
