/**
 * Issue statuses and priorities. Every team has the built-in statuses; a workspace can add its own on top
 * (statuses/<id>.json, usually brought over by the Linear import, like "Blocked"). Each status belongs to a group;
 * the groups decide its icon, its place in lists and which issues the Active, Backlog and All tabs show.
 */
import type { CustomStatus } from './schema'

export const STATUS_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'canceled'] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]

export const BUILTIN_STATUS_IDS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate'] as const
/** a built-in status id, or the id of a workspace's own status */
export type StatusId = string

export interface Status {
  id: StatusId
  name: string
  group: StatusGroup
  /** CSS colour (a theme variable, or a workspace status's own colour) */
  color: string
  /** a workspace's own status: the teams that use it (missing = every team) */
  teams?: string[]
  /** what it means */
  description?: string
  /** where new issues wait to be looked at: a backlog status with the triage icon */
  triage?: boolean
  /** one of the workspace's own (they can be edited in Settings) */
  custom?: boolean
}

export const STATUSES: Status[] = [
  { id: 'backlog', name: 'Backlog', group: 'backlog', color: 'var(--status-backlog)', description: 'We might do it some day.' },
  { id: 'todo', name: 'Todo', group: 'unstarted', color: 'var(--status-todo)', description: 'We plan to do it soon.' },
  { id: 'in_progress', name: 'In Progress', group: 'started', color: 'var(--status-progress)', description: 'Someone is working on it.' },
  { id: 'in_review', name: 'In Review', group: 'started', color: 'var(--status-review)', description: 'It’s done and waiting for someone to check it.' },
  { id: 'done', name: 'Done', group: 'completed', color: 'var(--status-done)', description: 'Finished.' },
  { id: 'canceled', name: 'Canceled', group: 'canceled', color: 'var(--status-canceled)', description: 'We decided not to do it.' },
  { id: 'duplicate', name: 'Duplicate', group: 'canceled', color: 'var(--status-canceled)', description: 'Someone already reported the same thing.' },
]

/**
 * Built-in and workspace statuses in one list: by group, built-in ones first, then the workspace's own by position.
 * Pure, so the import can use it on statuses it is about to write.
 */
export function workflow(custom: Iterable<CustomStatus>): Status[] {
  const own = [...custom].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
  return STATUS_GROUPS.flatMap((g) => [
    ...STATUSES.filter((s) => s.group === g),
    ...own
      .filter((s) => s.group === g)
      .map(
        (s): Status => ({
          id: s.id,
          name: s.name,
          group: s.group,
          color: s.color,
          custom: true,
          ...(s.teams?.length && { teams: s.teams }),
          ...(s.description && { description: s.description }),
          ...(s.triage && { triage: true }),
        }),
      ),
  ])
}

// the workspace's statuses, kept in step with the store (store.ts), so `statusOf` works anywhere
let all = workflow([])
let byId = new Map(all.map((s) => [s.id, s]))

export function setCustomStatuses(custom: Iterable<CustomStatus>) {
  all = workflow(custom)
  byId = new Map(all.map((s) => [s.id, s]))
}

/** every status, in order; with a team, only the ones that team uses */
export const allStatuses = (team?: string): Status[] => (team ? all.filter((s) => !s.teams || s.teams.includes(team)) : all)

export type FindStatus = (id: StatusId) => Status

/** a status whose file is gone (deleted, say) still shows, so nothing breaks */
export const statusOf = (id: StatusId): Status => byId.get(id) ?? { id, name: 'Deleted status', group: 'unstarted', color: 'var(--status-backlog)' }

/**
 * How much of a started status's circle is filled: the later in the workflow, the fuller (½, ¾, ⅞…), so
 * In Progress is half full and In Review three quarters
 */
export function startedFill(id: StatusId): number {
  const n = all.filter((s) => s.group === 'started').findIndex((s) => s.id === id)
  return 1 - 0.5 ** (Math.max(n, 0) + 1)
}

/**
 * The built-in status that stands in for a workspace's own status in the files (`status: canceled` next to
 * `customStatus: { id, as: canceled }`), so a version of the app from before workspace statuses can still read them
 */
export const STAND_IN: Record<StatusGroup, StatusId> = { backlog: 'backlog', unstarted: 'todo', started: 'in_progress', completed: 'done', canceled: 'canceled' }

export const isBuiltIn = (id: StatusId): boolean => (BUILTIN_STATUS_IDS as readonly string[]).includes(id)

/** a built-in status or one of the workspace's */
export const isStatus = (id: string): boolean => byId.has(id)

/** finished or canceled */
export const isClosed = (id: StatusId): boolean => ['completed', 'canceled'].includes(statusOf(id).group)
/** The tabs on a team's Issues page. */
export type IssueTab = 'active' | 'backlog' | 'all'

export const TAB_GROUPS: Record<IssueTab, StatusGroup[]> = {
  active: ['unstarted', 'started'],
  backlog: ['backlog'],
  all: ['backlog', 'unstarted', 'started', 'completed', 'canceled'],
}

/** 0 = no priority, 1 = urgent … 4 = low (the same numbers the import uses). */
export const PRIORITY_IDS = [0, 1, 2, 3, 4] as const
export type Priority = (typeof PRIORITY_IDS)[number]

export const PRIORITY_NAMES: Record<Priority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

/** Display order for grouping by priority: urgent first, "no priority" last. */
export const PRIORITY_ORDER: Priority[] = [1, 2, 3, 4, 0]

/** Estimates people can pick, in points. Imported issues can have other numbers; those are shown as they are. */
export const ESTIMATES = [1, 2, 3, 5, 8] as const
