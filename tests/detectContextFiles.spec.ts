import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { detectContextFiles, isPrimaryInstructionFile } from '../src/audit/detectContextFiles.js'

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

  it('classifies CLAUDE.md as claude', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Claude')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path === 'CLAUDE.md')?.kind).toBe('claude')
  })

  it('classifies lowercase claude.md as claude', async () => {
    await fs.writeFile(path.join(tmpDir, 'claude.md'), '# Claude')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path.toLowerCase() === 'claude.md')?.kind).toBe('claude')
  })

  it('detects .claude/CLAUDE.md', async () => {
    const claudeDir = path.join(tmpDir, '.claude')
    await fs.mkdir(claudeDir, { recursive: true })
    await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Claude')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path.includes('CLAUDE.md'))
    expect(found).toBeDefined()
    expect(found?.kind).toBe('claude')
  })

  it('detects .claude/commands/review.md as claude', async () => {
    const cmdDir = path.join(tmpDir, '.claude', 'commands')
    await fs.mkdir(cmdDir, { recursive: true })
    await fs.writeFile(path.join(cmdDir, 'review.md'), '# Review command')
    const files = await detectContextFiles(tmpDir)
    const found = files.find((f) => f.path.includes('review.md'))
    expect(found).toBeDefined()
    expect(found?.kind).toBe('claude')
  })

  it('classifies .codex/**/*.md as codex', async () => {
    const codexDir = path.join(tmpDir, '.codex')
    await fs.mkdir(codexDir, { recursive: true })
    await fs.writeFile(path.join(codexDir, 'guide.md'), '# Codex')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path.includes('guide.md'))?.kind).toBe('codex')
  })

  it('classifies top-level prompts/**/*.md as prompt', async () => {
    const promptsDir = path.join(tmpDir, 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(path.join(promptsDir, 'task.md'), '# Task')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path.includes('task.md'))?.kind).toBe('prompt')
  })

  it('classifies docs/prompts/**/*.md as prompt', async () => {
    const promptsDir = path.join(tmpDir, 'docs', 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(path.join(promptsDir, 'review.md'), '# Prompt')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path.includes('review.md'))?.kind).toBe('prompt')
  })

  it('classifies .github/instructions/**/*.md as prompt', async () => {
    const insDir = path.join(tmpDir, '.github', 'instructions')
    await fs.mkdir(insDir, { recursive: true })
    await fs.writeFile(path.join(insDir, 'general.md'), '# Instructions')
    const files = await detectContextFiles(tmpDir)
    expect(files.find((f) => f.path.includes('general.md'))?.kind).toBe('prompt')
  })

  it('respects extra ignore patterns', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents')
    const files = await detectContextFiles(tmpDir, ['**/AGENTS.md'])
    expect(files.find((f) => f.path === 'AGENTS.md')).toBeUndefined()
  })

  it('reads a symlink whose target stays inside the repo', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents')
    await fs.mkdir(path.join(tmpDir, '.claude'))
    await fs.symlink('../AGENTS.md', path.join(tmpDir, '.claude', 'CLAUDE.md'))
    const files = await detectContextFiles(tmpDir)
    const link = files.find((f) => f.path === path.join('.claude', 'CLAUDE.md'))
    expect(link).toBeDefined()
    expect(link?.skipped).toBeUndefined()
    expect(link?.bytes).toBe(8)
  })

  it('marks a symlink that points outside the repo as skipped without stating it', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outsideDir, 'secret.md'), 'TOP SECRET')
      await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(tmpDir, 'AGENTS.md'))
      const files = await detectContextFiles(tmpDir)
      expect(files).toEqual([
        { path: 'AGENTS.md', kind: 'agents', bytes: 0, skipped: 'outside-repo' },
      ])
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('does not traverse a symlinked directory', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outsideDir, 'notes.md'), '# Notes')
      await fs.symlink(outsideDir, path.join(tmpDir, '.codex'))
      const files = await detectContextFiles(tmpDir)
      expect(files).toHaveLength(0)
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('marks a dangling symlink as not-a-file', async () => {
    await fs.symlink(path.join(tmpDir, 'missing.md'), path.join(tmpDir, 'AGENTS.md'))
    const files = await detectContextFiles(tmpDir)
    expect(files[0]?.skipped).toBe('not-a-file')
  })

  it('marks files above the size limit as too-large', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'x'.repeat(1024 * 1024 + 1))
    const files = await detectContextFiles(tmpDir)
    expect(files[0]?.skipped).toBe('too-large')
    expect(files[0]?.bytes).toBe(1024 * 1024 + 1)
  })
})

describe('isPrimaryInstructionFile', () => {
  it('treats AGENTS.md as primary', () => {
    expect(isPrimaryInstructionFile('/repo/AGENTS.md')).toBe(true)
  })

  it('treats CLAUDE.md as primary', () => {
    expect(isPrimaryInstructionFile('/repo/CLAUDE.md')).toBe(true)
  })

  it('treats .cursorrules as primary', () => {
    expect(isPrimaryInstructionFile('/repo/.cursorrules')).toBe(true)
  })

  it('treats .cursor/rules/*.mdc as primary', () => {
    expect(isPrimaryInstructionFile('/repo/.cursor/rules/project.mdc')).toBe(true)
  })

  it('treats copilot-instructions as primary', () => {
    expect(isPrimaryInstructionFile('/repo/.github/copilot-instructions.md')).toBe(true)
  })

  it('treats prompt files as non-primary', () => {
    expect(isPrimaryInstructionFile('/repo/docs/prompts/review.md')).toBe(false)
  })

  it('handles Windows-style separators', () => {
    expect(isPrimaryInstructionFile('C:\\repo\\.cursor\\rules\\project.mdc')).toBe(true)
  })
})
