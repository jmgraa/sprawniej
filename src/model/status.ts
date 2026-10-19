/**
 * Issue statuses and priorities. Every team has the built-in statuses; a workspace can add its own on top
 * (statuses/<id>.json, usually brought over by the Linear import, like "Blocked"). Each status belongs to a group;
 * the groups decide its icon, its place in lists and which issues the Active, Backlog and All tabs show.
 */
import type { BuiltinStatus, CustomStatus, StatusCategory } from './schema'

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
  /** one of the workspace's own (they can be deleted, and limited to some teams) */
  custom?: boolean
  /** the section of the workflow it's in: a built-in category id ("started", "duplicate") or one of the workspace's */
  category: string
}

/** A section of the workflow: one per group, Duplicate on its own, and the workspace's own categories */
export interface Category {
  id: string
  name: string
  /** the group its statuses belong to */
  kind: StatusGroup
  custom?: boolean
}

export const BUILTIN_CATEGORIES: Category[] = [
  { id: 'backlog', name: 'Backlog', kind: 'backlog' },
  { id: 'unstarted', name: 'Unstarted', kind: 'unstarted' },
  { id: 'started', name: 'Started', kind: 'started' },
  { id: 'completed', name: 'Completed', kind: 'completed' },
  { id: 'canceled', name: 'Canceled', kind: 'canceled' },
  { id: 'duplicate', name: 'Duplicate', kind: 'canceled' },
]

/** the categories in order: each of the workspace's own comes after the built-in one of its kind */
export function categoriesOf(own: Iterable<StatusCategory>): Category[] {
  const mine = [...own].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
  return BUILTIN_CATEGORIES.flatMap((c) =>
    c.id === 'duplicate' ? [c] : [c, ...mine.filter((m) => m.kind === c.kind).map((m): Category => ({ id: m.id, name: m.name, kind: m.kind, custom: true }))],
  )
}

/** what the workspace changed on top of the built-in statuses */
export interface WorkflowExtras {
  builtins?: Iterable<BuiltinStatus>
  categories?: Iterable<StatusCategory>
}

export const STATUSES: Status[] = [
  { id: 'backlog', name: 'Backlog', group: 'backlog', color: 'var(--status-backlog)', category: 'backlog', description: 'We might do it some day.' },
  { id: 'todo', name: 'Todo', group: 'unstarted', color: 'var(--status-todo)', category: 'unstarted', description: 'We plan to do it soon.' },
  { id: 'in_progress', name: 'In Progress', group: 'started', color: 'var(--status-progress)', category: 'started', description: 'Someone is working on it.' },
  { id: 'in_review', name: 'In Review', group: 'started', color: 'var(--status-review)', category: 'started', description: 'It’s done and waiting for someone to check it.' },
  { id: 'done', name: 'Done', group: 'completed', color: 'var(--status-done)', category: 'completed', description: 'Finished.' },
  { id: 'canceled', name: 'Canceled', group: 'canceled', color: 'var(--status-canceled)', category: 'canceled', description: 'We decided not to do it.' },
  { id: 'duplicate', name: 'Duplicate', group: 'canceled', color: 'var(--status-canceled)', category: 'duplicate', description: 'Someone already reported the same thing.' },
]

/**
 * Every status in one list, category by category; within one, by position (built-in ones first until someone moves
 * them). Built-in statuses take the workspace's changes (`extras.builtins`). Pure, so the import can use it on
 * statuses it is about to write.
 */
export function workflow(custom: Iterable<CustomStatus>, extras: WorkflowExtras = {}): Status[] {
  const cats = categoriesOf(extras.categories ?? [])
  const changed = new Map<string, BuiltinStatus>([...(extras.builtins ?? [])].map((b) => [b.id, b]))
  const placed: (Status & { order: number })[] = [
    ...STATUSES.map((s, n) => {
      const b = changed.get(s.id)
      return {
        ...s,
        ...(b?.name?.trim() && { name: b.name.trim() }),
        ...(b?.color && { color: b.color }),
        ...(b?.description !== undefined && { description: b.description.trim() || undefined }),
        // built-in ones come first until someone puts them elsewhere
        order: b?.position ?? n - 100,
      }
    }),
    ...[...custom].map((s) => ({
      id: s.id,
      name: s.name,
      group: s.group,
      color: s.color,
      custom: true,
      // a category that's gone (or of another kind) leaves it in its group's own
      category: s.category && cats.some((c) => c.id === s.category && c.kind === s.group) ? s.category : s.group,
      order: s.position ?? 0,
      ...(s.teams?.length && { teams: s.teams }),
      ...(s.description && { description: s.description }),
      ...(s.triage && { triage: true }),
    })),
  ]
  return cats.flatMap((c) =>
    placed
      .filter((s) => s.category === c.id)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((s) => {
        const { order: _, ...status } = s
        return status
      }),
  )
}

// the workspace's statuses, kept in step with the store (store.ts), so `statusOf` works anywhere
let all = workflow([])
let byId = new Map(all.map((s) => [s.id, s]))

export function setCustomStatuses(custom: Iterable<CustomStatus>, extras: WorkflowExtras = {}) {
  all = workflow(custom, extras)
  byId = new Map(all.map((s) => [s.id, s]))
}

/** every status, in order; with a team, only the ones that team uses */
export const allStatuses = (team?: string): Status[] => (team ? all.filter((s) => !s.teams || s.teams.includes(team)) : all)

export type FindStatus = (id: StatusId) => Status

/** a status whose file is gone (deleted, say) still shows, so nothing breaks */
export const statusOf = (id: StatusId): Status => byId.get(id) ?? { id, name: 'Deleted status', group: 'unstarted', color: 'var(--status-backlog)', category: 'unstarted' }

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
 * `customStatus: { id, as: canceled }`), so a version of the app from before workspace statuses can still read them.
 * Backwards compatibility: don't remove or simplify this (CLAUDE.md, docs/architecture.md "Older versions").
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
