/**
 * A set of issues with a toolbar: optional tabs on the left; Filter, Display and List / Board on the right (beside
 * the description, on a page with a header); the active filters below. The page decides the fixed part (`filters`, e.g. this team). What a person filters on top
 * stays on this page until they leave, or, on a saved view, is saved into the view.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Columns3, Layers, List, Plus, SearchX, SquareStack } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Segmented } from '@/components/Segmented'
import { useDisplay } from '@/data/displays'
import { groupIssues, inTab, matches } from '@/data/select'
import { useData } from '@/data/store'
import type { Display, Filters } from '@/model/schema'
import { allStatuses, TAB_GROUPS, type IssueTab } from '@/model/status'
import { Button } from '@/ui/button'
import { NewViewDialog } from '@/features/views/NewViewDialog'
import { DisplayOptions } from './DisplayOptions'
import { FilterButton, FilterChips } from './FilterBar'
import { activeFilters, type FilterKey } from './filters'
import { IssueBoard } from './IssueBoard'
import { IssueList } from './IssueList'
import { openComposer } from './composer'
import type { Group } from '@/data/select'
import type { NewIssue } from '@/data/actions'

interface Props {
  /** key for remembering List/Board and other display choices */
  page: string
  /** what the page always shows (this team, this project) */
  filters: Filters
  tab?: IssueTab
  baseDisplay?: Partial<Display>
  left?: ReactNode
  /** a view's or project's name and details, given the toolbar buttons to show beside its description */
  header?: (tools: ReactNode) => ReactNode
  empty?: ReactNode
  /** filter kinds the page decides already */
  hideFilters?: FilterKey[]
  /** a saved view: its filters and display live in the view, for everyone */
  saved?: { filters: Filters; display: Display; onFilters: (f: Filters) => void; onDisplay: (patch: Partial<Display>) => void }
  /** where "Save as view" puts a new view (null = the whole workspace); leave out to not offer it */
  viewScope?: string | null
}

