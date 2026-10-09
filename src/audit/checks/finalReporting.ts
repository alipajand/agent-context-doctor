import type { ContextIssue } from '../../types.js'

const STRONG_SECTION_PATTERNS = [
  /#+\s*final\s+report/i,
  /#+\s*completion\s+report/i,
  /#+\s*handoff/i,
]

const STRONG_FIELD_PATTERNS = [
  /files\s+changed/i,
  /commands\s+run/i,
  /tests\s+(added|updated|run|result|results)/i,
  /known\s+limitations/i,
  /recommended\s+next\s+steps?/i,
]

// Generic headings ("## Reporting", "## When you are done") are only guidance
// when their section asks for something to report, so an empty heading does
// not count. The heading must be the whole title: "## Reporting bugs" is not.
// The trailing `\s*(?::\s*)?` has one way to split spaces, so a heading padded
// with spaces is matched in linear time.
const REPORT_HEADING =
  /^#{1,6}\s+(?:reporting|report(?:ing)?\s+back|what\s+to\s+report|(?:when|after)\s+you(?:'re|\s+are)?\s+(?:done|finished)|(?:when|after)\s+you\s+finish|summary\s+of\s+(?:your\s+)?(?:changes|work)|wrap(?:ping)?[\s-]up)\s*(?::\s*)?$/i

const HEADING = /^#{1,6}\s/

const YOU = String.raw`(?:you(?:'ve|\s+have)?\s+)?`

// What a report asks for, grouped so that two phrasings of one field ("files
// changed", "files you modified") count once.
const REPORT_FIELDS: RegExp[][] = [
  [
    /files\s+changed/i,
    new RegExp(
      String.raw`\bfiles\s+(?:that\s+)?${YOU}(?:changed|modified|touched|edited|created)\b`,
      'i',
    ),
    /\b(?:changed|modified|touched|edited)\s+files\b/i,
    /\bwhat\s+you\s+changed\b/i,
  ],
  [
    /commands\s+run/i,
    new RegExp(String.raw`\bcommands\s+(?:that\s+)?${YOU}(?:ran|run|executed|used)\b`, 'i'),
  ],
  [
    /tests\s+(added|updated|run|result|results)/i,
    /\btest\s+results?\b/i,
    new RegExp(
      String.raw`\btests\s+(?:that\s+)?${YOU}(?:ran|run|added|wrote|written|updated)\b`,
      'i',
    ),
    /\b(?:results|output)\s+of\s+(?:the\s+)?(?:tests|checks|commands)\b/i,
    /\band\s+their\s+(?:results|output)\b/i,
  ],
  [
    /known\s+limitations/i,
    /\b(?:anything|everything|work|items?|tasks?)\s+(?:(?:that\s+)?(?:is|was|you)\s+)?(?:left\s+)?(?:undone|unfinished|incomplete|outstanding|not\s+done)\b/i,
    /\banything\s+(?:you\s+)?(?:skipped|left\s+out)\b/i,
    // "Open questions" or "follow-ups" alone are often a project's own terms
    // (an open questions page, a follow-ups feature), so they need a
    // determiner that makes them items of the report.
    /\b(?:any|remaining|unresolved)\s+open\s+(?:items|questions|issues|risks)\b/i,
    /\bremaining\s+(?:work|issues|risks|todos?)\b/i,
  ],
  [
    /recommended\s+next\s+steps?/i,
    /\b(?:suggested|recommended|any)\s+next\s+steps\b/i,
    /\b(?:any|remaining|suggested)\s+follow[- ]?ups?\b/i,
  ],
]

// A single field is enough when the same line places it in the final message:
// "In your final message, list the files you changed."
const REPORT_ANCHOR =
  /\b(?:final|closing|completion|handoff)\s+(?:report|summary|message|response|note)\b|\bwhen\s+you(?:'re|\s+are)?\s+(?:done|finished)\b|\bwhen\s+you\s+finish\b|\breport\s+back\b/i

const REPORT_VERB = /\b(?:report|list|summari[sz]e|include|mention|describe|state|tell)\b/i

function fieldCount(text: string): number {
  return REPORT_FIELDS.filter((group) => group.some((p) => p.test(text))).length
}

function hasReportingSection(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    if (!REPORT_HEADING.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !HEADING.test(lines[end])) end++
    if (fieldCount(lines.slice(i + 1, end).join('\n')) > 0) return true
  }
  return false
}

export function checkFinalReporting(filePath: string, content: string): ContextIssue[] {
  const hasStrongSection = STRONG_SECTION_PATTERNS.some((p) => p.test(content))
  if (hasStrongSection) return []

  const matchedFields = STRONG_FIELD_PATTERNS.filter((p) => p.test(content))
  if (matchedFields.length >= 2) return []

  // Plain-word fields count when they are asked for together, in one
  // paragraph, so terms scattered through a long file do not add up.
  if (content.split(/\n\s*\n/).some((paragraph) => fieldCount(paragraph) >= 2)) return []

  const lines = content.split('\n')
  if (hasReportingSection(lines)) return []
  if (
    lines.some((line) => REPORT_ANCHOR.test(line) && REPORT_VERB.test(line) && fieldCount(line) > 0)
  ) {
    return []
  }

  return [
    {
      id: `reporting-missing-${filePath}`,
      severity: 'low',
      category: 'final-reporting',
      file: filePath,
      message: 'No final reporting guidance found',
      recommendation:
        'Add instructions telling the agent what to include in its final report: files changed, commands run, test results, and known limitations.',
    },
  ]
}
