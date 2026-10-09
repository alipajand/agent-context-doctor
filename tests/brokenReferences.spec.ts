import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  checkBrokenReferences,
  extractFileReferences,
} from '../src/audit/checks/brokenReferences.js'
import { auditRepo } from '../src/audit/auditRepo.js'

const targets = (content: string) => extractFileReferences(content).map((r) => r.target)

describe('extractFileReferences', () => {
  it('reads Markdown links, inline-code paths, and @imports', () => {
    const content = [
      'See [architecture](docs/ARCHITECTURE.md#layers).',
      'Checks live in `src/audit/checks/`.',
      'Config: `./config/app.json`.',
      '@docs/style.md',
    ].join('\n')
    expect(targets(content)).toEqual([
      'docs/ARCHITECTURE.md',
      'src/audit/checks/',
      './config/app.json',
      'docs/style.md',
    ])
  })

  it.each([
    'Visit [site](https://example.com/docs.md).',
    'Jump to [section](#setup).',
    'Mail [me](mailto:a@b.co).',
    'Edit `index.ts` carefully.',
    'Import from `../../types.js`.',
    'Clone `alipajand/agent-context-doctor`.',
    'Install `@scope/pkg`.',
    'Put it in `path/to/file.ts`.',
    'Match `src/**/*.ts`.',
    'Ignore `node_modules/foo/index.js`.',
    'Email me at dev@example.com.',
  ])('ignores non-references: %s', (line) => {
    expect(targets(line)).toEqual([])
  })

  it('handles hostile lines in linear time', () => {
    const start = Date.now()
    extractFileReferences('['.repeat(200_000))
    extractFileReferences(`[a](b "${'x'.repeat(200_000)}`)
    extractFileReferences('[]('.repeat(350_000))
    extractFileReferences(`\`a/${'.'.repeat(600)}\` `.repeat(2_000))
    extractFileReferences(`\`a${'.'.repeat(200_000)}x\``)
    extractFileReferences(`\`./${'.'.repeat(200_000)}x\``)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('skips fenced code blocks', () => {
    expect(targets('```bash\ncat `docs/missing.md`\n```')).toEqual([])
  })

  it('keeps explicit relative Markdown links', () => {
    expect(targets('[up](../README.md)')).toEqual(['../README.md'])
  })
})

describe('checkBrokenReferences', () => {
  it('reports only the missing targets with line numbers', () => {
    const content = 'See `docs/a.md`.\nAnd `docs/b.md`.'
    const issues = checkBrokenReferences('AGENTS.md', content, new Set(['docs/b.md']))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ line: 2, severity: 'medium', category: 'broken-references' })
  })
})

