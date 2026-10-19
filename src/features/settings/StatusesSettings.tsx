/**
 * Settings › Statuses: a team's workflow, like Linear's. Pick a team; its statuses are listed by category (the
 * categories are fixed). Any status can be dragged to another place in its category, edited (name, colour,
 * description: for every team that has it), made the team's default, or removed from the team as long as its
 * category keeps one, its issues moving to a status you pick. ＋ adds a status to a category. Below: triage and the
 * team's automations.
 */
import { useState, type CSSProperties } from 'react'
import { Link } from 'wouter'
import { GripVertical, MoreHorizontal, Pencil, Plus, RotateCcw, Star, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineText } from '@/components/InlineText'
import {
  canRemoveFromTeam,
  createStatus,
  defaultStatus,
  LABEL_COLORS,
  removeStatusFromTeam,
  reorderStatuses,
  resetBuiltinStatus,
  setDefaultStatus,
  setTeamAutomation,
  setTeamTriage,
  statusNameFree,
  statusUses,
  updateStatus,
} from '@/data/actions'
import { useData } from '@/data/store'
import { CATEGORIES, statusOf, usedBy, type CategoryId, type Status } from '@/model/status'
import type { Team } from '@/model/schema'
import { StatusIcon } from '@/features/issues/icons'
import { useWorkflow } from '@/features/issues/pickers'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Switch } from '@/ui/switch'
import { cn } from '@/lib/utils'

/** the status's icon on a soft square of its own colour */
function Tile({ status, faded }: { status: string; faded?: boolean }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', faded && 'opacity-50')} style={{ background: `color-mix(in oklab, ${statusOf(status).color} 16%, transparent)` }}>
      <StatusIcon status={status} className="size-4" />
    </span>
  )
}

const issuesText = (n: number) => (n === 1 ? '1 issue' : `${n} issues`)

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

/** the other teams whose workflow has this status (an edit changes it for them too) */
function useAlsoIn(status: Status, team: string): string[] {
  return useData(useShallow((s) => Object.values(s.teams).filter((t) => t.key !== team && usedBy(status, t.key)).map((t) => t.name)))
}

