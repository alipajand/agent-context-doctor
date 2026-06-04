import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { detectContextFiles } from '../src/audit/detectContextFiles.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('detectContextFiles', () => {
  it('detects AGENTS.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path === 'AGENTS.md')
    expect(found).toBeDefined()
    expect(found?.kind).toBe('agents')
  })

  it('detects .cursor/rules/*.mdc', async () => {
    const rulesDir = path.join(tmpDir, '.cursor', 'rules')
    await fs.mkdir(rulesDir, { recursive: true })
    await fs.writeFile(path.join(rulesDir, 'project.mdc'), '# Rules')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path.includes('project.mdc'))
    expect(found).toBeDefined()
    expect(found?.kind).toBe('cursor')
  })

  it('detects .cursorrules', async () => {
    await fs.writeFile(path.join(tmpDir, '.cursorrules'), '# Cursor rules')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path === '.cursorrules')
    expect(found).toBeDefined()
    expect(found?.kind).toBe('cursor')
  })

  it('detects .github/copilot-instructions.md', async () => {
    const ghDir = path.join(tmpDir, '.github')
    await fs.mkdir(ghDir, { recursive: true })
    await fs.writeFile(path.join(ghDir, 'copilot-instructions.md'), '# Copilot')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path.includes('copilot-instructions.md'))
    expect(found).toBeDefined()
    expect(found?.kind).toBe('copilot')
  })

  it('returns empty array when no context files exist', async () => {
    const files = await detectContextFiles(tmpDir)
    expect(files).toHaveLength(0)
  })

  it('reports correct byte size', async () => {
    const content = 'Hello World'
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), content)
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path === 'AGENTS.md')
    expect(found?.bytes).toBe(Buffer.byteLength(content, 'utf-8'))
  })

  it('ignores node_modules', async () => {
    const nmDir = path.join(tmpDir, 'node_modules')
    await fs.mkdir(nmDir, { recursive: true })
    await fs.writeFile(path.join(nmDir, 'AGENTS.md'), '# Not real')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path.includes('node_modules'))
    expect(found).toBeUndefined()
  })
})
