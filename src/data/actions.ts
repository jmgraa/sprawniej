/**
 * The ONLY place that changes workspace data (CLAUDE.md, golden rules). Every action works out which files
 * change and hands them to the open workspace, which:
 *   1. updates the store (the screen changes at once),
 *   2. keeps the files in this browser (survives a crash),
 *   3. saves them to GitHub a moment later.
 * Each action also says in a few words what happened; that becomes the commit message on GitHub.
 */
import { generateKeyBetween } from 'fractional-indexing'
import { ulid } from 'ulid'
import type { ArchivedIssue, BuiltinStatus, Comment, CustomStatus, Display, Filters, InboxItem, Issue, Label, Person, Project, ReadState, Team, View } from '@/model/schema'
import { AUTO_ARCHIVE_MONTHS, FORMAT_VERSION, isGuest } from '@/model/schema'
import { PRIORITY_NAMES, STAND_IN, allStatuses, isBuiltIn, isClosed as closedStatus, statusOf, usedBy, type StatusGroup, type StatusId } from '@/model/status'
import { BINARY_PREFIX } from '@/github/api'
import { workspace } from '@/sync/engine'
import { archiveLinesUnread, archiveMonth, archiveToFile, classify, commentToFile as commentFile, inboxToFile, issueToFile, jsonToFile, parseArchive, paths, viewToFile } from './files'
import { commentNotes, followLists, followers, issueNotes, type Note } from './notify'
import { changedOnly, keyBetween, keysBetween } from './ordering'
import { applyFiles, archiveFiles, highestArchived, parsedFiles, pathOf } from './project'
import { relinkFiles } from './relink'
import { isClosed, isUnread } from './select'
import { issueRef, useData } from './store'

const now = () => new Date().toISOString()

function save(files: Map<string, string | null>, message: string) {
  const ws = workspace()
  if (ws) ws.write(files, message)
  else applyFiles(files, useData.getState().me?.login ?? null) // no workspace open (tests, previews): screen only
}

const one = (path: string, text: string | null) => new Map([[path, text]])

// ---------- notes for other people's inboxes ----------

const SAME_NOTE_WITHIN = 10 * 60_000

/**
 * the same note from me about the same issue, a few minutes ago (typing "@ania", deleting it, typing it again;
 * dragging an issue back and forth between two statuses)
 */
function toldRecently(to: string, issue: string, n: Note, me: string): boolean {
  if (n.type === 'commented') return false
  const since = new Date(Date.now() - SAME_NOTE_WITHIN).toISOString()
  for (const [, p] of parsedFiles()) {
    const v = p.kind === 'inbox' && p.login === to ? p.value : null
    if (v && v.actor === me && v.issue === issue && v.type === n.type && v.status === n.status && !v.comment && v.at > since) return true
  }
  return false
}

/** adds an inbox file for each note to `files`, so the change and its notes are saved together */
function addNotes(files: Map<string, string | null>, issue: string, notes: Note[]) {
  const me = useData.getState().me?.login
  if (!me) return
  for (const n of notes) {
    if (!n.comment && toldRecently(n.to, issue, n, me)) continue
    const item: InboxItem = { id: ulid(), type: n.type, issue, actor: me, at: now() }
    if (n.comment) item.comment = n.comment
    if (n.status) item.status = n.status
    files.set(paths.inbox(n.to, item.id), inboxToFile(item))
  }
}

/** remove everyone's inbox notes about an issue or a comment that's gone */
function dropNotes(files: Map<string, string | null>, about: (n: InboxItem) => boolean) {
  for (const [path, p] of parsedFiles()) if (p.kind === 'inbox' && about(p.value)) files.set(path, null)
}

// ---------- issues ----------

/** fields a person can change (Pick, not Omit: Omit drops named keys on passthrough schemas) */
export type IssuePatch = Partial<
  Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'project' | 'parent' | 'sortOrder' | 'duplicateOf' | 'dueDate' | 'estimate' | 'snoozedUntil' | 'snoozedAt'>
>

function describe(issue: Issue, patch: IssuePatch): string {
  const ref = issueRef(issue)
  const people = useData.getState().people
  if (patch.status && patch.status !== issue.status) return `${ref}: ${statusOf(issue.status).name} -> ${statusOf(patch.status).name}`
  if (patch.priority !== undefined && patch.priority !== issue.priority) return `${ref}: priority ${PRIORITY_NAMES[patch.priority]}`
  if (patch.assignee !== undefined && patch.assignee !== issue.assignee)
    return patch.assignee ? `${ref}: assign to ${people[patch.assignee]?.name ?? patch.assignee}` : `${ref}: unassign`
  if (patch.labels !== undefined) return `${ref}: labels`
  if (patch.project !== undefined) return patch.project ? `${ref}: project ${useData.getState().projects[patch.project]?.name ?? ''}`.trim() : `${ref}: no project`
  if (patch.parent !== undefined) {
    const parent = patch.parent ? useData.getState().issues[patch.parent] : undefined
    return parent ? `${ref}: sub-issue of ${issueRef(parent)}` : `${ref}: no parent`
  }
  if (patch.dueDate !== undefined) return patch.dueDate ? `${ref}: due ${patch.dueDate}` : `${ref}: no due date`
  if (patch.estimate !== undefined) return patch.estimate === null ? `${ref}: no estimate` : `${ref}: estimate ${patch.estimate}`
  if (patch.title !== undefined) return `${ref}: edit title`
  if (patch.description !== undefined) return `${ref}: edit description`
  if (patch.sortOrder !== undefined) return `${ref}: reorder`
  return `${ref}: update`
}

export function updateIssue(id: string, patch: IssuePatch): void {
  const old = useData.getState().issues[id]
  if (!old) return
  // picking what it already is (Todo on a Todo issue) changes nothing, so nothing is saved
  const same = (k: keyof IssuePatch) => JSON.stringify(patch[k] ?? null) === JSON.stringify(old[k as keyof Issue] ?? null)
  if ((Object.keys(patch) as (keyof IssuePatch)[]).every(same)) return
  const next: Issue = { ...old, ...patch, updatedAt: now() }
  const moved = !!patch.status && patch.status !== old.status
  if (moved) {
    next.completedAt = statusOf(patch.status!).group === 'completed' ? now() : null
    // a snooze in Triage ends once the issue moves on
    if (!patch.snoozedUntil) {
      delete next.snoozedUntil
      delete next.snoozedAt
    }
  }
  const files = one(paths.issue(next), issueToFile(next))
  const s = useData.getState()
  if (s.me) addNotes(files, id, issueNotes(old, next, s.me.login, s.people, s.comments[id] ?? []))
  if (moved && closedStatus(next.status) && !closedStatus(old.status)) closeRelated(files, next)
  save(files, describe(old, patch))
}

/**
 * The team's rules for parent and sub-issues, when `issue` has just closed: its open sub-issues close the same way
 * (closeSubIssuesWithParent), and its parent is done once every sub-issue is closed (closeParentWithSubIssues).
 */
