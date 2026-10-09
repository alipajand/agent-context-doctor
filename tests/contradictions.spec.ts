import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { checkContradictions } from '../src/audit/checks/contradictions.js'
import { auditRepo } from '../src/audit/auditRepo.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-contra-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── unit: checkContradictions ────────────────────────────────────────────────

describe('checkContradictions', () => {
  it('detects same-file test contradiction → high issue', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Tests must pass before finishing.\nYou can skip tests if slow.',
      },
    ])
    expect(issues.length).toBeGreaterThan(0)
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
    expect(issue?.category).toBe('contradictions')
    expect(issue?.file).toBe('AGENTS.md')
  })

  it('detects cross-file security contradiction → high issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Ask before auth changes. Do not change authentication.' },
      { path: '.cursorrules', content: 'You may bypass auth in dev mode.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-security')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
    expect(issue?.file).toBe('multiple')
  })

  it('detects refactor contradiction → medium issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Minimal diff — avoid unrelated refactors.' },
      { path: '.cursorrules', content: 'Feel free to refactor everything.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-refactors')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('medium')
  })

  it('detects product-decisions contradiction → medium issue', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Do not make product decisions. Implementation agent only.' },
      { path: '.cursorrules', content: 'Make product decisions as needed.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-product-decisions')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('medium')
  })

  it('returns no issue when only strict phrases exist', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content:
          'Tests must pass. Always run tests before finishing. Minimal diff. Do not make product decisions.',
      },
    ])
    expect(issues).toHaveLength(0)
  })

  it('returns no issue when only opposing phrases exist', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Skip tests if slow. Refactor everything.' },
    ])
    expect(issues).toHaveLength(0)
  })

  it('returns no issues for empty file list', () => {
    expect(checkContradictions([])).toHaveLength(0)
  })

  it('includes evidence phrases in recommendation', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Always run tests before finishing.\nIgnore failing tests.',
      },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.recommendation).toMatch(/always run tests/i)
    expect(issue?.recommendation).toMatch(/ignore failing tests/i)
  })

  it('sets file to the path for same-file contradiction', () => {
    const issues = checkContradictions([
      { path: 'CLAUDE.md', content: 'Run tests before finishing. Skip tests.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.file).toBe('CLAUDE.md')
  })

  it('sets file to "multiple" for cross-file contradiction', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Minimal diff.' },
      { path: '.cursorrules', content: 'Rewrite the app.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-refactors')
    expect(issue?.file).toBe('multiple')
  })

  it('includes files array on every contradiction issue', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Tests must pass before finishing.\nYou can skip tests if slow.',
      },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.files).toBeDefined()
    expect(issue?.files).toContain('AGENTS.md')
  })

  it('includes files from both involved files in cross-file contradiction', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Ask before auth changes. Do not change authentication.' },
      { path: '.cursorrules', content: 'You may bypass auth in dev mode.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-security')
    expect(issue?.files).toContain('AGENTS.md')
    expect(issue?.files).toContain('.cursorrules')
  })

  it('includes human-readable evidence with file and phrase context', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Tests must pass. Skip tests if slow.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-tests')
    expect(issue?.evidence).toBeDefined()
    expect(issue?.evidence).toContain('AGENTS.md')
    expect(issue?.evidence).toContain('"')
    expect(issue?.evidence).toContain('vs')
  })

  it('cross-file contradiction evidence references both file names', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Minimal diff. Avoid unrelated refactors.' },
      { path: '.cursorrules', content: 'Refactor everything.' },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-refactors')
    expect(issue?.evidence).toContain('AGENTS.md')
    expect(issue?.evidence).toContain('.cursorrules')
  })

  it('detects same-file security contradiction', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Ask before security changes.\nYou can bypass auth for testing.',
      },
    ])
    const issue = issues.find((i) => i.id === 'contradiction-security')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
  })

  it('can detect multiple contradiction groups simultaneously', () => {
    const issues = checkContradictions([
      {
        path: 'AGENTS.md',
        content: 'Tests must pass.\nSkip tests if slow.\nMinimal diff.\nRefactor everything.',
      },
    ])
    expect(issues.some((i) => i.id === 'contradiction-tests')).toBe(true)
    expect(issues.some((i) => i.id === 'contradiction-refactors')).toBe(true)
  })
})

// ── integration via auditRepo ────────────────────────────────────────────────

describe('auditRepo contradiction integration', () => {
  it('surfaces test contradiction in full audit result', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run tests before finishing. Ask before auth changes.\npnpm test.\nFinal report: summary.\nSkip tests if slow.',
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find((i) => i.category === 'contradictions')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('high')
  })

  it('surfaces cross-file contradiction', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Tests must pass. Ask before auth changes. pnpm test. Final report: summary.',
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
    expect(issue?.file).toBe('multiple')
  })

  it('no contradiction issues when context is consistent', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run tests before finishing. Ask before auth changes. pnpm test. Final report: summary. Minimal diff.',
    )
    const result = await auditRepo(tmpDir)
    const contraIssues = result.issues.filter((i) => i.category === 'contradictions')
    expect(contraIssues).toHaveLength(0)
  })
})

describe('checkContradictions negation', () => {
  it('does not treat "never skip tests" as contradicting "always run tests"', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Always run tests before finishing.' },
      { path: 'CLAUDE.md', content: 'Never skip tests.' },
    ])
    expect(issues).toEqual([])
  })

  it('still reports a permissive opposing phrase on a later line', () => {
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: 'Always run tests before finishing.' },
      { path: 'CLAUDE.md', content: 'Never skip tests in CI.\nLocally you can skip tests.' },
    ])
    expect(issues.map((i) => i.id)).toContain('contradiction-tests')
  })
})

