import { toDisplayText } from '../text/displayText.js'
import { MAX_VALUES_PER_LINE, maskSecret, redactSecrets } from './checks/secrets.js'

const MAX_EVIDENCE_LENGTH = 160

// Checks ask for evidence one finding at a time, often many times for the
// same file and line. Splitting the file once and masking each line once keeps
// the total work linear in the file's size.
let cachedContent: string | undefined
let cachedLines: string[] = []
const cachedEvidence = new Map<number, string>()

function linesOf(content: string): string[] {
  if (content !== cachedContent) {
    cachedContent = content
    cachedLines = content.split('\n')
    cachedEvidence.clear()
  }
  return cachedLines
}

function format(raw: string): string {
  return toDisplayText(redactSecrets(raw).replace(/\s+/g, ' ').trim()).slice(0, MAX_EVIDENCE_LENGTH)
}

/**
 * One line of an audited file, ready to show as evidence. Credentials are
 * masked before the line is shortened, so truncation cannot cut a token down
 * to a prefix the patterns no longer recognize. `secrets` lists extra values
 * to mask that the patterns would not find, such as a configured env value.
 */
export function getLineEvidence(content: string, line: number, secrets: string[] = []): string {
  const lines = linesOf(content)
  if (secrets.length === 0) {
    let evidence = cachedEvidence.get(line)
    if (evidence === undefined) {
      evidence = format(lines[line - 1] ?? '')
      cachedEvidence.set(line, evidence)
    }
    return evidence
  }
  // Caller values first: a pattern that masks part of one would leave the
  // rest unmatched by the split below.
  let raw = lines[line - 1] ?? ''
  // Each value is one pass over the line. Past the limit, everything after
  // the first four characters is hidden, which hides at least as much.
  if (secrets.length > MAX_VALUES_PER_LINE) {
    return format(raw.slice(0, 4) + '*'.repeat(Math.max(0, Math.min(raw.length - 4, 12))))
  }
  for (const secret of secrets) {
    if (secret) raw = raw.split(secret).join(maskSecret(secret))
  }
  return format(raw)
}
