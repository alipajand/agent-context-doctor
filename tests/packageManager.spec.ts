import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  checkPackageManagerAlignment,
  extractPackageManagerInvocations,
} from '../src/audit/checks/commandAlignment.js'
import { resolveExpectedPackageManager } from '../src/audit/packageManager.js'
import { auditRepo } from '../src/audit/auditRepo.js'

const pnpm = {
  manager: 'pnpm' as const,
  evidence: ['packageManager: pnpm@9.12.0', 'pnpm-lock.yaml'],
}

describe('resolveExpectedPackageManager', () => {
  it('uses packageManager when the lockfiles agree', () => {
    expect(resolveExpectedPackageManager('pnpm@9.12.0', ['pnpm-lock.yaml'])).toEqual(pnpm)
  })

  it('uses packageManager when there is no lockfile', () => {
    expect(resolveExpectedPackageManager('yarn@4.1.0', [])).toEqual({
      manager: 'yarn',
      evidence: ['packageManager: yarn@4.1.0'],
    })
  })

  it('uses a single lockfile when packageManager is missing', () => {
    expect(resolveExpectedPackageManager(null, ['yarn.lock'])).toEqual({
      manager: 'yarn',
      evidence: ['yarn.lock'],
    })
    expect(resolveExpectedPackageManager(null, ['bun.lockb', 'bun.lock'])?.manager).toBe('bun')
    expect(resolveExpectedPackageManager(null, ['npm-shrinkwrap.json'])?.manager).toBe('npm')
  })

  it.each([
    ['lockfiles disagree', null, ['pnpm-lock.yaml', 'package-lock.json']],
    ['packageManager disagrees with the lockfile', 'pnpm@9.12.0', ['yarn.lock']],
    ['no evidence', null, []],
    ['an unknown packageManager', 'deno@2.0.0', ['pnpm-lock.yaml']],
    ['a malformed packageManager', 'pnpm', ['pnpm-lock.yaml']],
    ['a packageManager with control characters', 'pnpm@9\u001b[31m', ['pnpm-lock.yaml']],
    ['an overlong packageManager', `pnpm@${'9'.repeat(5_000)}`, []],
  ])('returns null for %s', (_label, declared, lockfiles) => {
    expect(resolveExpectedPackageManager(declared, lockfiles)).toBeNull()
  })
})