function closeRelated(files: Map<string, string | null>, issue: Issue) {
  const s = useData.getState()
  const team = s.teams[issue.team]
  const at = now()
  const close = (i: Issue, status: string) => {
    const next = { ...i, status, updatedAt: at, completedAt: statusOf(status).group === 'completed' ? at : (i.completedAt ?? null) }
    files.set(paths.issue(next), issueToFile(next))
  }
  if (team?.closeSubIssuesWithParent) {
    for (const c of Object.values(s.issues)) if (c.parent === issue.id && !closedStatus(c.status)) close(c, issue.status)
  }
  const parent = issue.parent ? s.issues[issue.parent] : undefined
  if (parent && s.teams[parent.team]?.closeParentWithSubIssues && !closedStatus(parent.status)) {
    const siblings = Object.values(s.issues).filter((c) => c.parent === parent.id && c.id !== issue.id)
    if (siblings.every((c) => closedStatus(c.status))) close(parent, allStatuses(parent.team).find((x) => x.category === 'completed')?.id ?? 'done')
  }
}

/** Make exactly these people follow an issue (hear about its comments and status changes). */
export function setFollowers(id: string, logins: string[]) {
  const s = useData.getState()
  const old = s.issues[id]
  if (!old) return
  const lists = followLists(old, s.comments[id] ?? [], s.people, logins)
  const next: Issue = { ...old }
  // empty lists are left out, so the file stays short
  for (const k of ['subscribers', 'unsubscribed'] as const) {
    if (lists[k]?.length) next[k] = lists[k]
    else delete next[k]
  }
  if (JSON.stringify([old.subscribers ?? [], old.unsubscribed ?? []]) === JSON.stringify([next.subscribers ?? [], next.unsubscribed ?? []])) return
  // following isn't an edit: "last changed" stays as it was
  const me = s.me?.login
  const was = new Set(followers(old, s.comments[id] ?? [], s.people))
  const wanted = new Set(logins)
  const changed = [...new Set([...was, ...wanted])].filter((l) => was.has(l) !== wanted.has(l))
  const what = changed.length === 1 && changed[0] === me ? (wanted.has(me) ? 'subscribe' : 'unsubscribe') : 'subscribers'
  save(one(paths.issue(next), issueToFile(next)), `${issueRef(old)}: ${what}`)
}

/** Follow an issue, or stop following it. */
export function subscribe(id: string, on: boolean) {
  const s = useData.getState()
  const issue = s.issues[id]
  const me = s.me?.login
  if (!issue || !me) return
  const now = followers(issue, s.comments[id] ?? [], s.people)
  setFollowers(id, on ? [...now, me] : now.filter((l) => l !== me))
}

/**
 * A drag-n-drop drop. `patch` = what the group it landed in stands for (status, priority…); `place` = its new
 * neighbours (issue ids, null = top or bottom), or null to keep its place (the list isn't in manual order).
 * One file changes either way.
 */
export function moveIssue(id: string, to: { patch: IssuePatch; place: { prev: string | null; next: string | null } | null }) {
  const issues = useData.getState().issues
  if (!issues[id]) return
  const patch: IssuePatch = { ...to.patch }
  if (to.place) {
    const key = (x: string | null) => (x && issues[x] ? issues[x].sortOrder : null)
    patch.sortOrder = keyBetween(key(to.place.prev), key(to.place.next))
  }
  if (Object.keys(patch).length) updateIssue(id, patch)
}

/** Several picked issues dropped together: each gets the group's change, and they land side by side in this order. */
export function moveIssues(ids: string[], to: { patch: IssuePatch; place: { prev: string | null; next: string | null } | null }) {
  const issues = useData.getState().issues
  const key = (x: string | null) => (x && issues[x] ? issues[x].sortOrder : null)
  const keys = to.place ? keysBetween(key(to.place.prev), key(to.place.next), ids.length) : null
  ids.forEach((id, n) => {
    const issue = issues[id]
    if (!issue) return
    const patch = changedOnly(issue, to.patch)
    if (keys) patch.sortOrder = keys[n]
    if (Object.keys(patch).length) updateIssue(id, patch)
  })
}

export interface NewIssue {
  team: string
  title: string
  description?: string
  status?: Issue['status']
  priority?: Issue['priority']
  assignee?: string | null
  labels?: string[]
  project?: string | null
  parent?: string | null
  dueDate?: string | null
  estimate?: number | null
}

/** a team's next issue number: one more than any issue it has, or ever had (deleted and archived ones count too) */
export function nextNumber(team: string): number {
  const s = useData.getState()
  const floor = Math.max(s.teams[team]?.lastNumber ?? 0, highestArchived(team))
  const highest = Object.values(s.issues).reduce((max, i) => (i.team === team ? Math.max(max, i.number) : max), floor)
  return highest + 1
}

/** an issue leaves its team (deleted or moved): the team remembers its number so nobody gets it again */
function rememberNumber(files: Map<string, string | null>, issue: Issue) {
  const team = useData.getState().teams[issue.team]
  if (team && (team.lastNumber ?? 0) < issue.number) {
    const path = paths.team(team.key)
    const current = files.get(path)
    const latest = current ? (JSON.parse(current) as Team) : team
    if ((latest.lastNumber ?? 0) < issue.number) files.set(path, jsonToFile({ ...latest, lastNumber: issue.number }))
  }
}

/** where a new sub-issue goes: after its last sibling, or right after its parent */
function subIssueOrder(issues: Issue[], parent: Issue): string {
  const anchor = issues.filter((i) => i.parent === parent.id).reduce((max, i) => (i.sortOrder > max ? i.sortOrder : max), parent.sortOrder)
  const next = issues.reduce<string | null>((min, i) => (i.sortOrder > anchor && (min === null || i.sortOrder < min) ? i.sortOrder : min), null)
  return keyBetween(anchor, next)
}

/** Creates an issue at the top of its team's order (a sub-issue: under its siblings) and returns it. */
export function createIssue(input: NewIssue): Issue {
  const s = useData.getState()
  const inTeam = Object.values(s.issues).filter((i) => i.team === input.team)
  const number = nextNumber(input.team)
  const first = inTeam.reduce<string | null>((min, i) => (min === null || i.sortOrder < min ? i.sortOrder : min), null)
  const parent = input.parent ? s.issues[input.parent] : undefined
  const issue: Issue = {
    id: ulid(),
    team: input.team,
    number,
    title: input.title.trim(),
    description: input.description ?? '',
    status: input.status ?? startStatus(input.team, s.me?.login),
    priority: input.priority ?? 0,
    assignee: input.assignee ?? null,
    labels: input.labels ?? [],
    project: input.project ?? null,
    parent: input.parent ?? null,
    ...(input.dueDate && { dueDate: input.dueDate }),
    ...(input.estimate != null && { estimate: input.estimate }),
    sortOrder: parent && parent.team === input.team ? subIssueOrder(inTeam, parent) : generateKeyBetween(null, first),
    createdBy: s.me?.login ?? 'unknown',
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
  }
  const files = one(paths.issue(issue), issueToFile(issue))
  if (s.me) addNotes(files, issue.id, issueNotes(null, issue, s.me.login, s.people))
  save(files, `Create ${issueRef(issue)}: ${issue.title}`)
  return issue
}

