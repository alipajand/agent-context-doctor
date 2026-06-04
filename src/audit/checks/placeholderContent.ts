import type { ContextIssue } from '../../types.js'

const TEMPLATE_MARKERS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /lorem\s+ipsum/i,
  /<!--\s*describe/i,
  /<!--\s*list/i,
  /<!--\s*what\s+problem/i,
  /^list\s+paths\s+to\s+read\s+before\s+editing/im,
]

const SCOPED_MARKERS = [
  { pattern: /^in\s+scope\s*:/im, label: 'In scope:' },
  { pattern: /^out\s+of\s+scope\s*:/im, label: 'Out of scope:' },
]

function looksLikeBlankTemplate(content: string, matchLine: string): boolean {
  const trimmed = matchLine.replace(/^(in|out of)\s+scope\s*:\s*/i, '').trim()
  return trimmed === '' || trimmed === '*' || trimmed === '-' || trimmed.length < 5
}

export function checkPlaceholderContent(
  filePath: string,
  content: string,
): ContextIssue[] {
  const issues: ContextIssue[] = []
  const lines = content.split('\n')

  for (const pattern of TEMPLATE_MARKERS) {
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        issues.push({
          id: `placeholder-${filePath}-${idx}`,
          severity: 'medium',
          category: 'placeholder-content',
          file: filePath,
          line: idx + 1,
          message: `Placeholder content detected: "${line.trim().slice(0, 80)}"`,
          recommendation:
            'Replace placeholder content with real, project-specific instructions.',
        })
      }
    })
  }

  for (const { pattern, label } of SCOPED_MARKERS) {
    const match = content.match(pattern)
    if (match) {
      const lineIdx = lines.findIndex((l) => pattern.test(l))
      const matchLine = lineIdx >= 0 ? lines[lineIdx] : ''
      if (looksLikeBlankTemplate(content, matchLine)) {
        issues.push({
          id: `placeholder-scope-${filePath}-${label}`,
          severity: 'medium',
          category: 'placeholder-content',
          file: filePath,
          line: lineIdx >= 0 ? lineIdx + 1 : undefined,
          message: `Template section "${label}" appears unfilled`,
          recommendation:
            'Fill in the scope section with actual project-specific scope boundaries.',
        })
      }
    }
  }

  return issues
}
