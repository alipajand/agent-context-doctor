import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  parseSuppressions,
  applySuppressions,
  filterSuppressedIssues,
} from '../src/audit/suppressions.js'
import { auditRepo } from '../src/audit/auditRepo.js'
import type { ContextIssue } from '../src/types.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-suppress-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makeIssue(overrides: Partial<ContextIssue> = {}): ContextIssue {
  return {
    id: 'test-issue',
    severity: 'medium',
    category: 'risky-language',
    file: 'AGENTS.md',
    message: 'test message',
    recommendation: 'test recommendation',
    ...overrides,
  }
}

// ── parseSuppressions ────────────────────────────────────────────────────────

describe('parseSuppressions', () => {
  it('parses a next-line suppression comment', () => {
    const rules = parseSuppressions('<!-- acd-disable-next-line risky-language -->\nsome content')
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({ kind: 'next-line', category: 'risky-language', line: 1 })
  })

  it('parses a file-level suppression comment', () => {
    const rules = parseSuppressions('<!-- acd-disable-file risky-language -->')
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({ kind: 'file', category: 'risky-language', line: 1 })
  })

  it('records the correct line number for mid-file suppressions', () => {
    const content = ['# Title', 'Line 2', '<!-- acd-disable-next-line contradictions -->'].join(
      '\n',
    )
    const rules = parseSuppressions(content)
    expect(rules[0].line).toBe(3)
  })

  it('parses multiple suppression comments', () => {
    const content = [
      '<!-- acd-disable-file risky-language -->',
      '<!-- acd-disable-next-line command-alignment -->',
    ].join('\n')
    const rules = parseSuppressions(content)
    expect(rules).toHaveLength(2)
    expect(rules[0].kind).toBe('file')
    expect(rules[1].kind).toBe('next-line')
  })

  it('returns empty array when no suppression comments exist', () => {
    expect(parseSuppressions('# Regular file\nNo suppressions here.')).toHaveLength(0)
  })

  it('accepts unknown categories without error', () => {
    const rules = parseSuppressions('<!-- acd-disable-file totally-unknown -->')
    expect(rules).toHaveLength(1)
    expect(rules[0].category).toBe('totally-unknown')
  })
})

// ── applySuppressions ────────────────────────────────────────────────────────

describe('applySuppressions', () => {
  it('suppresses an issue matching a next-line rule at the correct line', () => {
    const rules = parseSuppressions(
      '<!-- acd-disable-next-line risky-language -->\nskip tests here',
    )
    const issue = makeIssue({ category: 'risky-language', line: 2 })
    expect(applySuppressions(issue, rules)).toBe(true)
  })

  it('does not suppress an issue whose line is not immediately after the comment', () => {
    const rules = parseSuppressions(
      '<!-- acd-disable-next-line risky-language -->\nline2\nskip tests here',
    )
    const issue = makeIssue({ category: 'risky-language', line: 3 })
    expect(applySuppressions(issue, rules)).toBe(false)
  })

  it('suppresses an issue matching a file-level rule regardless of line', () => {
    const rules = parseSuppressions('<!-- acd-disable-file risky-language -->')
    const issue = makeIssue({ category: 'risky-language', line: 99 })
    expect(applySuppressions(issue, rules)).toBe(true)
  })

  it('does not suppress an issue with a different category', () => {
    const rules = parseSuppressions('<!-- acd-disable-file risky-language -->')
    const issue = makeIssue({ category: 'placeholder-content' })
    expect(applySuppressions(issue, rules)).toBe(false)
  })

  it('does not suppress when category is unknown', () => {
    const rules = parseSuppressions('<!-- acd-disable-file totally-unknown -->')
    const issue = makeIssue({ category: 'totally-unknown' })
    expect(applySuppressions(issue, rules)).toBe(false)
  })

  it('does not suppress a next-line issue whose line field is undefined', () => {
    const rules = parseSuppressions('<!-- acd-disable-next-line risky-language -->')
    const issue = makeIssue({ category: 'risky-language', line: undefined })
    expect(applySuppressions(issue, rules)).toBe(false)
  })
})

// ── filterSuppressedIssues ───────────────────────────────────────────────────

