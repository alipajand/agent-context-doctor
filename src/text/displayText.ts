// C0/C1 control characters except tab. Text copied from audited files can carry
// ANSI/OSC escape sequences that a terminal would otherwise interpret.
const CONTROL_CHARS = /[\u0000-\u0008\u000A-\u001F\u007F-\u009F]/g

// Zero-width characters, bidirectional controls, and Unicode tag characters.
// They render as nothing (or reorder surrounding text), so they can hide
// instructions from a human reviewer while an agent still reads them. Kept as
// numeric ranges so formatters cannot rewrite them into literal characters.
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad], // soft hyphen
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x200b, 0x200f], // zero-width space/joiners, LRM, RLM
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space / BOM
  [0xe0000, 0xe007f], // Unicode tag characters
]

export function isInvisibleCodePoint(codePoint: number): boolean {
  return INVISIBLE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)
}

export function formatCodePoint(char: string): string {
  const hex = (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
  return `<U+${hex}>`
}

/**
 * Make untrusted text safe to print on one line: control characters become
 * spaces and invisible characters are shown as `<U+XXXX>` markers.
 */
export function toDisplayText(text: string): string {
  let out = ''
  for (const char of text.replace(CONTROL_CHARS, ' ')) {
    out += isInvisibleCodePoint(char.codePointAt(0) ?? 0) ? formatCodePoint(char) : char
  }
  return out
}
