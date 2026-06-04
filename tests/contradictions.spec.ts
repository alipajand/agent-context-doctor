import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { checkContradictions } from '../src/audit/checks/contradictions.js'
import { auditRepo } from '../src/audit/auditRepo.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-contra-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── unit: checkContradictions ────────────────────────────────────────────────

describe('checkContradictions', () => {
  it('detects same-file test contradiction → high issue', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Tests must pass before finishing.\nYou can skip tests if slow.',
      },
    ])
    expect(issues.length).toBeGreaterThan(0)
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
    expect(issue?.category).toBe('contradictions')
    expect(issue?.file).toBe('AGENTS.md')
  })

  it('detects cross-file security contradiction → high issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Ask before auth changes. Do not change authentication.' },
      { path: '.cursorrules', content: 'You may bypass auth in dev mode.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-security')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
    expect(issue?.file).toBe('multiple')
  })

  it('detects refactor contradiction → medium issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Minimal diff — avoid unrelated refactors.' },
      { path: '.cursorrules', content: 'Feel free to refactor everything.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-refactors')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('medium')
  })

  it('detects product-decisions contradiction → medium issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Do not make product decisions. Implementation agent only.' },
      { path: '.cursorrules', content: 'Make product decisions as needed.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-product-decisions')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('medium')
  })

  it('returns no issue when only strict phrases exist', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content:
          'Tests must pass. Always run tests before finishing. Minimal diff. Do not make product decisions.',
      },
    ])
    expect(issues).toHaveLength(0)
  })

  it('returns no issue when only opposing phrases exist', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Skip tests if slow. Refactor everything.' },
    ])
    expect(issues).toHaveLength(0)
  })

  it('returns no issues for empty file list', () => {
    expect(checkContradictions([])).toHaveLength(0)
  })

  it('includes evidence phrases in recommendation', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Always run tests before finishing.\nIgnore failing tests.',
      },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.recommendation).toMatch(/always run tests/i)
    expect(issue?.recommendation).toMatch(/ignore failing tests/i)
  })

  it('sets file to the path for same-file contradiction', () => {
    const issues = checkContradictions([
      { path: 'CLAUDE.md', content: 'Run tests before finishing. Skip tests.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.file).toBe('CLAUDE.md')
  })

  it('sets file to "multiple" for cross-file contradiction', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Minimal diff.' },
      { path: '.cursorrules', content: 'Rewrite the app.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-refactors')
    expect(issue?.file).toBe('multiple')
  })

  it('detects same-file security contradiction', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Ask before security changes.\nYou can bypass auth for testing.',
      },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-security')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
  })

  it('can detect multiple contradiction groups simultaneously', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Tests must pass.\nSkip tests if slow.\nMinimal diff.\nRefactor everything.',
      },
    ])
    expect(issues.some((i) => i.id === 'contradiction-tests')).toBe(true)
    expect(issues.some((i) => i.id === 'contradiction-refactors')).toBe(true)
  })
})

// ── integration via auditRepo ────────────────────────────────────────────────

describe('auditRepo contradiction integration', () => {
  it('surfaces test contradiction in full audit result', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run tests before finishing. Ask before auth changes.\npnpm test.\nFinal report: summary.\nSkip tests if slow.',
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.category === 'contradictions')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
  })

  it('surfaces cross-file contradiction', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Tests must pass. Ask before auth changes. pnpm test. Final report: summary.',
    )
    const cursorDir = path.join(tmpDir, '.cursor', 'rules')
    await fs.mkdir(cursorDir, { recursive: true })
    await fs.writeFile(
      path.join(cursorDir, 'overrides.mdc'),
      'Ignore failing tests when in a hurry.',
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.id === 'contradiction-tests')
    expect(issue).toBeDefined()
    expect(issue?.file).toBe('multiple')
  })

  it('no contradiction issues when context is consistent', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run tests before finishing. Ask before auth changes. pnpm test. Final report: summary. Minimal diff.',
    )
    const result = await auditRepo(tmpDir)
    const contraIssues = result.issues.filter((i) => i.category === 'contradictions')
    expect(contraIssues).toHaveLength(0)
  })
})