/** Remove an issue (and its comments). Its sub-issues stay, without a parent. */
export function deleteIssue(id: string) {
  const s = useData.getState()
  const issue = s.issues[id]
  if (!issue) return
  const files = new Map<string, string | null>([[paths.issue(issue), null]])
  for (const c of s.comments[id] ?? []) files.set(paths.comment(issue.team, c), null)
  for (const child of Object.values(s.issues).filter((i) => i.parent === id)) {
    files.set(paths.issue(child), issueToFile({ ...child, parent: null, updatedAt: now() }))
  }
  dropNotes(files, (n) => n.issue === id)
  rememberNumber(files, issue)
  save(files, `Delete ${issueRef(issue)}: ${issue.title}`)
}

/** Move an issue to another team: it gets that team's next number, like a new issue there. */
export function moveIssueToTeam(id: string, team: string): Issue | undefined {
  const s = useData.getState()
  const old = s.issues[id]
  if (!old || old.team === team || !s.teams[team]) return old
  const number = nextNumber(team)
  const next: Issue = { ...old, team, number, formerRefs: [...(old.formerRefs ?? []), issueRef(old)], updatedAt: now() }
  const files = new Map<string, string | null>([
    [pathOf((p) => p.kind === 'issue' && p.value.id === id) ?? paths.issue(old), null],
    [paths.issue(next), issueToFile(next)],
  ])
  for (const c of s.comments[id] ?? []) {
    files.set(paths.comment(old.team, c), null)
    files.set(paths.comment(team, c), commentFile(c))
  }
  rememberNumber(files, old)
  save(files, `Move ${issueRef(old)} to ${s.teams[team].name} as ${issueRef(next)}`)
  return next
}

// ---------- the archive ----------

/**
 * change the records in one archive month file; the change goes into `files` (an emptied file is removed). Lines this
 * version can't read stay as they are (archiveLinesUnread): dropping them would lose a newer version's issues.
 */
function editArchive(files: Map<string, string | null>, path: string, team: string, edit: (records: ArchivedIssue[]) => ArchivedIssue[]) {
  const text = files.has(path) ? files.get(path) : (archiveFiles().get(path) ?? null)
  files.set(path, archiveToFile(edit(text ? parseArchive(path, team, text) : []), text ? archiveLinesUnread(path, team, text) : []))
}

/** which archive files hold an issue (each line starts with its id) */
function archivePathsOf(team: string, id: string): string[] {
  const out: string[] = []
  for (const [path, text] of archiveFiles()) if (path.startsWith(`teams/${team}/archive/`) && text.includes(`{"id":"${id}"`)) out.push(path)
  return out
}

/**
 * Put issues away: they leave every list and board but can still be opened, found and brought back. An issue's
 * sub-issues go with it (unless `auto`, where each finished issue goes on its own). Returns how many were archived.
 */
export function archiveIssues(ids: string[], { auto = false } = {}): number {
  const s = useData.getState()
  const me = s.me?.login ?? 'unknown'
  const at = now()
  const all: Issue[] = []
  const add = (id: string) => {
    const issue = s.issues[id]
    if (!issue || all.includes(issue)) return
    all.push(issue)
    if (!auto) for (const child of Object.values(s.issues)) if (child.parent === id) add(child.id)
  }
  ids.forEach(add)
  if (!all.length) return 0
  const files = new Map<string, string | null>()
  const byFile = new Map<string, ArchivedIssue[]>()
  for (const issue of all) {
    const comments = s.comments[issue.id] ?? []
    const path = paths.archive(issue.team, archiveMonth(issue, at))
    byFile.set(path, [...(byFile.get(path) ?? []), { ...issue, archivedAt: at, archivedBy: me, comments }])
    files.set(pathOf((p) => p.kind === 'issue' && p.value.id === issue.id) ?? paths.issue(issue), null)
    for (const c of comments) files.set(paths.comment(issue.team, c), null)
    rememberNumber(files, issue)
  }
  for (const [path, records] of byFile) {
    const ids = new Set(records.map((r) => r.id))
    editArchive(files, path, records[0].team, (old) => [...old.filter((r) => !ids.has(r.id)), ...records])
  }
  const n = all.length
  save(files, auto ? `Archive ${n} finished issue${n === 1 ? '' : 's'}` : n === 1 ? `Archive ${issueRef(all[0])}` : `Archive ${issueRef(all[0])} and ${n - 1} more`)
  return n
}

/**
 * Bring an archived issue back, with its comments, where it was. Sub-issues that were archived together with it come
 * back too. Needs the archive loaded (loadArchive).
 */
export function restoreIssue(id: string): Issue | undefined {
  const s = useData.getState()
  const a = s.archive[id]
  if (!a || s.issues[id]) return s.issues[id]
  const all = [a]
  for (let k = 0; k < all.length; k++) {
    for (const c of Object.values(s.archive)) if (c.parent === all[k].id && c.archivedAt === a.archivedAt && !s.issues[c.id] && !all.includes(c)) all.push(c)
  }
  const files = new Map<string, string | null>()
  const restored: Issue[] = []
  let bump = 0
  for (const r of all) {
    const { archivedAt: _at, archivedBy: _by, comments, ...rest } = r
    for (const path of archivePathsOf(r.team, r.id)) editArchive(files, path, r.team, (old) => old.filter((x) => x.id !== r.id))
    // a number someone took meanwhile (only by editing files by hand) means a new one
    const taken = Object.values(s.issues).some((i) => i.team === r.team && i.number === r.number)
    const issue: Issue = { ...rest, number: taken ? nextNumber(r.team) + bump++ : r.number, updatedAt: now() }
    files.set(paths.issue(issue), issueToFile(issue))
    for (const c of comments) files.set(paths.comment(r.team, c), commentFile(c))
    restored.push(issue)
  }
  const n = restored.length - 1
  save(files, n ? `Restore ${issueRef(restored[0])} and ${n} sub-issue${n === 1 ? '' : 's'}` : `Restore ${issueRef(restored[0])}`)
  return restored[0]
}

/** a moment `months` months before `at`, as ISO */
function monthsBefore(at: number, months: number): string {
  const d = new Date(at)
  d.setMonth(d.getMonth() - months)
  return d.toISOString()
}

/**
 * A team's auto-close (team.autoClose months): issues not started yet (Triage, Backlog, Unstarted) that nobody touched
 * for that long are canceled. Not while they're in an unfinished project, due in the future, or have open sub-issues.
 */
export function autoCloseStale(at = Date.now()) {
  const s = useData.getState()
  const stamp = new Date(at).toISOString()
  const files = new Map<string, string | null>()
  for (const i of Object.values(s.issues)) {
    const months = s.teams[i.team]?.autoClose ?? 0
    const group = statusOf(i.status).group
    if (!months || (group !== 'backlog' && group !== 'unstarted') || i.updatedAt >= monthsBefore(at, months)) continue
    const project = i.project ? s.projects[i.project] : undefined
    if (project && project.status !== 'completed' && project.status !== 'canceled') continue
    if (i.dueDate && i.dueDate >= stamp.slice(0, 10)) continue
    if (Object.values(s.issues).some((c) => c.parent === i.id && !closedStatus(c.status))) continue
    const to = allStatuses(i.team).find((x) => x.category === 'canceled')?.id ?? 'canceled'
    files.set(paths.issue(i), issueToFile({ ...i, status: to, updatedAt: stamp }))
  }
  if (files.size) save(files, files.size === 1 ? 'Auto-close 1 issue nobody touched in a while' : `Auto-close ${files.size} issues nobody touched in a while`)
}

