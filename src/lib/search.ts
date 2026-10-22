/** Lowercase words with accents stripped, so "beyonce" finds "Beyoncé" and "Love/Hate" is two words */
function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * True when every word of the query starts a word of the text, in any order. Only word starts,
 * so "hide all matching bina" takes the Binaural artists without Robina or Ian Urbina.
 */
export function matches(query: string, text: string): boolean {
  const haystack = words(text)
  return words(query).every((word) => haystack.some((w) => w.startsWith(word)))
}
