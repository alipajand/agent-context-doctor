import type { ContextIssue, Severity } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { checkSecrets } from './secrets.js'

/** Agent configuration files checked by `checkAgentConfig`, relative to the repo root. */
export const AGENT_CONFIG_FILES = [
  '.claude/settings.json',
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  '.gemini/settings.json',
  '.roo/mcp.json',
] as const

type Finding = { severity: Severity; message: string; recommendation: string; needle?: string }

/**
 * Remove // and /* *\/ comments and trailing commas outside strings, so
 * JSONC files such as .vscode/mcp.json parse with JSON.parse.
 */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inString) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        i++
      } else if (char === '"') {
        inString = false
      }
    } else if (char === '"') {
      inString = true
      out += char
    } else if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (char === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'
        i++
      }
      i++
    } else if (char === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) {
      // Trailing comma: JSON.parse rejects it, JSONC allows it.
    } else {
      out += char
    }
  }
  return out
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

const UNRESTRICTED_SHELL = /^Bash(?:\((?:\*|:\*|\*:\*)?\))?$/

function claudeSettingsFindings(settings: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []
  const permissions = asRecord(settings.permissions)

  if (permissions?.defaultMode === 'bypassPermissions') {
    findings.push({
      severity: 'high',
      message: 'Claude Code is set to bypassPermissions: every tool runs without asking',
      recommendation:
        'Remove defaultMode "bypassPermissions" from the shared settings. Grant specific tools with permissions.allow instead.',
      needle: 'bypassPermissions',
    })
  }

  for (const rule of asStrings(permissions?.allow)) {
    if (UNRESTRICTED_SHELL.test(rule.replace(/\s+/g, ''))) {
      findings.push({
        severity: 'high',
        message: `Claude Code permission "${rule}" allows any shell command without asking`,
        recommendation:
          'Allow specific commands instead, for example "Bash(pnpm test:*)", and keep destructive commands behind a prompt.',
        needle: rule,
      })
    }
  }

  findings.push(...credentialFindings('Claude Code settings', asRecord(settings.env)))

  if (settings.enableAllProjectMcpServers === true) {
    findings.push({
      severity: 'medium',
      message: 'Claude Code auto-approves every MCP server defined in the repository',
      recommendation:
        'Remove enableAllProjectMcpServers and approve servers individually (enabledMcpjsonServers), so a new server added in a pull request is not trusted automatically.',
      needle: 'enableAllProjectMcpServers',
    })
  }

  return findings
}

// Launchers that download and run a package by name at start-up.
const PACKAGE_RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'uvx', 'pipx'])

function packageArgument(command: string, args: string[]): string | undefined {
  const rest =
    command === 'pnpm' || command === 'yarn' ? args.slice(args[0] === 'dlx' ? 1 : 0) : args
  return rest.find((arg) => !arg.startsWith('-'))
}

function isPinned(spec: string): boolean {
  // @scope/name@1.2.3, name@1.2.3, name==1.2.3 (uvx/pipx)
  const version = /^(@[^/]+\/[^@]+|[^@=]+)(?:@|==)(.+)$/.exec(spec)?.[2]
  return version !== undefined && /^\d/.test(version)
}

const CREDENTIAL_KEY = /token|secret|password|passwd|api[_-]?key|credential|^authorization$/i

