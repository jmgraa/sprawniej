/** People the Linear import brought who aren't linked to a GitHub account yet, and what they have here. */
import { useShallow } from 'zustand/react/shallow'
import { useData, type DataState } from '@/data/store'
import { isGuest, type Person } from '@/model/schema'

/** "12 issues and 30 comments": what a person from Linear has here (issues they're assigned to or made); '' for none */
export function workOf(s: Pick<DataState, 'issues' | 'comments'>, login: string): string {
  const issues = Object.values(s.issues).filter((i) => i.assignee === login || i.createdBy === login).length
  const comments = Object.values(s.comments).reduce((n, list) => n + list.filter((c) => c.author === login).length, 0)
  const n = (count: number, one: string) => (count ? [`${count} ${one}${count === 1 ? '' : 's'}`] : [])
  return [...n(issues, 'issue'), ...n(comments, 'comment')].join(' and ')
}

/** the people from Linear who aren't linked to a GitHub account yet */
export function useUnlinked(): Person[] {
  return useData(useShallow((s) => Object.values(s.people).filter((p) => isGuest(p.login)).sort((a, b) => a.name.localeCompare(b.name))))
}
