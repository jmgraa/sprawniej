/**
 * A long list split into pages ("11–20 of 43 people", with Previous and Next), so it doesn't fill the screen.
 * Remount it (key) when what it shows changes a lot, e.g. a new search, to start again on the first page.
 */
import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/ui/button'

interface Props<T> {
  items: T[]
  row: (item: T) => ReactNode
  /** "people": for "11–20 of 43 people" */
  noun: string
  perPage?: number
  /** show the page this item is on (e.g. a label you just added); changes of it are followed */
  show?: { index: number; at: number } | null
  className?: string
}

export function PagedList<T>({ items, row, noun, perPage = 10, show, className }: Props<T>) {
  const [page, setPage] = useState(() => (show && show.index >= 0 ? Math.floor(show.index / perPage) : 0))
  const [shown, setShown] = useState(show?.at)
  if (show && show.at !== shown && show.index >= 0) {
    setShown(show.at)
    setPage(Math.floor(show.index / perPage))
  }
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  // fewer items than before (one deleted, a narrower search): stay on a page that exists
  const at = Math.min(page, pages - 1)
  const from = at * perPage
  return (
    <div>
      <ul className={className}>{items.slice(from, from + perPage).map(row)}</ul>
      {pages > 1 && (
        <nav className="mt-2 flex items-center gap-1 text-sm text-muted-foreground" aria-label={`Pages of ${noun}`}>
          <span className="mr-auto tabular-nums">
            {from + 1}–{Math.min(from + perPage, items.length)} of {items.length} {noun}
          </span>
          <Button variant="ghost" size="sm" disabled={at === 0} onClick={() => setPage(at - 1)}>
            <ChevronLeft /> Previous
          </Button>
          <Button variant="ghost" size="sm" disabled={at === pages - 1} onClick={() => setPage(at + 1)}>
            Next <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  )
}