describe('checkContradictions package manager and skipped tests (#64)', () => {
  const groups = (files: Array<{ path: string; content: string }>) =>
    checkContradictions(files).map((i) => i.id)

  it('reports both contradictions in the issue #64 reproduction', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      '{"packageManager":"pnpm@9.12.0","scripts":{"test":"vitest run"}}',
    )
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n\nUse pnpm. Always run `pnpm test` before finishing. Never skip failing tests. Never push to main.\n\n## Final report\n\nFiles changed, commands run.\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'CLAUDE.md'),
      '# CLAUDE.md\n\n- Use npm for everything: `npm install`, `npm test`.\n- If the tests are slow, skip them and rely on CI.\n',
    )
    const result = await auditRepo(tmpDir)
    const issues = result.issues.filter((i) => i.category === 'contradictions')
    expect(issues.map((i) => [i.id, i.severity, i.files])).toEqual([
      ['contradiction-tests', 'high', ['AGENTS.md', 'CLAUDE.md']],
      ['contradiction-package-manager', 'medium', ['AGENTS.md', 'CLAUDE.md']],
    ])
    expect(issues[0].evidence).toContain(
      'CLAUDE.md: "If the tests are slow, skip them and rely on CI."',
    )
    expect(issues[1].evidence).toBe('AGENTS.md: "Use pnpm" vs CLAUDE.md: "Use npm"')
  })

  it.each([
    ['Always use pnpm.', 'We use yarn for installs.'],
    ['- Use bun for scripts.', 'Only use npm.'],
    ['The package manager is pnpm.', 'Use yarn.'],
    ['Package manager: `pnpm`', 'Always use npm.'],
    ['Use pnpm.', 'Never mind the old docs. Use npm.'],
    ['Use pnpm.', 'Do not use yarn. Use npm for everything.'],
  ])('reports equivalent wording: %s / %s', (a, b) => {
    expect(
      groups([
        { path: 'AGENTS.md', content: a },
        { path: 'CLAUDE.md', content: b },
      ]),
    ).toEqual(['contradiction-package-manager'])
  })

  it.each([
    ['Use pnpm.', 'Use pnpm, never npm.'],
    ['Use pnpm.', 'Do not use npm or yarn.'],
    ['Use pnpm.', 'Run the npm scripts defined in package.json.'],
    ['Use pnpm.', 'If you use yarn, delete yarn.lock first.'],
    ['Use pnpm.', 'The docs site uses npm.'],
    ['Use pnpm instead of npm.', 'Use pnpm for everything.'],
    ['Use pnpm.', 'Never "use npm for everything".'],
  ])('does not report complementary wording: %s / %s', (a, b) => {
    expect(
      groups([
        { path: 'AGENTS.md', content: a },
        { path: 'CLAUDE.md', content: b },
      ]),
    ).toEqual([])
  })

  it('ignores package manager preferences outside primary instruction files', () => {
    expect(
      groups([
        { path: 'AGENTS.md', content: 'Use pnpm.' },
        { path: path.join('examples', 'legacy', 'AGENTS.md'), content: 'Use yarn.' },
        { path: path.join('.claude', 'commands', 'release.md'), content: 'Use npm.' },
      ]),
    ).toEqual([])
  })

  it.each([
    ['Never skip failing tests.', 'If the tests are slow, skip them.'],
    ['Always run `pnpm test` before finishing.', 'Skip the tests when they are slow.'],
    ["Don't skip tests.", 'Tests can be skipped if they take too long.'],
    ['Tests must always pass.', 'Rely on CI instead of running the tests locally.'],
  ])('reports skipping tests against a rule to run them: %s / %s', (a, b) => {
    expect(
      groups([
        { path: 'AGENTS.md', content: a },
        { path: 'CLAUDE.md', content: b },
      ]),
    ).toEqual(['contradiction-tests'])
  })

  it.each([
    ['Always run tests before finishing.', 'Skip the e2e tests for documentation-only changes.'],
    ['Never skip failing tests.', 'Do not skip the tests when they are slow.'],
    ['Never skip failing tests.', 'Report which tests were skipped.'],
    ['Always run tests before finishing.', 'Never write "skip them if the tests are slow".'],
  ])('does not report a legitimate exception or agreement: %s / %s', (a, b) => {
    expect(
      groups([
        { path: 'AGENTS.md', content: a },
        { path: 'CLAUDE.md', content: b },
      ]),
    ).toEqual([])
  })

  it('handles hostile lines in linear time and bounds the evidence', () => {
    const start = Date.now()
    const issues = checkContradictions([
      { path: 'AGENTS.md', content: `Use pnpm. ${'never always use npm '.repeat(50_000)}` },
      { path: 'CLAUDE.md', content: `"${'we use npm '.repeat(90_000)}"` },
      { path: 'GEMINI.md', content: 'never skip tests '.repeat(60_000) },
    ])
    expect(Date.now() - start).toBeLessThan(5_000)
    expect(issues.every((i) => (i.evidence ?? '').length < 400)).toBe(true)
  })

  it('shows a padded phrase as one line of evidence', () => {
    const [issue] = checkContradictions([
      { path: 'AGENTS.md', content: 'Use pnpm.' },
      { path: 'CLAUDE.md', content: `we${' '.repeat(500_000)}use yarn` },
    ])
    expect(issue.evidence).toBe('AGENTS.md: "Use pnpm" vs CLAUDE.md: "we use yarn"')
  })

  it('can be suppressed in every involved file', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '<!-- acd-disable-file contradictions -->\nUse pnpm.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'CLAUDE.md'),
      '<!-- acd-disable-file contradictions -->\nUse npm for everything.',
    )
    const result = await auditRepo(tmpDir)
    expect(result.issues.some((i) => i.category === 'contradictions')).toBe(false)
  })
})
