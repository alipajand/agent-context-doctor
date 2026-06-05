import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { printTerminalReport } from '../src/report/terminalReport.js'
import type { AuditResult } from '../src/types.js'

const baseResult: AuditResult = {
  repoPath: '/fake/repo',
  files: [{ path: 'AGENTS.md', kind: 'agents', bytes: 1234 }],
  summary: { fileCount: 1, issueCount: 1, high: 1, medium: 0, low: 0 },
  score: { total: 69, max: 100, grade: 'needs-work' },
  issues: [
    {
      id: 'risky-high-AGENTS.md-3-skip tests',
      severity: 'high',
      category: 'risky-language',
      file: 'AGENTS.md',
      line: 3,
      message: 'Risky instruction: "skip tests"',
      recommendation: 'Remove language that lets agents bypass validation.',
      evidence: 'you may skip tests when slow',
    },
  ],
}

let logSpy: ReturnType<typeof vi.spyOn>
let output: string

function captured(): string {
  return output
}

beforeEach(() => {
  output = ''
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output += args.join(' ') + '\n'
  })
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('printTerminalReport', () => {
  it('prints the header and repo path', () => {
    printTerminalReport(baseResult)
    expect(captured()).toContain('Agent Context Doctor')
    expect(captured()).toContain('/fake/repo')
  })

  it('prints the file count and score', () => {
    printTerminalReport(baseResult)
    expect(captured()).toContain('1')
    expect(captured()).toContain('69 / 100')
    expect(captured()).toContain('needs-work')
  })

  it('lists detected context files', () => {
    printTerminalReport(baseResult)
    expect(captured()).toContain('AGENTS.md')
    expect(captured()).toContain('agents')
  })

  it('prints issue details including recommendation and evidence', () => {
    printTerminalReport(baseResult)
    expect(captured()).toContain('skip tests')
    expect(captured()).toContain('Recommendation:')
    expect(captured()).toContain('Evidence:')
    expect(captured()).toContain('you may skip tests when slow')
  })

  it('includes the line number in the file reference', () => {
    printTerminalReport(baseResult)
    expect(captured()).toContain('AGENTS.md:3')
  })

  it('prints a no-issues message when there are no issues', () => {
    const clean: AuditResult = {
      ...baseResult,
      summary: { fileCount: 1, issueCount: 0, high: 0, medium: 0, low: 0 },
      score: { total: 100, max: 100, grade: 'excellent' },
      issues: [],
    }
    printTerminalReport(clean)
    expect(captured()).toContain('No issues found')
  })

  it('handles a result with no context files', () => {
    const noFiles: AuditResult = {
      ...baseResult,
      files: [],
      summary: { fileCount: 0, issueCount: 0, high: 0, medium: 0, low: 0 },
      score: { total: 100, max: 100, grade: 'excellent' },
      issues: [],
    }
    printTerminalReport(noFiles)
    expect(captured()).not.toContain('Context Files:')
  })

  it('omits a line suffix when an issue has no line number', () => {
    const noLine: AuditResult = {
      ...baseResult,
      issues: [{ ...baseResult.issues[0], line: undefined, evidence: undefined }],
    }
    printTerminalReport(noLine)
    expect(captured()).toContain('AGENTS.md —')
  })

  it('renders low and medium severities', () => {
    const mixed: AuditResult = {
      ...baseResult,
      summary: { fileCount: 1, issueCount: 2, high: 0, medium: 1, low: 1 },
      issues: [
        { ...baseResult.issues[0], severity: 'medium', evidence: undefined },
        { ...baseResult.issues[0], id: 'low-1', severity: 'low', evidence: undefined },
      ],
    }
    printTerminalReport(mixed)
    expect(captured()).toContain('medium')
    expect(captured()).toContain('low')
  })

  it('renders an excellent grade', () => {
    printTerminalReport({
      ...baseResult,
      score: { total: 100, max: 100, grade: 'excellent' },
    })
    expect(captured()).toContain('excellent')
  })

  it('renders a good grade', () => {
    printTerminalReport({
      ...baseResult,
      score: { total: 85, max: 100, grade: 'good' },
    })
    expect(captured()).toContain('good')
  })

  it('renders a risky grade', () => {
    printTerminalReport({
      ...baseResult,
      score: { total: 30, max: 100, grade: 'risky' },
    })
    expect(captured()).toContain('risky')
  })

  it('renders an unrecognized severity without ANSI coloring', () => {
    const weird: AuditResult = {
      ...baseResult,
      issues: [
        {
          ...baseResult.issues[0],
          severity: 'critical' as AuditResult['issues'][0]['severity'],
          evidence: undefined,
        },
      ],
    }
    printTerminalReport(weird)
    expect(captured()).toContain('[critical]')
  })

  it('renders repo-level issues without a redundant file reference', () => {
    const repoIssue: AuditResult = {
      ...baseResult,
      issues: [
        {
          id: 'repo-issue',
          severity: 'medium',
          category: 'general',
          file: '/fake/repo',
          message: 'Repo-level finding',
          recommendation: 'Do something.',
        },
      ],
    }
    printTerminalReport(repoIssue)
    expect(captured()).toContain('Repo-level finding')
  })
})