describe('extractPackageManagerInvocations', () => {
  const managers = (content: string) =>
    extractPackageManagerInvocations(content).map((i) => `${i.manager}:${i.line}`)

  it('finds installs and script runs', () => {
    expect(
      managers('Run `yarn install`, then `yarn test`.\n```\nnpm run build\nbun add zod\n```'),
    ).toEqual(['yarn:1', 'npm:3', 'bun:4'])
  })

  it.each([
    ['a version spec', 'Pinned to `pnpm@9.12.0`; `npm@10` also works.'],
    ['a global install', 'Install the CLI with `npm install -g pnpm`.'],
    ['a yarn global add', 'Run `yarn global add serve`.'],
    ['a registry command', 'Publish with `npm publish` and check `npm view acd`.'],
    ['a one-off runner', 'Run `npx tsc` or `pnpm dlx tsc` or `bunx tsc`.'],
    ['a negated command', 'Do not run `npm install` here.'],
    ['a conditional for another manager', 'If you use yarn, run `yarn install` instead.'],
    ['prose', 'We moved from yarn to pnpm in 2024.'],
    ['a file name', 'Never edit `pnpm-lock.yaml` or `.npmrc` by hand.'],
    ['a scoped package', 'Import `@pnpm/logger`.'],
    ['an unknown npm subcommand', 'Run `npm lint`.'],
  ])('ignores %s', (_label, content) => {
    expect(managers(content)).toEqual([])
  })

  it.each([
    'Use `pnpm install` instead of `npm install`.',
    'Run `pnpm install` (not `yarn install`).',
    'Run `pnpm install`, never `npm install`.',
    'Use `pnpm test` or `npm test`.',
  ])('keeps only the preferred command when another is ruled out: %s', (content) => {
    expect(managers(content)).toEqual(['pnpm:1'])
  })

  it('accepts a Corepack hash suffix', () => {
    const declared = `pnpm@11.15.0+sha512.${'a1'.repeat(64)}`
    expect(resolveExpectedPackageManager(declared, [])?.manager).toBe('pnpm')
  })

  it('handles a hostile line in linear time', () => {
    const start = Date.now()
    extractPackageManagerInvocations(`Never ${'yarn add x '.repeat(100_000)}`)
    extractPackageManagerInvocations(`If you use yarn, ${'yarn add x '.repeat(100_000)}`)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('reports one invocation per manager and line', () => {
    expect(managers('Run `yarn install && yarn build && yarn test`.')).toEqual(['yarn:1'])
  })
})

describe('checkPackageManagerAlignment', () => {
  it('reports a command for another package manager', () => {
    const issues = checkPackageManagerAlignment('AGENTS.md', 'Run `yarn test`.', pnpm)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      severity: 'medium',
      category: 'command-alignment',
      file: 'AGENTS.md',
      line: 1,
      evidence: 'Run `yarn test`.',
      message: 'Instruction uses yarn, but this repository uses pnpm',
    })
    expect(issues[0].recommendation).toContain('packageManager: pnpm@9.12.0')
    expect(issues[0].recommendation).toContain('pnpm-lock.yaml')
  })

  it('reports each wrong manager once per file, at its first line', () => {
    const content = '```bash\nnpm run dev\nnpm run build\nyarn test\nnpm run lint\n```'
    const issues = checkPackageManagerAlignment('AGENTS.md', content, pnpm)
    expect(issues.map((i) => [i.line, i.message])).toEqual([
      [2, 'Instruction uses npm, but this repository uses pnpm'],
      [4, 'Instruction uses yarn, but this repository uses pnpm'],
    ])
    expect(issues[0].recommendation).toContain('on lines 2, 3, 5')
  })

  it('accepts commands for the expected package manager', () => {
    expect(
      checkPackageManagerAlignment('AGENTS.md', 'Run `pnpm install && pnpm test`.', pnpm),
    ).toEqual([])
  })

  it('reports nothing when the expected manager is unknown', () => {
    expect(checkPackageManagerAlignment('AGENTS.md', 'Run `yarn test`.', null)).toEqual([])
  })
})

