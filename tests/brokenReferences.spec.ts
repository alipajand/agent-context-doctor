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
})
