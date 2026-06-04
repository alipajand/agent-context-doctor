import pc from 'picocolors'
import type { AuditResult } from '../types.js'

function severityColor(severity: string): string {
  switch (severity) {
    case 'high':
      return pc.red(`[high]`)
    case 'medium':
      return pc.yellow(`[medium]`)
    case 'low':
      return pc.cyan(`[low]`)
    default:
      return `[${severity}]`
  }
}

export function printTerminalReport(result: AuditResult): void {
  const { repoPath, files, summary, issues } = result

  console.log()
  console.log(pc.bold(pc.white('Agent Context Doctor')))
  console.log(pc.dim('─'.repeat(50)))
  console.log(`${pc.bold('Repo:')}    ${repoPath}`)
  console.log(`${pc.bold('Files:')}   ${summary.fileCount}`)

  const issueLabel =
    summary.issueCount === 0
      ? pc.green(`${summary.issueCount} total`)
      : `${summary.issueCount} total — ${pc.red(`${summary.high} high`)}, ${pc.yellow(`${summary.medium} medium`)}, ${pc.cyan(`${summary.low} low`)}`
  console.log(`${pc.bold('Issues:')}  ${issueLabel}`)

  if (files.length > 0) {
    console.log()
    console.log(pc.bold('Context Files:'))
    for (const f of files) {
      console.log(`  ${pc.green('✓')} ${f.path} ${pc.dim(`(${f.kind}, ${f.bytes}B)`)}`)
    }
  }

  if (issues.length > 0) {
    console.log()
    console.log(pc.bold('Issues:'))
    for (const issue of issues) {
      const loc = issue.line ? `:${issue.line}` : ''
      const fileRef = issue.file !== result.repoPath ? `${issue.file}${loc}` : issue.file
      console.log(`  ${severityColor(issue.severity)} ${fileRef} — ${issue.message}`)
      console.log(`    ${pc.dim('Recommendation:')} ${issue.recommendation}`)
    }
  } else {
    console.log()
    console.log(pc.green('✓ No issues found.'))
  }

  console.log()
}
