/**
 * Pure helpers that turn the store into what a list or board shows: filter, sort, group. No React, no store
 * access, so they are easy to test (tests/select.test.ts).
 */
import type { Comment, Display, Filters, InboxItem, Issue, Ordering, Person, Project, ReadState } from '@/model/schema'
import { followers } from './notify'
import { PRIORITY_NAMES, PRIORITY_ORDER, TAB_GROUPS, allStatuses, isClosed as closedStatus, statusOf, type IssueTab, type Priority, type Status } from '@/model/status'

/** for the Subscribers filter: who follows an issue depends on its comments and on who is in the workspace */
export interface FollowContext {
  comments: Record<string, Comment[]>
  people: Record<string, Person>
}

export function matches(issue: Issue, f: Filters, ctx?: FollowContext): boolean {
  if (f.teams?.length && !f.teams.includes(issue.team)) return false
  if (f.statuses?.length && !f.statuses.includes(issue.status)) return false
  if (f.assignees?.length && !f.assignees.includes(issue.assignee)) return false
  if (f.subscribers?.length && ctx) {
    const following = followers(issue, ctx.comments[issue.id] ?? [], ctx.people)
    if (!f.subscribers.some((l) => following.includes(l))) return false
  }
  if (f.priorities?.length && !f.priorities.includes(issue.priority)) return false
  if (f.labels?.length && !issue.labels.some((l) => f.labels!.includes(l))) return false
  if (f.projects?.length && !f.projects.includes(issue.project)) return false
  return true
}

/**
 * Whether a tab shows an issue. Issues waiting in Triage show only on the Triage tab (not while snoozed), or where a
 * filter asks for their status by name (`asked`), like in Linear: they're outside the normal workflow until accepted.
 */
export function inTab(issue: Issue, tab: IssueTab, asked?: string[]): boolean {
  const s = statusOf(issue.status)
  if (tab === 'triage') return !!s.triage && !isSnoozed(issue)
  if (s.triage) return !!asked?.includes(issue.status)
  return TAB_GROUPS[tab].includes(s.group)
}

/** snoozed in Triage, and nothing changed since */
export const isSnoozed = (issue: Issue, at = Date.now()): boolean =>
  !!issue.snoozedUntil && issue.snoozedUntil > new Date(at).toISOString() && issue.updatedAt <= (issue.snoozedAt ?? '')

/** "completed" and "canceled" issues are hidden unless the display asks for them */
export const isClosed = (issue: Issue) => closedStatus(issue.status)

const PRIORITY_RANK = new Map(PRIORITY_ORDER.map((p, i) => [p, i]))

