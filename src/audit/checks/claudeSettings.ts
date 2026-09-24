import type { Severity } from '../../types.js'
import { findShellRisks } from './shellRisk.js'

export type ConfigFinding = {
  severity: Severity
  message: string
  recommendation: string
  /** Text to locate the line for evidence. */
  needle?: string
  /** Set when the needle is a secret that must not appear in evidence. */
  secret?: boolean
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// Programs that run whatever they are given, so allowing them with open
// arguments is the same as allowing every shell command. git and the package
// managers belong here too: `git -c core.pager=...` and `npm exec` run code.
const RUNS_ANYTHING = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'eval',
  'exec',
  'env',
  'xargs',
  'node',
  'deno',
  'bun',
  'python',
  'python3',
  'ruby',
  'perl',
  'php',
  'npx',
  'bunx',
  'pnpx',
  'npm',
  'pnpm',
  'yarn',
  'git',
  'make',
  'find',
  'docker',
])

const RUNNER_SUBCOMMANDS = new Set(['exec', 'dlx', 'x'])
const NETWORK = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'rsync', 'ftp'])

/** Inner command of a `Bash(...)` rule with trailing wildcards removed; '' means any command. */
function bashRuleCommand(rule: string): string | null {
  const compact = rule.trim()
  if (compact === 'Bash') return ''
  const inner = /^Bash\((.*)\)$/s.exec(compact)?.[1]
  if (inner === undefined) return null
  return inner.replace(/(?::\*|\s*\*)+\s*$/, '').trim()
}

