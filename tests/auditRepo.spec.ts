import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { auditRepo } from '../src/audit/auditRepo.js'
import * as contradictions from '../src/audit/checks/contradictions.js'

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

  it('includes contradiction issues when involved files cannot be resolved', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'placeholder')
    vi.spyOn(contradictions, 'checkContradictions').mockReturnValueOnce([
      {
        id: 'contradiction-tests',
        severity: 'high',
        category: 'contradictions',
        file: 'multiple',
        message: 'Contradictory agent instructions detected: tests',
        recommendation: 'Remove one side of the contradiction.',
      },
    ])

    const result = await auditRepo(tmpDir)
    expect(result.issues.some((i) => i.id === 'contradiction-tests')).toBe(true)
    vi.restoreAllMocks()
  })

  it('skips contradictions check when disabled', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Tests must pass. Skip tests. Ask before auth. pnpm test. Final report: summary.',
    )
    const result = await auditRepo(tmpDir, { disabledChecks: ['contradictions'] })
    expect(result.issues.some((i) => i.category === 'contradictions')).toBe(false)
  })

  it('does not run primary instruction checks on prompt files', async () => {
    const promptsDir = path.join(tmpDir, 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(path.join(promptsDir, 'review.md'), '# Prompt only\nNo safety language.')
    const result = await auditRepo(tmpDir)
    const promptSafety = result.issues.filter(
      (i) => i.category === 'safety-boundaries' && i.file.includes('review.md'),
    )
    expect(promptSafety).toHaveLength(0)
  })

  it('returns a computed score in the audit result', async () => {
    const result = await auditRepo(tmpDir)
    expect(result.score.max).toBe(100)
    expect(result.score.total).toBeGreaterThanOrEqual(0)
    expect(result.score.grade).toBeDefined()
  })

  it('reports but never reads a context file that links outside the repo', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outsideDir, 'env.md'), 'TODO: skip tests SECRET_TOKEN=abc')
      await fs.symlink(path.join(outsideDir, 'env.md'), path.join(tmpDir, 'AGENTS.md'))
      const result = await auditRepo(tmpDir)
      expect(result.issues.map((i) => i.category)).toEqual(['file-access'])
      expect(JSON.stringify(result)).not.toContain('SECRET_TOKEN')
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('reports an oversized context file without auditing its contents', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'skip tests\n'.repeat(120_000))
    const result = await auditRepo(tmpDir)
    expect(result.issues.map((i) => i.category)).toEqual(['file-size'])
    expect(result.issues[0].severity).toBe('medium')
  })
})

describe('auditRepo structural checks across related files', () => {
  const fullGuidance = [
    '# Agents',
    'Run `pnpm test` before finishing.',
    'Ask before changing auth or billing.',
    '## Final report',
    'List files changed and commands run.',
  ].join('\n')

  async function write(rel: string, content: string): Promise<void> {
    const full = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content)
  }

  function structuralIssues(issues: Array<{ category: string; file: string }>, file: string) {
    return issues.filter(
      (i) =>
        i.file === file &&
        ['safety-boundaries', 'validation-commands', 'final-reporting'].includes(i.category),
    )
  }

  it('treats a CLAUDE.md that points at AGENTS.md as covered', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('CLAUDE.md', 'Follow the rules in AGENTS.md.')
    const result = await auditRepo(tmpDir)
    expect(structuralIssues(result.issues, 'CLAUDE.md')).toEqual([])
  })

  it('treats an @AGENTS.md import as a reference', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('CLAUDE.md', '@AGENTS.md')
    const result = await auditRepo(tmpDir)
    expect(structuralIssues(result.issues, 'CLAUDE.md')).toEqual([])
  })

  it('still flags a CLAUDE.md that neither contains nor references the guidance', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('CLAUDE.md', 'Be concise.')
    const result = await auditRepo(tmpDir)
    expect(
      structuralIssues(result.issues, 'CLAUDE.md')
        .map((i) => i.category)
        .sort(),
    ).toEqual(['final-reporting', 'safety-boundaries', 'validation-commands'])
  })

  it('evaluates a Cursor rules directory as one set', async () => {
    await write('.cursor/rules/safety.mdc', 'Ask before changing auth.')
    await write('.cursor/rules/testing.mdc', 'Run pnpm test.')
    await write('.cursor/rules/report.mdc', '## Final report\nFiles changed, commands run.')
    const result = await auditRepo(tmpDir)
    const structural = result.issues.filter((i) =>
      ['safety-boundaries', 'validation-commands', 'final-reporting'].includes(i.category),
    )
    expect(structural).toEqual([])
  })

  it('skips structural checks for nested AGENTS.md but keeps content checks', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('packages/web/AGENTS.md', 'In this package you can skip tests.')
    const result = await auditRepo(tmpDir)
    const nested = result.issues.filter((i) => i.file === path.join('packages', 'web', 'AGENTS.md'))
    expect(nested.map((i) => i.category)).toEqual(['risky-language'])
  })
})
