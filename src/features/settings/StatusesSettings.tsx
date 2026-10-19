/**
 * Settings › Statuses: every status, by kind, in one card. The built-in ones are shown with how many issues they
 * have; the workspace's own (usually brought by the Linear import) can be dragged into another order by their handle,
 * and edited or deleted from their ⋯ menu. ＋ on a kind adds a new one.
 */
import { useState, type CSSProperties } from 'react'
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineText } from '@/components/InlineText'
import { Picker } from '@/components/Picker'
import { createStatus, deleteStatus, LABEL_COLORS, reorderStatuses, statusNameFree, statusUses, updateStatus } from '@/data/actions'
import { useData } from '@/data/store'
import { STAND_IN, statusOf, workflow, type Status, type StatusGroup } from '@/model/status'
import { StatusIcon } from '@/features/issues/icons'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { cn } from '@/lib/utils'

/** the card's sections: one per kind, with Duplicate on its own (it can't have company) */
const SECTIONS: { title: string; group: StatusGroup; shows: (s: Status) => boolean; canAdd: boolean }[] = [
  { title: 'Backlog', group: 'backlog', shows: (s) => s.group === 'backlog', canAdd: true },
  { title: 'Unstarted', group: 'unstarted', shows: (s) => s.group === 'unstarted', canAdd: true },
  { title: 'Started', group: 'started', shows: (s) => s.group === 'started', canAdd: true },
  { title: 'Completed', group: 'completed', shows: (s) => s.group === 'completed', canAdd: true },
  { title: 'Canceled', group: 'canceled', shows: (s) => s.group === 'canceled' && s.id !== 'duplicate', canAdd: true },
  { title: 'Duplicate', group: 'canceled', shows: (s) => s.id === 'duplicate', canAdd: false },
]

/** new issues start here */
const DEFAULT_STATUS = 'todo'

/** the status's icon on a soft square of its own colour */
function Tile({ status, faded }: { status: string; faded?: boolean }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', faded && 'opacity-50')} style={{ background: `color-mix(in oklab, ${statusOf(status).color} 16%, transparent)` }}>
      <StatusIcon status={status} className="size-4" />
    </span>
  )
}

const issuesText = (n: number) => (n === 1 ? '1 issue' : `${n} issues`)

function Details({ status, uses }: { status: Status; uses: number }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-[15px]">
        {status.name}
        {status.id === DEFAULT_STATUS && <span className="text-muted-foreground"> · Default</span>}
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {issuesText(uses)}
        {status.description && ` · ${status.description}`}
      </span>
    </span>
  )
}

function TeamsNote({ status }: { status: Status }) {
  const teams = useData((s) => s.teams)
  if (!status.teams?.length) return null
  return <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{status.teams.map((k) => teams[k]?.name ?? k).join(', ')}</span>
}

function BuiltInRow({ status, uses }: { status: Status; uses: number }) {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5">
      <Tile status={status.id} />
      <Details status={status} uses={uses} />
    </li>
  )
}

function ColorTile({ status }: { status: Status }) {
  return (
    <Popover>
      <PopoverTrigger className="rounded-lg outline-offset-2 hover:ring-1 hover:ring-ring/50" aria-label={`Colour of ${status.name}`}>
        <Tile status={status.id} />
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-5 gap-1 p-2">
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => updateStatus(status.id, { color: c })}
            className={cn('flex size-8 items-center justify-center rounded-md hover:bg-accent', c === status.color && 'bg-accent')}
            aria-label={`Use ${c}`}
            aria-pressed={c === status.color}
          >
            <span className="size-3.5 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function TeamsPicker({ status }: { status: Status }) {
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  const chosen = status.teams ?? []
  const items = teams.map((t) => ({ value: t.key, label: t.name, icon: <span className="w-4 text-center leading-none">{t.emoji}</span> }))
  const names = chosen.map((k) => teams.find((t) => t.key === k)?.name ?? k)
  return (
    <Picker multiple placeholder="Teams that use it…" items={items} value={chosen} onSelect={(keys) => updateStatus(status.id, { teams: keys })} align="end">
      <span className="flex h-8 max-w-48 items-center truncate rounded-md border px-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Teams that use it">
        {names.length ? names.join(', ') : 'Every team'}
      </span>
    </Picker>
  )
}

