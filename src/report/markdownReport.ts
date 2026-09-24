import { toDisplayText } from '../text/displayText.js'
import type { AuditResult, ContextIssue, Severity } from '../types.js'

// Escapes text for Markdown prose and table cells. Raw `<` would let excerpts
// such as `<!-- describe -->` open an HTML comment that hides the rest of the report.
function escapeMarkdown(str: string): string {
  return toDisplayText(str)
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/([`*_[\]])/g, '\\$1')
}

function codeSpan(str: string): string {
  const text = toDisplayText(str)
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longestRun + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

// GFM splits table rows on `|` even inside code spans unless it is escaped.
function tableCodeSpan(str: string): string {
  return codeSpan(str).replace(/\|/g, '\\|')
}

function issueRow(issue: ContextIssue): string {
  const loc = issue.line ? `:${issue.line}` : ''
  const file = `${issue.file}${loc}`
  return `| ${issue.severity} | ${escapeMarkdown(issue.category)} | ${escapeMarkdown(file)} | ${escapeMarkdown(issue.message)} | ${escapeMarkdown(issue.recommendation)} |`
}

export function toMarkdownReport(result: AuditResult): string {
  const { repoPath, files, summary, score, issues } = result
  const timestamp = new Date().toISOString()

  const severityOrder: Severity[] = ['high', 'medium', 'low']

  const lines: string[] = []

  lines.push('# Agent Context Doctor Report')
  lines.push('')
  lines.push(`**Generated:** ${timestamp}`)
  lines.push(`**Repo:** ${codeSpan(repoPath)}`)
  lines.push(`**Score:** ${score.total} / ${score.max} — ${score.grade}`)
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Quality score | ${score.total} / ${score.max} (${score.grade}) |`)
  lines.push(`| Context files | ${summary.fileCount} |`)
  lines.push(`| Total issues | ${summary.issueCount} |`)
  lines.push(`| High | ${summary.high} |`)
  lines.push(`| Medium | ${summary.medium} |`)
  lines.push(`| Low | ${summary.low} |`)
  if (result.baseline) {
    lines.push(`| New since baseline | ${result.baseline.new} |`)
    lines.push(`| Known (baseline) | ${result.baseline.known} |`)
  }
  lines.push('')

  lines.push('## Context Files')
  lines.push('')
  if (files.length === 0) {
    lines.push('_No context files detected._')
  } else {
    lines.push('| File | Kind | Size (bytes) |')
    lines.push('|------|------|-------------|')
    for (const f of files) {
      lines.push(`| ${tableCodeSpan(f.path)} | ${f.kind} | ${f.bytes} |`)
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
      lines.push(`- **${codeSpan(`${issue.file}${loc}`)}** — ${escapeMarkdown(issue.message)}`)
      lines.push(`  - ${escapeMarkdown(issue.recommendation)}`)
      if (issue.evidence) {
        lines.push(`  - Evidence: ${codeSpan(issue.evidence)}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
