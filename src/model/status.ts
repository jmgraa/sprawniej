/**
 * Issue statuses and priorities. Each team has a workflow: the built-in statuses (a team can leave some out, and the
 * workspace can rename and reorder them, builtin-statuses/) plus statuses of the workspace's own (statuses/<id>.json,
 * often brought by the Linear import, like "Blocked"), each for some teams. Every status is in one of the fixed
 * categories (Triage, Backlog, Unstarted, Started, Completed, Canceled, Duplicate), which can't change: they decide its
 * icon, its place in lists, which tab shows its issues and whether they count as closed.
 */
import type { BuiltinStatus, CustomStatus } from './schema'

export const STATUS_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'canceled'] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]

export const BUILTIN_STATUS_IDS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate'] as const
/** a built-in status id, or the id of a workspace's own status */
export type StatusId = string

/**
 * The fixed sections of a workflow, in order. Triage statuses are backlog ones (that is what files and older versions
 * see) set apart for issues waiting to be looked at; Duplicate is a canceled one of its own.
 */
export const CATEGORIES = [
  { id: 'triage', name: 'Triage', group: 'backlog' },
  { id: 'backlog', name: 'Backlog', group: 'backlog' },
  { id: 'unstarted', name: 'Unstarted', group: 'unstarted' },
  { id: 'started', name: 'Started', group: 'started' },
  { id: 'completed', name: 'Completed', group: 'completed' },
  { id: 'canceled', name: 'Canceled', group: 'canceled' },
  { id: 'duplicate', name: 'Duplicate', group: 'canceled' },
] as const satisfies readonly { id: string; name: string; group: StatusGroup }[]
export type CategoryId = (typeof CATEGORIES)[number]['id']

export interface Status {
  id: StatusId
  name: string
  group: StatusGroup
  /** its section of the workflow */
  category: CategoryId
  /** CSS colour (a theme variable, or a workspace status's own colour) */
  color: string
  /** a workspace's own status: the teams that use it (missing = every team) */
  teams?: string[]
  /** a built-in status: the teams that left it out */
  hiddenIn?: string[]
  /** what it means */
  description?: string
  /** where new issues wait to be looked at (the Triage category) */
  triage?: boolean
  /** one of the workspace's own */
  custom?: boolean
}

/** what the workspace changed about the built-in statuses */
export interface WorkflowExtras {
  builtins?: Iterable<BuiltinStatus>
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
  const changed = new Map<string, BuiltinStatus>([...(extras.builtins ?? [])].map((b) => [b.id, b]))
  const placed: (Status & { order: number })[] = [
    ...STATUSES.map((s, n) => {
      const b = changed.get(s.id)
      return {
        ...s,
        ...(b?.name?.trim() && { name: b.name.trim() }),
        ...(b?.color && { color: b.color }),
        ...(b?.description !== undefined && { description: b.description.trim() || undefined }),
        ...(b?.hiddenIn?.length && { hiddenIn: b.hiddenIn }),
        // built-in ones come first until someone puts them elsewhere
        order: b?.position ?? n - 100,
      }
    }),
    ...[...custom].map((s) => ({
      id: s.id,
      name: s.name,
      group: s.group,
      category: (s.triage && s.group === 'backlog' ? 'triage' : s.group) as CategoryId,
      color: s.color,
      custom: true,
      order: s.position ?? 0,
      ...(s.teams?.length && { teams: s.teams }),
      ...(s.description && { description: s.description }),
      ...(s.triage && s.group === 'backlog' && { triage: true }),
    })),
  ]
  return CATEGORIES.flatMap((c) =>
    placed
      .filter((s) => s.category === c.id)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((s) => {
        const { order: _, ...status } = s
        return status
      }),
  )
}

/** whether a team's workflow has this status */
export const usedBy = (s: Status, team: string): boolean => (s.custom ? !s.teams || s.teams.includes(team) : !s.hiddenIn?.includes(team))

// the workspace's statuses, kept in step with the store (store.ts), so `statusOf` works anywhere
let all = workflow([])
let byId = new Map(all.map((s) => [s.id, s]))

export function setCustomStatuses(custom: Iterable<CustomStatus>, extras: WorkflowExtras = {}) {
  all = workflow(custom, extras)
  byId = new Map(all.map((s) => [s.id, s]))
}

/** every status, in order; with a team, only the ones in its workflow */
export const allStatuses = (team?: string): Status[] => (team ? all.filter((s) => usedBy(s, team)) : all)

export type FindStatus = (id: StatusId) => Status

/** a status whose file is gone (deleted, say) still shows, so nothing breaks */
export const statusOf = (id: StatusId): Status => byId.get(id) ?? { id, name: 'Deleted status', group: 'unstarted', color: 'var(--status-backlog)', category: 'unstarted' }

/** a status of the Triage category: its issues wait to be accepted, declined or marked as a duplicate */
export const isTriage = (id: StatusId): boolean => !!statusOf(id).triage

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

/** The tabs on a team's Issues page. Triage only shows with triage on, and its issues show nowhere else. */
export type IssueTab = 'triage' | 'active' | 'backlog' | 'all'

export const TAB_GROUPS: Record<IssueTab, StatusGroup[]> = {
  triage: ['backlog'],
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
