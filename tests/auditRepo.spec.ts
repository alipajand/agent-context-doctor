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
    expect(result.score).toEqual({ total: 0, max: 100, grade: 'risky' })
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

describe('auditRepo file-size budget', () => {
  const guidance =
    'Run pnpm test. Ask before auth changes. Final report: files changed, commands run.'

  it('flags a primary file over the default budget as low', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), `${guidance}\n${'x'.repeat(41_000)}`)
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.category === 'file-size')
    expect(issue?.severity).toBe('low')
    expect(issue?.message).toContain('over the 40 KB budget')
  })

  it('respects a custom maxFileBytes and skips supplementary files', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), `${guidance}\n${'x'.repeat(2_000)}`)
    await fs.mkdir(path.join(tmpDir, 'docs', 'prompts'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'docs', 'prompts', 'big.md'), 'y'.repeat(5_000))
    const result = await auditRepo(tmpDir, { maxFileBytes: 1_000 })
    expect(result.issues.filter((i) => i.category === 'file-size').map((i) => i.file)).toEqual([
      'AGENTS.md',
    ])
  })
})

describe('auditRepo delegated instruction files (#61)', () => {
  const STRUCTURAL = ['safety-boundaries', 'validation-commands', 'final-reporting']
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

  async function structuralByFile(): Promise<Record<string, string[]>> {
    const result = await auditRepo(tmpDir)
    const byFile: Record<string, string[]> = {}
    for (const issue of result.issues) {
      if (!STRUCTURAL.includes(issue.category)) continue
      const key = issue.file.replace(/\\/g, '/')
      byFile[key] = [...(byFile[key] ?? []), issue.category].sort()
    }
    return byFile
  }

  it('reports the issue #61 reproduction only on the file that holds the guidance', async () => {
    await write('package.json', '{"scripts":{"test":"node --test"}}')
    await write(
      'AGENTS.md',
      '# AGENTS\n\nRun `npm test` before finishing. Never push to main.\n\n## Final report\n\nFiles changed, commands run.\n',
    )
    await write(
      'CLAUDE.md',
      '# CLAUDE.md\n\nFollow [AGENTS.md](AGENTS.md); it is the single source of truth.\n',
    )
    expect(await structuralByFile()).toEqual({ 'AGENTS.md': ['safety-boundaries'] })
  })

  it('reports nothing when the delegated file has all the guidance', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('CLAUDE.md', 'Follow AGENTS.md.')
    expect(await structuralByFile()).toEqual({})
  })

  it('keeps the findings on a file that delegates to a file that does not exist', async () => {
    await write('CLAUDE.md', 'Follow [AGENTS.md](AGENTS.md).')
    expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
  })

  it('follows delegation through several files', async () => {
    await write('AGENTS.md', fullGuidance)
    await write('CLAUDE.md', 'Follow AGENTS.md.')
    await write('GEMINI.md', 'Follow CLAUDE.md.')
    expect(await structuralByFile()).toEqual({})
  })

  it('reports a guidance gap once, at the end of a delegation chain', async () => {
    await write('AGENTS.md', 'Run `pnpm test`.\n## Final report\nFiles changed, commands run.')
    await write('CLAUDE.md', 'Follow AGENTS.md.')
    await write('GEMINI.md', 'Follow CLAUDE.md.')
    expect(await structuralByFile()).toEqual({ 'AGENTS.md': ['safety-boundaries'] })
  })

  it('follows @imports of in-repository files that are not context files', async () => {
    await write('docs/agent-guide.md', fullGuidance)
    await write('AGENTS.md', '@docs/agent-guide.md')
    await write('CLAUDE.md', 'Follow AGENTS.md.')
    expect(await structuralByFile()).toEqual({})
  })

  it('resolves @imports relative to the importing file', async () => {
    await write('.claude/shared/guide.md', fullGuidance)
    await write('.claude/CLAUDE.md', '@shared/guide.md')
    expect(await structuralByFile()).toEqual({})
  })

  it('does not follow @imports that leave the repository', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outside, 'guide.md'), fullGuidance)
      const rel = path.relative(tmpDir, path.join(outside, 'guide.md')).replace(/\\/g, '/')
      await write('CLAUDE.md', `@${rel}`)
      expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('does not follow an in-repository symlink whose target is outside', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outside, 'guide.md'), fullGuidance)
      await fs.mkdir(path.join(tmpDir, 'docs'))
      await fs.symlink(path.join(outside, 'guide.md'), path.join(tmpDir, 'docs', 'guide.md'))
      await write('CLAUDE.md', '@docs/guide.md')
      expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('terminates on a delegation cycle and reports the gap on each file in it', async () => {
    await write('AGENTS.md', 'See CLAUDE.md. Run `pnpm test`.\n## Final report\nFiles changed.')
    await write('CLAUDE.md', 'See AGENTS.md.')
    expect(await structuralByFile()).toEqual({
      'AGENTS.md': ['safety-boundaries'],
      'CLAUDE.md': ['safety-boundaries'],
    })
  })

  it('terminates on a three-file cycle that has the guidance', async () => {
    await write('AGENTS.md', `${fullGuidance}\nSee GEMINI.md.`)
    await write('CLAUDE.md', 'See AGENTS.md.')
    await write('GEMINI.md', 'See CLAUDE.md.')
    expect(await structuralByFile()).toEqual({})
  })

  it('terminates on @import cycles', async () => {
    await write('docs/a.md', '@b.md')
    await write('docs/b.md', '@a.md')
    await write('CLAUDE.md', '@docs/a.md\n@CLAUDE.md')
    expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
  })

  it('keeps findings on a file that delegates to a non-primary file without the guidance', async () => {
    await write('docs/prompts/style.md', 'Write short sentences.')
    await write('CLAUDE.md', 'Follow docs/prompts/style.md.')
    expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
  })

  it('evaluates a large rules directory once instead of once per file', async () => {
    const big = `${'Ask before changing auth. '.repeat(8_000)}\n`
    for (let i = 0; i < 40; i++) {
      await write(`.cursor/rules/r${i}.mdc`, `${big}See r${(i + 1) % 40}.mdc`)
    }
    const start = Date.now()
    const byFile = await structuralByFile()
    expect(Object.keys(byFile)).toHaveLength(40)
    expect(Date.now() - start).toBeLessThan(10_000)
  }, 30_000)

  it('handles thousands of rule files in roughly linear time', async () => {
    await fs.mkdir(path.join(tmpDir, '.cursor', 'rules'), { recursive: true })
    await Promise.all(
      Array.from({ length: 3_000 }, (_, i) =>
        fs.writeFile(path.join(tmpDir, '.cursor', 'rules', `r${i}.mdc`), ''),
      ),
    )
    const start = Date.now()
    const byFile = await structuralByFile()
    expect(Object.keys(byFile)).toHaveLength(3_000)
    expect(Date.now() - start).toBeLessThan(15_000)
  }, 60_000)

  it('caps @import read attempts', async () => {
    const imports = Array.from({ length: 1_000 }, (_, i) => `@docs/missing-${i}.md`).join('\n')
    await write('CLAUDE.md', imports)
    const start = Date.now()
    expect(await structuralByFile()).toEqual({ 'CLAUDE.md': STRUCTURAL.slice().sort() })
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('keeps findings that the delegated file does not share', async () => {
    await write('AGENTS.md', 'Ask before changing auth. Run `pnpm test`.')
    await write('CLAUDE.md', 'Follow AGENTS.md.\n## Final report\nFiles changed, commands run.')
    expect(await structuralByFile()).toEqual({ 'AGENTS.md': ['final-reporting'] })
  })
})
