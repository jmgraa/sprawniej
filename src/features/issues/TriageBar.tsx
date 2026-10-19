/**
 * On an issue waiting in Triage: accept it (into its team's default status), decline it (canceled), mark it as a
 * duplicate of another issue, or snooze it, the same four choices Linear's Triage gives.
 */
import { AlarmClock, Check, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Picker } from '@/components/Picker'
import { acceptIssue, declineIssue, defaultStatus, markDuplicate, snoozeIssue } from '@/data/actions'
import { isSnoozed } from '@/data/select'
import type { Issue } from '@/model/schema'
import { statusOf } from '@/model/status'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { useOtherIssueItems } from './pickers'
import { SNOOZES, snoozeUntil } from './snooze'

export function TriageBar({ issue }: { issue: Issue }) {
  const others = useOtherIssueItems(issue.id)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/30 px-3 py-2">
      <span className="mr-auto text-sm text-muted-foreground">
        {isSnoozed(issue) ? `Snoozed in Triage until ${new Date(issue.snoozedUntil!).toLocaleDateString()}` : 'Waiting in Triage'}
      </span>
      <Button size="sm" variant="outline" onClick={() => acceptIssue(issue.id)} title={`Moves it to ${statusOf(defaultStatus(issue.team)).name}`}>
        <Check /> Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => declineIssue(issue.id)}>
        <X /> Decline
      </Button>
      <Picker placeholder="Duplicate of…" items={others} value="" onSelect={(of) => markDuplicate(issue.id, of)} align="end">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent/60 [&_svg]:size-4">
          <Copy /> Mark as duplicate
        </span>
      </Picker>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <AlarmClock /> Snooze
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {SNOOZES.map(([label, step]) => (
            <DropdownMenuItem
              key={label}
              onSelect={() => {
                snoozeIssue(issue.id, snoozeUntil(step))
                toast(`Snoozed ${label.toLowerCase()}`, { description: 'It leaves Triage until then, or until it changes.' })
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
