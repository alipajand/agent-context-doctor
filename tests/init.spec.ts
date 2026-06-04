import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { initRepo } from '../src/init/initRepo.js'
import { AGENTS_TEMPLATE } from '../src/init/template.js'
import { checkRiskyLanguage } from '../src/audit/checks/riskyLanguage.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-init-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── initRepo ─────────────────────────────────────────────────────────────────

describe('initRepo', () => {
  it('creates AGENTS.md when none exists', async () => {
    const result = await initRepo(tmpDir)
    expect(result.status).toBe('created')
    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(content).toBe(AGENTS_TEMPLATE)
  })

  it('returns already-exists and does not overwrite by default', async () => {
    const original = 'original content'
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), original, 'utf-8')

    const result = await initRepo(tmpDir)
    expect(result.status).toBe('already-exists')

    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(content).toBe(original)
  })

  it('overwrites an existing AGENTS.md when --force is set', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'old content', 'utf-8')

    const result = await initRepo(tmpDir, { force: true })
    expect(result.status).toBe('overwritten')

    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(content).toBe(AGENTS_TEMPLATE)
  })

  it('returns the absolute path to AGENTS.md', async () => {
    const result = await initRepo(tmpDir)
    expect(result.status).toBe('created')
    if (result.status === 'created') {
      expect(path.isAbsolute(result.path)).toBe(true)
      expect(result.path).toContain('AGENTS.md')
    }
  })

  it('resolves a relative repo path correctly', async () => {
    // Pass tmpDir as absolute path and verify the file is created there
    const result = await initRepo(tmpDir)
    expect(result.status).toBe('created')
    const exists = await fs
      .access(path.join(tmpDir, 'AGENTS.md'))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })
})

// ── AGENTS_TEMPLATE ───────────────────────────────────────────────────────────

describe('AGENTS_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof AGENTS_TEMPLATE).toBe('string')
    expect(AGENTS_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('contains a Scope section', () => {
    expect(AGENTS_TEMPLATE).toContain('## Scope')
  })

  it('contains forbidden-changes guidance', () => {
    expect(AGENTS_TEMPLATE).toContain('Forbidden changes')
  })

  it('contains validation commands section', () => {
    expect(AGENTS_TEMPLATE).toContain('## Required validation')
    expect(AGENTS_TEMPLATE).toContain('pnpm test')
  })

  it('contains final report section', () => {
    expect(AGENTS_TEMPLATE).toContain('## Final report')
    expect(AGENTS_TEMPLATE).toContain('Files changed')
    expect(AGENTS_TEMPLATE).toContain('Commands run')
  })

  it('passes risky-language false-positive check — negated phrases are not flagged', () => {
    const issues = checkRiskyLanguage('AGENTS.md', AGENTS_TEMPLATE)
    expect(issues).toHaveLength(0)
  })

  it('does not contain bare "skip tests" without negation', () => {
    // Confirm the risky phrase only appears after "Do not"
    expect(AGENTS_TEMPLATE).not.toMatch(/(?<!not\s)skip\s+tests/i)
  })

  it('does not contain bare "bypass auth" without negation', () => {
    expect(AGENTS_TEMPLATE).not.toMatch(/(?<!not\s)bypass\s+auth/i)
  })

  it('does not contain bare "commit secrets" without negation', () => {
    expect(AGENTS_TEMPLATE).not.toMatch(/(?<!not\s)commit\s+secrets/i)
  })

  it('ends with a newline', () => {
    expect(AGENTS_TEMPLATE.endsWith('\n')).toBe(true)
  })
})

// ── --print mode (template content only, no file system) ─────────────────────

describe('--print mode (template content)', () => {
  it('AGENTS_TEMPLATE is the same string initRepo would write', async () => {
    await initRepo(tmpDir)
    const written = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(written).toBe(AGENTS_TEMPLATE)
  })
})
