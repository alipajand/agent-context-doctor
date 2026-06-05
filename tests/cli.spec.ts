import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { VERSION } from '../src/version.js'
import type { AuditResult } from '../src/types.js'

const TSX = path.resolve('node_modules/.bin/tsx')
const CLI_SRC = path.resolve('src/cli.ts')
const DIST_CLI = path.resolve('dist/cli.js')
const hasDist = existsSync(DIST_CLI)

function runCli(args: string[], cwd?: string): SpawnSyncReturns<string> {
  return spawnSync(TSX, [CLI_SRC, ...args], { encoding: 'utf-8', cwd })
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-cli-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('version constant', () => {
  it('package.json version matches VERSION constant', async () => {
    const raw = await readFile(path.resolve('package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).toBe(VERSION)
  })
})

// ── CLI behavior via tsx (runs against src, no build required) ─────────────────

describe('acd --version', () => {
  it('prints the VERSION constant and exits 0', () => {
    const result = runCli(['--version'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(VERSION)
  })
})

describe('acd audit', () => {
  it('audits a clean repo and exits 0', () => {
    const result = runCli(['audit', path.resolve('examples/good-context')])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Agent Context Doctor')
  })

  it('writes an audit progress line to stderr in terminal mode', () => {
    const result = runCli(['audit', path.resolve('examples/good-context')])
    expect(result.stderr).toContain('Auditing')
  })

  it('emits valid JSON to stdout with --json', () => {
    const result = runCli(['audit', path.resolve('examples/good-context'), '--json'])
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as AuditResult
    expect(parsed.repoPath).toContain('good-context')
    expect(Array.isArray(parsed.issues)).toBe(true)
    expect(typeof parsed.score.total).toBe('number')
  })

  it('does not print the progress line in --json mode', () => {
    const result = runCli(['audit', path.resolve('examples/good-context'), '--json'])
    expect(result.stderr).not.toContain('Auditing')
  })

  it('exits non-zero with --fail-on high on a bad repo', () => {
    const result = runCli(['audit', path.resolve('examples/bad-context'), '--fail-on', 'high'])
    expect(result.status).not.toBe(0)
  })

  it('rejects an invalid --fail-on value', () => {
    const result = runCli(['audit', path.resolve('examples/good-context'), '--fail-on', 'bogus'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Invalid fail-on value')
  })

  it('writes a Markdown report with --output', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm test. Ask before auth changes. Final report: files changed.',
    )
    const result = runCli(['audit', tmpDir, '--output', 'report.md'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Markdown report written to')
    const md = await fs.readFile(path.join(tmpDir, 'report.md'), 'utf-8')
    expect(md).toContain('# Agent Context Doctor Report')
  })

  it('reports a config error and exits 1 on invalid .acdrc', async () => {
    await fs.writeFile(path.join(tmpDir, '.acdrc'), '{ not valid json')
    const result = runCli(['audit', tmpDir])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Config error')
  })

  it('honors failOn from .acdrc config', async () => {
    await fs.copyFile(
      path.resolve('examples/bad-context/AGENTS.md'),
      path.join(tmpDir, 'AGENTS.md'),
    )
    await fs.writeFile(path.join(tmpDir, '.acdrc'), JSON.stringify({ audit: { failOn: 'high' } }))
    const result = runCli(['audit', tmpDir])
    expect(result.status).not.toBe(0)
  })

  it('exits non-zero with --fail-on low when low issues exist', () => {
    const result = runCli(['audit', path.resolve('examples/good-context'), '--fail-on', 'low'])
    expect(result.status).not.toBe(0)
  })

  it('exits 0 with --fail-on low when the audit has no issues', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' } }),
    )
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      [
        '# AGENTS',
        'Run `pnpm test` and `pnpm lint`.',
        'Do not change auth without approval.',
        '## Final report',
        'Include files changed and commands run.',
      ].join('\n'),
    )
    const result = runCli(['audit', tmpDir, '--fail-on', 'low'])
    expect(result.status).toBe(0)
  })

  it('exits non-zero with --fail-on medium when medium issues exist', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# Agents\nDo stuff.\nFinal report: files changed.',
    )
    const result = runCli(['audit', tmpDir, '--fail-on', 'medium'])
    expect(result.status).not.toBe(0)
  })

  it('uses audit.json from .acdrc when --json flag is omitted', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm test. Ask before auth changes. Final report: files changed.',
    )
    await fs.writeFile(path.join(tmpDir, '.acdrc'), JSON.stringify({ audit: { json: true } }))
    const result = runCli(['audit', tmpDir])
    expect(result.status).toBe(0)
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  it('writes output from .acdrc when --output flag is omitted', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm test. Ask before auth changes. Final report: files changed.',
    )
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ audit: { output: 'docs/report.md' } }),
    )
    const result = runCli(['audit', tmpDir])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Markdown report written to')
    const md = await fs.readFile(path.join(tmpDir, 'docs', 'report.md'), 'utf-8')
    expect(md).toContain('# Agent Context Doctor Report')
  })
})

