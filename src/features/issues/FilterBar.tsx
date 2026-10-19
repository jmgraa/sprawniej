/**
 * Filters for a list of issues: "Filter" adds one (status, assignee, subscribers, priority, labels, project, team), and each
 * active filter shows as a chip you can change or remove. Inside one filter, any chosen value matches
 * (Todo or In Progress); different filters must all match (Todo and assigned to Ana).
 */
import { useMemo, type ReactNode } from 'react'
import { Bell, Box, CircleDot, ListFilter, SignalHigh, Tag, UserRound, Users, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Picker, type PickerItem } from '@/components/Picker'
import { useData } from '@/data/store'
import type { Filters } from '@/model/schema'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import type { FilterKey } from './filters'
import { priorityItems, useLabelItems, usePeopleItems, useProjectItems, useStatusItems } from './pickers'

const KINDS: { key: FilterKey; name: string; icon: ReactNode }[] = [
  { key: 'statuses', name: 'Status', icon: <CircleDot /> },
  { key: 'assignees', name: 'Assignee', icon: <UserRound /> },
  { key: 'subscribers', name: 'Subscribers', icon: <Bell /> },
  { key: 'priorities', name: 'Priority', icon: <SignalHigh /> },
  { key: 'labels', name: 'Labels', icon: <Tag /> },
  { key: 'projects', name: 'Project', icon: <Box /> },
  { key: 'teams', name: 'Team', icon: <Users /> },
]

function useItems(): Record<FilterKey, PickerItem<unknown>[]> {
  const statuses = useStatusItems()
  const people = usePeopleItems()
  const labels = useLabelItems()
  const projects = useProjectItems()
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  return useMemo(
    () => ({
      statuses,
      assignees: people,
      // anyone following the issue: who made it, is assigned, commented, was mentioned or subscribed
      subscribers: people.filter((p) => p.value !== null),
      priorities: priorityItems,
      labels,
      projects,
      teams: teams.map((t) => ({ value: t.key, label: t.name, icon: <span className="w-4 text-center leading-none">{t.emoji}</span> })),
    }),
    [statuses, people, labels, projects, teams],
  )
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  /** filters this page already decides (a team page decides the team) */
  hide?: FilterKey[]
  /** shown at the end of the chip row, e.g. "Save as view" */
  extra?: ReactNode
}

export function FilterButton({ hide = [], onPick }: { hide?: FilterKey[]; onPick: (key: FilterKey) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 text-[15px]" aria-label="Filter">
          <ListFilter /> <span className="hidden sm:inline">Filter</span>
        </Button>
      </DropdownMenuTrigger>
      {/* focus goes to the filter's own menu next, not back to this button */}
      <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
        {KINDS.filter((k) => !hide.includes(k.key)).map((k) => (
          <DropdownMenuItem key={k.key} onSelect={() => setTimeout(() => onPick(k.key))} className="[&_svg]:text-muted-foreground">
            {k.icon} {k.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** the chips; `open` = the filter whose menu is open (one just picked from the Filter button shows even when empty) */
export function FilterChips({ filters, onChange, hide = [], extra, open, setOpen }: Props & { open: FilterKey | null; setOpen: (k: FilterKey | null) => void }) {
  const items = useItems()
  const shown = KINDS.filter((k) => !hide.includes(k.key) && ((filters[k.key]?.length ?? 0) > 0 || open === k.key))
  if (!shown.length && !extra) return null
  const set = (key: FilterKey, values: unknown[]) => onChange({ ...filters, [key]: values.length ? values : undefined })
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((k) => {
        const values = (filters[k.key] ?? []) as unknown[]
        const names = values.map((v) => items[k.key].find((i) => JSON.stringify(i.value) === JSON.stringify(v))?.label ?? (v === null ? String(v) : 'one that was deleted'))
        return (
          <span key={k.key} className="inline-flex h-8 items-center rounded-lg border text-sm">
            <Picker
              multiple
              placeholder={`${k.name}…`}
              items={items[k.key]}
              value={values}
              onSelect={(v) => set(k.key, v)}
              open={open === k.key}
              onOpenChange={(o) => setOpen(o ? k.key : null)}
            >
              <button type="button" className="flex h-full items-center gap-1.5 rounded-l-lg px-2.5 hover:bg-accent/60 [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
                {k.icon}
                <span className="text-muted-foreground">{k.name}</span>
                <span className="max-w-64 truncate">{names.length ? names.join(', ') : 'any'}</span>
              </button>
            </Picker>
            <button
              type="button"
              onClick={() => set(k.key, [])}
              className="flex h-full items-center rounded-r-lg border-l px-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label={`Remove the ${k.name.toLowerCase()} filter`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        )
      })}
      {shown.length > 1 && (
        <button type="button" onClick={() => onChange(Object.fromEntries(hide.map((k) => [k, filters[k]])))} className="px-1 text-sm text-muted-foreground hover:text-foreground">
          Clear all
        </button>
      )}
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  )
}