/** a status of the workspace's own: handle to drag it, ⋯ to edit or delete it; editing changes it in place */
function CustomRow({ status, uses, onDelete }: { status: Status; uses: number; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: status.id, disabled: editing })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} className={cn('group relative flex items-center gap-3 px-2 py-2.5', isDragging && 'z-10 rounded-lg bg-popover shadow-lg')}>
      {!editing && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${status.name}`}
          className="absolute top-1/2 -left-6 flex h-8 w-5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {editing ? (
        <>
          <ColorTile status={status} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <InlineText value={status.name} onSave={(v) => updateStatus(status.id, { name: v })} allowed={(v) => statusNameFree(v, status.id)} label={`Name of ${status.name}`} required autoFocus className="h-7 text-[15px]" />
            <InlineText value={status.description ?? ''} onSave={(v) => updateStatus(status.id, { description: v })} placeholder="Add a description" label={`Description of ${status.name}`} className="h-6 text-sm text-muted-foreground" />
          </span>
          <TeamsPicker status={status} />
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            Done
          </Button>
        </>
      ) : (
        <>
          <Tile status={status.id} />
          <Details status={status} uses={uses} />
          <TeamsNote status={status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label={`More for ${status.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  )
}

function Section({ title, group, list, canAdd, uses, onDelete }: { title: string; group: StatusGroup; list: Status[]; canAdd: boolean; uses: (id: string) => number; onDelete: (s: Status) => void }) {
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const own = list.filter((s) => s.custom).map((s) => s.id)
  function dropped({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    reorderStatuses(arrayMove(own, own.indexOf(String(active.id)), own.indexOf(String(over.id))))
  }
  return (
    <section>
      <div className="flex h-10 items-center rounded-md bg-accent/50 pr-1.5 pl-4">
        <h3 className="text-[15px] text-muted-foreground">{title}</h3>
        {canAdd && (
          <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" onClick={() => setAdding(true)} aria-label={`Add a ${title.toLowerCase()} status`}>
            <Plus />
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
        <ul className="flex flex-col divide-y divide-border/60 py-1">
          {list
            .filter((s) => !s.custom)
            .map((s) => (
              <BuiltInRow key={s.id} status={s} uses={uses(s.id)} />
            ))}
          <SortableContext items={own} strategy={verticalListSortingStrategy}>
            {list
              .filter((s) => s.custom)
              .map((s) => (
                <CustomRow key={s.id} status={s} uses={uses(s.id)} onDelete={() => onDelete(s)} />
              ))}
          </SortableContext>
          {adding && (
            <li className="flex items-center gap-3 px-2 py-2.5">
              <Tile status={STAND_IN[group]} faded />
              <InlineText
                value=""
                autoFocus
                placeholder="New status name"
                label="New status name"
                allowed={(v) => statusNameFree(v)}
                onSave={(v) => v.trim() && createStatus(group, v)}
                onDone={() => setAdding(false)}
                className="h-8 text-[15px]"
              />
            </li>
          )}
        </ul>
      </DndContext>
    </section>
  )
}

export function StatusesSettings() {
  const own = useData((s) => s.statuses)
  const issues = useData((s) => s.issues)
  const [deleting, setDeleting] = useState<Status | null>(null)
  const statuses = workflow(Object.values(own))
  const uses = (id: string) => Object.values(issues).filter((i) => i.status === id).length

  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border bg-accent/10 p-3 pl-6 sm:pl-3">
        {SECTIONS.map((sec) => (
          <Section key={sec.title} title={sec.title} group={sec.group} list={statuses.filter(sec.shows)} canAdd={sec.canAdd} uses={uses} onDelete={setDeleting} />
        ))}
      </div>
      {deleting && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDeleting(null)} title={`Delete the status “${deleting.name}”?`} confirm="Delete status" onConfirm={() => deleteStatus(deleting.id)}>
          {statusUses(deleting.id)
            ? `${statusUses(deleting.id) === 1 ? 'The 1 issue' : `The ${statusUses(deleting.id)} issues`} in it (and any archived ones) move to ${statusOf(STAND_IN[deleting.group]).name}.`
            : `No issue is in it. Any archived ones move to ${statusOf(STAND_IN[deleting.group]).name}.`}
        </ConfirmDialog>
      )}
    </>
  )
}