/**
 * The daily tidy-up: archives issues finished (and last changed) more than a team's `autoArchive` months ago, a few
 * hundred per save,
 * and mends the archive after two people's changes crossed (an archived issue someone edited at the same moment
 * stays out of the archive; a comment added to it meanwhile joins it). Returns how many were archived.
 */
export async function tidyArchive(at = Date.now()): Promise<number> {
  autoCloseStale(at)
  const s = useData.getState()
  const due: string[] = []
  for (const i of Object.values(s.issues)) {
    const months = s.teams[i.team]?.autoArchive ?? AUTO_ARCHIVE_MONTHS
    // finished that long ago and untouched since (so a restored issue isn't put straight back)
    const last = i.completedAt && i.completedAt > i.updatedAt ? i.completedAt : i.updatedAt
    if (months > 0 && isClosed(i) && last < monthsBefore(at, months)) due.push(i.id)
  }
  let done = 0
  for (let n = 0; n < due.length; n += IMPORT_BATCH) {
    done += archiveIssues(due.slice(n, n + IMPORT_BATCH), { auto: true })
    await workspace()?.flush()
  }
  mendArchive()
  return done
}

/** see tidyArchive */
function mendArchive() {
  const s = useData.getState()
  const files = new Map<string, string | null>()
  for (const [path, text] of archiveFiles()) {
    const team = path.split('/')[1]
    const ids = [...text.matchAll(/^\{"id":"([^"]+)"/gm)].map((m) => m[1])
    const active = ids.filter((id) => s.issues[id])
    const loose = ids.filter((id) => !s.issues[id] && s.comments[id]?.length)
    if (!active.length && !loose.length) continue
    editArchive(files, path, team, (old) =>
      old
        .filter((r) => {
          if (!active.includes(r.id)) return true
          // the issue came back: so do its comments that only the archive still has
          const issue = s.issues[r.id]
          const here = new Set((s.comments[r.id] ?? []).map((c) => c.id))
          for (const c of r.comments) if (!here.has(c.id)) files.set(paths.comment(issue.team, { ...c, issue: r.id }), commentFile({ ...c, issue: r.id }))
          return false
        })
        .map((r) => {
          if (!loose.includes(r.id)) return r
          // a comment added or edited meanwhile joins the archived issue; the newer copy wins
          const newer = new Map(s.comments[r.id].map((c) => [c.id, c]))
          const merged = [...r.comments.filter((c) => !newer.has(c.id)), ...newer.values()]
          return { ...r, comments: merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
        }),
    )
    for (const id of loose) for (const c of s.comments[id]) files.set(paths.comment(team, c), null)
  }
  if (files.size) save(files, 'Tidy up the archive')
}

// ---------- comments ----------

const tidyBody = (body: string) => body.replace(/\s+$/, '')

/** where a comment's file really is (usually under the issue's team, but not if the issue moved meanwhile) */
const commentPath = (id: string) => pathOf((p) => p.kind === 'comment' && p.value.id === id)

export function createComment(issueId: string, body: string): Comment | undefined {
  const s = useData.getState()
  const issue = s.issues[issueId]
  if (!issue || !s.me || !body.trim()) return undefined
  const comment: Comment = { id: ulid(), issue: issueId, author: s.me.login, createdAt: now(), body: tidyBody(body) }
  const files = one(paths.comment(issue.team, comment), commentFile(comment))
  addNotes(files, issueId, commentNotes(issue, comment, null, s.comments[issueId] ?? [], s.me.login, s.people))
  save(files, `${issueRef(issue)}: comment`)
  return comment
}

/** only your own comments; an empty text is ignored (delete the comment instead) */
export function updateComment(issueId: string, id: string, body: string) {
  const s = useData.getState()
  const issue = s.issues[issueId]
  const old = s.comments[issueId]?.find((c) => c.id === id)
  if (!issue || !old || !s.me || old.author !== s.me.login || !body.trim() || tidyBody(body) === old.body) return
  const next: Comment = { ...old, body: tidyBody(body), editedAt: now() }
  const files = one(paths.comment(issue.team, next), commentFile(next))
  // written in the issue's old team while a teammate moved the issue: it moves along now
  const was = commentPath(id)
  if (was && was !== paths.comment(issue.team, next)) files.set(was, null)
  addNotes(files, issueId, commentNotes(issue, next, old.body, [], s.me.login, s.people))
  save(files, `${issueRef(issue)}: edit comment`)
}

export function deleteComment(issueId: string, id: string) {
  const s = useData.getState()
  const issue = s.issues[issueId]
  const old = s.comments[issueId]?.find((c) => c.id === id)
  if (!issue || !old || !s.me || old.author !== s.me.login) return
  const files = one(commentPath(id) ?? paths.comment(issue.team, old), null)
  dropNotes(files, (n) => n.comment === id)
  save(files, `${issueRef(issue)}: delete comment`)
}

// ---------- your inbox ----------

function saveReadState(next: ReadState, files = new Map<string, string | null>(), message = 'Inbox: mark as read') {
  const me = useData.getState().me?.login
  if (!me) return
  files.set(paths.readState(me), jsonToFile(next))
  save(files, message)
}

export function markRead(ids: string[]) {
  const s = useData.getState()
  const fresh = s.inbox.filter((n) => ids.includes(n.id) && isUnread(n, s.readState)).map((n) => n.id)
  if (fresh.length) saveReadState({ ...s.readState, read: [...s.readState.read, ...fresh] })
}

export function markAllRead() {
  const s = useData.getState()
  if (!s.inbox.some((n) => isUnread(n, s.readState))) return
  const latest = s.inbox.reduce((max, n) => (n.at > max ? n.at : max), s.readState.readUntil ?? '')
  saveReadState({ ...s.readState, readUntil: latest, read: [] }, undefined, 'Inbox: mark all as read')
}

/** delete notes from your inbox (all of them if `ids` is left out, only read ones with `readOnly`) */
export function deleteInboxItems(ids?: string[], { readOnly = false } = {}) {
  const s = useData.getState()
  const me = s.me?.login
  if (!me) return
  const gone = s.inbox.filter((n) => (!ids || ids.includes(n.id)) && (!readOnly || !isUnread(n, s.readState)))
  if (!gone.length) return
  const files = new Map<string, string | null>(gone.map((n) => [paths.inbox(me, n.id), null]))
  const ids2 = new Set(gone.map((n) => n.id))
  const read = s.readState.read.filter((id) => !ids2.has(id))
  if (read.length !== s.readState.read.length) files.set(paths.readState(me), jsonToFile({ ...s.readState, read }))
  save(files, gone.length === 1 ? 'Inbox: delete a note' : `Inbox: delete ${gone.length} notes`)
}

const DAY = 86_400_000
/** how long inbox notes are kept: read ones, unread ones, and anyone's (people who left never tidy theirs) */
export const INBOX_KEEP = { read: 30 * DAY, unread: 90 * DAY, anyone: 180 * DAY }

/**
 * Keeps the workspace small: removes old notes from your inbox (and very old ones from anyone's) and forgets read
 * marks for notes that are gone. Runs when the workspace opens; saves nothing when there's nothing to tidy.
 */
export function tidyInbox(at = Date.now()) {
  const s = useData.getState()
  const me = s.me?.login
  if (!me) return
  const before = (ms: number) => new Date(at - ms).toISOString()
  const files = new Map<string, string | null>()
  for (const [path, p] of parsedFiles()) {
    if (p.kind !== 'inbox') continue
    const n = p.value
    const old = p.login === me ? n.at < (isUnread(n, s.readState) ? before(INBOX_KEEP.unread) : before(INBOX_KEEP.read)) : n.at < before(INBOX_KEEP.anyone)
    if (old) files.set(path, null)
  }
  const left = new Set(s.inbox.filter((n) => !files.has(paths.inbox(me, n.id))).map((n) => n.id))
  const read = s.readState.read.filter((id) => left.has(id))
  if (read.length !== s.readState.read.length) files.set(paths.readState(me), jsonToFile({ ...s.readState, read }))
  if (files.size) save(files, 'Tidy up old inbox notes')
}

// ---------- labels ----------

/** a calm set of label colours; new labels take the next one */
export const LABEL_COLORS = ['#eb5757', '#f2994a', '#f2c94c', '#4cb782', '#26b5ce', '#5e6ad2', '#bb87fc', '#f7a8d8', '#95a2b3']

export function createLabel(name: string): Label {
  const s = useData.getState()
  const label: Label = { id: ulid(), name: name.trim(), color: LABEL_COLORS[Object.keys(s.labels).length % LABEL_COLORS.length] }
  save(one(paths.label(label.id), jsonToFile(label)), `Add label ${label.name}`)
  return label
}

export function updateLabel(id: string, patch: Partial<Pick<Label, 'name' | 'color'>>) {
  const labels = useData.getState().labels
  const label = labels[id]
  if (!label) return
  // two labels with one name can't be told apart in pickers and filters
  if (patch.name !== undefined && Object.values(labels).some((l) => l.id !== id && l.name.toLowerCase() === patch.name!.trim().toLowerCase())) return
  save(one(paths.label(id), jsonToFile({ ...label, ...patch })), `Edit label ${patch.name ?? label.name}`)
}

/** remove a label everywhere */
export function deleteLabel(id: string) {
  const s = useData.getState()
  const label = s.labels[id]
  if (!label) return
  const files = new Map<string, string | null>([[paths.label(id), null]])
  for (const i of Object.values(s.issues)) {
    if (i.labels.includes(id)) files.set(paths.issue(i), issueToFile({ ...i, labels: i.labels.filter((l) => l !== id), updatedAt: now() }))
  }
  dropFromViews(files, 'labels', id)
  save(files, `Delete label ${label.name}`)
}

// ---------- statuses and team workflows ----------

/** a status name nobody has yet, built-in ones included (two statuses with one name can't be told apart) */
export const statusNameFree = (name: string, except?: string) =>
  !!name.trim() && !allStatuses().some((s) => s.id !== except && s.name.toLowerCase() === name.trim().toLowerCase())

/** where a team's new issues start: its default status, or Todo (or its first Unstarted status) */
export function defaultStatus(team: string): StatusId {
  const mine = allStatuses(team)
  const chosen = useData.getState().teams[team]?.defaultStatus
  return (chosen && mine.find((s) => s.id === chosen)?.id) ?? mine.find((s) => s.id === 'todo')?.id ?? mine.find((s) => s.group === 'unstarted')?.id ?? 'todo'
}

/** the team's Triage status, when it has triage on */
export function triageStatus(team: string): StatusId | undefined {
  return useData.getState().teams[team]?.triage ? allStatuses(team).find((s) => s.triage)?.id : undefined
}

/** where a new issue starts: in Triage when someone outside a team with triage on makes it, otherwise the default */
export function startStatus(team: string, login: string | null | undefined): StatusId {
  const t = useData.getState().teams[team]
  return (t?.triage && login && !t.members.includes(login) && triageStatus(team)) || defaultStatus(team)
}

/**
 * A new status in a category, last in it. With a team, it's for that team: a status of that name another team
 * already has (or a built-in one the team left out) joins its workflow instead of being made twice.
 */
export function createStatus(group: StatusGroup, name: string, opts: { team?: string; triage?: boolean } = {}): StatusId | undefined {
  const st = useData.getState()
  const same = allStatuses().find((s) => s.name.toLowerCase() === name.trim().toLowerCase())
  if (same) {
    if (!opts.team || usedBy(same, opts.team) || same.group !== group || !!same.triage !== !!opts.triage) return
    addToTeam(same.id, opts.team)
    return same.id
  }
  if (!name.trim()) return
  const own = Object.values(st.statuses)
  const category = opts.triage ? 'triage' : group
  // after everything in its category (built-in ones without a place of their own come first anyway)
  const last = Math.max(0, ...allStatuses().filter((s) => s.category === category).map((s) => (s.custom ? st.statuses[s.id]?.position : st.builtinStatuses[s.id]?.position) ?? 0))
  const status: CustomStatus = {
    id: ulid(),
    name: name.trim(),
    group,
    color: opts.triage ? '#fc7840' : LABEL_COLORS[own.length % LABEL_COLORS.length],
    position: last + 1,
    ...(opts.team && { teams: [opts.team] }),
    ...(opts.triage && { triage: true }),
  }
  save(one(paths.status(status.id), jsonToFile(status)), `Add status ${status.name}${opts.team ? ` to ${st.teams[opts.team]?.name ?? opts.team}` : ''}`)
  return status.id
}

/** put a status (back) in a team's workflow */
function addToTeam(id: string, team: string) {
  const st = useData.getState()
  if (isBuiltIn(id)) {
    const b = st.builtinStatuses[id]
    const hiddenIn = (b?.hiddenIn ?? []).filter((k) => k !== team)
    save(one(paths.builtinStatus(id), jsonToFile({ ...b, id, hiddenIn })), `Add status ${statusOf(id).name} to ${st.teams[team]?.name ?? team}`)
    return
  }
  const s = st.statuses[id]
  if (!s?.teams?.length || s.teams.includes(team)) return
  save(one(paths.status(id), jsonToFile({ ...s, teams: [...s.teams, team] })), `Add status ${s.name} to ${st.teams[team]?.name ?? team}`)
}

type StatusPatch = Partial<Pick<CustomStatus, 'name' | 'color' | 'description'>>

/** change a status for every team that has it: one of the workspace's own in its file, a built-in one in builtin-statuses/ */
export function updateStatus(id: string, patch: StatusPatch) {
  const s = useData.getState()
  if (patch.name !== undefined && !statusNameFree(patch.name, id)) return
  const named = patch.name !== undefined ? { name: patch.name.trim() } : {}
  if (isBuiltIn(id)) {
    const next: BuiltinStatus = { ...s.builtinStatuses[id], id: id as BuiltinStatus['id'], ...patch, ...named }
    save(one(paths.builtinStatus(id), jsonToFile(next)), `Edit status ${next.name ?? statusOf(id).name}`)
    return
  }
  const status = s.statuses[id]
  if (!status) return
  const next: CustomStatus = { ...status, ...patch, ...named }
  if (!next.description?.trim()) delete next.description
  save(one(paths.status(id), jsonToFile(next)), `Edit status ${next.name}`)
}

/** a built-in status back to its own name, colour and description (it keeps its place and the teams that left it out) */
export function resetBuiltinStatus(id: string) {
  const b = useData.getState().builtinStatuses[id]
  if (!b) return
  const kept = { ...(b.position !== undefined && { position: b.position }), ...(b.hiddenIn?.length && { hiddenIn: b.hiddenIn }) }
  save(one(paths.builtinStatus(id), Object.keys(kept).length ? jsonToFile({ id: b.id, ...kept }) : null), `Reset status ${statusOf(id).name}`)
}

/** put the statuses of one category in this order (positions become 1, 2, 3…), built-in ones included */
export function reorderStatuses(ids: string[]) {
  const s = useData.getState()
  const files = new Map<string, string | null>()
  ids.forEach((id, n) => {
    if (isBuiltIn(id)) {
      if (s.builtinStatuses[id]?.position !== n + 1) files.set(paths.builtinStatus(id), jsonToFile({ ...s.builtinStatuses[id], id, position: n + 1 }))
    } else if (s.statuses[id] && s.statuses[id].position !== n + 1) files.set(paths.status(id), jsonToFile({ ...s.statuses[id], position: n + 1 }))
  })
  if (files.size) save(files, `Reorder statuses: ${ids.map((id) => statusOf(id).name).join(', ')}`)
}

/** how many of a team's issues (or everyone's) have a status, archived ones not counted */
export const statusUses = (id: string, team?: string) => Object.values(useData.getState().issues).filter((i) => i.status === id && (!team || i.team === team)).length

/** whether a team can do without a status: its category has to keep one, and Duplicate can't go */
export function canRemoveFromTeam(id: string, team: string): boolean {
  const s = statusOf(id)
  return s.category !== 'duplicate' && allStatuses(team).filter((x) => x.category === s.category).length > 1
}

/** move a team's issues in one status to another, archived ones too (into `files`) */
function moveTeamIssues(files: Map<string, string | null>, team: string | null, from: string, to: string) {
  const s = useData.getState()
  const at = now()
  for (const i of Object.values(s.issues)) {
    if (i.status !== from || (team && i.team !== team)) continue
    const closes = statusOf(to).group === 'completed'
    files.set(paths.issue(i), issueToFile({ ...i, status: to, updatedAt: at, completedAt: closes ? (i.completedAt ?? at) : statusOf(to).group === 'canceled' ? (i.completedAt ?? null) : null }))
  }
  for (const [path, text] of archiveFiles()) {
    const k = classify(path)!.parts[0]
    if ((team && k !== team) || !text.includes(isBuiltIn(from) ? `"status":"${from}"` : `"id":"${from}"`)) continue
    editArchive(files, path, k, (records) => records.map((r) => (r.status === from ? { ...r, status: to } : r)))
  }
}

/**
 * Take a status out of a team's workflow (as in Linear: its category keeps at least one). The team's issues in it,
 * archived ones too, move to `to`. A built-in one stays for other teams; one of the workspace's own that no team
 * has any more is deleted, and views that filter by it lose it like a deleted label.
 */
export function removeStatusFromTeam(id: string, team: string, to: string) {
  const s = useData.getState()
  if (!canRemoveFromTeam(id, team) || to === id) return
  const files = new Map<string, string | null>()
  moveTeamIssues(files, team, id, to)
  if (isBuiltIn(id)) {
    const b = s.builtinStatuses[id]
    files.set(paths.builtinStatus(id), jsonToFile({ ...b, id, hiddenIn: [...new Set([...(b?.hiddenIn ?? []), team])] }))
  } else {
    const status = s.statuses[id]
    const rest = (status.teams?.length ? status.teams : Object.keys(s.teams)).filter((k) => k !== team)
    if (rest.length) files.set(paths.status(id), jsonToFile({ ...status, teams: rest }))
    else {
      files.set(paths.status(id), null)
      dropFromViews(files, 'statuses', id)
    }
  }
  const t = s.teams[team]
  if (t?.defaultStatus === id) {
    const { defaultStatus: _, ...rest } = t
    files.set(paths.team(team), jsonToFile(rest))
  }
  save(files, `Remove status ${statusOf(id).name} from ${t?.name ?? team}`)
}

/** delete a status of the workspace's own everywhere; its issues, archived ones too, move to `to` */
export function deleteStatus(id: string, to?: string) {
  const s = useData.getState()
  const status = s.statuses[id]
  if (!status) return
  const files = new Map<string, string | null>([[paths.status(id), null]])
  moveTeamIssues(files, null, id, to ?? STAND_IN[status.group])
  dropFromViews(files, 'statuses', id)
  save(files, `Delete status ${status.name}`)
}

export function setDefaultStatus(team: string, id: string) {
  const t = useData.getState().teams[team]
  if (!t || t.defaultStatus === id || !allStatuses(team).some((s) => s.id === id)) return
  save(one(paths.team(team), jsonToFile({ ...t, defaultStatus: id })), `${t.name}: new issues start in ${statusOf(id).name}`)
}

type TeamAutomation = Partial<Pick<Team, 'autoClose' | 'closeParentWithSubIssues' | 'closeSubIssuesWithParent'>>

export function setTeamAutomation(team: string, patch: TeamAutomation) {
  const t = useData.getState().teams[team]
  if (!t) return
  const next: Team = { ...t, ...patch }
  for (const k of Object.keys(patch) as (keyof TeamAutomation)[]) if (!next[k]) delete next[k]
  save(one(paths.team(team), jsonToFile(next)), `${t.name}: automations`)
}

/**
 * Turn triage on or off for a team. On: the team gets a Triage status (the workspace's, if it has one). Off: issues
 * still waiting in Triage move to Backlog, and the Triage status leaves the team.
 */
export function setTeamTriage(team: string, on: boolean) {
  const s = useData.getState()
  const t = s.teams[team]
  if (!t || !!t.triage === on) return
  if (on) {
    const existing = allStatuses().find((x) => x.triage)
    if (existing) addToTeam(existing.id, team)
    else createStatus('backlog', 'Triage', { team, triage: true })
    save(one(paths.team(team), jsonToFile({ ...useData.getState().teams[team], triage: true })), `${t.name}: triage on`)
    return
  }
  const files = new Map<string, string | null>()
  const { triage: _, ...rest } = t
  files.set(paths.team(team), jsonToFile(rest))
  for (const tr of allStatuses(team).filter((x) => x.triage)) {
    moveTeamIssues(files, team, tr.id, allStatuses(team).find((x) => x.category === 'backlog')?.id ?? 'backlog')
    const status = s.statuses[tr.id]
    const others = (status.teams?.length ? status.teams : Object.keys(s.teams)).filter((k) => k !== team)
    files.set(paths.status(tr.id), others.length ? jsonToFile({ ...status, teams: others }) : null)
  }
  save(files, `${t.name}: triage off`)
}

// ---------- triage ----------

/** accept an issue waiting in Triage: it moves to its team's default status */
export function acceptIssue(id: string) {
  const issue = useData.getState().issues[id]
  if (issue) updateIssue(id, { status: defaultStatus(issue.team) })
}

/** decline an issue waiting in Triage: it's canceled */
export function declineIssue(id: string) {
  const issue = useData.getState().issues[id]
  if (!issue) return
  updateIssue(id, { status: allStatuses(issue.team).find((s) => s.category === 'canceled')?.id ?? 'canceled' })
}

/** mark an issue as a duplicate of another: it goes to Duplicate and points at the original */
export function markDuplicate(id: string, of: string) {
  if (id !== of) updateIssue(id, { status: 'duplicate', duplicateOf: of })
}

/** hide an issue from Triage until `until`, or until it changes before that */
export function snoozeIssue(id: string, until: string) {
  const at = now()
  updateIssue(id, { snoozedUntil: until, snoozedAt: at })
}

/**
 * A label, project or team that's gone comes out of saved views' filters where others are left ("Bug or Design"
 * becomes "Design"). Where it was the only one, it stays: the view keeps showing nothing rather than suddenly showing
 * every issue, and its filter says the one it was about was deleted.
 */
function dropFromViews(files: Map<string, string | null>, field: 'labels' | 'projects' | 'teams' | 'statuses', id: string) {
  for (const v of Object.values(useData.getState().views)) {
    if (files.has(paths.view(v.id))) continue // being deleted already
    const list = v.filters[field] as (string | null)[] | undefined
    if (!list?.includes(id)) continue
    const rest = list.filter((x) => x !== id)
    if (!rest.length) continue
    files.set(paths.view(v.id), viewToFile({ ...v, filters: { ...v.filters, [field]: rest } }))
  }
}

// ---------- views ----------

export interface NewView {
  name: string
  emoji: string
  description?: string
  /** null = the whole workspace */
  team: string | null
  filters?: Filters
  display: Display
}

export function createView(input: NewView): View {
  const me = useData.getState().me
  const view: View = {
    id: ulid(),
    name: input.name.trim(),
    emoji: input.emoji,
    description: input.description?.trim() ?? '',
    owner: me?.login ?? 'unknown',
    team: input.team,
    filters: input.filters ?? {},
    display: input.display,
    createdAt: now(),
  }
  save(one(paths.view(view.id), viewToFile(view)), `Create view ${view.emoji} ${view.name}`)
  return view
}

export type ViewPatch = Partial<Pick<View, 'name' | 'emoji' | 'description' | 'filters' | 'display'>>

export function updateView(id: string, patch: ViewPatch) {
  const view = useData.getState().views[id]
  if (!view) return
  const next: View = { ...view, ...patch }
  // empty filter lists are left out, so the file stays readable
  next.filters = Object.fromEntries(Object.entries(next.filters).filter(([, v]) => !Array.isArray(v) || v.length > 0))
  const what = patch.filters ? 'filters' : patch.display ? 'display' : patch.name ? 'rename' : 'edit'
  save(one(paths.view(id), viewToFile(next)), `View ${next.emoji} ${next.name}: ${what}`)
}

export function deleteView(id: string) {
  const view = useData.getState().views[id]
  if (!view) return
  save(one(paths.view(id), null), `Delete view ${view.emoji} ${view.name}`)
}

// ---------- projects ----------

export interface NewProject {
  name: string
  emoji: string
  description?: string
  status?: Project['status']
  lead?: string | null
  teams?: string[]
  targetDate?: string | null
}

export function createProject(input: NewProject): Project {
  const project: Project = {
    id: ulid(),
    name: input.name.trim(),
    emoji: input.emoji,
    description: input.description?.trim() ?? '',
    status: input.status ?? 'planned',
    lead: input.lead ?? null,
    teams: input.teams ?? [],
    targetDate: input.targetDate ?? null,
    createdAt: now(),
  }
  save(one(paths.project(project.id), jsonToFile(project)), `Create project ${project.emoji} ${project.name}`)
  return project
}

export type ProjectPatch = Partial<Pick<Project, 'name' | 'emoji' | 'description' | 'status' | 'lead' | 'teams' | 'targetDate'>>

export function updateProject(id: string, patch: ProjectPatch) {
  const project = useData.getState().projects[id]
  if (!project) return
  const next = { ...project, ...patch }
  const what = patch.status ? `status ${patch.status.replace('_', ' ')}` : patch.lead !== undefined ? 'lead' : patch.targetDate !== undefined ? 'target date' : 'edit'
  save(one(paths.project(id), jsonToFile(next)), `Project ${next.emoji} ${next.name}: ${what}`)
}

/** remove a project; its issues stay, without a project */
export function deleteProject(id: string) {
  const s = useData.getState()
  const project = s.projects[id]
  if (!project) return
  const files = new Map<string, string | null>([[paths.project(id), null]])
  for (const i of Object.values(s.issues)) if (i.project === id) files.set(paths.issue(i), issueToFile({ ...i, project: null, updatedAt: now() }))
  dropFromViews(files, 'projects', id)
  save(files, `Delete project ${project.emoji} ${project.name}`)
}

// ---------- teams ----------

export function createTeam(input: { key: string; name: string; emoji: string }): Team {
  const me = useData.getState().me
  const team: Team = { key: input.key, name: input.name.trim(), emoji: input.emoji, members: me ? [me.login] : [], createdAt: now() }
  save(one(paths.team(team.key), jsonToFile(team)), `Create team ${team.name}`)
  return team
}

/** how many months after an issue is finished it gets archived; 0 = never */
export function setAutoArchive(key: string, months: number) {
  const team = useData.getState().teams[key]
  if (!team || (team.autoArchive ?? AUTO_ARCHIVE_MONTHS) === months) return
  save(one(paths.team(key), jsonToFile({ ...team, autoArchive: months })), months ? `${team.name}: archive finished issues after ${months} ${months === 1 ? 'month' : 'months'}` : `${team.name}: never archive finished issues`)
}

/** a team's name or emoji; its key stays (issue numbers like ENG-12 are made from it) */
export function updateTeam(key: string, patch: { name?: string; emoji?: string }) {
  const team = useData.getState().teams[key]
  if (!team) return
  const next = { ...team, ...(patch.name !== undefined && { name: patch.name.trim() }), ...(patch.emoji !== undefined && { emoji: patch.emoji }) }
  if (!next.name || (next.name === team.name && next.emoji === team.emoji)) return
  save(one(paths.team(key), jsonToFile(next)), next.name !== team.name ? `Rename team ${team.name} to ${next.name}` : `Team ${next.emoji} ${next.name}: emoji`)
}

/** what deleting a team takes with it, for the warning */
export function teamContents(key: string): { issues: number; archived: number; comments: number; views: number } {
  const s = useData.getState()
  const prefix = `teams/${key}/`
  const all = workspace()?.paths() ?? []
  const archived = all
    .filter((p) => p.startsWith(`${prefix}archive/`))
    .reduce((n, p) => n + (workspace()?.read(p) ?? '').split('\n').filter((l) => l.trim()).length, 0)
  return {
    issues: Object.values(s.issues).filter((i) => i.team === key).length,
    archived,
    comments: all.filter((p) => p.startsWith(`${prefix}comments/`)).length,
    views: Object.values(s.views).filter((v) => v.team === key).length,
  }
}

/**
 * Delete a team for everyone: its issues, comments, archive and its own views go. Sub-issues in other teams lose their
 * parent, projects stop listing the team, and inbox notes about its issues go away.
 */
export function deleteTeam(key: string) {
  const s = useData.getState()
  const team = s.teams[key]
  if (!team) return
  const files = new Map<string, string | null>()
  for (const p of [...(workspace()?.paths() ?? []), ...archiveFiles().keys()]) if (p.startsWith(`teams/${key}/`)) files.set(p, null)
  files.set(paths.team(key), null)
  const gone = new Set(Object.values(s.issues).filter((i) => i.team === key).map((i) => i.id))
  for (const id of gone) {
    files.set(paths.issue(s.issues[id]), null)
    for (const c of s.comments[id] ?? []) files.set(paths.comment(key, c), null)
  }
  for (const i of Object.values(s.issues)) {
    if (i.team !== key && i.parent && gone.has(i.parent)) files.set(paths.issue(i), issueToFile({ ...i, parent: null, updatedAt: now() }))
  }
  for (const v of Object.values(s.views)) if (v.team === key) files.set(paths.view(v.id), null)
  dropFromViews(files, 'teams', key)
  for (const p of Object.values(s.projects)) if (p.teams.includes(key)) files.set(paths.project(p.id), jsonToFile({ ...p, teams: p.teams.filter((t) => t !== key) }))
  dropNotes(files, (n) => gone.has(n.issue))
  save(files, `Delete team ${team.emoji} ${team.name}`)
}

export function joinTeam(key: string) {
  const s = useData.getState()
  const team = s.teams[key]
  if (!team || !s.me || team.members.includes(s.me.login)) return
  const next = { ...team, members: [...team.members, s.me.login] }
  save(one(paths.team(key), jsonToFile(next)), `${s.me.name || s.me.login} joins ${team.name}`)
}

export function leaveTeam(key: string) {
  const s = useData.getState()
  const team = s.teams[key]
  if (!team || !s.me) return
  const next = { ...team, members: team.members.filter((m) => m !== s.me!.login) }
  save(one(paths.team(key), jsonToFile(next)), `${s.me.name || s.me.login} leaves ${team.name}`)
}

/** "Engineering" → "ENG", "Mobile app" → "MA" */
export function suggestKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const raw = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3)
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]/.test(key) ? key.slice(0, 7) : `T${key}`.slice(0, 7)
}