describe('filterSuppressedIssues', () => {
  it('next-line suppression hides a risky-language issue', () => {
    const content = [
      '# Agents',
      '<!-- acd-disable-next-line risky-language -->',
      'skip tests if you want',
    ].join('\n')
    const issue = makeIssue({ category: 'risky-language', file: 'AGENTS.md', line: 3 })
    const result = filterSuppressedIssues('AGENTS.md', content, [issue])
    const nonWarnings = result.filter((i) => i.category !== 'suppressions')
    expect(nonWarnings).toHaveLength(0)
  })

  it('next-line suppression does not hide issue two lines later', () => {
    const content = [
      '# Agents',
      '<!-- acd-disable-next-line risky-language -->',
      'line 3 is suppressed target',
      'skip tests if you want',
    ].join('\n')
    // issue is on line 4 — two lines after the comment on line 2
    const issue = makeIssue({ category: 'risky-language', file: 'AGENTS.md', line: 4 })
    const result = filterSuppressedIssues('AGENTS.md', content, [issue])
    const nonWarnings = result.filter((i) => i.category !== 'suppressions')
    expect(nonWarnings).toHaveLength(1)
  })

  it('file-level suppression hides all issues for that category in that file', () => {
    const content = [
      '<!-- acd-disable-file risky-language -->',
      'skip tests here',
      'bypass auth there',
    ].join('\n')
    const issues = [
      makeIssue({ category: 'risky-language', file: 'AGENTS.md', line: 2 }),
      makeIssue({ id: 'test-issue-2', category: 'risky-language', file: 'AGENTS.md', line: 3 }),
    ]
    const result = filterSuppressedIssues('AGENTS.md', content, issues)
    const nonWarnings = result.filter((i) => i.category !== 'suppressions')
    expect(nonWarnings).toHaveLength(0)
  })

  it('suppression for one category does not hide issues of another category', () => {
    const content = '<!-- acd-disable-file risky-language -->\nContent'
    const issue = makeIssue({ category: 'placeholder-content', file: 'AGENTS.md' })
    const result = filterSuppressedIssues('AGENTS.md', content, [issue])
    const nonWarnings = result.filter((i) => i.category !== 'suppressions')
    expect(nonWarnings).toHaveLength(1)
    expect(nonWarnings[0].category).toBe('placeholder-content')
  })

  it('unknown suppression category emits a low-severity suppressions issue', () => {
    const content = '<!-- acd-disable-file unknown-check -->'
    const result = filterSuppressedIssues('AGENTS.md', content, [])
    const warning = result.find((i) => i.category === 'suppressions')
    expect(warning).toBeDefined()
    expect(warning?.severity).toBe('low')
    expect(warning?.message).toContain('Unknown acd suppression category: "unknown-check"')
    expect(warning?.file).toBe('AGENTS.md')
  })

  it('emits only one warning per unknown category even if it appears multiple times', () => {
    const content = [
      '<!-- acd-disable-file unknown-check -->',
      '<!-- acd-disable-next-line unknown-check -->',
    ].join('\n')
    const result = filterSuppressedIssues('AGENTS.md', content, [])
    const warnings = result.filter((i) => i.category === 'suppressions')
    expect(warnings).toHaveLength(1)
  })

  it('passes through issues from other files untouched', () => {
    const content = '<!-- acd-disable-file risky-language -->'
    const issueOtherFile = makeIssue({ category: 'risky-language', file: 'OTHER.md' })
    const result = filterSuppressedIssues('AGENTS.md', content, [issueOtherFile])
    expect(result).toContain(issueOtherFile)
  })

  it('returns issues unchanged when no suppression comments exist', () => {
    const content = '# Regular file\nNo suppressions here.'
    const issues = [
      makeIssue({ category: 'risky-language', file: 'AGENTS.md', line: 1 }),
      makeIssue({ id: 'test-2', category: 'placeholder-content', file: 'AGENTS.md' }),
    ]
    const result = filterSuppressedIssues('AGENTS.md', content, issues)
    expect(result).toHaveLength(2)
    expect(result).toEqual(issues)
  })
})

// ── contradiction suppression via auditRepo (cross-file) ────────────────────

describe('contradiction suppression integration', () => {
  it('contradiction issue with one file suppressed is NOT hidden when another file is unsuppressed', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      [
        '<!-- acd-disable-file contradictions -->',
        'Tests must pass. Ask before auth changes. pnpm test. Final report: summary.',
      ].join('\n'),
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
  })

  it('contradiction issue is hidden when ALL involved files suppress that category', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      [
        '<!-- acd-disable-file contradictions -->',
        'Tests must pass. Ask before auth changes. pnpm test. Final report: summary.',
      ].join('\n'),
    )
    const cursorDir = path.join(tmpDir, '.cursor', 'rules')
    await fs.mkdir(cursorDir, { recursive: true })
    await fs.writeFile(
      path.join(cursorDir, 'overrides.mdc'),
      ['<!-- acd-disable-file contradictions -->', 'Ignore failing tests when in a hurry.'].join(
        '\n',
      ),
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.id === 'contradiction-tests')
    expect(issue).toBeUndefined()
  })

  it('same-file contradiction is suppressed when that file has a file-level suppression', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      [
        '<!-- acd-disable-file contradictions -->',
        'Tests must pass. pnpm test. Ask before auth changes. Final report: summary.',
        'Skip tests if you are in a hurry.',
      ].join('\n'),
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.id === 'contradiction-tests')
    expect(issue).toBeUndefined()
  })

  it('existing audit behavior is unchanged when no suppression comments exist', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n\nRun pnpm test.\nAsk before changing auth.\nFinal report: summary.',
    )
    const result = await auditRepo(tmpDir)
    const suppressionIssues = result.issues.filter((i) => i.category === 'suppressions')
    expect(suppressionIssues).toHaveLength(0)
  })

  it('inline suppression of risky-language within a full audit works end-to-end', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      [
        '# Agents',
        'Run pnpm test. Ask before auth changes. Final report: summary.',
        '<!-- acd-disable-next-line risky-language -->',
        'skip tests if the suite is flaky',
      ].join('\n'),
    )
    const before = await auditRepo(tmpDir)
    const riskyBefore = before.issues.filter((i) => i.category === 'risky-language')
    expect(riskyBefore).toHaveLength(0)
  })
})
