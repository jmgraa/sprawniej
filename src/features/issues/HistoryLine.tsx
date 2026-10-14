/** One line of an issue's history ("Ana moved it from Todo to In Progress · 2 h ago"), shown between comments. */
import type { ReactNode } from 'react'
import { PersonAvatar } from '@/components/Avatar'
import type { Change, HistoryEvent } from '@/data/history'
import { issueRef, useData } from '@/data/store'
import { PRIORITY_NAMES, statusOf } from '@/model/status'
import { estimateName, shortDate, timeAgo } from './format'
import { PriorityIcon, StatusIcon } from './icons'

const B = ({ children }: { children: ReactNode }) => <span className="text-foreground/90">{children}</span>

function list(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function useText(change: Change, by: string): ReactNode {
  const people = useData((s) => s.people)
  const projects = useData((s) => s.projects)
  const labels = useData((s) => s.labels)
  const issues = useData((s) => s.issues)
  const person = (l: string | null) => (l ? (people[l]?.name ?? l) : '')
  const project = (id: string | null) => (id && projects[id] ? `${projects[id].emoji} ${projects[id].name}` : 'a project')
  const issue = (id: string | null) => (id && issues[id] ? issueRef(issues[id]) : 'another issue')
  switch (change.kind) {
    case 'status':
      return (
        <>
          moved it from <StatusIcon status={change.from} className="inline align-[-2px]" /> <B>{statusOf(change.from).name}</B> to{' '}
          <StatusIcon status={change.to} className="inline align-[-2px]" /> <B>{statusOf(change.to).name}</B>
        </>
      )
    case 'priority':
      return change.to ? (
        <>
          set the priority to <PriorityIcon priority={change.to} className="inline align-[-2px]" /> <B>{PRIORITY_NAMES[change.to]}</B>
        </>
      ) : (
        'removed the priority'
      )
    case 'assignee':
      if (!change.to) return <>unassigned <B>{person(change.from)}</B></>
      return change.to === by ? 'assigned it to themselves' : <>assigned it to <B>{person(change.to)}</B></>
    case 'labels': {
      const word = (n: number) => (n === 1 ? 'label' : 'labels')
      // "the Bug and Design labels", and labels deleted since then said as such
      const these = (ids: string[]) => {
        const named = ids.flatMap((id) => (labels[id] ? [labels[id].name] : []))
        const gone = ids.length - named.length
        const goneText = gone === 1 ? 'a label deleted since' : `${gone} labels deleted since`
        if (!named.length) return goneText
        return (
          <>
            the <B>{list(named)}</B> {word(named.length)}
            {gone > 0 && <> and {goneText}</>}
          </>
        )
      }
      if (change.added.length && change.removed.length) return <>added {these(change.added)} and removed {these(change.removed)}</>
      if (change.added.length) return <>added {these(change.added)}</>
      return <>removed {these(change.removed)}</>
    }
    case 'project':
      return change.to ? <>moved it to <B>{project(change.to)}</B></> : <>took it out of <B>{project(change.from)}</B></>
    case 'parent':
      return change.to ? <>made it a sub-issue of <B>{issue(change.to)}</B></> : <>made it a standalone issue</>
    case 'title':
      return <>renamed it to <B>“{change.to}”</B></>
    case 'description':
      return 'edited the description'
    case 'dueDate':
      return change.to ? <>set the due date to <B>{shortDate(change.to)}</B></> : 'removed the due date'
    case 'estimate':
      return change.to !== null ? <>set the estimate to <B>{estimateName(change.to)}</B></> : 'removed the estimate'
    case 'team':
      return <>moved it from <B>{change.from}</B> to <B>{change.to}</B></>
    case 'removed':
      return /^(?:- )?Archive /m.test(change.message) ? 'archived it' : 'removed it'
    case 'restored':
      return 'brought it back'
  }
}

export function HistoryLine({ event }: { event: HistoryEvent }) {
  const person = useData((s) => s.people[event.by])
  const text = useText(event.change, event.by)
  return (
    <li className="flex items-start gap-2.5 px-1 text-sm text-muted-foreground">
      <PersonAvatar person={person} login={event.by} className="mt-px size-5 text-[9px]" />
      <span className="min-w-0">
        <B>{person?.name ?? event.by}</B> {text}
        <span title={new Date(event.at).toLocaleString()}> · {timeAgo(event.at)}</span>
      </span>
    </li>
  )
}

/** the first line: who created the issue, from its own fields */
export function CreatedLine({ by, at }: { by: string; at: string }) {
  const person = useData((s) => s.people[by])
  return (
    <li className="flex items-start gap-2.5 px-1 text-sm text-muted-foreground">
      <PersonAvatar person={person} login={by} className="mt-px size-5 text-[9px]" />
      <span>
        <B>{person?.name ?? by}</B> created the issue
        <span title={new Date(at).toLocaleString()}> · {timeAgo(at)}</span>
      </span>
    </li>
  )
}