// ---------- people and the workspace ----------

/**
 * Make sure your people/ file matches your GitHub profile (name and picture change over time). A name you typed here
 * stays, and so does one your file already has when GitHub has none (someone from Linear linked to you).
 */
export function introduceMe(me: Person) {
  const s = useData.getState()
  const mine = s.people[me.login]
  const keepName = !!mine?.name && (mine.nameSetHere || (me.name === me.login && mine.name !== me.login))
  const next = { ...mine, ...me, name: keepName ? mine!.name : me.name }
  if (mine && mine.name === next.name && mine.avatarUrl === me.avatarUrl && mine.githubId === me.githubId) return
  save(one(paths.person(me.login), jsonToFile(next)), mine ? `Update ${next.name || me.login}'s profile` : `${next.name || me.login} joins the workspace`)
}

/** Your name as teammates see it here. Empty, or the same as on GitHub: back to your GitHub name. */
export function renameMe(name: string) {
  const s = useData.getState()
  if (!s.me) return
  const mine = s.people[s.me.login] ?? s.me
  const typed = name.trim().replace(/\s+/g, ' ')
  const { nameSetHere: _was, ...rest } = mine
  const next: Person = !typed || typed === s.me.name ? { ...rest, name: s.me.name } : { ...rest, name: typed, nameSetHere: true }
  if (next.name === mine.name && !!next.nameSetHere === !!mine.nameSetHere) return
  save(one(paths.person(s.me.login), jsonToFile(next)), `${mine.name} is now called ${next.name}`)
}

