import { defaultFilter } from 'cmdk'
import { plain } from './plain'

/** cmdk's matching (for `<Command filter>`), without accents: "lukasz" finds Łukasz in any menu */
export const plainFilter = (value: string, search: string, keywords?: string[]) => defaultFilter(plain(value), plain(search), keywords?.map(plain))

/**
 * The items a typed search matches, loosely ("drk smi" finds Darek Smith), best match first; all of them, in their own
 * order, when nothing is typed. Uses the same matching as the menus (cmdk), so search feels the same everywhere.
 */
export function fuzzy<T>(items: T[], query: string, words: (item: T) => string[]): T[] {
  const q = plain(query.trim())
  if (!q) return items
  return items
    .map((item, n) => ({ item, n, score: plainFilter(words(item).join(' '), q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .map((x) => x.item)
}
