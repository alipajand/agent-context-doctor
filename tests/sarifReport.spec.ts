import { describe, it, expect } from 'vitest'
import { toSarifReport } from '../src/report/sarifReport.js'
import type { AuditResult } from '../src/types.js'

const result: AuditResult = {
  repoPath: '/work/repo',
  files: [{ path: 'AGENTS.md', kind: 'agents', bytes: 10 }],
  summary: { fileCount: 1, issueCount: 3, high: 2, medium: 0, low: 1 },
  score: { total: 57, max: 100, grade: 'needs-work' },
  issues: [
    {
      id: 'r',
      severity: 'high',
      category: 'risky-language',
      file: 'AGENTS.md',
      line: 4,
      message: 'Risky instruction: "skip tests"',
      recommendation: 'Remove it.',
      fingerprint: 'abc123',
    },
    {
      id: 'c',
      severity: 'high',
      category: 'contradictions',
      file: 'multiple',
      files: ['AGENTS.md', '.cursor/rules/a.mdc'],
      message: 'Contradictory agent instructions detected: tests',
      recommendation: 'Pick one.',
    },
    {
      id: 'p',
      severity: 'low',
      category: 'presence',
      file: '/work/repo',
      message: 'Something repo-wide',
      recommendation: 'Fix it.',
    },
  ],
}

function parse(json: string) {
  return JSON.parse(json) as {
    version: string
    runs: Array<{
      tool: { driver: { name: string; rules: Array<{ id: string }> } }
      results: Array<{
        ruleId: string
        level: string
        locations?: Array<{
          physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } }
        }>
        partialFingerprints?: Record<string, string>
        baselineState?: string
      }>
    }>
  }
}

describe('toSarifReport', () => {
  it('produces SARIF 2.1.0 with one rule per category', () => {
    const sarif = parse(toSarifReport(result, '/work'))
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver.name).toBe('agent-context-doctor')
    expect(sarif.runs[0].tool.driver.rules.map((r) => r.id)).toEqual([
      'risky-language',
      'contradictions',
      'presence',
    ])
  })

  it('maps severities to SARIF levels', () => {
    const levels = parse(toSarifReport(result, '/work')).runs[0].results.map((r) => r.level)
    expect(levels).toEqual(['error', 'error', 'note'])
  })

  it('reports locations relative to the base directory with line regions', () => {
    const [first] = parse(toSarifReport(result, '/work')).runs[0].results
    expect(first.locations?.[0].physicalLocation.artifactLocation.uri).toBe('repo/AGENTS.md')
    expect(first.locations?.[0].physicalLocation.region?.startLine).toBe(4)
    expect(first.partialFingerprints).toEqual({ 'acdIssue/v1': 'abc123' })
  })

  it('lists every file for cross-file issues and none for repo-wide ones', () => {
    const results = parse(toSarifReport(result, '/work/repo')).runs[0].results
    expect(results[1].locations?.map((l) => l.physicalLocation.artifactLocation.uri)).toEqual([
      'AGENTS.md',
      '.cursor/rules/a.mdc',
    ])
    expect(results[2].locations).toBeUndefined()
  })

  it('sets baselineState when a baseline was applied', () => {
    const withBaseline: AuditResult = {
      ...result,
      baseline: { path: 'b.json', known: 1, new: 2 },
      issues: [{ ...result.issues[0], inBaseline: true }, result.issues[1]],
    }
    const states = parse(toSarifReport(withBaseline, '/work')).runs[0].results.map(
      (r) => r.baselineState,
    )
    expect(states).toEqual(['unchanged', 'new'])
  })
})
