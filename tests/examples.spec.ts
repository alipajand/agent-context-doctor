import { describe, it, expect } from 'vitest'
import { auditRepo } from '../src/audit/auditRepo.js'

describe('example fixtures', () => {
  it('good-context example audits with zero high issues', async () => {
    const result = await auditRepo('examples/good-context')
    expect(result.summary.high).toBe(0)
  })

  it('bad-context example audits with at least one high issue', async () => {
    const result = await auditRepo('examples/bad-context')
    expect(result.summary.high).toBeGreaterThan(0)
  })

  it('bad-context has a higher issue count than good-context', async () => {
    const bad = await auditRepo('examples/bad-context')
    const good = await auditRepo('examples/good-context')
    expect(bad.summary.issueCount).toBeGreaterThan(good.summary.issueCount)
  })

  it('good-context score is higher than bad-context score', async () => {
    const bad = await auditRepo('examples/bad-context')
    const good = await auditRepo('examples/good-context')
    expect(good.score.total).toBeGreaterThan(bad.score.total)
  })

  it('bad-context contains a risky-language high issue', async () => {
    const result = await auditRepo('examples/bad-context')
    const riskyIssue = result.issues.find(
      (i) => i.category === 'risky-language' && i.severity === 'high',
    )
    expect(riskyIssue).toBeDefined()
    expect(riskyIssue?.evidence).toBeDefined()
  })

  it('bad-context contains a contradiction issue', async () => {
    const result = await auditRepo('examples/bad-context')
    const contradiction = result.issues.find((i) => i.category === 'contradictions')
    expect(contradiction).toBeDefined()
    expect(contradiction?.files).toBeDefined()
    expect(contradiction?.files?.length).toBeGreaterThan(0)
  })

  it('good-context AGENTS.md is detected as agents kind', async () => {
    const result = await auditRepo('examples/good-context')
    expect(result.files[0].kind).toBe('agents')
  })
})
