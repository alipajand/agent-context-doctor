import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  extractCommands,
  checkCommandAlignment,
  checkCommandsWithoutPackageJson,
} from '../src/audit/checks/commandAlignment.js'
import { auditRepo } from '../src/audit/auditRepo.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-cmd-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── extractCommands ──────────────────────────────────────────────────────────

describe('extractCommands', () => {
  it('extracts pnpm test from inline text', () => {
    const cmds = extractCommands('Run `pnpm test` before submitting.')
    expect(cmds.some((c) => c.script === 'test')).toBe(true)
  })

  it('extracts pnpm run validate from inline text', () => {
    const cmds = extractCommands('Use `pnpm run validate` to check.')
    expect(cmds.some((c) => c.script === 'validate')).toBe(true)
  })

  it('extracts command from fenced code block', () => {
    const content = '```bash\npnpm run deploy\n```'
    const cmds = extractCommands(content)
    expect(cmds.some((c) => c.script === 'deploy')).toBe(true)
  })

  it('normalizes npm run test to test', () => {
    const cmds = extractCommands('Run `npm run test` to verify.')
    expect(cmds.some((c) => c.script === 'test')).toBe(true)
  })

  it('normalizes yarn lint to lint', () => {
    const cmds = extractCommands('Run `yarn lint` to check style.')
    expect(cmds.some((c) => c.script === 'lint')).toBe(true)
  })

  it('normalizes bun run build to build', () => {
    const cmds = extractCommands('Build with `bun run build`.')
    expect(cmds.some((c) => c.script === 'build')).toBe(true)
  })

  it('does not flag pnpm install as a script', () => {
    const cmds = extractCommands('First run `pnpm install`.')
    expect(cmds.some((c) => c.script === 'install')).toBe(false)
  })

  it('does not flag yarn install as a script', () => {
    const cmds = extractCommands('Run `yarn install` first.')
    expect(cmds.some((c) => c.script === 'install')).toBe(false)
  })

  it('includes line numbers', () => {
    const cmds = extractCommands('line1\nline2\npnpm test\nline4')
    const found = cmds.find((c) => c.script === 'test')
    expect(found?.line).toBe(3)
  })

  it('handles multiple commands on different lines', () => {
    const content = 'pnpm test\npnpm lint\npnpm build'
    const cmds = extractCommands(content)
    const scripts = cmds.map((c) => c.script)
    expect(scripts).toContain('test')
    expect(scripts).toContain('lint')
    expect(scripts).toContain('build')
  })
})

// ── checkCommandAlignment ───────────────────────────────────────────────────

describe('checkCommandAlignment', () => {
  it('returns no issue when pnpm test exists in scripts', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `pnpm test`', { test: 'vitest run' })
    expect(issues).toHaveLength(0)
  })

  it('returns medium issue when pnpm validate is missing from scripts', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `pnpm validate`', {
      test: 'vitest run',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('medium')
    expect(issues[0].category).toBe('command-alignment')
    expect(issues[0].message).toContain('validate')
  })

  it('returns medium issue when npm run build maps to missing build script', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `npm run build`', {
      test: 'jest',
    })
    expect(issues.some((i) => i.message.includes('build'))).toBe(true)
    expect(issues[0].severity).toBe('medium')
  })

  it('does not flag pnpm install', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `pnpm install` first.', {
      test: 'vitest',
    })
    expect(issues).toHaveLength(0)
  })

  it('includes line number and file in issue', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'line1\npnpm run deploy\nline3', {
      test: 'vitest',
    })
    expect(issues[0].file).toBe('AGENTS.md')
    expect(issues[0].line).toBe(2)
  })

  it('recommendation mentions the missing script name', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `pnpm validate`', { test: 'jest' })
    expect(issues[0].recommendation).toContain('validate')
  })

  it('includes evidence containing the referenced command', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'Run `pnpm validate` before merging', {
      test: 'jest',
    })
    expect(issues[0].evidence).toBeDefined()
    expect(issues[0].evidence).toContain('pnpm validate')
  })

  it('evidence reflects the full line content trimmed', () => {
    const issues = checkCommandAlignment('AGENTS.md', 'line1\n  pnpm run deploy  \nline3', {
      test: 'jest',
    })
    expect(issues[0].evidence).toBe('pnpm run deploy')
  })

  it('no issues when all mentioned scripts exist', () => {
    const issues = checkCommandAlignment(
      'AGENTS.md',
      'Run `pnpm test`, `pnpm lint`, `pnpm build`',
      { test: 'vitest', lint: 'eslint .', build: 'tsc' },
    )
    expect(issues).toHaveLength(0)
  })
})

// ── checkCommandsWithoutPackageJson ─────────────────────────────────────────

describe('checkCommandsWithoutPackageJson', () => {
  it('creates a low issue when package manager commands are present but no package.json', () => {
    const issues = checkCommandsWithoutPackageJson('AGENTS.md', 'Run `pnpm test` to verify.')
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('low')
    expect(issues[0].category).toBe('command-alignment')
  })

  it('returns no issues when content has no package manager commands', () => {
    const issues = checkCommandsWithoutPackageJson(
      'AGENTS.md',
      'Ask before changing auth. Final report: list files.',
    )
    expect(issues).toHaveLength(0)
  })
})

// ── integration via auditRepo ───────────────────────────────────────────────

describe('auditRepo command alignment integration', () => {
  it('flags missing validate script when AGENTS.md mentions pnpm validate', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' } }),
    )
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `# AGENTS\nRun \`pnpm validate\` before submitting.\nDo not change auth.\nFinal report: files changed.`,
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find(
      (i) => i.category === 'command-alignment' && i.message.includes('validate'),
    )
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('medium')
  })

  it('does not flag pnpm test when test script exists', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `# AGENTS\nRun \`pnpm test\`.\nDo not change auth.\nFinal report: files changed.`,
    )
    const result = await auditRepo(tmpDir)
    const cmdIssues = result.issues.filter((i) => i.category === 'command-alignment')
    expect(cmdIssues).toHaveLength(0)
  })

  it('emits low issue when no package.json exists but commands are mentioned', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `# AGENTS\nRun \`pnpm test\`.\nDo not change auth.\nFinal report: files changed.`,
    )
    const result = await auditRepo(tmpDir)
    const issue = result.issues.find(
      (i) => i.category === 'command-alignment' && i.severity === 'low',
    )
    expect(issue).toBeDefined()
  })
})
