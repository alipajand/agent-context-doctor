import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { auditRepo } from '../src/audit/auditRepo.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-audit-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('auditRepo', () => {
  it('creates a high issue when no context files are found', async () => {
    const result = await auditRepo(tmpDir)
    expect(result.summary.issueCount).toBeGreaterThan(0)
    expect(result.summary.high).toBeGreaterThan(0)
    const noFilesIssue = result.issues.find((i) => i.id === 'presence-no-files')
    expect(noFilesIssue).toBeDefined()
    expect(noFilesIssue?.severity).toBe('high')
    expect(noFilesIssue?.message).toContain('No agent context files found')
  })

  it('returns repoPath as absolute path', async () => {
    const result = await auditRepo(tmpDir)
    expect(path.isAbsolute(result.repoPath)).toBe(true)
  })

  it('returns correct file count', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# Agents\nRun pnpm test.\nSecurity: ask before changing auth.\nFinal report: list files changed.',
    )
    const result = await auditRepo(tmpDir)
    expect(result.summary.fileCount).toBe(1)
    expect(result.files[0].kind).toBe('agents')
  })

  it('detects safety issue for primary file without safety language', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n\nDo stuff. Run tests.\nFinal report: summary.',
    )
    const result = await auditRepo(tmpDir)
    const safetyIssue = result.issues.find((i) => i.category === 'safety-boundaries')
    expect(safetyIssue).toBeDefined()
    expect(safetyIssue?.severity).toBe('medium')
  })

  it('detects validation command issue for primary file without commands', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n\nDo stuff.\nAsk before changing auth.\nFinal report: summary.',
    )
    const result = await auditRepo(tmpDir)
    const validationIssue = result.issues.find((i) => i.category === 'validation-commands')
    expect(validationIssue).toBeDefined()
    expect(validationIssue?.severity).toBe('medium')
  })

  it('detects final reporting issue for primary file without reporting guidance', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n\nRun pnpm test.\nAsk before changing auth.',
    )
    const result = await auditRepo(tmpDir)
    const reportingIssue = result.issues.find((i) => i.category === 'final-reporting')
    expect(reportingIssue).toBeDefined()
    expect(reportingIssue?.severity).toBe('low')
  })

  it('produces no structural issues for a well-written AGENTS.md', async () => {
    const wellWritten = `# AGENTS

Run \`pnpm test\` and \`pnpm lint\` before finishing.

Do not change auth, billing, or database schema without approval.
Ask before modifying production config.

## Final report
Include: files changed, commands run, tests passed, known limitations.
`
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), wellWritten)
    const result = await auditRepo(tmpDir)
    const structuralIssues = result.issues.filter((i) =>
      ['safety-boundaries', 'validation-commands', 'final-reporting', 'presence'].includes(
        i.category,
      ),
    )
    expect(structuralIssues).toHaveLength(0)
  })

  it('summary counts match issue array', async () => {
    const result = await auditRepo(tmpDir)
    const high = result.issues.filter((i) => i.severity === 'high').length
    const medium = result.issues.filter((i) => i.severity === 'medium').length
    const low = result.issues.filter((i) => i.severity === 'low').length
    expect(result.summary.high).toBe(high)
    expect(result.summary.medium).toBe(medium)
    expect(result.summary.low).toBe(low)
    expect(result.summary.issueCount).toBe(high + medium + low)
  })
})