describe('acd list', () => {
  it('lists detected context files', () => {
    const result = runCli(['list', path.resolve('examples/good-context')])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('AGENTS.md')
    expect(result.stdout).toContain('[agents]')
  })

  it('reports when no context files are found', () => {
    const result = runCli(['list', tmpDir])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No agent context files found')
  })

  it('reports a config error and exits 1 on invalid .acdrc', async () => {
    await fs.writeFile(path.join(tmpDir, '.acdrc'), '{ broken')
    const result = runCli(['list', tmpDir])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Config error')
  })

  it('respects ignoreFiles from .acdrc', async () => {
    const archiveDir = path.join(tmpDir, 'prompts', 'archive')
    await fs.mkdir(archiveDir, { recursive: true })
    await fs.writeFile(path.join(archiveDir, 'old.md'), '# Old prompt')
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents')
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: ['prompts/archive/**'] } }),
    )
    const result = runCli(['list', tmpDir])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('AGENTS.md')
    expect(result.stdout).not.toContain('old.md')
  })
})

describe('acd init', () => {
  it('creates AGENTS.md and exits 0', async () => {
    const result = runCli(['init', tmpDir])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Created')
    const exists = await fs
      .access(path.join(tmpDir, 'AGENTS.md'))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })

  it('exits 1 when AGENTS.md already exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'existing')
    const result = runCli(['init', tmpDir])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('already exists')
  })

  it('overwrites with --force', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'old')
    const result = runCli(['init', tmpDir, '--force'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Overwrote')
    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(content).not.toBe('old')
  })

  it('prints the template without writing files with --print', async () => {
    const result = runCli(['init', tmpDir, '--print'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('## Scope')
    const exists = await fs
      .access(path.join(tmpDir, 'AGENTS.md'))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })
})

// These tests only run after `pnpm build`. They are skipped when dist/ is absent
// so the main `pnpm test` pass (which runs before build in CI) is unaffected.
describe.skipIf(!hasDist)('CLI smoke tests (requires built dist/)', () => {
  it('--version prints a semver string and exits 0', () => {
    const result = spawnSync('node', [DIST_CLI, '--version'], { encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('--version output matches VERSION constant', () => {
    const result = spawnSync('node', [DIST_CLI, '--version'], { encoding: 'utf-8' })
    expect(result.stdout.trim()).toBe(VERSION)
  })

  it('audit --help exits 0 and mentions "audit"', () => {
    const result = spawnSync('node', [DIST_CLI, 'audit', '--help'], { encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('audit')
  })

  it('audit --help mentions --json flag', () => {
    const result = spawnSync('node', [DIST_CLI, 'audit', '--help'], { encoding: 'utf-8' })
    expect(result.stdout).toContain('--json')
  })

  it('audit --help mentions --output flag', () => {
    const result = spawnSync('node', [DIST_CLI, 'audit', '--help'], { encoding: 'utf-8' })
    expect(result.stdout).toContain('--output')
  })

  it('audit --help mentions --fail-on flag', () => {
    const result = spawnSync('node', [DIST_CLI, 'audit', '--help'], { encoding: 'utf-8' })
    expect(result.stdout).toContain('--fail-on')
  })

  it('auditing good-context exits 0', () => {
    const result = spawnSync('node', [DIST_CLI, 'audit', 'examples/good-context'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
  })

  it('auditing bad-context with --fail-on high exits non-zero', () => {
    const result = spawnSync(
      'node',
      [DIST_CLI, 'audit', 'examples/bad-context', '--fail-on', 'high'],
      { encoding: 'utf-8' },
    )
    expect(result.status).not.toBe(0)
  })
})
