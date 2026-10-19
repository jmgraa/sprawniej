/**
 * Settings › Statuses: every status, category by category, in one card. Any status can be dragged into another place
 * in its category by its handle and edited from its ⋯ menu (built-in ones too: name, colour, description); the
 * workspace's own can also be limited to some teams and deleted. ＋ on a category adds a status to it, and the
 * workspace can add categories of its own, each working like one of the built-in kinds.
 */
import { useState, type CSSProperties } from 'react'
import { GripVertical, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineText } from '@/components/InlineText'
import { Picker } from '@/components/Picker'
import {
  createStatus,
  createStatusCategory,
  deleteStatus,
  deleteStatusCategory,
  LABEL_COLORS,
  renameStatusCategory,
  reorderStatuses,
  resetBuiltinStatus,
  statusNameFree,
  statusUses,
  updateStatus,
} from '@/data/actions'
import { useData } from '@/data/store'
import { BUILTIN_CATEGORIES, STAND_IN, STATUS_GROUPS, categoriesOf, statusOf, type Category, type Status, type StatusGroup } from '@/model/status'
import { StatusIcon } from '@/features/issues/icons'
import { useWorkflow } from '@/features/issues/pickers'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { cn } from '@/lib/utils'

/** new issues start here */
const DEFAULT_STATUS = 'todo'

/** what a category of the workspace's own works like, in words */
const KIND_NAMES = Object.fromEntries(BUILTIN_CATEGORIES.filter((c) => c.id !== 'duplicate').map((c) => [c.kind, c.name])) as Record<StatusGroup, string>

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

/** one status: a handle to drag it, ⋯ to edit (or delete or reset) it; editing changes it in place */
function Row({ status, uses, onDelete }: { status: Status; uses: number; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const changed = useData((s) => {
    const b = s.builtinStatuses[status.id]
    return !!b && (b.name !== undefined || b.color !== undefined || b.description !== undefined)
  })
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
          {status.custom && <TeamsPicker status={status} />}
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
              {!status.custom && changed && (
                <DropdownMenuItem onSelect={() => resetBuiltinStatus(status.id)}>
                  <RotateCcw /> Reset name and colour
                </DropdownMenuItem>
              )}
              {status.custom && (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 /> Delete…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  )
}

function CategoryHeader({ category, onAdd, onDelete }: { category: Category; onAdd?: () => void; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className="group/head flex h-10 items-center gap-1 rounded-md bg-accent/50 pr-1.5 pl-4">
      {renaming ? (
        <InlineText value={category.name} onSave={(v) => renameStatusCategory(category.id, v)} onDone={() => setRenaming(false)} label={`Name of ${category.name}`} required autoFocus className="h-8 text-[15px]" />
      ) : (
        <h3 className="truncate text-[15px] text-muted-foreground">
          {category.name}
          {category.custom && <span className="text-muted-foreground/60"> · works like {KIND_NAMES[category.kind]}</span>}
        </h3>
      )}
      <span className="ml-auto flex items-center">
        {category.custom && !renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label={`More for ${category.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Delete category…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onAdd && (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onAdd} aria-label={`Add a status to ${category.name}`}>
            <Plus />
          </Button>
        )}
      </span>
    </div>
  )
}

function Section({ category, list, uses, onDelete, onDeleteCategory }: { category: Category; list: Status[]; uses: (id: string) => number; onDelete: (s: Status) => void; onDeleteCategory: () => void }) {
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = list.map((s) => s.id)
  function dropped({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    reorderStatuses(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  return (
    <section>
      <CategoryHeader category={category} onAdd={category.id === 'duplicate' ? undefined : () => setAdding(true)} onDelete={onDeleteCategory} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
        <ul className="flex flex-col divide-y divide-border/60 py-1">
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {list.map((s) => (
              <Row key={s.id} status={s} uses={uses(s.id)} onDelete={() => onDelete(s)} />
            ))}
          </SortableContext>
          {!list.length && !adding && <li className="px-2 py-3 text-sm text-muted-foreground">No statuses yet. Add one with ＋.</li>}
          {adding && (
            <li className="flex items-center gap-3 px-2 py-2.5">
              <Tile status={STAND_IN[category.kind]} faded />
              <InlineText
                value=""
                autoFocus
                placeholder="New status name"
                label="New status name"
                allowed={(v) => statusNameFree(v)}
                onSave={(v) => v.trim() && createStatus(category.kind, v, category.custom ? category.id : undefined)}
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

/** the last line of the card: name a category and pick which built-in kind it works like */
function NewCategory() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<StatusGroup>('started')
  if (!open) {
    return (
      <Button variant="ghost" className="w-fit text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus /> New category
      </Button>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (createStatusCategory(name, kind)) {
          setName('')
          setOpen(false)
        }
      }}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name, like Blocked" aria-label="Category name" className="h-9 max-w-64" />
      <span className="text-sm text-muted-foreground">works like</span>
      <Select value={kind} onValueChange={(v) => setKind(v as StatusGroup)}>
        <SelectTrigger className="h-9 w-36" aria-label="Works like">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_GROUPS.map((g) => (
            <SelectItem key={g} value={g}>
              {KIND_NAMES[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" disabled={!name.trim()}>
        Add
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  )
}

export function StatusesSettings() {
  const own = useData((s) => s.statusCategories)
  const issues = useData((s) => s.issues)
  const statuses = useWorkflow()
  const [deleting, setDeleting] = useState<Status | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const uses = (id: string) => Object.values(issues).filter((i) => i.status === id).length
  const homeOf = (kind: StatusGroup) => BUILTIN_CATEGORIES.find((c) => c.kind === kind)!.name

  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border bg-accent/10 p-3 pl-6 sm:pl-3">
        {categoriesOf(Object.values(own)).map((c) => (
          <Section key={c.id} category={c} list={statuses.filter((s) => s.category === c.id)} uses={uses} onDelete={setDeleting} onDeleteCategory={() => setDeletingCategory(c)} />
        ))}
        <NewCategory />
      </div>
      {deleting && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDeleting(null)} title={`Delete the status “${deleting.name}”?`} confirm="Delete status" onConfirm={() => deleteStatus(deleting.id)}>
          {statusUses(deleting.id)
            ? `${statusUses(deleting.id) === 1 ? 'The 1 issue' : `The ${statusUses(deleting.id)} issues`} in it (and any archived ones) move to ${statusOf(STAND_IN[deleting.group]).name}.`
            : `No issue is in it. Any archived ones move to ${statusOf(STAND_IN[deleting.group]).name}.`}
        </ConfirmDialog>
      )}
      {deletingCategory && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeletingCategory(null)}
          title={`Delete the category “${deletingCategory.name}”?`}
          confirm="Delete category"
          onConfirm={() => deleteStatusCategory(deletingCategory.id)}
        >
          Its statuses stay, and move to {homeOf(deletingCategory.kind)}. No issue changes.
        </ConfirmDialog>
      )}
    </>
  )
}