export function compareIssues(ordering: Ordering): (a: Issue, b: Issue) => number {
  switch (ordering) {
    case 'priority':
      return (a, b) => PRIORITY_RANK.get(a.priority)! - PRIORITY_RANK.get(b.priority)! || byOrder(a, b)
    case 'due':
      // soonest first; no due date last
      return (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || byOrder(a, b)
    case 'updated':
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    case 'created':
      return (a, b) => b.createdAt.localeCompare(a.createdAt)
    case 'manual':
      return byOrder
  }
}

/** sortOrder keys compare as plain strings (not localeCompare: fractional-indexing relies on byte order) */
function byOrder(a: Issue, b: Issue): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface Group {
  /** what an issue dropped into this group gets: a status id, a login, a priority, a project id, or null */
  key: string
  value: string | number | null
  title: string
  issues: Issue[]
  /** a group this page leaves out (Done on the Active tab): never a column, only somewhere to drop an issue */
  outside?: boolean
}

interface GroupCtx {
  people: Record<string, Person>
  projects: Record<string, Project>
  /** the page's team, if it has one: only its projects become extra groups */
  team?: string
  /** issues shown even though the page would leave them out (just dropped on Done from the Active board) */
  keep?: ReadonlySet<string>
}

/**
 * Split issues into groups in display order. Grouping by status always shows every status the tab covers,
 * even empty ones, so there is somewhere to drop an issue.
 *
 * `everyGroup` (the board) adds a group for every other place an issue could go: statuses this tab leaves out
 * (marked `outside`), people with nothing assigned, open projects with nothing in them. The board shows empty ones
 * under "Hidden columns" as places to drop a card; one that gets an issue becomes a column.
 */
export function groupIssues(issues: Issue[], display: Display, ctx: GroupCtx, tab: IssueTab = 'all', everyGroup = false): Group[] {
  const sorted = issues
    .filter((i) => (display.showCompleted || !isClosed(i) || ctx.keep?.has(i.id)) && (display.showSubIssues || !i.parent))
    .sort(compareIssues(display.ordering))
  switch (display.grouping) {
    case 'none':
      return [{ key: 'all', value: null, title: 'All issues', issues: sorted }]
    case 'status': {
      const groups = TAB_GROUPS[tab]
      // Triage statuses only on the Triage tab, and there nothing else
      const shown = (s: Status) => groups.includes(s.group) && (tab === 'triage') === !!s.triage && (display.showCompleted || (s.group !== 'completed' && s.group !== 'canceled'))
      // the team's statuses, and any other one its issues have (an issue that moved here from another team)
      const known = allStatuses(ctx.team)
      const others = [...new Set(sorted.map((i) => i.status))].filter((id) => !known.some((s) => s.id === id)).map(statusOf)
      return [...known, ...others].filter((s) => everyGroup || shown(s)).map((s) => ({
        key: s.id,
        value: s.id,
        title: s.name,
        issues: sorted.filter((i) => i.status === s.id),
        ...(!shown(s) && { outside: true }),
      }))
    }
    case 'priority':
      return PRIORITY_ORDER.map((p: Priority) => ({
        key: `p${p}`,
        value: p,
        title: PRIORITY_NAMES[p],
        issues: sorted.filter((i) => i.priority === p),
      }))
    case 'assignee': {
      const assigned = sorted.map((i) => i.assignee).filter((l): l is string => !!l)
      const logins = [...new Set(everyGroup ? [...assigned, ...Object.keys(ctx.people)] : assigned)].sort((a, b) =>
        (ctx.people[a]?.name ?? a).localeCompare(ctx.people[b]?.name ?? b),
      )
      const out: Group[] = logins.map((l) => ({ key: l, value: l, title: ctx.people[l]?.name ?? l, issues: sorted.filter((i) => i.assignee === l) }))
      out.push({ key: 'nobody', value: null, title: 'No assignee', issues: sorted.filter((i) => !i.assignee) })
      return out
    }
    case 'project': {
      const used = sorted.map((i) => i.project).filter((p): p is string => !!p)
      const open = Object.values(ctx.projects)
        .filter((p) => p.status !== 'completed' && p.status !== 'canceled' && (!ctx.team || !p.teams.length || p.teams.includes(ctx.team)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => p.id)
      const ids = [...new Set(everyGroup ? [...used, ...open] : used)]
      const out: Group[] = ids.map((id) => ({ key: id, value: id, title: ctx.projects[id]?.name ?? 'Unknown project', issues: sorted.filter((i) => i.project === id) }))
      out.push({ key: 'none', value: null, title: 'No project', issues: sorted.filter((i) => !i.project) })
      return out
    }
  }
}

/**
 * Put each sub-issue right under its parent when both are in the same group.
 * Sub-issues whose parent is elsewhere stay where they are, at depth 0.
 */
export function nestChildren(issues: Issue[]): { issue: Issue; depth: number }[] {
  const here = new Set(issues.map((i) => i.id))
  const kids = new Map<string, Issue[]>()
  for (const i of issues) if (i.parent && here.has(i.parent)) kids.set(i.parent, [...(kids.get(i.parent) ?? []), i])
  const out: { issue: Issue; depth: number }[] = []
  const seen = new Set<string>()
  const visit = (i: Issue, depth: number) => {
    if (seen.has(i.id)) return // a parent loop in hand-edited files must not hang the app
    seen.add(i.id)
    out.push({ issue: i, depth })
    for (const k of kids.get(i.id) ?? []) visit(k, depth + 1)
  }
  for (const i of issues) if (!(i.parent && here.has(i.parent))) visit(i, 0)
  for (const i of issues) if (!seen.has(i.id)) visit(i, 0) // only reachable through a loop
  return out
}

export interface ChildCount {
  done: number
  total: number
}

const childCache = new WeakMap<Record<string, Issue>, Map<string, ChildCount>>()

/**
 * Sub-issue counters for every parent at once: how many children are done, out of how many. Built once per
 * version of the issues record (the store replaces it on every change), so a list of n rows costs O(n), not O(n²).
 */
export function childIndex(issues: Record<string, Issue>): Map<string, ChildCount> {
  let index = childCache.get(issues)
  if (index) return index
  index = new Map()
  for (const i of Object.values(issues)) {
    if (!i.parent) continue
    const c = index.get(i.parent) ?? { done: 0, total: 0 }
    c.total++
    if (statusOf(i.status).group === 'completed') c.done++
    index.set(i.parent, c)
  }
  childCache.set(issues, index)
  return index
}

/** share of a project's issues that are done, 0..1 (canceled ones don't count either way) */
export function projectProgress(projectId: string, issues: Issue[]): { done: number; total: number } {
  const mine = issues.filter((i) => i.project === projectId && statusOf(i.status).group !== 'canceled')
  return { done: mine.filter((i) => statusOf(i.status).group === 'completed').length, total: mine.length }
}

/** not marked as read yet (state/<login>.json) */
export const isUnread = (n: Pick<InboxItem, 'id' | 'at'>, r: ReadState) => !r.read.includes(n.id) && (!r.readUntil || n.at > r.readUntil)
