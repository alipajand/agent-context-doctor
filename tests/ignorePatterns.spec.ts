import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  MAX_BRACE_DEPTH,
  MAX_BRACE_EXPANSIONS,
  assertSafeIgnorePatterns,
  unsafeIgnorePatternReason,
} from '../src/config/ignorePatterns.js'
import { loadConfig } from '../src/config/loadConfig.js'
import { auditRepo } from '../src/audit/auditRepo.js'
import { findContextFiles } from '../src/fs/findFiles.js'

// GHSA-vfj7-8cjw-p6xm: `braces` recurses once per nesting level. This pattern is
// 6,001 characters, under the 10,000-character limit in `braces`, and exhausts
// the stack in `braces` when Node runs with a smaller stack.
const DEEP = '{'.repeat(3000) + 'a' + '}'.repeat(3000)

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-ignore-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('unsafeIgnorePatternReason', () => {
  it('rejects deeply nested braces under the braces length limit', () => {
    expect(DEEP.length).toBeLessThan(10_000)
    expect(unsafeIgnorePatternReason(DEEP)).toMatch(/nests braces more than 10 levels/)
    expect(unsafeIgnorePatternReason('{a,'.repeat(2000) + 'a' + '}'.repeat(2000))).toMatch(
      /nests braces/,
    )
  })

  it('accepts nesting up to the limit and rejects one level more', () => {
    const nested = (n: number) => '{a,'.repeat(n) + 'b' + '}'.repeat(n)
    expect(unsafeIgnorePatternReason(nested(MAX_BRACE_DEPTH))).toBeUndefined()
    expect(unsafeIgnorePatternReason(nested(MAX_BRACE_DEPTH + 1))).toMatch(/nests braces/)
  })

  it('rejects sibling groups that multiply past the expansion limit', () => {
    expect(unsafeIgnorePatternReason('{a,b}'.repeat(9))).toBeUndefined() // 512
    expect(unsafeIgnorePatternReason('{a,b}'.repeat(11))).toMatch(
      new RegExp(`more than ${MAX_BRACE_EXPANSIONS} patterns`),
    ) // 2048
    expect(unsafeIgnorePatternReason('{a,b}'.repeat(20))).toMatch(/more than/) // 1,048,576
  })

  it('counts ranges and rejects oversized ones', () => {
    expect(unsafeIgnorePatternReason('v{1..5}/*.md')).toBeUndefined()
    expect(unsafeIgnorePatternReason('{a..z}{a..z}/**')).toBeUndefined() // 676
    expect(unsafeIgnorePatternReason('{1..2000}')).toMatch(/more than/)
    expect(unsafeIgnorePatternReason('{0..9990..10}')).toBeUndefined() // exactly 1000
    expect(unsafeIgnorePatternReason('{0..10000..10}')).toMatch(/more than/) // 1001
  })

  it('accepts ordinary glob patterns', () => {
    for (const pattern of [
      'docs/prompts/legacy/**',
      '**/*.md',
      '.cursor/rules/old-*.mdc',
      'prompts/archive/**',
      '!keep.md',
      '**/node_modules/**',
      '@(a|b)/*.md',
      '[abc]*.md',
    ]) {
      expect(unsafeIgnorePatternReason(pattern), pattern).toBeUndefined()
    }
  })

  it('accepts existing brace patterns', () => {
    for (const pattern of [
      'docs/{a,b}/**',
      '{docs,notes}/**/*.{md,mdc}',
      'a/{b,{c,d}}/*',
      '{,old-}prompts/**',
      '.github/{prompts,instructions}/**/*.md',
    ]) {
      expect(unsafeIgnorePatternReason(pattern), pattern).toBeUndefined()
    }
  })

  it('handles malformed and escaped input without throwing', () => {
    for (const pattern of [
      '',
      'docs/{a,b',
      'docs/a,b}',
      '}}}{{{',
      '\\{'.repeat(50) + 'a',
      '{'.repeat(9) + 'a',
      '\\',
      'a{}b',
    ]) {
      expect(() => unsafeIgnorePatternReason(pattern), pattern).not.toThrow()
      expect(unsafeIgnorePatternReason(pattern), pattern).toBeUndefined()
    }
    // An unclosed brace is literal, but the groups inside it still expand.
    expect(unsafeIgnorePatternReason('{' + '{a,b}'.repeat(11))).toMatch(/more than/)
    expect(unsafeIgnorePatternReason('{'.repeat(MAX_BRACE_DEPTH + 1) + 'a')).toMatch(/nests/)
  })
})

describe('assertSafeIgnorePatterns', () => {
  it('names the offending entry', () => {
    expect(() => assertSafeIgnorePatterns(['docs/**', DEEP])).toThrow(
      'ignoreFiles[1] nests braces more than 10 levels deep',
    )
    expect(() => assertSafeIgnorePatterns(['docs/**', '{a,b}'])).not.toThrow()
  })
})

describe('.acdrc ignoreFiles validation', () => {
  it('rejects an unsafe pattern as a config error', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: [DEEP] } }),
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow(
      /failed validation:\n\s+rules\.ignoreFiles\.0: pattern nests braces/,
    )
  })

  it('rejects a non-string pattern', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: [42] } }),
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow('failed validation')
  })

  it('still loads brace patterns', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: ['{docs,notes}/**/*.{md,mdc}'] } }),
    )
    const config = await loadConfig(tmpDir)
    expect(config?.rules?.ignoreFiles).toEqual(['{docs,notes}/**/*.{md,mdc}'])
  })
})

describe('ignore patterns at audit time', () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents\n')
    for (const dir of ['docs', 'notes', 'keep']) {
      await fs.mkdir(path.join(tmpDir, dir, '.claude', 'commands'), { recursive: true })
      await fs.writeFile(path.join(tmpDir, dir, 'AGENTS.md'), `# ${dir}\n`)
    }
  })

  it('applies brace ignore patterns as before', async () => {
    const files = await findContextFiles(tmpDir, ['{docs,notes}/**'])
    const rel = files.map((f) => path.relative(tmpDir, f)).sort()
    expect(rel).toEqual(['AGENTS.md', path.join('keep', 'AGENTS.md')])
  })

  it('rejects an unsafe pattern from the library API with an ordinary error', async () => {
    await expect(findContextFiles(tmpDir, [DEEP])).rejects.toThrow(/ignoreFiles\[0\] nests braces/)
    await expect(auditRepo(tmpDir, { ignoreFiles: ['{a,b}'.repeat(20)] })).rejects.toThrow(
      /ignoreFiles\[0\] expands to more than/,
    )
  })
})

describe('CLI with an unsafe .acdrc pattern and a small stack', () => {
  it('exits 1 with a config error instead of exhausting the stack', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents\n')
    await fs.writeFile(
      path.join(tmpDir, '.acdrc'),
      JSON.stringify({ rules: { ignoreFiles: [DEEP] } }),
    )
    const result = spawnSync(
      process.execPath,
      [
        '--stack-size=400',
        '--import',
        'tsx',
        path.resolve('src/cli.ts'),
        'audit',
        tmpDir,
        '--json',
      ],
      { encoding: 'utf-8' },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Config error')
    expect(result.stderr).toContain('rules.ignoreFiles.0: pattern nests braces')
    expect(result.stderr).not.toContain('RangeError')
    expect(result.stderr).not.toContain('Maximum call stack')
  })
})
