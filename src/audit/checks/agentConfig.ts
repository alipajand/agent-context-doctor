import type { ContextIssue } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { checkSecrets } from './secrets.js'
import {
  asRecord,
  asStrings,
  claudeSettingsFindings,
  clip,
  referencedScripts,
  type ConfigFinding as Finding,
} from './claudeSettings.js'
import { findShellRisks } from './shellRisk.js'

/** Agent configuration files checked by `checkAgentConfig`, relative to the repo root. */
export const AGENT_CONFIG_FILES = [
  '.claude/settings.json',
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  '.gemini/settings.json',
  '.roo/mcp.json',
] as const

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
      secret: true,
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

  const commandLine = [typeof server.command === 'string' ? server.command : '', ...args].join(' ')
  for (const risk of findShellRisks(commandLine)) {
    if (risk.label.startsWith('runs a package')) continue
    findings.push({
      severity: risk.severity,
      message: `MCP server "${name}" ${risk.label} when it starts`,
      recommendation: 'Start MCP servers from a pinned package or a reviewed local script.',
      needle: typeof server.command === 'string' ? server.command : undefined,
    })
  }

  const headersHelper = typeof server.headersHelper === 'string' ? server.headersHelper : undefined
  if (headersHelper) {
    findings.push({
      severity: 'medium',
      message: `MCP server "${name}" runs "${clip(headersHelper)}" to produce request headers`,
      recommendation:
        'A headers helper runs on your machine each time the server connects. Keep it in user settings, or make sure it only reads a local credential.',
      needle: 'headersHelper',
    })
    for (const risk of findShellRisks(headersHelper)) {
      findings.push({
        severity: risk.severity,
        message: `MCP server "${name}" headersHelper ${risk.label}`,
        recommendation: 'Remove the command, or replace it with a reviewed local script.',
        needle: 'headersHelper',
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

// The quoted JSON form finds the value itself: a bare "~" would also match
// "Edit(~/.zshrc)" on an earlier line.
function lineOf(content: string, needle: string | undefined): number | undefined {
  if (!needle) return undefined
  const lines = content.split('\n')
  for (const form of [JSON.stringify(needle), needle]) {
    const idx = lines.findIndex((line) => line.includes(form))
    if (idx !== -1) return idx + 1
  }
  return undefined
}

/**
 * Risky settings in committed agent configuration: Claude Code permissions,
 * hooks, environment, and credential helpers, and MCP server definitions.
 * Hardcoded credentials are reported through the secrets patterns, with
 * redacted evidence.
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
    findings.push(...credentialFindings('Claude Code settings', asRecord(root.env)))
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
    const isCredential = finding.secret === true
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

/** Repository scripts that `.claude/settings.json` runs from hooks or the status line. */
export function claudeSettingsScripts(content: string): string[] {
  try {
    const settings = asRecord(JSON.parse(stripJsonComments(content)))
    return settings ? referencedScripts(settings) : []
  } catch {
    return []
  }
}
