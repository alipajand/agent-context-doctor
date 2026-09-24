import type { ContextIssue, Severity } from '../../types.js'
import { getLineEvidence } from '../evidence.js'
import { formatCodePoint, isInvisibleCodePoint } from '../../text/displayText.js'

const BOM = 0xfeff
const ZWNJ = 0x200c
const ZWJ = 0x200d

// Unicode tag characters mirror ASCII (U+E0020–U+E007E) and render as nothing,
// so they can carry a complete hidden instruction that agents still read.
function isTagCharacter(codePoint: number): boolean {
  return codePoint >= 0xe0000 && codePoint <= 0xe007f
}

// Bidirectional overrides and isolates reorder how text is displayed
// ("Trojan Source"), so a reviewer sees different words than an agent reads.
function isBidiControl(codePoint: number): boolean {
  return (
    (codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069)
  )
}

const JOINABLE = /[\p{L}\p{M}\p{Extended_Pictographic}]/u

// ZWJ builds emoji sequences and ZWNJ is ordinary orthography in Persian,
// Arabic, and Indic scripts. Only report them between ASCII text or at edges.
function isLegitimateJoiner(chars: string[], index: number): boolean {
  const before = chars[index - 1] ?? ''
  const after = chars[index + 1] ?? ''
  const nonAsciiJoinable = (c: string) => c !== '' && c.charCodeAt(0) > 0x7f && JOINABLE.test(c)
  return nonAsciiJoinable(before) && nonAsciiJoinable(after)
}

function decodeTagText(chars: string[]): string {
  return chars
    .map((c) => c.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0xe0020 && cp <= 0xe007e)
    .map((cp) => String.fromCharCode(cp - 0xe0000))
    .join('')
}

type LineFinding = {
  severity: Severity
  codePoints: Set<string>
  hiddenText: string
}

function scanLine(line: string, isFirstLine: boolean): LineFinding | null {
  const chars = Array.from(line)
  let severity: Severity | null = null
  const codePoints = new Set<string>()
  const tagChars: string[] = []

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const codePoint = char.codePointAt(0) ?? 0
    if (!isInvisibleCodePoint(codePoint)) continue
    if (codePoint === BOM && isFirstLine && i === 0) continue
    if ((codePoint === ZWJ || codePoint === ZWNJ) && isLegitimateJoiner(chars, i)) continue

    codePoints.add(formatCodePoint(char))
    if (isTagCharacter(codePoint)) {
      tagChars.push(char)
      severity = 'high'
    } else if (isBidiControl(codePoint)) {
      severity = 'high'
    } else if (severity === null) {
      severity = 'medium'
    }
  }

  if (severity === null) return null
  return { severity, codePoints, hiddenText: decodeTagText(tagChars) }
}

export function checkHiddenCharacters(filePath: string, content: string): ContextIssue[] {
  const issues: ContextIssue[] = []

  content.split('\n').forEach((line, idx) => {
    const finding = scanLine(line, idx === 0)
    if (!finding) return

    const list = [...finding.codePoints].join(', ')
    const hidden = finding.hiddenText
      ? ` Hidden text: "${finding.hiddenText.replace(/\s+/g, ' ').trim().slice(0, 120)}"`
      : ''

    issues.push({
      id: `hidden-characters-${filePath}-${idx + 1}`,
      severity: finding.severity,
      category: 'hidden-characters',
      file: filePath,
      line: idx + 1,
      evidence: getLineEvidence(content, idx + 1),
      message: `Invisible Unicode characters (${list}) can hide instructions from reviewers.${hidden}`,
      recommendation:
        'Remove invisible characters from agent instructions. Tag characters and bidirectional controls can smuggle instructions that humans do not see but agents follow.',
    })
  })

  return issues
}