function runsAnything(words: string[]): boolean {
  const program = (words[0] ?? '').replace(/^.*\//, '')
  if (program === '' || program === '*' || program === 'sudo' || program === 'su') return true
  if (!RUNS_ANYTHING.has(program)) return false
  // Only flags after the program (`node`, `bash -c`, `python -c`) leave the code open.
  const positional = words.slice(1).find((w) => !w.startsWith('-'))
  return positional === undefined || RUNNER_SUBCOMMANDS.has(positional)
}

export function allowRuleFindings(rule: string): ConfigFinding[] {
  const command = bashRuleCommand(rule)
  if (command !== null) {
    const words = command.split(/\s+/).filter(Boolean)
    const program = (words[0] ?? '').replace(/^.*\//, '')
    if (runsAnything(words)) {
      return [
        {
          severity: 'high',
          message: `Claude Code permission "${clip(rule)}" lets the agent run any code without asking`,
          recommendation:
            'Allow specific commands instead, for example "Bash(pnpm test:*)". Shells, interpreters, sudo, package runners, and bare git or package manager rules can run anything they are given.',
          needle: rule,
        },
      ]
    }
    if (NETWORK.has(program)) {
      return [
        {
          severity: 'medium',
          message: `Claude Code permission "${clip(rule)}" allows network requests without asking`,
          recommendation:
            'Keep network commands behind a prompt: an agent following injected instructions could send code or secrets out.',
          needle: rule,
        },
      ]
    }
    const destructive =
      (program === 'rm' && words.slice(1).every((w) => w.startsWith('-'))) ||
      (program === 'git' && /^git\s+(?:push|reset\s+--hard|clean\s+-\w*f)/.test(command)) ||
      program === 'dd' ||
      program === 'mkfs'
    if (destructive) {
      return [
        {
          severity: 'medium',
          message: `Claude Code permission "${clip(rule)}" allows destructive or publishing commands without asking`,
          recommendation:
            'Move this rule to permissions.ask so a person confirms deletions, pushes, and history rewrites.',
          needle: rule,
        },
      ]
    }
    return []
  }

  if (/^WebFetch(?:\(\s*\*?\s*\))?$/.test(rule.trim())) {
    return [
      {
        severity: 'medium',
        message: `Claude Code permission "${clip(rule)}" fetches any URL without asking`,
        recommendation:
          'Allow specific domains instead, for example "WebFetch(domain:docs.example.com)". Fetched pages can carry injected instructions, and URLs can carry data out.',
        needle: rule,
      },
    ]
  }

  const fileRule = /^(Read|Edit|Write|MultiEdit|NotebookEdit)\((.*)\)$/s.exec(rule.trim())
  if (fileRule && /^(?:~|\/\/|\$HOME)|(?:^|\/)\.\.(?:\/|$)/.test(fileRule[2].trim())) {
    const writes = fileRule[1] !== 'Read'
    return [
      {
        severity: writes ? 'high' : 'medium',
        message: `Claude Code permission "${clip(rule)}" lets the agent ${writes ? 'change' : 'read'} files outside the project without asking`,
        recommendation:
          'Scope file permissions to the project. Home and absolute paths expose SSH keys, cloud credentials, and other projects.',
        needle: rule,
      },
    ]
  }

  return []
}

function additionalDirectoryFindings(dirs: string[]): ConfigFinding[] {
  return dirs.flatMap((dir): ConfigFinding[] => {
    const trimmed = dir.trim().replace(/\/+$/, '')
    if (/^(?:|\/|~|\$HOME|\$\{HOME\}|[A-Za-z]:)$/.test(trimmed)) {
      return [
        {
          severity: 'high',
          message: `Claude Code additionalDirectories includes "${clip(dir)}", which opens the whole ${trimmed === '/' || trimmed === '' ? 'filesystem' : 'home directory'} to the agent`,
          recommendation: 'Remove it, or name the specific sibling directory the agent needs.',
          needle: dir,
        },
      ]
    }
    if (/^(?:\/|~|\$HOME)|(?:^|\/)\.\.(?:\/|$)/.test(trimmed)) {
      return [
        {
          severity: 'medium',
          message: `Claude Code additionalDirectories gives the agent access to "${clip(dir)}", outside the repository`,
          recommendation:
            'Committed settings apply to everyone who opens the project. Keep extra directories in .claude/settings.local.json instead.',
          needle: dir,
        },
      ]
    }
    return []
  })
}

const ENDPOINT_VARS = /^(?:ANTHROPIC(?:_BEDROCK|_VERTEX)?_BASE_URL|CLAUDE_CODE_API_BASE_URL)$/i
const PROXY_VARS = /^(?:https?_proxy|all_proxy)$/i
const ANTHROPIC_HOST = /^https:\/\/(?:[\w-]+\.)*anthropic\.com(?::\d+)?(?:\/|$)/i
const LOCAL_HOST = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i

function isEnvReference(value: string): boolean {
  return /^\$\{?[A-Za-z_]\w*(?::-[^}]*)?\}?$/.test(value.trim())
}

function envFindings(env: Record<string, unknown>): ConfigFinding[] {
  const findings: ConfigFinding[] = []
  for (const [key, raw] of Object.entries(env)) {
    if (typeof raw !== 'string' || raw.trim() === '' || isEnvReference(raw)) continue
    const value = raw.trim()
    const where = `Claude Code settings set ${key}`

    if (ENDPOINT_VARS.test(key)) {
      if (LOCAL_HOST.test(value) || ANTHROPIC_HOST.test(value)) continue
      findings.push({
        severity: 'high',
        message: `${where}, sending every prompt and the code it contains to ${clip(value)}`,
        recommendation:
          'Do not set API endpoints in committed settings. Anyone who opens the project would route their session through this host.',
        needle: key,
      })
    } else if (PROXY_VARS.test(key) && !LOCAL_HOST.test(value)) {
      findings.push({
        severity: 'high',
        message: `${where}, routing the agent's network traffic through ${clip(value)}`,
        recommendation: 'Remove the proxy from committed settings; configure it per machine.',
        needle: key,
      })
    } else if (key === 'NODE_TLS_REJECT_UNAUTHORIZED' && value === '0') {
      findings.push({
        severity: 'high',
        message: `${where}=0, turning off TLS certificate checks`,
        recommendation: 'Remove it. Without certificate checks, traffic can be intercepted.',
        needle: key,
      })
    } else if (
      key === 'NODE_OPTIONS' &&
      /(?:^|\s)(?:--require|-r|--import|--loader|--experimental-loader)(?:\s|=)/.test(value)
    ) {
      findings.push({
        severity: 'high',
        message: `${where} to preload code into every Node.js process the agent starts`,
        recommendation: 'Remove the preload from committed settings.',
        needle: key,
      })
    } else if (/^(?:BASH_ENV|ENV|ZDOTDIR|PROMPT_COMMAND)$/.test(key)) {
      findings.push({
        severity: 'high',
        message: `${where}, which runs code every time the agent starts a shell`,
        recommendation: 'Remove it from committed settings.',
        needle: key,
      })
    } else if (key === 'PATH') {
      findings.push({
        severity: 'medium',
        message: `${where}, changing which programs run when the agent calls a command`,
        recommendation:
          'Avoid overriding PATH in committed settings; a repository directory early in PATH can shadow git, node, or pnpm.',
        needle: key,
      })
    }
  }
  return findings
}

// Settings that run a command to obtain credentials or headers.
const CREDENTIAL_HELPERS = [
  'apiKeyHelper',
  'awsCredentialExport',
  'awsAuthRefresh',
  'gcpAuthRefresh',
  'otelHeadersHelper',
]

export type SettingsCommand = { source: string; command: string }

/** Shorten repository-provided text quoted in a message. */
export function clip(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Every command that Claude Code runs on its own because of these settings. */
export function settingsCommands(settings: Record<string, unknown>): SettingsCommand[] {
  const commands: SettingsCommand[] = []

  const hooks = asRecord(settings.hooks) ?? {}
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const hookList = asRecord(entry)?.hooks
      if (!Array.isArray(hookList)) continue
      for (const hook of hookList) {
        const command = asRecord(hook)?.command
        if (typeof command === 'string') commands.push({ source: `${event} hook`, command })
      }
    }
  }

  const statusLine = settings.statusLine
  const statusCommand = typeof statusLine === 'string' ? statusLine : asRecord(statusLine)?.command
  if (typeof statusCommand === 'string')
    commands.push({ source: 'statusLine', command: statusCommand })

  for (const key of CREDENTIAL_HELPERS) {
    const value = settings[key]
    if (typeof value === 'string') commands.push({ source: key, command: value })
  }
  return commands
}

