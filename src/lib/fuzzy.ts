import { defaultFilter } from 'cmdk'

/** letters without their accents, so "lukasz" finds Łukasz and "wisniewska" finds Wiśniewska */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')

/**
 * The items a typed search matches, loosely ("drk smi" finds Darek Smith), best match first; all of them, in their own
 * order, when nothing is typed. Uses the same matching as the menus (cmdk), so search feels the same everywhere.
 */
export function fuzzy<T>(items: T[], query: string, words: (item: T) => string[]): T[] {
  const q = plain(query.trim())
  if (!q) return items
  return items
    .map((item, n) => ({ item, n, score: defaultFilter(plain(words(item).join(' ')), q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .map((x) => x.item)
}
