import path from 'node:path'
import type { ContextIssue, Severity } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { allowRuleFindings, clip } from './claudeSettings.js'
import { parseFrontmatter } from './frontmatter.js'
import { findShellRisks } from './shellRisk.js'

type LineFinding = { line: number; severity: Severity; message: string; recommendation: string }

const RUNS_SHELL = /^\.claude\/(?:commands\/.+\.md|skills\/.+\.md)$/
const SUBAGENT = /^\.claude\/agents\/.+\.md$/
const MEMORY_FILE = /(?:^|\/)CLAUDE\.md$/i

/**
 * Tools a command or skill pre-approves, from `allowed-tools` as a comma
 * separated string or a YAML list. Commas inside `Bash(...)` stay with their rule.
 */
function allowedTools(content: string): { rule: string; line: number }[] {
  const lines = content.split('\n')
  const fm = parseFrontmatter(content)
  if (!fm || fm.endLine === -1) return []

  const at = lines.findIndex((l, i) => i < fm.endLine && /^allowed-tools\s*:/.test(l))
  if (at === -1) return []
  const inline = lines[at].replace(/^allowed-tools\s*:\s*/, '').replace(/^\[|\]$/g, '')
  const rules: { rule: string; line: number }[] = []
  for (const rule of splitRules(inline)) rules.push({ rule, line: at + 1 })
  for (let i = at + 1; i < fm.endLine - 1; i++) {
    const item = /^\s+-\s+(.+)$/.exec(lines[i])
    if (!item) break
    rules.push({ rule: unquote(item[1]), line: i + 1 })
  }
  return rules
}

function splitRules(text: string): string[] {
  const rules: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && (char === ',' || char === ' ')) {
      if (current.trim()) rules.push(unquote(current))
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) rules.push(unquote(current))
  return rules
}

function unquote(value: string): string {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2')
}

/**
 * Shell commands a command or skill runs before the model sees it: inline
 * !`cmd` and ```! fenced blocks. They run without a permission prompt.
 */
