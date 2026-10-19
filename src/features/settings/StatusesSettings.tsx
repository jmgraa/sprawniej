/**
 * Settings › Statuses: every status, by kind. The built-in ones are shown with what they mean; the workspace's own
 * (usually brought by the Linear import) can be renamed, recoloured, described, limited to some teams, moved,
 * deleted, and new ones added.
 */
import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineText } from '@/components/InlineText'
import { Picker } from '@/components/Picker'
import { createStatus, deleteStatus, LABEL_COLORS, moveStatus, statusNameFree, statusUses, updateStatus } from '@/data/actions'
import { useData } from '@/data/store'
import { STAND_IN, STATUS_GROUPS, statusOf, workflow, type Status, type StatusGroup } from '@/model/status'
import { StatusIcon } from '@/features/issues/icons'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { cn } from '@/lib/utils'

const GROUP_NAMES: Record<StatusGroup, string> = { backlog: 'Backlog', unstarted: 'Not started', started: 'Started', completed: 'Done', canceled: 'Canceled' }

function ColorButton({ status }: { status: Status }) {
  return (
    <Popover>
      <PopoverTrigger className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent/60" aria-label={`Colour of ${status.name}`}>
        <StatusIcon status={status.id} className="size-4" />
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

function TeamsButton({ status }: { status: Status }) {
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  const chosen = status.teams ?? []
  const items = teams.map((t) => ({ value: t.key, label: t.name, icon: <span className="w-4 text-center leading-none">{t.emoji}</span> }))
  const names = chosen.map((k) => teams.find((t) => t.key === k)?.name ?? k)
  return (
    <Picker multiple placeholder="Teams that use it…" items={items} value={chosen} onSelect={(keys) => updateStatus(status.id, { teams: keys })} align="end">
      <span className="h-8 max-w-40 truncate rounded-md px-2 text-sm leading-8 text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Teams that use it">
        {names.length ? names.join(', ') : 'Every team'}
      </span>
    </Picker>
  )
}

function Row({ status, first, last, uses, onDelete }: { status: Status; first: boolean; last: boolean; uses: number; onDelete: () => void }) {
  const count = <span className="w-20 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{uses === 1 ? '1 issue' : `${uses} issues`}</span>
  if (!status.custom) {
    return (
      <li className="flex min-h-11 items-center gap-2 rounded-md px-1">
        <span className="flex size-8 shrink-0 items-center justify-center">
          <StatusIcon status={status.id} className="size-4" />
        </span>
        <span className="w-36 shrink-0 text-[15px]">{status.name}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{status.description}</span>
        <span className="shrink-0 text-sm text-muted-foreground/70">Built in</span>
        {count}
        <span className="w-[100px] shrink-0" />
      </li>
    )
  }
  return (
    <li className="group flex min-h-11 items-center gap-2 rounded-md px-1 hover:bg-accent/40">
      <ColorButton status={status} />
      <InlineText value={status.name} onSave={(v) => updateStatus(status.id, { name: v })} allowed={(v) => statusNameFree(v, status.id)} label={`Name of ${status.name}`} required className="h-8 w-36 shrink-0 text-[15px]" />
      <InlineText value={status.description ?? ''} onSave={(v) => updateStatus(status.id, { description: v })} placeholder="Add a description" label={`Description of ${status.name}`} className="h-8 min-w-0 flex-1 text-sm text-muted-foreground" />
      <TeamsButton status={status} />
      {count}
      <span className="flex w-[100px] shrink-0 justify-end [@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" disabled={first} aria-label={`Move ${status.name} up`} onClick={() => moveStatus(status.id, -1)}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" disabled={last} aria-label={`Move ${status.name} down`} onClick={() => moveStatus(status.id, 1)}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Delete ${status.name}`} onClick={onDelete}>
          <Trash2 />
        </Button>
      </span>
    </li>
  )
}

export function StatusesSettings() {
  const own = useData((s) => s.statuses)
  const issues = useData((s) => s.issues)
  const [adding, setAdding] = useState<StatusGroup | null>(null)
  const [deleting, setDeleting] = useState<Status | null>(null)
  const statuses = workflow(Object.values(own))
  const uses = (id: string) => Object.values(issues).filter((i) => i.status === id).length

  return (
    <div className="flex flex-col gap-6">
      {STATUS_GROUPS.map((g) => {
        const list = statuses.filter((s) => s.group === g)
        const mine = list.filter((s) => s.custom)
        return (
          <div key={g}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">{GROUP_NAMES[g]}</h3>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAdding(g)} aria-label={`Add a ${GROUP_NAMES[g].toLowerCase()} status`}>
                <Plus /> Add
              </Button>
            </div>
            <ul className="flex flex-col">
              {list.map((s) => (
                <Row key={s.id} status={s} first={mine[0]?.id === s.id} last={mine.at(-1)?.id === s.id} uses={uses(s.id)} onDelete={() => setDeleting(s)} />
              ))}
              {adding === g && (
                <li className="flex h-11 items-center gap-2 rounded-md bg-accent/40 px-1">
                  <span className="flex size-8 shrink-0 items-center justify-center">
                    <StatusIcon status={STAND_IN[g]} className="size-4 opacity-50" />
                  </span>
                  <InlineText
                    value=""
                    autoFocus
                    placeholder="New status name"
                    label="New status name"
                    allowed={(v) => statusNameFree(v)}
                    onSave={(v) => v.trim() && createStatus(g, v)}
                    onDone={() => setAdding(null)}
                    className="h-8 text-[15px]"
                  />
                </li>
              )}
            </ul>
          </div>
        )
      })}
      {deleting && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDeleting(null)} title={`Delete the status “${deleting.name}”?`} confirm="Delete status" onConfirm={() => deleteStatus(deleting.id)}>
          {statusUses(deleting.id)
            ? `${statusUses(deleting.id) === 1 ? 'The 1 issue' : `The ${statusUses(deleting.id)} issues`} in it (and any archived ones) move to ${statusOf(STAND_IN[deleting.group]).name}.`
            : `No issue is in it. Any archived ones move to ${statusOf(STAND_IN[deleting.group]).name}.`}
        </ConfirmDialog>
      )}
    </div>
  )
}
