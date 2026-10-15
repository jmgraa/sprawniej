/** A list that shows its first few rows and a "Show all" button, so a long list doesn't fill the page. */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/ui/button'

interface Props<T> {
  items: T[]
  row: (item: T) => ReactNode
  /** "people": for "Show all 43 people" */
  noun: string
  /** rows shown before "Show all" */
  limit?: number
  /** a search is on: every match shows */
  all?: boolean
  className?: string
}

export function ShortList<T>({ items, row, noun, limit = 8, all, className }: Props<T>) {
  const [open, setOpen] = useState(false)
  // one hidden row isn't worth a button
  const cut = !all && !open && items.length > limit + 1
  return (
    <div>
      <ul className={className}>{(cut ? items.slice(0, limit) : items).map(row)}</ul>
      {!all && items.length > limit + 1 && (
        <Button variant="ghost" size="sm" className="mt-1 -ml-2 text-muted-foreground" onClick={() => setOpen(!open)}>
          {open ? (
            <>
              <ChevronUp /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown /> Show all {items.length} {noun}
            </>
          )}
        </Button>
      )}
    </div>
  )
}