/**
 * Someone from the Linear import who hadn't joined is this GitHub person: their issues, comments, projects and views
 * become theirs, and their "hasn't joined" profile goes (see relink.ts). `to` is what GitHub says about the account;
 * their own people/ file, if they have one, wins.
 */
export function linkPerson(guest: string, to: Person) {
  const g = useData.getState().people[guest]
  if (!g || !isGuest(guest) || isGuest(to.login)) return
  save(relinkFiles(g, to), `Link ${g.name} to @${to.login}`)
}

/** A brand-new workspace: its file, you, and a first team. */
export function startWorkspace(name: string, firstTeam: { key: string; name: string; emoji: string }) {
  const me = useData.getState().me
  const created = now()
  const files = new Map<string, string | null>([[paths.workspace(), jsonToFile({ name: name.trim(), format: FORMAT_VERSION, createdAt: created })]])
  if (me) files.set(paths.person(me.login), jsonToFile(me))
  const team: Team = { key: firstTeam.key, name: firstTeam.name.trim(), emoji: firstTeam.emoji, members: me ? [me.login] : [], createdAt: created }
  files.set(paths.team(team.key), jsonToFile(team))
  save(files, `Create the ${name.trim()} workspace`)
}

export function renameWorkspace(name: string) {
  const ws = useData.getState().workspace
  if (!ws || !name.trim()) return
  save(one(paths.workspace(), jsonToFile({ ...ws, name: name.trim() })), `Rename the workspace to ${name.trim()}`)
}