describe('auditRepo broken references', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-refs-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function write(rel: string, content = 'x'): Promise<void> {
    const full = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content)
  }

  const refIssues = async () =>
    (await auditRepo(tmpDir)).issues.filter((i) => i.category === 'broken-references')

  it('flags a reference to a file that does not exist', async () => {
    await write('AGENTS.md', 'Read `docs/ARCHITECTURE.md` first.')
    const issues = await refIssues()
    expect(issues.map((i) => i.message)).toEqual([
      'Instruction references a file that does not exist: "docs/ARCHITECTURE.md"',
    ])
  })

  it('accepts files that exist, relative to the root or the file', async () => {
    await write('docs/ARCHITECTURE.md')
    await write('packages/web/notes.md')
    await write('AGENTS.md', 'Read `docs/ARCHITECTURE.md`.')
    await write('packages/web/AGENTS.md', 'See [notes](./notes.md).')
    expect(await refIssues()).toEqual([])
  })

  it('treats a .js reference as found when the .ts source exists', async () => {
    await write('src/audit/auditRepo.ts')
    await write('AGENTS.md', 'Entry point: `src/audit/auditRepo.js`.')
    expect(await refIssues()).toEqual([])
  })

  it('does not probe paths outside the repository', async () => {
    await write('AGENTS.md', 'See [secret](../../../../etc/hosts.md).')
    expect(await refIssues()).toEqual([])
  })

  it('can be disabled', async () => {
    await write('AGENTS.md', 'Read `docs/missing.md`.')
    const result = await auditRepo(tmpDir, { disabledChecks: ['broken-references'] })
    expect(result.issues.some((i) => i.category === 'broken-references')).toBe(false)
  })

  describe('root-level file names in backticks (#66)', () => {
    it('reports the issue #66 reproduction: `RELEASING.md` and `docs/ARCHITECTURE.md`', async () => {
      await write(
        'AGENTS.md',
        'Release steps live in `RELEASING.md`. Read `docs/ARCHITECTURE.md` first. Run `npm test`.',
      )
      const issues = await refIssues()
      expect(issues.map((i) => i.message).sort()).toEqual([
        'Instruction references a file that does not exist: "RELEASING.md"',
        'Instruction references a file that does not exist: "docs/ARCHITECTURE.md"',
      ])
    })

    it.each([
      'README.md',
      'ARCHITECTURE.md',
      'config.json',
      'pyproject.toml',
      'deploy.sh',
      '.prettierrc.yaml',
    ])('reports a missing root-level `%s`', async (name) => {
      await write('AGENTS.md', `See \`${name}\` before you start.`)
      expect((await refIssues()).map((i) => i.line)).toEqual([1])
    })

    it('accepts a root-level name that exists', async () => {
      await write('RELEASING.md')
      await write('AGENTS.md', 'Release steps live in `RELEASING.md`.')
      expect(await refIssues()).toEqual([])
    })

    it('accepts a bare name that exists next to the referencing file', async () => {
      await write('packages/web/SETUP.md')
      await write('packages/web/AGENTS.md', 'Read `SETUP.md` first.')
      expect(await refIssues()).toEqual([])
    })

    it('accepts a bare name that exists elsewhere in the repository', async () => {
      await write('packages/api/package.json', '{}')
      await write('AGENTS.md', 'Each package declares its scripts in `package.json`.')
      expect(await refIssues()).toEqual([])
    })

    it.each([
      'Call `config.get` to read settings.',
      'Edit `index.ts` carefully.',
      'Set `foo.json` to whatever you need.',
      'Run `node.js` scripts with tsx.',
      'Open `localhost:3000`.',
      'Match `*.md` files.',
      'Write `.md` files.',
    ])('does not treat a code identifier as a root-level file: %s', async (line) => {
      await write('AGENTS.md', line)
      expect(await refIssues()).toEqual([])
    })

    it('still ignores bare names inside fenced code blocks', async () => {
      await write('AGENTS.md', '```bash\ncat `RELEASING.md`\n```')
      expect(await refIssues()).toEqual([])
    })

    it('still reports root-level Markdown links', async () => {
      await write('AGENTS.md', 'See [releasing](RELEASING.md).')
      expect((await refIssues()).map((i) => i.line)).toEqual([1])
    })
  })

  describe('ignored and excluded paths (#62)', () => {
    it('does not report the issue #62 reproduction: paths described as ignored', async () => {
      await write(
        'AGENTS.md',
        'Run `npm test`.\n\n`.gitignore` excludes `.idea/` and `.serena/`.\n',
      )
      expect(await refIssues()).toEqual([])
    })

    it.each([
      'Editor state in `.idea/` is git-ignored.',
      'Generated files under `out/reports/` are ignored by git.',
      'Do not commit `.serena/`; it is untracked.',
      'Local settings in `config/local.json` are not checked in.',
      'The build excludes `scratch/notes.md`.',
    ])('does not report paths on a line that describes them as excluded: %s', async (line) => {
      await write('AGENTS.md', line)
      expect(await refIssues()).toEqual([])
    })

    it('limits the exclusion wording to its own sentence', async () => {
      await write(
        'AGENTS.md',
        'Read `docs/missing.md` first. `public/` is generated and gitignored.',
      )
      expect((await refIssues()).map((i) => i.message)).toEqual([
        'Instruction references a file that does not exist: "docs/missing.md"',
      ])
    })

    it('does not read "ignored" as a verb about something else as exclusion', async () => {
      await write('AGENTS.md', 'The old menu ignored `hidden`, and the decks live in `decks/`.')
      expect((await refIssues()).map((i) => i.message)).toEqual([
        'Instruction references a file that does not exist: "decks/"',
      ])
    })

    it('does not report a directory that the root .gitignore matches', async () => {
      await write('.gitignore', '# editors\n.idea/\n/.serena/\n*.log\n')
      await write('AGENTS.md', 'IDE settings live in `.idea/` and `.serena/`.')
      expect(await refIssues()).toEqual([])
    })

    it('still reports a gitignored file used as an ordinary reference', async () => {
      await write('.gitignore', 'config/local.json\n')
      await write('AGENTS.md', 'Read `config/local.json` before you start.')
      expect((await refIssues()).map((i) => i.message)).toEqual([
        'Instruction references a file that does not exist: "config/local.json"',
      ])
    })

    it('still reports a missing directory that .gitignore does not match', async () => {
      await write('.gitignore', '.idea/\n')
      await write('AGENTS.md', 'Checks live in `src/checks/`.')
      expect((await refIssues()).map((i) => i.line)).toEqual([1])
    })

    it('respects negated .gitignore patterns', async () => {
      await write('.gitignore', 'generated/*\n!generated/keep/\n')
      await write('AGENTS.md', 'See `generated/keep/`.')
      expect((await refIssues()).map((i) => i.line)).toEqual([1])
    })

    it('does not read a .gitignore that links outside the repository', async () => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
      try {
        await fs.writeFile(path.join(outside, 'gitignore'), 'src/\n')
        await fs.symlink(path.join(outside, 'gitignore'), path.join(tmpDir, '.gitignore'))
        await write('AGENTS.md', 'Checks live in `src/checks/`.')
        expect((await refIssues()).map((i) => i.line)).toEqual([1])
      } finally {
        await fs.rm(outside, { recursive: true, force: true })
      }
    })
  })
})
