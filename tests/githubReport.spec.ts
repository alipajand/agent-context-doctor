import { describe, it, expect } from 'vitest'
import { toGithubAnnotations } from '../src/report/githubReport.js'
import type { AuditResult } from '../src/types.js'

const base: AuditResult = {
  repoPath: '/work',
  files: [],
  summary: { fileCount: 1, issueCount: 2, high: 1, medium: 1, low: 0 },
  score: { total: 72, max: 100, grade: 'needs-work' },
  issues: [
    {
      id: 'r',
      severity: 'high',
      category: 'risky-language',
      file: 'AGENTS.md',
      line: 3,
      message: 'Risky instruction: "skip tests"',
      recommendation: 'Remove it.',
    },
    {
      id: 's',
      severity: 'medium',
      category: 'safety-boundaries',
      file: 'docs/a,b:c.md',
      message: 'No safety-boundary language found',
      recommendation: 'Add it.',
    },
  ],
}

describe('toGithubAnnotations', () => {
  it('emits one annotation per issue with file and line', () => {
    const lines = toGithubAnnotations(base, '/work').split('\n')
    expect(lines[0]).toBe(
      '::error file=AGENTS.md,line=3,title=acd risky-language::Risky instruction: "skip tests". Remove it.',
    )
    expect(lines[1].startsWith('::warning ')).toBe(true)
  })

  it('escapes commas and colons in properties', () => {
    const lines = toGithubAnnotations(base, '/work').split('\n')
    expect(lines[1]).toContain('file=docs/a%2Cb%3Ac.md')
  })

  it('cannot be tricked into starting a new command by message text', () => {
    const out = toGithubAnnotations(
      { ...base, issues: [{ ...base.issues[0], message: 'x\n::add-mask::y' }] },
      '/work',
    )
    expect(out.split('\n').filter((l) => l.startsWith('::'))).toHaveLength(1)
  })

  it('skips issues that are already in the baseline', () => {
    const out = toGithubAnnotations(
      {
        ...base,
        baseline: { path: 'b.json', known: 1, new: 1 },
        issues: [{ ...base.issues[0], inBaseline: true }, base.issues[1]],
      },
      '/work',
    )
    expect(out).not.toContain('::error')
    expect(out).toContain('1 known from baseline')
  })

  it('ends with a summary line', () => {
    const lines = toGithubAnnotations(base, '/work').split('\n')
    expect(lines[lines.length - 1]).toContain('acd: score 72/100 (needs-work)')
  })
})
