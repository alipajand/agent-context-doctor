import type { Severity } from '../../types.js'

export type ShellRisk = { severity: Severity; label: string }

const REMOTE_SCRIPT = 'downloads and runs a remote script'
const SENDS_DATA = 'sends data to a remote server'
const RAW_SOCKET = 'opens a raw network connection'
const HIDDEN_CODE = 'decodes and runs hidden code'
const DELETES_HOME = 'deletes the root or home directory'
const READS_CREDENTIALS = 'reads credential files from the home directory'
const UNPINNED_RUNNER = 'runs a package from the registry without a pinned version'

const SEVERITY: Record<string, Severity> = {
  [REMOTE_SCRIPT]: 'high',
  [SENDS_DATA]: 'high',
  [RAW_SOCKET]: 'high',
  [HIDDEN_CODE]: 'high',
  [DELETES_HOME]: 'high',
  [READS_CREDENTIALS]: 'medium',
  [UNPINNED_RUNNER]: 'medium',
}

// Commands are split into pipeline stages first, so every pattern below only
// looks at one stage and none of them needs an unbounded run across the whole
// command. That keeps matching linear on hostile input.
const DOWNLOADER = /\b(?:curl|wget)\b/i
const SHELL_STAGE = /^\s*(?:sudo\s+)?(?:(?:ba|z|da|k)?sh|python3?|node|perl|ruby)\b/i
const SHELL_OF_DOWNLOAD = /\b(?:ba|z)?sh\s+(?:-c\s+)?["']?(?:\$\(|<\()\s*(?:curl|wget)\b/i
const CURL_UPLOAD =
  /\s(?:-d|--data(?:-binary|-raw|-urlencode)?|-F|--form|-T|--upload-file)(?:\s|=)/i
const WGET_POST = /\s--post-(?:data|file)\b/i
const DEV_SOCKET = /\/dev\/(?:tcp|udp)\//
const NETCAT = /(?:^|\s)(?:nc|ncat|netcat)\s/
const PORT_ARGUMENT = /\s\d{2,5}(?:\s|$)/
const BASE64_DECODE = /\bbase64\s+(?:-d|-D|--decode)\b/i
const RM_HOME = /\brm\s+((?:-\S+\s+)+)["']?(?:\/|~\/?|\$HOME\/?|\$\{HOME\}\/?)\*?["']?(?=\s|$)/
const HOME_CREDENTIALS =
  /(?:~|\$HOME|\$\{HOME\})\/\.(?:ssh|aws|gnupg|kube|netrc|docker\/config\.json|config\/gh|npmrc)\b/i
const RUNNER = /\b(?:npx|bunx|pnpx)\s+(?:(?:-y|--yes)\s+)*(\S+)/i

function stagesOf(command: string): string[][] {
  return command
    .split(/\n|;|&&|\|\|/)
    .map((sequence) => sequence.split('|'))
    .filter((stages) => stages.some((s) => s.trim() !== ''))
}

function isUnpinnedRunner(stage: string): boolean {
  const spec = RUNNER.exec(stage)?.[1]?.replace(/^["']|["']$/g, '')
  if (!spec || spec.startsWith('-')) return false
  const version = /^(?:@[^/@]+\/)?[^@]+@(.+)$/.exec(spec)?.[1]
  return version === undefined || !/^\d/.test(version)
}

/** Risky behaviour in a shell command or script, one entry per kind. */
export function findShellRisks(command: string): ShellRisk[] {
  const labels = new Set<string>()

  if (HOME_CREDENTIALS.test(command)) labels.add(READS_CREDENTIALS)
  if (SHELL_OF_DOWNLOAD.test(command)) labels.add(REMOTE_SCRIPT)
  if (DEV_SOCKET.test(command)) labels.add(RAW_SOCKET)

  for (const stages of stagesOf(command)) {
    const sequence = stages.join('|')
    if (/\beval\b/.test(sequence) && /base64/i.test(sequence)) labels.add(HIDDEN_CODE)
    let shellLater = false
    for (let i = stages.length - 1; i >= 0; i--) {
      const stage = stages[i]
      if (DOWNLOADER.test(stage) && shellLater) labels.add(REMOTE_SCRIPT)
      if (BASE64_DECODE.test(stage) && shellLater) labels.add(HIDDEN_CODE)
      shellLater ||= SHELL_STAGE.test(stage)
      if (/\bcurl\b/i.test(stage) && CURL_UPLOAD.test(stage)) labels.add(SENDS_DATA)
      if (/\bwget\b/i.test(stage) && WGET_POST.test(stage)) labels.add(SENDS_DATA)
      if (NETCAT.test(stage) && PORT_ARGUMENT.test(stage)) labels.add(RAW_SOCKET)
      const rm = RM_HOME.exec(stage)
      if (rm && /(?:^|\s)-(?:[a-zA-Z]*[rR]|-recursive\b)/.test(` ${rm[1]}`)) {
        labels.add(DELETES_HOME)
      }
      if (isUnpinnedRunner(stage)) labels.add(UNPINNED_RUNNER)
    }
  }

  return Object.keys(SEVERITY)
    .filter((label) => labels.has(label))
    .map((label) => ({ severity: SEVERITY[label], label }))
}
