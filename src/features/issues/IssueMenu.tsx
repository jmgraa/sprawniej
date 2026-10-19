/**
 * Right-click (or long-press) on an issue in a list or on a board: open it, copy its number or link, change its
 * status, priority, assignee, labels or estimate, archive or delete it. With several issues picked and one of them
 * right-clicked, the changes apply to all of them.
 */
import { useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { AlarmClock, Archive, Check, CircleDot, Copy, ExternalLink, Link2, SignalHigh, Tag, Trash2, Triangle, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { usePalette, type QuickField } from '@/app/palette'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { acceptIssue, archiveIssues, declineIssue, deleteIssue, snoozeIssue } from '@/data/actions'
import { issueRef } from '@/data/store'
import type { Issue } from '@/model/schema'
import { isTriage } from '@/model/status'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/ui/context-menu'
import { clearSelection, useSelection } from './selection'
import { SNOOZES, snoozeUntil } from './snooze'

const FIELDS: [QuickField, string, typeof CircleDot, string][] = [
  ['status', 'Status', CircleDot, 'S'],
  ['priority', 'Priority', SignalHigh, 'P'],
  ['assignee', 'Assignee', UserRound, 'A'],
  ['labels', 'Labels', Tag, 'L'],
  ['estimate', 'Estimate', Triangle, 'E'],
]

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast(`${what} copied`))

export function IssueMenu({ issue, disabled, children }: { issue: Issue; disabled?: boolean; children: ReactNode }) {
  const [, navigate] = useLocation()
  const [ids, setIds] = useState<string[]>([issue.id])
  const [confirm, setConfirm] = useState(false)
  const many = ids.length > 1
  const ref = issueRef(issue)

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (!open) return
          // the picked issues, if this is one of them; otherwise just this one
          const picked = useSelection.getState().ids
          setIds(picked.includes(issue.id) ? picked : [issue.id])
        }}
      >
        <ContextMenuTrigger asChild disabled={disabled}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {many ? (
            <ContextMenuLabel>{ids.length} picked issues</ContextMenuLabel>
          ) : (
            <>
              <ContextMenuItem onSelect={() => navigate(`/issue/${ref}`)}>
                <ExternalLink /> Open
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => copy(ref, ref)}>
                <Copy /> Copy number
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => copy(`${location.origin}${location.pathname}#/issue/${ref}`, 'Link')}>
                <Link2 /> Copy link
              </ContextMenuItem>
            </>
          )}
          {!many && isTriage(issue.status) && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => acceptIssue(issue.id)}>
                <Check /> Accept
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => declineIssue(issue.id)}>
                <X /> Decline
              </ContextMenuItem>
              {SNOOZES.map(([label, step]) => (
                <ContextMenuItem key={label} onSelect={() => snoozeIssue(issue.id, snoozeUntil(step))}>
                  <AlarmClock /> Snooze {label.toLowerCase()}
                </ContextMenuItem>
              ))}
            </>
          )}
          <ContextMenuSeparator />
          {FIELDS.map(([field, label, Icon, key]) => (
            // opens the same menu as the shortcut, for these issues
            <ContextMenuItem key={field} onSelect={() => usePalette.setState({ quick: { issues: ids, field } })}>
              <Icon /> {label}…<ContextMenuShortcut>{key}</ContextMenuShortcut>
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              const n = archiveIssues(ids)
              if (many) clearSelection()
              toast(`Archived ${n} issue${n === 1 ? '' : 's'}`, { description: 'Find archived issues under Archived on their team’s Issues page.' })
            }}
          >
            <Archive /> {many ? `Archive ${ids.length} issues` : 'Archive'}
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 /> {many ? `Delete ${ids.length} issues…` : 'Delete…'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={many ? `Delete ${ids.length} issues?` : `Delete ${ref}?`}
        confirm="Delete"
        onConfirm={() => {
          for (const id of ids) deleteIssue(id)
          if (many) clearSelection()
        }}
      >
        {many ? 'They and their comments will be removed for everyone. Their sub-issues stay.' : 'It and its comments will be removed for everyone. Its sub-issues stay.'}
      </ConfirmDialog>
    </>
  )
}
