import type { AuditResult, ContextIssue, Severity } from '../types.js'

function escapeMarkdown(str: string): string {
  return str.replace(/\|/g, '\\|')
}

function issueRow(issue: ContextIssue): string {
  const loc = issue.line ? `:${issue.line}` : ''
  const file = `${issue.file}${loc}`
  return `| ${issue.severity} | ${issue.category} | ${escapeMarkdown(file)} | ${escapeMarkdown(issue.message)} | ${escapeMarkdown(issue.recommendation)} |`
}

export function toMarkdownReport(result: AuditResult): string {
  const { repoPath, files, summary, issues } = result
  const timestamp = new Date().toISOString()

  const severityOrder: Severity[] = ['high', 'medium', 'low']

  const lines: string[] = []

  lines.push('# Agent Context Doctor Report')
  lines.push('')
  lines.push(`**Generated:** ${timestamp}`)
  lines.push(`**Repo:** \`${repoPath}\``)
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Context files | ${summary.fileCount} |`)
  lines.push(`| Total issues | ${summary.issueCount} |`)
  lines.push(`| High | ${summary.high} |`)
  lines.push(`| Medium | ${summary.medium} |`)
  lines.push(`| Low | ${summary.low} |`)
  lines.push('')

  lines.push('## Context Files')
  lines.push('')
  if (files.length === 0) {
    lines.push('_No context files detected._')
  } else {
    lines.push('| File | Kind | Size (bytes) |')
    lines.push('|------|------|-------------|')
    for (const f of files) {
      lines.push(`| \`${f.path}\` | ${f.kind} | ${f.bytes} |`)
    }
  }
  lines.push('')

  lines.push('## Issues')
  lines.push('')
  if (issues.length === 0) {
    lines.push('_No issues found._')
  } else {
    lines.push('| Severity | Category | File | Message | Recommendation |')
    lines.push('|----------|----------|------|---------|---------------|')
    for (const issue of issues) {
      lines.push(issueRow(issue))
    }
  }
  lines.push('')

  lines.push('## Recommendations by Severity')
  lines.push('')

  for (const sev of severityOrder) {
    const sevIssues = issues.filter((i) => i.severity === sev)
    if (sevIssues.length === 0) continue

    lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)}`)
    lines.push('')
    for (const issue of sevIssues) {
      const loc = issue.line ? `:${issue.line}` : ''
      lines.push(`- **\`${issue.file}${loc}\`** — ${issue.message}`)
      lines.push(`  - ${issue.recommendation}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
