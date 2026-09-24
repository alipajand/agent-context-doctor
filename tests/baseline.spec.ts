import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  applyBaseline,
  BaselineError,
  fingerprintIssue,
  loadBaseline,
} from '../src/audit/baseline.js'
import type { AuditResult, ContextIssue } from '../src/types.js'

const issue = (overrides: Partial<ContextIssue> = {}): ContextIssue => ({
  id: 'risky-high-AGENTS.md-2-skip tests',
  severity: 'high',
  category: 'risky-language',
  file: 'AGENTS.md',
  line: 3,
  message: 'Risky instruction: "skip tests"',
  recommendation: 'Remove it.',
  evidence: 'skip tests if slow',
  ...overrides,
})

const result = (issues: ContextIssue[]): AuditResult => ({
  repoPath: '/repo',
  files: [],
  summary: { fileCount: 1, issueCount: issues.length, high: 0, medium: 0, low: 0 },
  score: { total: 80, max: 100, grade: 'good' },
  issues,
})

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-baseline-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('fingerprintIssue', () => {
  it('ignores line numbers and ids', () => {
    expect(fingerprintIssue(issue({ line: 3, id: 'a' }))).toBe(
      fingerprintIssue(issue({ line: 40, id: 'b' })),
    )
  })

  it('changes with the message, file, or evidence', () => {
    const base = fingerprintIssue(issue())
    expect(fingerprintIssue(issue({ file: 'CLAUDE.md' }))).not.toBe(base)
    expect(fingerprintIssue(issue({ evidence: 'other' }))).not.toBe(base)
    expect(fingerprintIssue(issue({ message: 'other' }))).not.toBe(base)
  })

  it('treats Windows and POSIX separators alike', () => {
    expect(fingerprintIssue(issue({ file: 'a\\b.md' }))).toBe(
      fingerprintIssue(issue({ file: 'a/b.md' })),
    )
  })
})

describe('loadBaseline', () => {
  it('reads fingerprints from a JSON report', async () => {
    const file = path.join(tmpDir, 'baseline.json')
    const known = { ...issue(), fingerprint: fingerprintIssue(issue()) }
    await fs.writeFile(file, JSON.stringify(result([known])))
    expect([...(await loadBaseline(file))]).toEqual([known.fingerprint])
  })

  it('computes fingerprints for reports written before they existed', async () => {
    const file = path.join(tmpDir, 'baseline.json')
    await fs.writeFile(file, JSON.stringify(result([issue()])))
    expect([...(await loadBaseline(file))]).toEqual([fingerprintIssue(issue())])
  })

  it.each([
    ['a missing file', null],
    ['invalid JSON', '{ nope'],
    ['a report without issues', '{"score": 1}'],
  ])('rejects %s', async (_label, content) => {
    const file = path.join(tmpDir, 'baseline.json')
    if (content !== null) await fs.writeFile(file, content)
    await expect(loadBaseline(file)).rejects.toThrow(BaselineError)
  })
})

describe('applyBaseline', () => {
  it('marks known issues and counts new ones', () => {
    const known = { ...issue(), fingerprint: fingerprintIssue(issue()) }
    const fresh = issue({ message: 'Risky instruction: "bypass auth"' })
    fresh.fingerprint = fingerprintIssue(fresh)
    const applied = applyBaseline(result([known, fresh]), new Set([known.fingerprint]), 'b.json')
    expect(applied.issues.map((i) => i.inBaseline)).toEqual([true, undefined])
    expect(applied.baseline).toEqual({ path: 'b.json', known: 1, new: 1 })
  })
})
