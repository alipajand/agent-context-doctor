import { toDisplayText } from '../text/displayText.js'
import { issueLocations } from './locations.js'
import type { AuditResult, Severity } from '../types.js'

const COMMAND: Record<Severity, 'error' | 'warning' | 'notice'> = {
  high: 'error',
  medium: 'warning',
  low: 'notice',
}

// Workflow command encoding: data escapes %, CR, and LF; property values
// additionally escape ':' and ','. Without it, text from an audited file could
// end the annotation early and start a new command.
function escapeData(value: string): string {
  return toDisplayText(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')
}

/**
 * GitHub Actions annotations, one per issue, so findings appear inline on the
 * pull request diff. Issues already in the baseline are left out.
 */
export function toGithubAnnotations(result: AuditResult, baseDir: string = process.cwd()): string {
  const lines: string[] = []

  for (const issue of result.issues) {
    if (issue.inBaseline) continue
    const [file] = issueLocations(result, issue, baseDir)
    const props = [
      ...(file ? [`file=${escapeProperty(file)}`] : []),
      ...(file && issue.line ? [`line=${issue.line}`] : []),
      `title=${escapeProperty(`acd ${issue.category}`)}`,
    ]
    lines.push(
      `::${COMMAND[issue.severity]} ${props.join(',')}::${escapeData(
        `${issue.message}. ${issue.recommendation}`,
      )}`,
    )
  }

  const { summary, score } = result
  const known = result.baseline ? `, ${result.baseline.known} known from baseline` : ''
  lines.push(
    `acd: score ${score.total}/${score.max} (${score.grade}), ${summary.issueCount} issues — ${summary.high} high, ${summary.medium} medium, ${summary.low} low${known}`,
  )
  return lines.join('\n')
}
