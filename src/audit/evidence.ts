const MAX_EVIDENCE_LENGTH = 160

export function getLineEvidence(content: string, line: number): string {
  const lines = content.split('\n')
  const raw = lines[line - 1] ?? ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EVIDENCE_LENGTH)
}
