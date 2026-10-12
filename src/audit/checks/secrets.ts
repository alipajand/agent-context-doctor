import type { ContextIssue, Severity } from '../../types.js'
import { toDisplayText } from '../../text/displayText.js'

type SecretPattern = {
  label: string
  pattern: RegExp
  severity: Severity
  /** Capture group holding the secret value; 0 means the whole match. */
  group?: number
  /** Extra filter for broad patterns. */
  looksReal?: (value: string) => boolean
}

// Generic assignments only count when the value looks like a credential:
// letters and digits, not a function call, variable, or env lookup.
function looksLikeCredential(value: string): boolean {
  return /[A-Za-z]/.test(value) && /\d/.test(value) && !/[()[\]]/.test(value)
}

// Well-known credential formats. All are anchored on distinctive prefixes so
// ordinary prose does not match.
const SECRET_PATTERNS: SecretPattern[] = [
  { label: 'AWS access key ID', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'high' },
  { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, severity: 'high' },
  { label: 'GitHub token', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, severity: 'high' },
  { label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, severity: 'high' },
  {
    label: 'OpenAI API key',
    pattern: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g,
    severity: 'high',
  },
  {
    label: 'Stripe secret key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    severity: 'high',
  },
  { label: 'Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, severity: 'high' },
  { label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: 'high' },
  { label: 'npm access token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, severity: 'high' },
  {
    label: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
    severity: 'high',
  },
  {
    label: 'credential assignment',
    pattern:
      /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']?([^\s"'`,;]{8,})/gi,
    severity: 'medium',
    group: 1,
    looksReal: looksLikeCredential,
  },
]

// Values that are clearly documentation rather than real credentials.
const PLACEHOLDER =
  /example|sample|dummy|fake|placeholder|changeme|your[_-]|redacted|xxxx|\*{3}|<[^<>]*>|\$\{|\$[A-Z_]|process\.env|environ|getenv|secrets\.|\{\{/i

/** Mask a credential, keeping a short prefix so the finding can be located. */
export function maskSecret(value: string): string {
  const visible = value.startsWith('-----') ? value.length : Math.min(4, value.length)
  return value.slice(0, visible) + '*'.repeat(Math.max(0, Math.min(value.length - visible, 12)))
}

type LineScan = { redacted: string; labels: string[]; severity: Severity | null }

// Masking replaces every occurrence of each value across the whole line, one
// pass per distinct value. A line with thousands of distinct credentials would
// make that grow with the square of its length, so past this many the line is
// masked word by word instead.
export const MAX_VALUES_PER_LINE = 64

// Every value that maskSecret hides part of is at least eight characters long
// and contains no whitespace, so it lies inside a run of eight or more
// non-space characters. Keeping only the first four characters of each such
// run hides at least what masking the values one by one would.
function maskEveryWord(line: string): string {
  return line.replace(
    /\S{8,}/g,
    (word) => word.slice(0, 4) + '*'.repeat(Math.min(word.length - 4, 12)),
  )
}

function scanLine(line: string): LineScan {
  // Insertion order is discovery order, which the masking below relies on.
  const values = new Set<string>()
  const labels: string[] = []
  let severity: Severity | null = null

  for (const {
    label,
    pattern,
    severity: patternSeverity,
    group = 0,
    looksReal,
  } of SECRET_PATTERNS) {
    for (const match of line.matchAll(pattern)) {
      const value = match[group]
      if (!value || PLACEHOLDER.test(value)) continue
      if (looksReal && !looksReal(value)) continue
      values.add(value)
      if (!labels.includes(label)) labels.push(label)
      if (severity !== 'high') severity = patternSeverity
    }
  }

  if (values.size > MAX_VALUES_PER_LINE) {
    return { redacted: maskEveryWord(line), labels, severity }
  }
  let redacted = line
  for (const value of values) redacted = redacted.split(value).join(maskSecret(value))
  return { redacted, labels, severity }
}

/**
 * Mask every credential the secrets check would report. Any text quoted from
 * an audited file goes through this before it reaches a finding, so a token
 * on a line flagged for another reason is not printed in plaintext.
 */
export function redactSecrets(text: string): string {
  return text
    .split('\n')
    .map((line) => scanLine(line).redacted)
    .join('\n')
}

export function checkSecrets(filePath: string, content: string): ContextIssue[] {
  const issues: ContextIssue[] = []

  content.split('\n').forEach((line, idx) => {
    const { redacted: redactedLine, labels, severity } = scanLine(line)
    if (severity === null) return

    issues.push({
      id: `secrets-${filePath}-${idx + 1}`,
      severity,
      category: 'secrets',
      file: filePath,
      line: idx + 1,
      // Evidence is built from the redacted line so reports never repeat the secret.
      evidence: toDisplayText(redactedLine.replace(/\s+/g, ' ').trim()).slice(0, 160),
      message: `Possible ${labels.join(', ')} in an agent instruction file`,
      recommendation:
        'Remove the credential, rotate it, and reference it through an environment variable or secret manager instead. Instruction files are read by agents and often shared.',
    })
  })

  return issues
}