export function IssuesView({ page, filters, tab = 'all', baseDisplay, left, header, empty, hideFilters, saved, viewScope }: Props) {
  const mine = useDisplay(page, baseDisplay)
  const display = saved?.display ?? mine.display
  const setDisplay = saved?.onDisplay ?? mine.setDisplay
  const [ownFilters, setOwnFilters] = useState<Filters>({})
  const extra = saved?.filters ?? ownFilters
  const setExtra = saved?.onFilters ?? setOwnFilters
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [saving, setSaving] = useState(false)

  const all = useData(useShallow((s) => Object.values(s.issues)))
  const people = useData((s) => s.people)
  const comments = useData((s) => s.comments)
  const projects = useData((s) => s.projects)
  // issues dropped on the board into a hidden column (Done on Active, another project on a project page) stay in view
  // until you leave
  const [keptOn, setKept] = useState<{ page: string; tab: string; ids: ReadonlySet<string> }>({ page, tab, ids: new Set() })
  const kept = useMemo(() => (keptOn.page === page && keptOn.tab === tab ? keptOn.ids : new Set<string>()), [keptOn, page, tab])
  const keep = (ids: string[]) => setKept({ page, tab, ids: new Set([...kept, ...ids]) })
  // (whatever the page's filters say: a dropped card lands in its new column, never vanishes)
  const shown = useMemo(() => {
    const follow = { comments, people }
    return all.filter((i) => kept.has(i.id) || (matches(i, filters, follow) && matches(i, extra, follow) && inTab(i, tab, [...(filters.statuses ?? []), ...(extra.statuses ?? [])])))
  }, [all, filters, extra, tab, kept, comments, people])
  const board = display.layout === 'board'
  // on a team's page, a board offers only that team's projects as places to drop
  const team = filters.teams?.length === 1 ? filters.teams[0] : undefined
  const groups = useMemo(() => groupIssues(shown, display, { people, projects, team, keep: kept }, tab, board), [shown, display, people, projects, tab, board, team, kept])
  const filtering = activeFilters(extra) > 0

  /** "+" on a group: a new issue that already belongs in that group (and on this page) */
  const addTo = (g: Group) => {
    const preset: Partial<NewIssue> = {}
    const both = { ...extra, ...filters }
    if (both.teams?.length === 1) preset.team = both.teams[0]
    if (both.projects?.length === 1 && both.projects[0]) preset.project = both.projects[0]
    if (both.labels?.length) preset.labels = both.labels
    if (both.assignees?.length === 1) preset.assignee = both.assignees[0]
    if (display.grouping === 'status' && typeof g.value === 'string') preset.status = g.value as NewIssue['status']
    if (display.grouping === 'priority' && typeof g.value === 'number') preset.priority = g.value as NewIssue['priority']
    if (display.grouping === 'assignee') preset.assignee = g.value as string | null
    if (display.grouping === 'project') preset.project = g.value as string | null
    openComposer(preset)
  }

  const saveAsView =
    viewScope !== undefined && !saved && filtering ? (
      <Button variant="outline" size="sm" onClick={() => setSaving(true)}>
        <Layers /> Save as view
      </Button>
    ) : undefined

  const tools = (
    <div className="flex items-center gap-2">
      <FilterButton hide={hideFilters} onPick={setOpenFilter} />
      <DisplayOptions display={display} onChange={setDisplay} onReset={saved ? undefined : mine.resetDisplay} tab={tab} />
      <Segmented
        tour="layout"
        label="Layout"
        value={display.layout}
        onChange={(layout) => setDisplay({ layout })}
        options={[
          { value: 'list', name: 'List', label: <><List /> <span className="hidden sm:inline">List</span></> },
          { value: 'board', name: 'Board', label: <><Columns3 /> <span className="hidden sm:inline">Board</span></> },
        ]}
      />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 md:px-8 pt-6">
      {header ? (
        header(tools)
      ) : (
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {left}
          <div className="ml-auto">{tools}</div>
        </div>
      )}
      <FilterChips filters={extra} onChange={setExtra} hide={hideFilters} open={openFilter} setOpen={setOpenFilter} extra={saveAsView} />
      {shown.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={<SearchX />}
            title="No issues match these filters"
            action={
              <Button variant="outline" onClick={() => setExtra({})}>
                Clear filters
              </Button>
            }
          />
        ) : (
          (empty ?? (
            <EmptyState
              icon={<SquareStack />}
              title="No issues here yet"
              action={
                <Button variant="outline" onClick={() => openComposer()}>
                  <Plus /> New issue
                </Button>
              }
            >
              Issues that fit this page show up here by themselves.
            </EmptyState>
          ))
        )
      ) : display.layout === 'list' ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-8" data-tour="issues">
          <IssueList groups={groups} display={display} onAdd={addTo} />
        </div>
      ) : (
        <div className="min-h-0 flex-1" data-tour="issues">
          <IssueBoard groups={groups} display={display} onAdd={addTo} onDrop={keep} />
        </div>
      )}
      {saving && (
        <NewViewDialog
          open
          onOpenChange={(o) => !o && setSaving(false)}
          preset={{ team: viewScope ?? null, filters: withTab({ ...filters, teams: undefined, ...extra }, tab), display }}
          onCreated={() => setOwnFilters({})}
        />
      )}
    </div>
  )
}

/** a view has no tabs: the tab you were on (Active, Backlog) becomes a status filter, so the view shows the same issues */
function withTab(f: Filters, tab: IssueTab): Filters {
  if (tab === 'all') return f
  const inTabNow = allStatuses()
    .filter((st) => (tab === 'triage' ? !!st.triage : !st.triage && TAB_GROUPS[tab].includes(st.group)))
    .map((st) => st.id)
  return { ...f, statuses: f.statuses?.length ? f.statuses.filter((st) => inTabNow.includes(st)) : inTabNow }
}
