/**
 * The choices for each issue property, ready for <Picker>. Used by the issue page, the new issue dialog and
 * keyboard shortcuts, so a property looks and works the same everywhere.
 */
import { useMemo } from 'react'
import { Box, CircleSlash } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { PersonAvatar } from '@/components/Avatar'
import type { PickerItem } from '@/components/Picker'
import { issueRef, useData } from '@/data/store'
import { isGuest, type Issue } from '@/model/schema'
import { ESTIMATES, PRIORITY_ORDER, PRIORITY_NAMES, workflow, type Priority, type StatusId } from '@/model/status'
import { EstimateIcon } from './DueDate'
import { estimateName } from './format'
import { PriorityIcon, StatusIcon } from './icons'

/** the statuses a team uses (without a team, every status in the workspace) */
export function useStatusItems(team?: string): PickerItem<StatusId>[] {
  const custom = useData((s) => s.statuses)
  return useMemo(
    () =>
      workflow(Object.values(custom))
        .filter((s) => !team || !s.teams || s.teams.includes(team))
        .map((s) => ({ value: s.id, label: s.name, icon: <StatusIcon status={s.id} /> })),
    [custom, team],
  )
}

export const priorityItems: PickerItem<Priority>[] = [0, ...PRIORITY_ORDER.filter((p) => p !== 0)].map((p) => ({
  value: p as Priority,
  label: PRIORITY_NAMES[p as Priority],
  icon: <PriorityIcon priority={p as Priority} />,
}))

export function usePeopleItems(): PickerItem<string | null>[] {
  const people = useData(useShallow((s) => Object.values(s.people)))
  const me = useData((s) => s.me?.login)
  return useMemo(
    () => [
      { value: null, label: 'No one', icon: <PersonAvatar login={null} /> },
      ...[...people]
        // you first, then everyone by name, then people who haven't joined yet
        .sort((a, b) => (a.login === me ? -1 : b.login === me ? 1 : Number(isGuest(a.login)) - Number(isGuest(b.login)) || a.name.localeCompare(b.name)))
        .map((p) => ({
          value: p.login as string | null,
          label: p.login === me ? `${p.name} (you)` : isGuest(p.login) ? `${p.name} (hasn’t joined)` : p.name,
          keywords: [p.login],
          icon: <PersonAvatar person={p} />,
        })),
    ],
    [people, me],
  )
}

export function useLabelItems(): PickerItem<string>[] {
  const labels = useData(useShallow((s) => Object.values(s.labels)))
  return useMemo(
    () =>
      [...labels]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => ({ value: l.id, label: l.name, icon: <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} /> })),
    [labels],
  )
}

export function useProjectItems(team?: string): PickerItem<string | null>[] {
  const projects = useData(useShallow((s) => Object.values(s.projects)))
  return useMemo(
    () => [
      { value: null, label: 'No project', icon: <Box className="size-4 text-muted-foreground" /> },
      ...projects
        .filter((p) => !team || p.teams.length === 0 || p.teams.includes(team))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id as string | null, label: p.name, icon: <span className="w-4 text-center leading-none">{p.emoji}</span> })),
    ],
    [projects, team],
  )
}

/** possible parents: issues in the same team, never the issue itself or one of its own sub-issues */
export function useParentItems(issue?: Pick<Issue, 'id' | 'team'>, team?: string): PickerItem<string | null>[] {
  const issues = useData((s) => s.issues)
  return useMemo(() => {
    const t = issue?.team ?? team
    const below = new Set<string>()
    if (issue) {
      const walk = (id: string) => {
        for (const i of Object.values(issues)) {
          if (i.parent !== id || below.has(i.id)) continue
          below.add(i.id)
          walk(i.id)
        }
      }
      below.add(issue.id)
      walk(issue.id)
    }
    return [
      { value: null, label: 'No parent', icon: <CircleSlash className="size-4 text-muted-foreground" /> },
      ...Object.values(issues)
        .filter((i) => i.team === t && !below.has(i.id))
        .sort((a, b) => b.number - a.number)
        .map((i) => ({ value: i.id as string | null, label: i.title, hint: issueRef(i), keywords: [issueRef(i)], icon: <StatusIcon status={i.status} /> })),
    ]
  }, [issues, issue, team])
}

/** the estimate choices; an imported estimate outside the usual ones is offered too, so it shows as picked */
export function estimateItems(current?: number | null): PickerItem<number | null>[] {
  const values = [...new Set([...ESTIMATES, ...(current != null ? [current] : [])])].sort((a, b) => a - b)
  return [
    { value: null, label: 'No estimate', icon: <EstimateIcon className="opacity-50" /> },
    ...values.map((p) => ({ value: p as number | null, label: estimateName(p), keywords: [String(p)], icon: <EstimateIcon /> })),
  ]
}
