import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readPackageScripts } from '../src/fs/readPackageJson.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-pkg-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('readPackageScripts', () => {
  it('returns the scripts object', async () => {
    const pkg = { name: 'demo', scripts: { test: 'vitest', build: 'tsc' } }
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
    const scripts = await readPackageScripts(tmpDir)
    expect(scripts).toEqual({ test: 'vitest', build: 'tsc' })
  })

  it('returns an empty object when scripts field is absent', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'demo' }))
    const scripts = await readPackageScripts(tmpDir)
    expect(scripts).toEqual({})
  })

  it('returns null when package.json does not exist', async () => {
    const scripts = await readPackageScripts(tmpDir)
    expect(scripts).toBeNull()
  })

  it('returns null when package.json is invalid JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{ not valid json')
    const scripts = await readPackageScripts(tmpDir)
    expect(scripts).toBeNull()
  })
})
