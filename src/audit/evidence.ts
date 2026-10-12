import { toDisplayText } from '../text/displayText.js'
import { maskSecret, redactSecrets } from './checks/secrets.js'

const MAX_EVIDENCE_LENGTH = 160

/**
 * One line of an audited file, ready to show as evidence. Credentials are
 * masked before the line is shortened, so truncation cannot cut a token down
 * to a prefix the patterns no longer recognize. `secrets` lists extra values
 * to mask that the patterns would not find, such as a configured env value.
 */
export function getLineEvidence(content: string, line: number, secrets: string[] = []): string {
  const lines = content.split('\n')
  // Caller values first: a pattern that masks part of one would leave the
  // rest unmatched by the split below.
  let raw = lines[line - 1] ?? ''
  for (const secret of secrets) {
    if (secret) raw = raw.split(secret).join(maskSecret(secret))
  }
  return toDisplayText(redactSecrets(raw).replace(/\s+/g, ' ').trim()).slice(0, MAX_EVIDENCE_LENGTH)
}
