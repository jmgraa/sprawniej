/** Finding issues by what you type (the ⌘K palette). Pure, tested in tests/search.test.ts. */
import type { Issue } from '@/model/schema'
import { plain } from '@/lib/plain'
import { isClosed } from './select'
import { findByRef, issueRef } from './store'

/** issues whose ID or title has every word you typed: an exact ID first, then open ones, then the most recent */
export function searchIssues(issues: Record<string, Issue>, query: string, max = 12): Issue[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const exact = findByRef(issues, q)
  const words = plain(q).split(/\s+/)
  const hits = Object.values(issues).filter((i) => i !== exact && words.every((w) => plain(`${issueRef(i)} ${i.title}`).includes(w)))
  hits.sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || b.updatedAt.localeCompare(a.updatedAt))
  return [...(exact ? [exact] : []), ...hits].slice(0, max)
}