describe('auditRepo package manager alignment (#63)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-pm-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function write(rel: string, content: string): Promise<void> {
    const full = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content)
  }

  const pmIssues = async () =>
    (await auditRepo(tmpDir)).issues.filter((i) => i.message.startsWith('Instruction uses '))

  const agents =
    '# AGENTS\n\nInstall with `yarn install`, then run `yarn test` before finishing. Never push to main.\n\n## Final report\n\nFiles changed, commands run.\n'

  it('reports the issue #63 reproduction', async () => {
    await write('package.json', '{"packageManager":"pnpm@9.12.0","scripts":{"test":"vitest run"}}')
    await write('pnpm-lock.yaml', "lockfileVersion: '9.0'\n")
    await write('AGENTS.md', agents)
    const issues = await pmIssues()
    expect(issues.map((i) => [i.file, i.line, i.message])).toEqual([
      ['AGENTS.md', 3, 'Instruction uses yarn, but this repository uses pnpm'],
    ])
    expect(issues[0].recommendation).toContain('packageManager: pnpm@9.12.0')
  })

  it('does not report pnpm@9.12.0 as a missing script (regression)', async () => {
    await write('package.json', '{"packageManager":"pnpm@9.12.0","scripts":{"test":"vitest run"}}')
    await write('AGENTS.md', 'The repo pins `pnpm@9.12.0`. Run `pnpm test`.')
    const result = await auditRepo(tmpDir)
    expect(result.issues.filter((i) => i.category === 'command-alignment')).toEqual([])
  })

  it('uses the only lockfile when packageManager is missing', async () => {
    await write('package.json', '{"scripts":{"test":"vitest run"}}')
    await write('yarn.lock', '')
    await write('AGENTS.md', 'Run `npm test`.')
    expect((await pmIssues()).map((i) => i.message)).toEqual([
      'Instruction uses npm, but this repository uses yarn',
    ])
  })

  it('reports nothing when the lockfiles conflict', async () => {
    await write('package.json', '{"scripts":{"test":"vitest run"}}')
    await write('yarn.lock', '')
    await write('package-lock.json', '{}')
    await write('AGENTS.md', 'Run `npm test` or `pnpm test`.')
    expect(await pmIssues()).toEqual([])
  })

  it('reports nothing without package.json, even with a lockfile', async () => {
    await write('pnpm-lock.yaml', '')
    await write('AGENTS.md', 'Run `yarn test`.')
    expect(await pmIssues()).toEqual([])
  })

  it('reports nothing for a malformed package.json', async () => {
    await write('package.json', '{"packageManager": ')
    await write('pnpm-lock.yaml', '')
    await write('AGENTS.md', 'Run `yarn test`.')
    expect(await pmIssues()).toEqual([])
  })

  it('checks workspace packages that share the root lockfile', async () => {
    await write('package.json', '{"packageManager":"pnpm@9.12.0","scripts":{}}')
    await write('pnpm-lock.yaml', '')
    await write('packages/web/package.json', '{"scripts":{"test":"vitest"}}')
    await write('packages/web/AGENTS.md', 'Run `npm test` here.')
    expect((await pmIssues()).map((i) => i.file.replace(/\\/g, '/'))).toEqual([
      'packages/web/AGENTS.md',
    ])
  })

  it('skips a nested project with its own lockfile or packageManager', async () => {
    await write('package.json', '{"packageManager":"pnpm@9.12.0","scripts":{}}')
    await write('pnpm-lock.yaml', '')
    await write('examples/yarn-app/yarn.lock', '')
    await write('examples/yarn-app/AGENTS.md', 'Run `yarn test`.')
    await write('tools/bun-cli/package.json', '{"packageManager":"bun@1.1.0"}')
    await write('tools/bun-cli/AGENTS.md', 'Run `bun test`.')
    expect(await pmIssues()).toEqual([])
  })

  it('does not read a lockfile symlink as evidence when it points outside', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(path.join(outside, 'yarn.lock'), '')
      await write('package.json', '{"scripts":{"test":"x"}}')
      await fs.symlink(path.join(outside, 'yarn.lock'), path.join(tmpDir, 'yarn.lock'))
      await write('AGENTS.md', 'Run `npm test`.')
      expect(await pmIssues()).toEqual([])
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('can be suppressed inline and disabled', async () => {
    await write('package.json', '{"packageManager":"pnpm@9.12.0","scripts":{"test":"x"}}')
    await write('AGENTS.md', '<!-- acd-disable-next-line command-alignment -->\nRun `yarn test`.')
    expect(await pmIssues()).toEqual([])
    await write('AGENTS.md', 'Run `yarn test`.')
    const result = await auditRepo(tmpDir, { disabledChecks: ['command-alignment'] })
    expect(result.issues.some((i) => i.category === 'command-alignment')).toBe(false)
  })

  it('lowers the score by one medium deduction per file and wrong manager', async () => {
    await write(
      'package.json',
      '{"packageManager":"pnpm@9.12.0","scripts":{"test":"x","build":"y"}}',
    )
    await write('AGENTS.md', 'Run `pnpm test`.')
    const before = (await auditRepo(tmpDir)).score.total
    await write('AGENTS.md', 'Run `pnpm test`.\nThen run `yarn test`.\nThen run `yarn build`.')
    const after = (await auditRepo(tmpDir)).score.total
    expect(before - after).toBe(8)
  })
})
