import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../src/config/loadConfig.js'
import { auditRepo } from '../src/audit/auditRepo.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-config-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── loadConfig ───────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns null when no .acdrc exists', async () => {
    const config = await loadConfig(tmpDir)
    expect(config).toBeNull()
  })

  it('loads valid .acdrc', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({
        audit: { failOn: 'high' },
        rules: { disabledChecks: ['placeholder-content'] },
      }),
    )
    const config = await loadConfig(tmpDir)
    expect(config?.audit?.failOn).toBe('high')
    expect(config?.rules?.disabledChecks).toContain('placeholder-content')
  })

  it('throws on invalid JSON', async () => {
    await fs.writeFile(path.join(tmpDir, '.acdrc'), '{ invalid json }')
    await expect(loadConfig(tmpDir)).rejects.toThrow('not valid JSON')
  })

  it('throws on invalid failOn value', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ audit: { failOn: 'critical' } }),
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow('failed validation')
  })

  it('throws on unknown disabledChecks value', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { disabledChecks: ['nonexistent-check'] } }),
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow('failed validation')
  })

  it('accepts partial config with only rules', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: ['docs/prompts/legacy/**'] } }),
    )
    const config = await loadConfig(tmpDir)
    expect(config?.rules?.ignoreFiles).toContain('docs/prompts/legacy/**')
  })

  it('accepts empty object as valid config', async () => {
    await fs.writeFile(path.join(tmpDir, '.acdrc'), '{}')
    const config = await loadConfig(tmpDir)
    expect(config).toBeDefined()
  })
})

// ── ignoreFiles integration ──────────────────────────────────────────────────

describe('ignoreFiles', () => {
  it('excludes matched files from audit', async () => {
    const docsPrompts = path.join(tmpDir, 'docs', 'prompts')
    await fs.mkdir(docsPrompts, { recursive: true })
    await fs.writeFile(path.join(docsPrompts, 'legacy.md'), '# Legacy prompt\nTODO: update')
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm test. Ask before auth changes. Final report: files changed.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )

    // Without ignoreFiles — legacy.md placeholder issue appears
    const withoutIgnore = await auditRepo(tmpDir)
    const legacyIssues = withoutIgnore.issues.filter((i) => i.file.includes('legacy'))
    expect(legacyIssues.length).toBeGreaterThan(0)

    // With ignoreFiles — legacy.md excluded
    const withIgnore = await auditRepo(tmpDir, { ignoreFiles: ['docs/prompts/**'] })
    const legacyIssuesAfter = withIgnore.issues.filter((i) => i.file.includes('legacy'))
    expect(legacyIssuesAfter).toHaveLength(0)
    expect(withIgnore.files.find((f) => f.path.includes('legacy'))).toBeUndefined()
  })
})

// ── disabledChecks integration ───────────────────────────────────────────────

describe('disabledChecks', () => {
  it('disables placeholder-content check', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'TODO: fill this in.\nRun pnpm test.\nAsk before auth changes.\nFinal report: summary.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )

    const withCheck = await auditRepo(tmpDir)
    expect(withCheck.issues.some((i) => i.category === 'placeholder-content')).toBe(true)

    const withoutCheck = await auditRepo(tmpDir, { disabledChecks: ['placeholder-content'] })
    expect(withoutCheck.issues.some((i) => i.category === 'placeholder-content')).toBe(false)
  })

  it('disables multiple checks', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'TODO: fill this in.\nNo safety language here.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    )
    const result = await auditRepo(tmpDir, {
      disabledChecks: [
        'placeholder-content',
        'safety-boundaries',
        'validation-commands',
        'final-reporting',
        'command-alignment',
      ],
    })
    const categories = result.issues.map((i) => i.category)
    expect(categories).not.toContain('placeholder-content')
    expect(categories).not.toContain('safety-boundaries')
    expect(categories).not.toContain('command-alignment')
  })
})

// ── allowedMissingScripts integration ────────────────────────────────────────

describe('allowedMissingScripts', () => {
  it('suppresses command-alignment issue for allowed missing script', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm validate before submitting.\nAsk before auth changes.\nFinal report: files changed.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )

    // Without allowedMissingScripts — issue appears
    const without = await auditRepo(tmpDir)
    expect(without.issues.some((i) => i.message.includes('validate'))).toBe(true)

    // With allowedMissingScripts — issue suppressed
    const with_ = await auditRepo(tmpDir, { allowedMissingScripts: ['validate'] })
    expect(with_.issues.some((i) => i.message.includes('validate'))).toBe(false)
  })

  it('only suppresses the listed scripts, not others', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm validate and pnpm deploy.\nAsk before auth changes.\nFinal report: files changed.',
    )
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )

    const result = await auditRepo(tmpDir, { allowedMissingScripts: ['validate'] })
    expect(result.issues.some((i) => i.message.includes('validate'))).toBe(false)
    expect(result.issues.some((i) => i.message.includes('deploy'))).toBe(true)
  })
})
