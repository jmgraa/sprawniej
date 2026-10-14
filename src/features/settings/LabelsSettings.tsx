/** Settings › Labels: rename, recolour or delete labels, and add new ones. Changes apply to every issue at once. */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineText } from '@/components/InlineText'
import { createLabel, deleteLabel, LABEL_COLORS, updateLabel } from '@/data/actions'
import { useData } from '@/data/store'
import type { Label } from '@/model/schema'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { cn } from '@/lib/utils'

function ColorButton({ label }: { label: Label }) {
  return (
    <Popover>
      <PopoverTrigger className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent/60" aria-label={`Colour of ${label.name}`}>
        <span className="size-3 rounded-full" style={{ background: label.color }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-5 gap-1 p-2">
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => updateLabel(label.id, { color: c })}
            className={cn('flex size-8 items-center justify-center rounded-md hover:bg-accent', c === label.color && 'bg-accent')}
            aria-label={`Use ${c}`}
            aria-pressed={c === label.color}
          >
            <span className="size-3.5 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function LabelsSettings() {
  const labels = useData(useShallow((s) => Object.values(s.labels).sort((a, b) => a.name.localeCompare(b.name))))
  const issues = useData((s) => s.issues)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Label | null>(null)
  const uses = (id: string) => Object.values(issues).filter((i) => i.labels.includes(id)).length
  const taken = labels.some((l) => l.name.toLowerCase() === name.trim().toLowerCase())

  return (
    <div className="flex flex-col gap-1">
      {labels.length === 0 && <p className="pb-2 text-[15px] text-muted-foreground">No labels yet. Labels like “Bug” or “Design” help you sort and filter issues.</p>}
      {labels.map((l) => {
        const n = uses(l.id)
        return (
          <div key={l.id} className="group flex h-11 items-center gap-2 rounded-md px-1 hover:bg-accent/40">
            <ColorButton label={l} />
            <InlineText
              value={l.name}
              onSave={(v) => updateLabel(l.id, { name: v })}
              allowed={(v) => !labels.some((o) => o.id !== l.id && o.name.toLowerCase() === v.toLowerCase())}
              label={`Name of ${l.name}`}
              required
              className="h-8 text-[15px]"
            />
            <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{n === 1 ? '1 issue' : `${n} issues`}</span>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete ${l.name}`} onClick={() => setDeleting(l)}>
              <Trash2 />
            </Button>
          </div>
        )
      })}
      <form
        className="mt-3 flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || taken) return
          createLabel(name)
          setName('')
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New label name" aria-label="New label name" className="h-9" />
        <Button type="submit" variant="outline" disabled={!name.trim() || taken}>
          <Plus /> Add
        </Button>
      </form>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete the label “${deleting.name}”?`}
          confirm="Delete label"
          onConfirm={() => deleteLabel(deleting.id)}
        >
          {uses(deleting.id) ? `It comes off ${uses(deleting.id) === 1 ? 'the 1 issue' : `all ${uses(deleting.id)} issues`} that have it. The issues stay.` : 'No issue uses it.'}
        </ConfirmDialog>
      )}
    </div>
  )
}
