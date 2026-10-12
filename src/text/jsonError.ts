/**
 * Describe a JSON.parse failure by position only. The parser's own message
 * quotes the start of the input, which for a file reached through a hostile
 * repository could be another file's content.
 */
export function describeJsonError(raw: string, err: unknown): string {
  const position = /position (\d+)/.exec(err instanceof Error ? err.message : '')
  if (!position) return 'is not valid JSON'
  const before = raw.slice(0, Number(position[1])).split('\n')
  return `is not valid JSON (line ${before.length}, column ${before[before.length - 1].length + 1})`
}
