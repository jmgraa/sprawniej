/**
 * A team's archived issues, newest first, with a search box. The archive is read when this opens; a big one shows
 * a page at a time.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Archive, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { EmptyState } from '@/components/EmptyState'
import { loadArchive } from '@/data/project'
import { issueRef, useData } from '@/data/store'
import { shortDate } from '@/features/issues/format'
import { StatusIcon } from '@/features/issues/icons'
import { plain } from '@/lib/plain'
import { TitleText } from '@/features/issues/TitleText'
import { AUTO_ARCHIVE_MONTHS } from '@/model/schema'
import { Button } from '@/ui/button'

const PAGE = 100

export function ArchiveList({ team, left }: { team: string; left: React.ReactNode }) {
  const loaded = useData((s) => s.archiveLoaded)
  useEffect(() => loadArchive(), [])
  const months = useData((s) => s.teams[team]?.autoArchive ?? AUTO_ARCHIVE_MONTHS)
  const records = useData(useShallow((s) => Object.values(s.archive).filter((a) => a.team === team && !s.issues[a.id])))
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const list = useMemo(() => {
    const words = plain(query.trim()).split(/\s+/).filter(Boolean)
    return records
      .filter((a) => words.every((w) => plain(`${issueRef(a)} ${a.title}`).includes(w)))
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || b.number - a.number)
  }, [records, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-6 md:px-8">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        {left}
        {records.length > 0 && (
          <label className="ml-auto flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-[15px] focus-within:border-ring sm:w-72">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(PAGE)
              }}
              placeholder="Find an archived issue…"
              aria-label="Find an archived issue"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
      </div>
      {!loaded ? null : records.length === 0 ? (
        <EmptyState
          icon={<Archive />}
          title="Nothing archived yet"
          action={
            <Button variant="outline" asChild>
              <Link href="/settings">Change when issues are archived</Link>
            </Button>
          }
        >
          {months > 0
            ? `Finished issues move here by themselves ${months} ${months === 1 ? 'month' : 'months'} after they’re done. You can also archive any issue from its menu.`
            : 'This team keeps finished issues in its lists. You can archive any issue from its menu.'}
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          {list.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No archived issue matches “{query}”.</p>}
          <ul className="flex flex-col">
            {list.slice(0, shown).map((a) => (
              <li key={a.id}>
                <Link href={`/issue/${issueRef(a)}`} className="flex h-11 items-center gap-3 rounded-md px-2 text-[15px] hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none sm:px-4">
                  <span className="hidden min-w-[4.75rem] shrink-0 whitespace-nowrap text-muted-foreground tabular-nums sm:inline">{issueRef(a)}</span>
                  <StatusIcon status={a.status} />
                  <span className="min-w-0 truncate text-foreground/80">
                    <TitleText title={a.title} />
                  </span>
                  <span className="ml-auto shrink-0 text-sm text-muted-foreground">Archived {shortDate(a.archivedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {list.length > shown && (
            <div className="flex justify-center py-4">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({(list.length - shown).toLocaleString()} left)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
