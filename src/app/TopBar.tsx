/** The bar above every page: sidebar toggle, where you are, whether your changes are saved, and search. */
import { Fragment } from 'react'
import { Link } from 'wouter'
import { PanelLeft, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNarrow } from '@/lib/useNarrow'
import { useChrome } from './chrome'
import { openPalette } from './palette'
import { SaveStatus } from './SaveStatus'
import { UpdateButton } from './UpdateButton'

export function TopBar() {
  const crumbs = useChrome((s) => s.crumbs)
  const toggle = useChrome((s) => s.toggleSidebar)
  const narrow = useNarrow()
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:h-16 md:gap-4 md:px-6">
      <button type="button" onClick={() => (narrow ? useChrome.setState({ menuOpen: true }) : toggle())} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Show or hide the sidebar">
        <PanelLeft className="size-5" />
      </button>
      <div className="hidden h-5 w-px bg-border md:block" />
      <nav className="flex min-w-0 items-center gap-2 text-[15px]" aria-label="Breadcrumbs">
        <Link href="/" className="hidden text-muted-foreground hover:text-foreground md:inline">
          Sprawniej
        </Link>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {/* a phone shows only where you are */}
            <span className="hidden text-muted-foreground md:inline">/</span>
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href} className="hidden truncate text-muted-foreground hover:text-foreground md:inline">
                {c.label}
              </Link>
            ) : (
              <span className={cn('truncate', i < crumbs.length - 1 && 'hidden md:inline')}>{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <UpdateButton />
        <SaveStatus />
        <button
          type="button"
          onClick={openPalette}
          className="flex size-10 items-center justify-center gap-2 rounded-lg border bg-input/20 text-[15px] text-muted-foreground hover:bg-input/40 md:w-80 md:justify-start md:px-3"
          aria-label="Search"
        >
          <Search className="size-4" />
          <span className="hidden md:inline">Search or jump to…</span>
          <kbd className="ml-auto hidden rounded-md border px-1.5 py-0.5 font-sans text-xs md:inline">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