export function injectedCommands(content: string): { command: string; line: number }[] {
  const commands: { command: string; line: number }[] = []
  const lines = content.split('\n')
  let block: { start: number; body: string[] } | null = null
  let fence: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (block) {
      if (/^\s*```\s*$/.test(line)) {
        commands.push({ command: block.body.join('\n'), line: block.start })
        block = null
      } else {
        block.body.push(line)
      }
      continue
    }
    const opener = /^\s*(```+|~~~+)(.*)$/.exec(line)
    if (opener) {
      if (fence === null && opener[2].trim() === '!') {
        block = { start: i + 1, body: [] }
      } else if (fence === null) {
        fence = opener[1]
      } else if (line.trim().startsWith(fence)) {
        fence = null
      }
      continue
    }
    if (fence !== null) continue
    for (const match of line.matchAll(/!`([^`\n]+)`/g)) {
      commands.push({ command: match[1], line: i + 1 })
    }
  }
  return commands
}

// Home-directory files that hold credentials; importing one puts it in context.
const CREDENTIAL_PATH =
  /(?:^|\/)(?:\.ssh|\.aws|\.gnupg|\.kube|\.docker|\.config\/gh|\.config\/gcloud)(?:\/|$)|(?:^|\/)(?:\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.env(?!\.(?:example|sample|template)$)(?:\.[\w.-]+)?|id_(?:rsa|ed25519|ecdsa)\w*|[\w.-]+\.pem)$/i

/** `@path` imports in a CLAUDE.md, outside code spans and fences. */
function memoryImports(content: string): { target: string; line: number }[] {
  const imports: { target: string; line: number }[] = []
  let fence: string | null = null
  content.split('\n').forEach((raw, i) => {
    const opener = /^\s*(```+|~~~+)/.exec(raw)
    if (opener) {
      if (fence === null) fence = opener[1]
      else if (raw.trim().startsWith(fence)) fence = null
      return
    }
    if (fence !== null) return
    const line = raw.replace(/`[^`]*`/g, '')
    for (const match of line.matchAll(/(?:^|[\s(])@((?:~|\.{1,2})?\/?[\w.~/-]*[\w~-])/g)) {
      imports.push({ target: match[1], line: i + 1 })
    }
  })
  return imports
}

function importFindings(rel: string, content: string): LineFinding[] {
  const findings: LineFinding[] = []
  for (const { target, line } of memoryImports(content)) {
    const outside =
      target.startsWith('~') ||
      target.startsWith('/') ||
      path.posix.normalize(path.posix.join(path.posix.dirname(rel), target)).startsWith('..')

    if (CREDENTIAL_PATH.test(target)) {
      findings.push({
        line,
        severity: 'high',
        message: `CLAUDE.md imports @${clip(target)}, loading a credential file into the agent context`,
        recommendation:
          'Remove the import. Anything imported is sent to the model and can end up in logs and output.',
      })
    } else if (outside) {
      findings.push({
        line,
        severity: 'low',
        message: `CLAUDE.md imports @${clip(target)} from outside the repository, so the instructions differ per machine and cannot be reviewed`,
        recommendation:
          'Keep shared instructions in the repository. Personal imports belong in CLAUDE.local.md or ~/.claude/CLAUDE.md.',
      })
    }
  }
  return findings
}

/**
 * Claude Code commands, skills, subagents, and CLAUDE.md files that grant
 * more than their text suggests: shell commands that run on invocation,
 * blanket tool approval, subagents that skip permission prompts, and imports
 * of files outside the repository.
 */
export function checkClaudeArtifact(filePath: string, content: string): ContextIssue[] {
  const rel = filePath.replace(/\\/g, '/')
  const findings: LineFinding[] = []

  if (RUNS_SHELL.test(rel)) {
    for (const { rule, line } of allowedTools(content)) {
      for (const finding of allowRuleFindings(rule)) {
        findings.push({
          line,
          severity: finding.severity,
          message: `allowed-tools ${finding.message.replace(/^Claude Code permission /, '')}`,
          recommendation: finding.recommendation,
        })
      }
    }
    for (const { command, line } of injectedCommands(content)) {
      for (const risk of findShellRisks(command)) {
        findings.push({
          line,
          severity: risk.severity,
          message: `Command runs when invoked and ${risk.label}`,
          recommendation:
            '!`...` commands run before the model reads the file, without a permission prompt. Keep them to local, read-only commands.',
        })
      }
    }
  }

  if (SUBAGENT.test(rel)) {
    const mode = parseFrontmatter(content)?.fields.get('permissionMode')
    if (mode && unquote(mode) === 'bypassPermissions') {
      const line = content.split('\n').findIndex((l) => /^permissionMode\s*:/.test(l)) + 1
      findings.push({
        line,
        severity: 'high',
        message: 'Subagent runs with permissionMode: bypassPermissions, so its tools never ask',
        recommendation:
          'Remove permissionMode or use a narrower mode, and limit the subagent with a tools list.',
      })
    }
  }

  if (MEMORY_FILE.test(rel)) findings.push(...importFindings(rel, content))

  return findings.map((f, i) => ({
    id: `agent-config-${rel}-${f.line}-${i}`,
    severity: f.severity,
    category: 'agent-config',
    file: filePath,
    line: f.line,
    evidence: getLineEvidence(content, f.line),
    message: f.message,
    recommendation: f.recommendation,
  }))
}

/**
 * Scripts referenced from settings (hooks, status line) run on every matching
 * event, so each line is checked like an inline command.
 */
export function checkClaudeScript(filePath: string, content: string): ContextIssue[] {
  const issues: ContextIssue[] = []
  content.split('\n').forEach((line, i) => {
    if (/^\s*#/.test(line)) return
    for (const risk of findShellRisks(line)) {
      issues.push({
        id: `agent-config-${filePath.replace(/\\/g, '/')}-${i + 1}-${risk.label}`,
        severity: risk.severity,
        category: 'agent-config',
        file: filePath,
        line: i + 1,
        evidence: getLineEvidence(content, i + 1),
        message: `Script run by Claude Code settings ${risk.label}`,
        recommendation:
          'Hooks and status line scripts run automatically. Keep them local and reviewed; never fetch and run remote code from them.',
      })
    }
  })
  return issues
}
