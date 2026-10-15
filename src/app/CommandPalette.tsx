/**
 * ⌘K (Ctrl K): search issues by ID or title, jump to any page, team, view or project, or run an action.
 * We filter ourselves (not cmdk) so a workspace with thousands of issues stays quick: only the best matches show.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { Box, CircleHelp, Download, Inbox, Layers, PanelLeft, Settings, SquarePen, SquareStack, User } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { loadArchive } from '@/data/project'
import { searchIssues } from '@/data/search'
import { findByRef, issueRef, useData } from '@/data/store'
import { openComposer } from '@/features/issues/composer'
import { StatusIcon } from '@/features/issues/icons'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog'
import { useChrome } from './chrome'
import { usePalette } from './palette'

interface Entry {
  id: string
  label: string
  icon: ReactNode
  /** more words to match */
  words?: string
  run: () => void
  shortcut?: string
}

const matches = (e: Entry, q: string) => q.split(/\s+/).every((w) => `${e.label} ${e.words ?? ''}`.toLowerCase().includes(w))

function Palette() {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState('')
  const close = () => usePalette.setState({ open: false })
  const issues = useData((s) => s.issues)
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  const views = useData(useShallow((s) => Object.values(s.views)))
  const projects = useData(useShallow((s) => Object.values(s.projects)))
  const go = (href: string) => () => navigate(href)

  const pages: Entry[] = useMemo(
    () => [
      { id: 'inbox', label: 'Inbox', icon: <Inbox />, run: go('/inbox') },
      { id: 'mine', label: 'My issues', icon: <User />, run: go('/my-issues') },
      ...teams.map((t) => ({ id: `team-${t.key}`, label: `${t.name} issues`, words: t.key, icon: <span className="w-5 text-center">{t.emoji}</span>, run: go(`/team/${t.key}/issues/active`) })),
      { id: 'projects', label: 'Projects', icon: <Box />, run: go('/projects') },
      { id: 'views', label: 'Views', icon: <Layers />, run: go('/views') },
      { id: 'settings', label: 'Settings and people', icon: <Settings />, run: go('/settings') },
      { id: 'help', label: 'Help', icon: <CircleHelp />, run: go('/help') },
    ],
    // eslint-style deps: navigate is stable
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [teams],
  )
  const things: Entry[] = useMemo(
    () => [
      ...views.map((v) => ({ id: `view-${v.id}`, label: v.name, words: 'view', icon: <span className="w-5 text-center">{v.emoji}</span>, run: go(`/view/${v.id}`) })),
      ...projects.map((p) => ({ id: `project-${p.id}`, label: p.name, words: 'project', icon: <span className="w-5 text-center">{p.emoji}</span>, run: go(`/project/${p.id}`) })),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [views, projects],
  )
  const actions: Entry[] = [
    { id: 'new', label: 'New issue', icon: <SquarePen />, run: () => openComposer(), shortcut: 'C' },
    { id: 'sidebar', label: 'Show or hide the sidebar', icon: <PanelLeft />, run: () => useChrome.getState().toggleSidebar() },
    { id: 'import', label: 'Import from Linear', icon: <Download />, run: go('/settings/import') },
  ]

  const q = query.trim().toLowerCase()
  const found = searchIssues(issues, query)
  // archived issues are found too, after the active ones (the archive is read the first time you search)
  const archive = useData((s) => s.archive)
  useEffect(() => {
    if (q) loadArchive()
  }, [q])
  const old = useMemo(() => Object.fromEntries(Object.entries(archive).filter(([id]) => !issues[id])), [archive, issues])
  // an archived issue asked for by its exact number (WEB-3) always shows, and first: WEB-30…39 mustn't bury it
  const exactOld = q ? findByRef(old, q) : undefined
  const exactActive = q ? findByRef(issues, q) : undefined
  const foundOld = useMemo(() => {
    const rest = found.length < 12 ? searchIssues(old, query, Math.min(6, 12 - found.length)) : []
    return exactOld ? [exactOld, ...rest.filter((i) => i !== exactOld)] : rest
  }, [found.length, old, query, exactOld])
  const oldFirst = !!exactOld && !exactActive
  const show = (list: Entry[]) => (q ? list.filter((e) => matches(e, q)) : list)
  const groups: [string, Entry[]][] = [
    ['Actions', show(actions)],
    ['Go to', show(pages)],
    ['Views and projects', q ? show(things) : []],
  ]
  const pick = (run: () => void) => {
    close()
    run()
  }

  const archivedGroup = foundOld.length > 0 && (
    <CommandGroup heading="Archived">
      {foundOld.map((i) => (
        <CommandItem key={i.id} value={`archived-${i.id}`} onSelect={() => pick(go(`/issue/${issueRef(i)}`))} className="text-muted-foreground">
          <StatusIcon status={i.status} />
          <span className="min-w-[4.75rem] shrink-0 whitespace-nowrap tabular-nums">{issueRef(i)}</span>
          <span className="truncate">{i.title}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )

  return (
    <Command shouldFilter={false} loop className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4">
      <CommandInput placeholder="Search issues, or type a command…" value={query} onValueChange={setQuery} className="h-12 text-[15px]" />
      <CommandList className="max-h-[min(60vh,28rem)]">
        <CommandEmpty>Nothing matches “{query.trim()}”.</CommandEmpty>
        {oldFirst && archivedGroup}
        {found.length > 0 && (
          <CommandGroup heading="Issues">
            {found.map((i) => (
              <CommandItem key={i.id} value={`issue-${i.id}`} onSelect={() => pick(go(`/issue/${issueRef(i)}`))}>
                <StatusIcon status={i.status} />
                <span className="min-w-[4.75rem] shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{issueRef(i)}</span>
                <span className="truncate">{i.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!oldFirst && archivedGroup}
        {groups.map(
          ([heading, list]) =>
            list.length > 0 && (
              <CommandGroup key={heading} heading={heading}>
                {list.map((e) => (
                  <CommandItem key={e.id} value={e.id} onSelect={() => pick(e.run)}>
                    {e.icon}
                    <span className="truncate">{e.label}</span>
                    {e.shortcut && <CommandShortcut>{e.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ),
        )}
        {!q && (
          <p className="px-4 pt-1 pb-3 text-xs text-muted-foreground">
            <SquareStack className="mr-1 inline size-3.5" /> Type an issue ID like ENG-12, or words from a title.
          </p>
        )}
      </CommandList>
    </Command>
  )
}

export function CommandPalette() {
  const open = usePalette((s) => s.open)
  return (
    <Dialog open={open} onOpenChange={(o) => usePalette.setState({ open: o })}>
      {open && (
        <DialogContent className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Search and commands</DialogTitle>
          <DialogDescription className="sr-only">Search issues by ID or title, go to a page, or run an action.</DialogDescription>
          <Palette />
        </DialogContent>
      )}
    </Dialog>
  )
}