// Values that defer to the environment or are clearly not a real secret.
function isLiteralCredential(value: string): boolean {
  if (value.length < 8) return false
  if (/\$\{|\$[A-Z_]|^env:|<|your[-_]|example|placeholder|changeme|xxx/i.test(value)) return false
  return !/^(?:true|false|null|\d+)$/i.test(value)
}

function credentialFindings(where: string, entries: Record<string, unknown> | null): Finding[] {
  const findings: Finding[] = []
  for (const [key, value] of Object.entries(entries ?? {})) {
    if (typeof value !== 'string' || !CREDENTIAL_KEY.test(key)) continue
    const secret = value.replace(/^Bearer\s+/i, '')
    if (!isLiteralCredential(secret)) continue
    findings.push({
      severity: 'high',
      message: `${where} hardcodes a credential in "${key}"`,
      recommendation:
        'Reference the credential through an environment variable (for example "${env:API_KEY}") instead of committing it, and rotate the exposed value.',
      needle: value,
    })
  }
  return findings
}

function mcpServerFindings(name: string, server: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [
    ...credentialFindings(`MCP server "${name}"`, asRecord(server.env)),
    ...credentialFindings(`MCP server "${name}"`, asRecord(server.headers)),
  ]
  const command =
    typeof server.command === 'string' ? (server.command.split(/[\\/]/).pop() ?? '') : ''
  const args = asStrings(server.args)
  const runsPackage =
    PACKAGE_RUNNERS.has(command) ||
    ((command === 'pnpm' || command === 'yarn') && args[0] === 'dlx')

  if (runsPackage) {
    const spec = packageArgument(command, args)
    if (spec && !isPinned(spec)) {
      findings.push({
        severity: 'medium',
        message: `MCP server "${name}" runs ${command} ${spec} without a pinned version`,
        recommendation:
          'Pin an exact version (for example name@1.2.3) so a new release of the package cannot change what runs with your agent.',
        needle: spec,
      })
    }
  }

  const url = typeof server.url === 'string' ? server.url : undefined
  if (
    url &&
    /^http:\/\//i.test(url) &&
    !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(url)
  ) {
    findings.push({
      severity: 'medium',
      message: `MCP server "${name}" connects over unencrypted HTTP`,
      recommendation: 'Use https:// for remote MCP servers.',
      needle: url,
    })
  }

  return findings
}

function lineOf(content: string, needle: string | undefined): number | undefined {
  if (!needle) return undefined
  const idx = content.split('\n').findIndex((line) => line.includes(needle))
  return idx === -1 ? undefined : idx + 1
}

/**
 * Risky settings in committed agent configuration: Claude Code permissions and
 * MCP server definitions. Hardcoded credentials are reported through the
 * secrets patterns, with redacted evidence.
 */
export function checkAgentConfig(filePath: string, content: string): ContextIssue[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(content))
  } catch {
    return [
      {
        id: `agent-config-invalid-${filePath}`,
        severity: 'low',
        category: 'agent-config',
        file: filePath,
        message: 'Agent configuration file is not valid JSON',
        recommendation: 'Fix the syntax so the agent and reviewers read the settings you intend.',
      },
    ]
  }

  const root = asRecord(parsed) ?? {}
  const findings: Finding[] = []

  if (filePath.replace(/\\/g, '/').endsWith('.claude/settings.json')) {
    findings.push(...claudeSettingsFindings(root))
  }

  const servers = asRecord(root.mcpServers) ?? asRecord(root.servers) ?? {}
  for (const [name, value] of Object.entries(servers)) {
    const server = asRecord(value)
    if (server) findings.push(...mcpServerFindings(name, server))
  }

  const secretIssues = checkSecrets(filePath, content).map((issue) => ({
    ...issue,
    id: issue.id.replace(/^secrets-/, 'agent-config-secret-'),
    category: 'agent-config',
    message: `${issue.message.replace(' in an agent instruction file', '')} in agent configuration`,
    recommendation:
      'Reference the credential through an environment variable (for example "${env:API_KEY}") instead of committing it, and rotate the exposed value.',
  }))

  const secretLines = new Set(secretIssues.map((i) => i.line))
  const issues: ContextIssue[] = []
  findings.forEach((finding, i) => {
    const line = lineOf(content, finding.needle)
    const isCredential = finding.severity === 'high' && finding.message.includes('hardcodes')
    if (isCredential && line !== undefined && secretLines.has(line)) return
    issues.push({
      id: `agent-config-${filePath}-${i}`,
      severity: finding.severity,
      category: 'agent-config',
      file: filePath,
      ...(line
        ? { line, evidence: evidenceFor(content, line, isCredential ? finding.needle : undefined) }
        : {}),
      message: finding.message,
      recommendation: finding.recommendation,
    })
  })

  return [...issues, ...secretIssues]
}

// Evidence for a credential finding must not repeat the value.
function evidenceFor(content: string, line: number, secret: string | undefined): string {
  const evidence = getLineEvidence(content, line)
  if (!secret) return evidence
  const masked = `${secret.slice(0, 4)}${'*'.repeat(Math.min(12, Math.max(0, secret.length - 4)))}`
  return evidence.split(secret).join(masked)
}
