/**
 * The menu that S (status), P (priority), A (assignee), L (labels) and E (estimate) open: for the picked issues, or the one under
 * the mouse, the focused one, or the open one. Pick with the keyboard or the mouse; labels stay open so you can
 * tick several. With several issues, a label is ticked when all of them have it.
 */
import { Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { usePalette, type QuickField } from '@/app/palette'
import type { PickerItem } from '@/components/Picker'
import { updateIssue } from '@/data/actions'
import { issueRef, useData } from '@/data/store'
import { plainFilter } from '@/lib/fuzzy'
import { cn } from '@/lib/utils'
import type { Issue } from '@/model/schema'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog'
import { estimateItems, priorityItems, statusItems, useLabelItems, usePeopleItems } from './pickers'

const TITLES: Record<QuickField, string> = { status: 'Change status', priority: 'Change priority', assignee: 'Assign to', labels: 'Change labels', estimate: 'Set estimate' }

function Menu({ issues, field }: { issues: Issue[]; field: QuickField }) {
  const people = usePeopleItems()
  const labels = useLabelItems()
  const close = () => usePalette.setState({ quick: null })
  const items = (
    field === 'status' ? statusItems : field === 'priority' ? priorityItems : field === 'assignee' ? people : field === 'estimate' ? estimateItems(issues.length === 1 ? issues[0].estimate : null) : labels
  ) as PickerItem<unknown>[]
  const chosen = (v: unknown) => issues.every((i) => (field === 'labels' ? i.labels.includes(v as string) : (i[field] ?? null) === v))

  function pick(v: unknown) {
    if (field === 'labels') {
      // a label all of them have comes off; otherwise it goes on all of them
      const id = v as string
      const off = chosen(id)
      for (const i of issues) {
        const has = i.labels.includes(id)
        if (off && has) updateIssue(i.id, { labels: i.labels.filter((l) => l !== id) })
        if (!off && !has) updateIssue(i.id, { labels: [...i.labels, id] })
      }
      return
    }
    for (const i of issues) if ((i[field] ?? null) !== v) updateIssue(i.id, { [field]: v })
    close()
  }

  return (
    <Command filter={plainFilter}>
      <CommandInput placeholder={`${TITLES[field]}…`} />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup>
          {items.map((i, n) => (
            <CommandItem key={n} value={`${i.label} ${(i.keywords ?? []).join(' ')}`} onSelect={() => pick(i.value)}>
              {i.icon}
              <span className="truncate">{i.label}</span>
              <Check className={cn('ml-auto size-4', !chosen(i.value) && 'invisible')} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function QuickEdit() {
  const quick = usePalette((s) => s.quick)
  const issues = useData(useShallow((s) => (quick ? quick.issues.map((id) => s.issues[id]).filter(Boolean) : [])))
  const open = !!quick && issues.length > 0
  return (
    <Dialog open={open} onOpenChange={(o) => !o && usePalette.setState({ quick: null })}>
      {open && (
        <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
          <div className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
            <DialogTitle className="shrink-0 text-sm font-normal">
              {TITLES[quick.field]}: <span className="text-foreground">{issues.length === 1 ? issueRef(issues[0]) : `${issues.length} issues`}</span>
            </DialogTitle>
            <DialogDescription className="truncate">{issues.length === 1 ? issues[0].title : issues.map(issueRef).join(', ')}</DialogDescription>
          </div>
          <Menu issues={issues} field={quick.field} />
        </DialogContent>
      )}
    </Dialog>
  )
}
