/** Issues as rows, grouped (by status unless the display says otherwise). Rows can be dragged (useIssueDrag.ts). */
import { useMemo, useState, type CSSProperties, type HTMLAttributes, type Ref } from 'react'
import { Link } from 'wouter'
import { ChevronDown, Plus } from 'lucide-react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PersonAvatar } from '@/components/Avatar'
import { LabelChip } from '@/components/LabelChip'
import { nestChildren, type Group } from '@/data/select'
import { issueRef, useData } from '@/data/store'
import type { Display, Issue } from '@/model/schema'
import { isClosed } from '@/model/status'
import { cn } from '@/lib/utils'
import { PriorityIcon, StatusIcon } from './icons'
import { GroupIcon } from './GroupIcon'
import { DueChip, EstimateChip } from './DueDate'
import { shortDate } from './format'
import { SubIssueCount } from './SubIssueCount'
import { TitleText } from './TitleText'
import { dragAnnouncements } from './dragText'
import { CarryCount } from './CarryCount'
import { selectionClick, useSelection } from './selection'
import { AUTO_SCROLL, groupDropId, useIssueDrag } from './useIssueDrag'

interface RowProps {
  issue: Issue
  depth?: number
  /** drag-n-drop wiring, when the row can be dragged */
  dragRef?: Ref<HTMLAnchorElement>
  dragProps?: HTMLAttributes<HTMLElement>
  style?: CSSProperties
  /** the place the row was picked up from, while it's being dragged */
  ghost?: boolean
  /** the copy under the pointer */
  lifted?: boolean
}

export function IssueRow({ issue, depth = 0, dragRef, dragProps, style, ghost, lifted }: RowProps) {
  const assignee = useData((s) => (issue.assignee ? s.people[issue.assignee] : undefined))
  const labels = useData((s) => s.labels)
  const picked = useSelection((s) => s.ids.includes(issue.id))
  const carried = useSelection((s) => s.draggingMany) && picked && !lifted
  const closed = isClosed(issue.status)
  return (
    <Link
      ref={dragRef}
      {...dragProps}
      href={`/issue/${issueRef(issue)}`}
      data-issue-id={lifted ? undefined : issue.id}
      data-picked={picked || undefined}
      aria-selected={picked || undefined}
      // capture: the link itself leaves ⌘/Shift-clicks to the browser (new tab), before an onClick would run
      onClickCapture={(e) => selectionClick(e, issue.id)}
      className={cn(
        'group flex h-11 items-center gap-2 rounded-md px-2 text-[15px] sm:gap-3 sm:px-4 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none touch-manipulation select-none [-webkit-touch-callout:none]',
        (ghost || carried) && 'opacity-30',
        picked && !lifted && 'bg-accent ring-1 ring-inset ring-ring/50',
        lifted && 'cursor-grabbing border bg-popover shadow-lg',
      )}
      style={{ paddingLeft: `${1 + depth * 2}rem`, ...style }}
    >
      <PriorityIcon priority={issue.priority} />
      <span className="hidden min-w-[4.75rem] shrink-0 whitespace-nowrap text-muted-foreground tabular-nums sm:inline">{issueRef(issue)}</span>
      <StatusIcon status={issue.status} />
      <span className={cn('min-w-0 truncate', closed && 'text-muted-foreground')}>
        <TitleText title={issue.title} />
      </span>
      <SubIssueCount id={issue.id} className="shrink-0" />
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-2 md:flex">{issue.labels.map((id) => labels[id] && <LabelChip key={id} label={labels[id]} />)}</span>
        {issue.estimate != null && <EstimateChip points={issue.estimate} className="hidden md:inline-flex" />}
        {issue.dueDate && <DueChip day={issue.dueDate} closed={closed} />}
        <PersonAvatar person={assignee} login={issue.assignee} />
        <span className="hidden w-14 text-right text-sm text-muted-foreground sm:inline">{shortDate(issue.createdAt)}</span>
      </span>
    </Link>
  )
}

function SortableRow({ issue, depth }: { issue: Issue; depth: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id })
  return (
    <IssueRow
      issue={issue}
      depth={depth}
      dragRef={setNodeRef}
      // keep it a link for screen readers; dnd-kit would make it a button
      dragProps={{ ...attributes, role: undefined, ...listeners }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      ghost={isDragging}
    />
  )
}

interface SectionProps {
  group: Group
  ids: string[]
  issueOf: (id: string) => Issue | undefined
  onAdd?: (group: Group) => void
}

function GroupSection({ group, ids, issueOf, onAdd }: SectionProps) {
  const [open, setOpen] = useState(true)
  const { setNodeRef, isOver } = useDroppable({ id: groupDropId(group.key) })
  // how deep each row sits (sub-issues under their parent); an issue dragged in from elsewhere sits at the top level
  const depths = useMemo(() => new Map(nestChildren(group.issues).map((r) => [r.issue.id, r.depth])), [group.issues])
  return (
    <section ref={setNodeRef} className={cn('rounded-lg', isOver && !open && 'ring-1 ring-ring/50')}>
      <div className="sticky top-0 z-10 flex h-11 items-center gap-3 rounded-lg bg-accent/70 px-4 backdrop-blur">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 text-[15px] font-medium" aria-expanded={open}>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          <GroupIcon group={group} />
          {group.title}
          <span className="font-normal text-muted-foreground tabular-nums">{ids.length}</span>
        </button>
        {onAdd && (
          <button type="button" onClick={() => onAdd(group)} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`New issue in ${group.title}`}>
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <SortableContext id={group.key} items={ids} strategy={verticalListSortingStrategy}>
          <div className="min-h-2 py-1">
            {ids.map((id) => {
              const issue = issueOf(id)
              return issue && <SortableRow key={id} issue={issue} depth={depths.get(id) ?? 0} />
            })}
          </div>
        </SortableContext>
      )}
    </section>
  )
}

export function IssueList({ groups, display, onAdd }: { groups: Group[]; display: Display; onAdd?: (group: Group) => void }) {
  const drag = useIssueDrag(groups, display, { nest: true })
  const active = drag.activeId ? drag.issue(drag.activeId) : undefined
  const issues = useData((s) => s.issues)
  return (
    <DndContext {...drag.dnd} autoScroll={AUTO_SCROLL} accessibility={{ announcements: dragAnnouncements(issues, groups, drag.order) }}>
      <div className="flex flex-col gap-1" onClickCapture={(e) => drag.justDropped() && e.preventDefault()}>
        {groups
          // a group that empties while you drag stays put until you drop
          .filter((g) => g.issues.length > 0 || drag.order[g.key]?.length > 0)
          .map((g) => (
            <GroupSection key={g.key} group={g} ids={drag.order[g.key] ?? []} issueOf={drag.issue} onAdd={onAdd} />
          ))}
      </div>
      <DragOverlay>
        {active && (
          <div className="relative">
            <IssueRow issue={active} lifted />
            <CarryCount />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