/** one status: a handle to drag it, ⋯ to edit, make default, reset or remove it; editing changes it in place */
function Row({ status, team, uses, isDefault, movable, onRemove }: { status: Status; team: string; uses: number; isDefault: boolean; movable: boolean; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const alsoIn = useAlsoIn(status, team)
  const changed = useData((s) => {
    const b = s.builtinStatuses[status.id]
    return !!b && (b.name !== undefined || b.color !== undefined || b.description !== undefined)
  })
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: status.id, disabled: editing || !movable })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  const canDefault = !isDefault && !status.triage && ['backlog', 'unstarted', 'started'].includes(status.group)
  return (
    <li ref={setNodeRef} style={style} className={cn('group relative flex items-center gap-3 px-2 py-2.5', isDragging && 'z-10 rounded-lg bg-popover shadow-lg')}>
      {!editing && movable && (
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
            {alsoIn.length > 0 && <span className="text-xs text-muted-foreground">Changes it for {alsoIn.join(', ')} too</span>}
          </span>
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            Done
          </Button>
        </>
      ) : (
        <>
          <Tile status={status.id} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px]">
              {status.name}
              {isDefault && <span className="text-muted-foreground"> · Default</span>}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {issuesText(uses)}
              {status.description && ` · ${status.description}`}
            </span>
          </span>
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
              {canDefault && (
                <DropdownMenuItem onSelect={() => setDefaultStatus(team, status.id)}>
                  <Star /> Make default
                </DropdownMenuItem>
              )}
              {!status.custom && changed && (
                <DropdownMenuItem onSelect={() => resetBuiltinStatus(status.id)}>
                  <RotateCcw /> Reset name and colour
                </DropdownMenuItem>
              )}
              {canRemoveFromTeam(status.id, team) && (
                <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                  <Trash2 /> Remove…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  )
}

/** `taken`: names the team's workflow already has (a name only another team uses can be added: that status joins) */
function Section({ category, team, list, taken, uses, onRemove }: { category: (typeof CATEGORIES)[number]; team: string; list: Status[]; taken: string[]; uses: (id: string) => number; onRemove: (s: Status) => void }) {
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = list.map((s) => s.id)
  const fallback = defaultStatus(team)
  function dropped({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    reorderStatuses(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  return (
    <section>
      <div className="flex h-10 items-center rounded-md bg-accent/50 pr-1.5 pl-4">
        <h3 className="text-[15px] text-muted-foreground">{category.name}</h3>
        {category.id !== 'duplicate' && (
          <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" onClick={() => setAdding(true)} aria-label={`Add a ${category.name.toLowerCase()} status`}>
            <Plus />
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
        <ul className="flex flex-col divide-y divide-border/60 py-1">
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {list.map((s) => (
              <Row key={s.id} status={s} team={team} uses={uses(s.id)} isDefault={s.id === fallback} movable={list.length > 1} onRemove={() => onRemove(s)} />
            ))}
          </SortableContext>
          {adding && (
            <li className="flex items-center gap-3 px-2 py-2.5">
              <Tile status={list[0]?.id ?? category.group} faded />
              <InlineText
                value=""
                autoFocus
                placeholder="New status name"
                label="New status name"
                allowed={(v) => !taken.includes(v.trim().toLowerCase())}
                onSave={(v) => v.trim() && createStatus(category.group, v, { team, triage: category.id === 'triage' })}
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

/** move-to choice for removing a status: any other status in the team's workflow */
function RemoveDialog({ status, team, statuses, onClose }: { status: Status; team: Team; statuses: Status[]; onClose: () => void }) {
  const others = statuses.filter((s) => s.id !== status.id && !s.triage)
  const [to, setTo] = useState(others.find((s) => s.category === status.category)?.id ?? others[0]?.id ?? '')
  const n = statusUses(status.id, team.key)
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Remove “${status.name}” from ${team.name}?`} confirm="Remove status" onConfirm={() => to && removeStatusFromTeam(status.id, team.key, to)}>
      <span className="flex flex-col gap-3">
        <span>{n ? `Its ${issuesText(n)} in ${team.name} (and any archived ones) move to:` : `No ${team.name} issue is in it. Any archived ones move to:`}</span>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger className="h-9 w-56" aria-label="Move its issues to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {others.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <StatusIcon status={s.id} /> {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
    </ConfirmDialog>
  )
}

const AUTO_CLOSE = [0, 1, 3, 6, 9, 12]

/** the team last looked at here (this browser only) */
const LAST_TEAM = 'sprawniej:statuses-team'

function Automations({ team }: { team: Team }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex-1">
          <span className="block text-[15px]">Auto-close</span>
          <span className="block text-sm text-muted-foreground">Issues not started yet that nobody touched for a while are canceled. Not while they’re in an unfinished project, due later, or have open sub-issues.</span>
        </span>
        <Select value={String(team.autoClose ?? 0)} onValueChange={(v) => setTeamAutomation(team.key, { autoClose: Number(v) })}>
          <SelectTrigger className="h-9 w-40" aria-label="Auto-close">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTO_CLOSE.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m === 0 ? 'Never' : m === 1 ? 'After 1 month' : `After ${m} months`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-3">
        <span className="flex-1">
          <span className="block text-[15px]">Close the parent with its sub-issues</span>
          <span className="block text-sm text-muted-foreground">Once all its sub-issues are closed, a parent issue moves to Done.</span>
        </span>
        <Switch checked={!!team.closeParentWithSubIssues} onCheckedChange={(on) => setTeamAutomation(team.key, { closeParentWithSubIssues: on })} />
      </label>
      <label className="flex items-center gap-3">
        <span className="flex-1">
          <span className="block text-[15px]">Close sub-issues with their parent</span>
          <span className="block text-sm text-muted-foreground">Closing a parent issue closes its open sub-issues the same way.</span>
        </span>
        <Switch checked={!!team.closeSubIssuesWithParent} onCheckedChange={(on) => setTeamAutomation(team.key, { closeSubIssuesWithParent: on })} />
      </label>
      <p className="text-sm text-muted-foreground">
        Closed issues are archived after a while: see{' '}
        <Link href="/settings/archive" className="underline underline-offset-2">
          Archive
        </Link>
        .
      </p>
    </div>
  )
}

export function StatusesSettings() {
  const teams = useData(useShallow((s) => Object.values(s.teams).sort((a, b) => a.name.localeCompare(b.name))))
  const issues = useData((s) => s.issues)
  const statuses = useWorkflow()
  const me = useData((s) => s.me?.login)
  // the team picked last time here, or else the first one you're in
  const [chosen, setChosen] = useState<string | null>(() => localStorage.getItem(LAST_TEAM))
  const team = teams.find((t) => t.key === chosen) ?? teams.find((t) => me && t.members.includes(me)) ?? teams[0]
  const choose = (key: string) => {
    localStorage.setItem(LAST_TEAM, key)
    setChosen(key)
  }
  const [removing, setRemoving] = useState<Status | null>(null)
  if (!team) return <p className="text-[15px] text-muted-foreground">Make a team first: statuses belong to a team’s workflow.</p>
  const mine = statuses.filter((s) => usedBy(s, team.key))
  const uses = (id: string) => Object.values(issues).filter((i) => i.status === id && i.team === team.key).length
  const shown = CATEGORIES.filter((c) => c.id !== 'triage' || team.triage)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <span className="text-[15px]">Workflow of</span>
        <Select value={team.key} onValueChange={choose}>
          <SelectTrigger className="h-9 w-56" aria-label="Team">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.emoji} {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border bg-accent/10 p-3 pl-6 sm:pl-3">
        {shown.map((c) => (
          <Section key={c.id} category={c} team={team.key} list={mine.filter((s) => s.category === (c.id as CategoryId))} taken={mine.map((s) => s.name.toLowerCase())} uses={uses} onRemove={setRemoving} />
        ))}
      </div>

      <label className="flex items-center gap-3">
        <span className="flex-1">
          <span className="block text-[15px] font-medium">Triage</span>
          <span className="block text-sm text-muted-foreground">
            An inbox for issues from outside the team. When someone who isn’t in {team.name} creates an issue for it, the issue waits on a Triage tab instead of
            joining the team’s work, until someone in the team accepts it (it moves to the default status), declines it, marks it as a duplicate or snoozes
            it. Turning it off moves waiting issues to Backlog.
          </span>
        </span>
        <Switch checked={!!team.triage} onCheckedChange={(on) => setTeamTriage(team.key, on)} />
      </label>

      <div>
        <h2 className="mb-3 text-[15px] font-medium">Automations</h2>
        <Automations team={team} />
      </div>

      {removing && <RemoveDialog status={removing} team={team} statuses={mine} onClose={() => setRemoving(null)} />}
    </div>
  )
}