function commandFindings(settings: Record<string, unknown>): ConfigFinding[] {
  const findings: ConfigFinding[] = []
  for (const { source, command } of settingsCommands(settings)) {
    if (CREDENTIAL_HELPERS.includes(source)) {
      findings.push({
        severity: 'medium',
        message: `Claude Code settings define ${source}, which runs "${clip(command)}" to produce credentials`,
        recommendation:
          'Credential helpers belong in user settings. In committed project settings, the repository decides what runs with your credentials.',
        needle: source,
      })
    }
    for (const risk of findShellRisks(command)) {
      findings.push({
        severity: risk.severity,
        message: `Claude Code ${source} ${risk.label}: "${clip(command)}"`,
        recommendation:
          'Commands in settings run automatically. Keep them to local, reviewed scripts in the repository.',
        needle: command,
      })
    }
  }
  return findings
}

export function claudeSettingsFindings(settings: Record<string, unknown>): ConfigFinding[] {
  const findings: ConfigFinding[] = []
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

  for (const rule of asStrings(permissions?.allow)) findings.push(...allowRuleFindings(rule))
  findings.push(...additionalDirectoryFindings(asStrings(permissions?.additionalDirectories)))

  const guarded = [...asStrings(permissions?.deny), ...asStrings(permissions?.ask)]
  if (permissions && !guarded.some((rule) => rule.includes('.env'))) {
    findings.push({
      severity: 'low',
      message: 'Claude Code settings do not deny reading .env files',
      recommendation:
        'Add deny rules such as "Read(./.env)" and "Read(./.env.*)" so secrets stay out of the agent context.',
      needle: '"permissions"',
    })
  }

  findings.push(...envFindings(asRecord(settings.env) ?? {}))
  findings.push(...commandFindings(settings))

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

const SCRIPT_TOKEN =
  /(?:["']?\$\{?CLAUDE_PROJECT_DIR\}?["']?\/|\.\/)?((?:[\w.-]+\/)*[\w.-]+\.(?:sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl))\b/g

/**
 * Repository-relative scripts that settings commands run, such as
 * `"$CLAUDE_PROJECT_DIR"/.claude/hooks/format.sh`, so their contents can be
 * checked too. Absolute and home paths are left out.
 */
export function referencedScripts(settings: Record<string, unknown>): string[] {
  const scripts = new Set<string>()
  for (const { command } of settingsCommands(settings)) {
    for (const match of command.matchAll(SCRIPT_TOKEN)) {
      const before = command.slice(0, match.index)
      if (/(?:^|[\s"'=])(?:\/|~)$/.test(before) || /(?:~|\$HOME)\/?$/.test(before)) continue
      const rel = match[1].replace(/^\.\//, '')
      if (!rel.startsWith('..') && !rel.startsWith('/')) scripts.add(rel)
    }
  }
  return [...scripts]
}
