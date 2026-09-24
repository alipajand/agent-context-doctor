import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkAgentConfig, stripJsonComments } from '../src/audit/checks/agentConfig.js'
import { auditRepo } from '../src/audit/auditRepo.js'

const json = (value: unknown) => JSON.stringify(value, null, 2)
// Assembled at runtime so no credential-shaped literal is committed.
const fakeGithubToken = 'ghp' + '_' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'

describe('stripJsonComments', () => {
  it('removes comments and trailing commas outside strings', () => {
    const text = '{\n  // comment\n  "a": "x // not a comment", /* block */\n  "b": [1, 2,],\n}'
    expect(JSON.parse(stripJsonComments(text))).toEqual({ a: 'x // not a comment', b: [1, 2] })
  })

  it('keeps commas inside strings', () => {
    expect(JSON.parse(stripJsonComments('{"a": "x,}"}'))).toEqual({ a: 'x,}' })
  })
})

describe('checkAgentConfig — Claude Code settings', () => {
  const file = '.claude/settings.json'

  it('flags bypassPermissions as high', () => {
    const issues = checkAgentConfig(
      file,
      json({ permissions: { defaultMode: 'bypassPermissions' } }),
    )
    expect(issues[0]).toMatchObject({ severity: 'high', category: 'agent-config', line: 3 })
  })

  it.each(['Bash', 'Bash(*)', 'Bash(:*)'])('flags unrestricted shell permission %s', (rule) => {
    const issues = checkAgentConfig(file, json({ permissions: { allow: [rule] } }))
    expect(issues.map((i) => i.message)).toContain(
      `Claude Code permission "${rule}" lets the agent run any code without asking`,
    )
  })

  it('accepts scoped shell permissions', () => {
    expect(
      checkAgentConfig(
        file,
        json({ permissions: { allow: ['Bash(pnpm test:*)', 'Read'], deny: ['Read(./.env)'] } }),
      ),
    ).toEqual([])
  })

  it('flags enableAllProjectMcpServers as medium', () => {
    const [issue] = checkAgentConfig(file, json({ enableAllProjectMcpServers: true }))
    expect(issue.severity).toBe('medium')
  })

  it('flags a hardcoded credential in env without repeating it', () => {
    const [issue] = checkAgentConfig(file, json({ env: { DB_PASSWORD: 'hunter2hunter2x' } }))
    expect(issue.severity).toBe('high')
    expect(issue.evidence).not.toContain('hunter2hunter2x')
  })
})

describe('checkAgentConfig — MCP servers', () => {
  it('flags unpinned npx and uvx packages', () => {
    const issues = checkAgentConfig(
      '.mcp.json',
      json({
        mcpServers: {
          fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
          git: { command: 'uvx', args: ['mcp-server-git'] },
          latest: { command: 'npx', args: ['-y', 'some-server@latest'] },
        },
      }),
    )
    expect(issues.map((i) => i.message)).toEqual([
      'MCP server "fs" runs npx @modelcontextprotocol/server-filesystem without a pinned version',
      'MCP server "git" runs uvx mcp-server-git without a pinned version',
      'MCP server "latest" runs npx some-server@latest without a pinned version',
    ])
  })

  it('accepts pinned packages', () => {
    expect(
      checkAgentConfig(
        '.mcp.json',
        json({
          mcpServers: {
            fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@2.1.0'] },
            git: { command: 'uvx', args: ['mcp-server-git==0.6.2'] },
            local: { command: 'node', args: ['./server.js'] },
          },
        }),
      ),
    ).toEqual([])
  })

  it('flags plain-HTTP remote servers but not localhost', () => {
    const issues = checkAgentConfig(
      '.vscode/mcp.json',
      json({
        servers: {
          remote: { type: 'http', url: 'http://mcp.example.com/sse' },
          local: { type: 'http', url: 'http://localhost:3000/mcp' },
        },
      }),
    )
    expect(issues.map((i) => i.message)).toEqual([
      'MCP server "remote" connects over unencrypted HTTP',
    ])
  })

  it('flags hardcoded credentials in env and headers, reporting each line once', () => {
    const issues = checkAgentConfig(
      '.cursor/mcp.json',
      json({
        mcpServers: {
          gh: { command: 'node', args: ['s.js'], env: { GITHUB_TOKEN: fakeGithubToken } },
          api: { url: 'https://x.dev', headers: { Authorization: 'Bearer abcd1234efgh5678' } },
          ok: { command: 'node', args: ['s.js'], env: { API_KEY: '${env:API_KEY}' } },
        },
      }),
    )
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.severity === 'high')).toBe(true)
    expect(JSON.stringify(issues)).not.toContain(fakeGithubToken)
    expect(JSON.stringify(issues)).not.toContain('abcd1234efgh5678')
  })

  it('reads JSONC with comments', () => {
    const text = '{\n  // servers\n  "servers": { "r": { "url": "http://10.0.0.5/mcp", }, },\n}'
    expect(checkAgentConfig('.vscode/mcp.json', text)).toHaveLength(1)
  })

  it('reports invalid JSON as low', () => {
    expect(checkAgentConfig('.mcp.json', '{ nope')[0].severity).toBe('low')
  })
})

describe('auditRepo agent configuration', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-agentcfg-'))
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      'Run pnpm test. Ask before auth changes. Final report: files changed, commands run.',
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('audits committed agent configuration files', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'))
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'settings.json'),
      json({ permissions: { defaultMode: 'bypassPermissions' } }),
    )
    const result = await auditRepo(tmpDir)
    expect(result.issues.find((i) => i.category === 'agent-config')?.file).toBe(
      path.join('.claude', 'settings.json'),
    )
  })

  it('does not read a config symlinked from outside the repository', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'acd-outside-'))
    try {
      await fs.writeFile(
        path.join(outside, 'mcp.json'),
        json({ mcpServers: { x: { url: 'http://evil.example/mcp' } } }),
      )
      await fs.symlink(path.join(outside, 'mcp.json'), path.join(tmpDir, '.mcp.json'))
      const result = await auditRepo(tmpDir)
      expect(result.issues.some((i) => i.category === 'agent-config')).toBe(false)
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('can be disabled', async () => {
    await fs.writeFile(path.join(tmpDir, '.mcp.json'), '{ nope')
    const result = await auditRepo(tmpDir, { disabledChecks: ['agent-config'] })
    expect(result.issues.some((i) => i.category === 'agent-config')).toBe(false)
  })
})
