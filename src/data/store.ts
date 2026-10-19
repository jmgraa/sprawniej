/**
 * Everything the workspace holds, kept in memory as plain maps. Components read from here with selectors;
 * they never change it directly. All changes go through `actions.ts` (see CLAUDE.md, golden rules).
 */
import { create } from 'zustand'
import type { ArchivedIssue, BuiltinStatus, Comment, CustomStatus, InboxItem, Issue, Label, Person, Project, ReadState, Team, View, Workspace } from '@/model/schema'
import { setCustomStatuses } from '@/model/status'

export interface DataState {
  workspace: Workspace | null
  /** the signed-in person */
  me: Person | null
  people: Record<string, Person>
  labels: Record<string, Label>
  /** the workspace's own statuses (the built-in ones are in src/model/status.ts) */
  statuses: Record<string, CustomStatus>
  /** what the workspace changed about built-in statuses, by status id */
  builtinStatuses: Record<string, BuiltinStatus>
  teams: Record<string, Team>
  issues: Record<string, Issue>
  /** archived issues by id; empty until something needs them (loadArchive in project.ts) */
  archive: Record<string, ArchivedIssue>
  archiveLoaded: boolean
  projects: Record<string, Project>
  views: Record<string, View>
  /** by issue id, oldest first */
  comments: Record<string, Comment[]>
  /** my inbox, newest first */
  inbox: InboxItem[]
  readState: ReadState
}

export const EMPTY: DataState = {
  workspace: null,
  me: null,
  people: {},
  labels: {},
  statuses: {},
  builtinStatuses: {},
  teams: {},
  issues: {},
  archive: {},
  archiveLoaded: false,
  projects: {},
  views: {},
  comments: {},
  inbox: [],
  readState: { readUntil: null, read: [] },
}

export const useData = create<DataState>()(() => ({ ...EMPTY }))

// statusOf and allStatuses read the workspace's statuses without the store; this keeps them in step (before screens redraw)
useData.subscribe((s, prev) => {
  if (s.statuses !== prev.statuses || s.builtinStatuses !== prev.builtinStatuses) setCustomStatuses(Object.values(s.statuses), { builtins: Object.values(s.builtinStatuses) })
})

/** "ENG-12" */
export const issueRef = (issue: Pick<Issue, 'team' | 'number'>) => `${issue.team}-${issue.number}`

/** find an issue by its "ENG-12" reference */
export function findByRef(issues: Record<string, Issue>, ref: string): Issue | undefined {
  const m = /^([A-Z][A-Z0-9]*)-(\d+)$/.exec(ref.toUpperCase())
  if (!m) return undefined
  const n = Number(m[2])
  const all = Object.values(issues)
  // an issue that moved to another team answers to its old number too (numbers are never given out twice)
  return all.find((i) => i.team === m[1] && i.number === n) ?? all.find((i) => i.formerRefs?.includes(`${m[1]}-${n}`))
}

/** an archived issue by its "ENG-12" reference (only once the archive is loaded); an active one with the same id wins */
export function findArchivedByRef(s: Pick<DataState, 'archive' | 'issues'>, ref: string): ArchivedIssue | undefined {
  const found = findByRef(s.archive, ref) as ArchivedIssue | undefined
  return found && !s.issues[found.id] ? found : undefined
}

declare global {
  interface Window {
    /** for scripted checks in tests: window.sprawniej.data.getState(), window.sprawniej.actions.createIssue(…) */
    sprawniej?: { data?: typeof useData; actions?: Record<string, unknown>; sync?: unknown }
  }
}
if (typeof window !== 'undefined') window.sprawniej = { ...window.sprawniej, data: useData }
