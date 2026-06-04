import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DIST_CLI = path.resolve('dist/cli.js')
const hasDist = existsSync(DIST_CLI)

// These tests only run after `pnpm build`. They are skipped when dist/ is absent
// so the main `pnpm test` pass (which runs before build in CI) is unaffected.
describe.skipIf(!hasDist)('CLI smoke tests (requires built dist/)', () => {
  it('--version prints a semver string and exits 0', () => {
    const result = spawnSync('node', [DIST_CLI, '--version'], { encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
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
