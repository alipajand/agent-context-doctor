import { describe, it, expect } from 'vitest'
import { toMarkdownReport } from '../src/report/markdownReport.js'
import { toJsonReport } from '../src/report/jsonReport.js'
import type { AuditResult } from '../src/types.js'

const sampleResult: AuditResult = {
  repoPath: '/fake/repo',
  files: [
    { path: 'AGENTS.md', kind: 'agents', bytes: 1234 },
    { path: '.cursor/rules/project.mdc', kind: 'cursor', bytes: 567 },
  ],
  summary: {
    fileCount: 2,
    issueCount: 3,
    high: 1,
    medium: 1,
    low: 1,
  },
  issues: [
    {
      id: 'risky-high-AGENTS.md-0-skip tests',
      severity: 'high',
      category: 'risky-language',
      file: 'AGENTS.md',
      line: 3,
      message: 'Risky instruction: "skip tests"',
      recommendation: 'Remove language that lets agents bypass validation.',
    },
    {
      id: 'safety-missing-.cursor/rules/project.mdc',
      severity: 'medium',
      category: 'safety-boundaries',
      file: '.cursor/rules/project.mdc',
      message: 'No safety-boundary language found',
      recommendation: 'Add explicit forbidden-change guidance.',
    },
    {
      id: 'reporting-missing-AGENTS.md',
      severity: 'low',
      category: 'final-reporting',
      file: 'AGENTS.md',
      message: 'No final reporting guidance found',
      recommendation: 'Add instructions about final report.',
    },
  ],
}

describe('toMarkdownReport', () => {
  it('generates a markdown string', () => {
    const md = toMarkdownReport(sampleResult)
    expect(typeof md).toBe('string')
    expect(md.length).toBeGreaterThan(0)
  })

  it('includes title', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('# Agent Context Doctor Report')
  })

  it('includes repo path', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('/fake/repo')
  })

  it('includes summary table', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('## Summary')
    expect(md).toContain('| Context files | 2 |')
    expect(md).toContain('| Total issues | 3 |')
    expect(md).toContain('| High | 1 |')
    expect(md).toContain('| Medium | 1 |')
    expect(md).toContain('| Low | 1 |')
  })

  it('includes context files table', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('## Context Files')
    expect(md).toContain('AGENTS.md')
    expect(md).toContain('agents')
    expect(md).toContain('1234')
  })

  it('includes issues table', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('## Issues')
    expect(md).toContain('skip tests')
    expect(md).toContain('safety-boundaries')
  })

  it('includes recommendations grouped by severity', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('## Recommendations by Severity')
    expect(md).toContain('### High')
    expect(md).toContain('### Medium')
    expect(md).toContain('### Low')
  })

  it('includes a generated timestamp', () => {
    const md = toMarkdownReport(sampleResult)
    expect(md).toContain('**Generated:**')
  })

  it('handles no issues gracefully', () => {
    const emptyResult: AuditResult = {
      ...sampleResult,
      summary: { fileCount: 1, issueCount: 0, high: 0, medium: 0, low: 0 },
      issues: [],
    }
    const md = toMarkdownReport(emptyResult)
    expect(md).toContain('_No issues found._')
  })

  it('handles no files gracefully', () => {
    const noFilesResult: AuditResult = {
      ...sampleResult,
      files: [],
      summary: { fileCount: 0, issueCount: 0, high: 0, medium: 0, low: 0 },
      issues: [],
    }
    const md = toMarkdownReport(noFilesResult)
    expect(md).toContain('_No context files detected._')
  })
})

describe('toJsonReport', () => {
  it('produces valid JSON', () => {
    const json = toJsonReport(sampleResult)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('parsed JSON matches AuditResult shape', () => {
    const json = toJsonReport(sampleResult)
    const parsed = JSON.parse(json) as AuditResult
    expect(parsed.repoPath).toBe('/fake/repo')
    expect(parsed.files).toHaveLength(2)
    expect(parsed.summary.issueCount).toBe(3)
    expect(parsed.issues).toHaveLength(3)
    expect(parsed.issues[0].severity).toBe('high')
  })

  it('includes all issue fields', () => {
    const json = toJsonReport(sampleResult)
    const parsed = JSON.parse(json) as AuditResult
    const issue = parsed.issues[0]
    expect(issue.id).toBeDefined()
    expect(issue.severity).toBeDefined()
    expect(issue.category).toBeDefined()
    expect(issue.file).toBeDefined()
    expect(issue.message).toBeDefined()
    expect(issue.recommendation).toBeDefined()
    expect(issue.line).toBe(3)
  })
})