// ---------- import ----------

/** how many files go into one save; big imports are saved in parts so GitHub never gets one huge change */
const IMPORT_BATCH = 300

/**
 * Write a prepared import (features/import). Saves part by part and waits for each, calling `progress` with how
 * many files are saved so far.
 */
export async function importFiles(files: Map<string, string | null>, message: string, progress?: (saved: number, total: number) => void) {
  const entries = [...files]
  const parts = Math.ceil(entries.length / IMPORT_BATCH)
  for (let n = 0; n < parts; n++) {
    const batch = new Map(entries.slice(n * IMPORT_BATCH, (n + 1) * IMPORT_BATCH))
    save(batch, parts > 1 ? `${message} (part ${n + 1} of ${parts})` : message)
    await workspace()?.flush()
    progress?.(Math.min(entries.length, (n + 1) * IMPORT_BATCH), entries.length)
  }
}

// ---------- pictures ----------

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
export const MAX_IMAGE_MB = 10

/** Keep a pasted or dropped picture in the workspace. Returns the address to put in the Markdown. */
export async function addImage(file: Blob): Promise<string> {
  const ext = IMAGE_TYPES[file.type]
  if (!ext) throw new Error('Only PNG, JPEG, GIF and WebP pictures can be added.')
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`This picture is too big. Pictures can be up to ${MAX_IMAGE_MB} MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
  const path = `assets/${hash}.${ext}`
  if (!workspace()?.read(path)) {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    save(one(path, BINARY_PREFIX + btoa(binary)), 'Add a picture')
  }
  return `/${path}`
}
