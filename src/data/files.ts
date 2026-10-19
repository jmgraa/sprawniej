/**
 * Turning things into files and files back into things. docs/data-format.md shows every format with examples.
 * Paths are relative to the repo root.
 */
import YAML from 'yaml'
import type { z } from 'zod'
import { STAND_IN, isBuiltIn, statusOf, type FindStatus } from '@/model/status'
import {
  archivedIssueSchema,
  builtinStatusSchema,
  commentFieldsSchema,
  customStatusSchema,
  inboxItemSchema,
  issueFieldsSchema,
  labelSchema,
  personSchema,
  projectSchema,
  readStateSchema,
  statusCategorySchema,
  teamSchema,
  viewSchema,
  workspaceSchema,
  type ArchivedIssue,
  type BuiltinStatus,
  type Comment,
  type CustomStatus,
  type Filters,
  type InboxItem,
  type Issue,
  type Label,
  type Person,
  type Project,
  type ReadState,
  type StatusCategory,
  type Team,
  type View,
  type Workspace,
} from '@/model/schema'

export const WORKSPACE_FILE = 'sprawniej.json'

export const paths = {
  workspace: () => WORKSPACE_FILE,
  person: (login: string) => `people/${login}.json`,
  label: (id: string) => `labels/${id}.json`,
  status: (id: string) => `statuses/${id}.json`,
  builtinStatus: (id: string) => `builtin-statuses/${id}.json`,
  statusCategory: (id: string) => `status-categories/${id}.json`,
  team: (key: string) => `teams/${key}/team.json`,
  issue: (i: Pick<Issue, 'team' | 'id'>) => `teams/${i.team}/issues/${i.id}.md`,
  /** archived issues of a team, one file per month (see archiveMonth) */
  archive: (team: string, month: string) => `teams/${team}/archive/${month}.jsonl`,
  comment: (team: string, c: Pick<Comment, 'issue' | 'id'>) => `teams/${team}/comments/${c.issue}/${c.id}.md`,
  project: (id: string) => `projects/${id}.json`,
  view: (id: string) => `views/${id}.json`,
  inbox: (login: string, id: string) => `inbox/${login}/${id}.json`,
  readState: (login: string) => `state/${login}.json`,
}

/** What a path holds. The order of fields in `Parsed` doesn't matter; `kind` does. */
export type Parsed =
  | { kind: 'workspace'; value: Workspace }
  | { kind: 'person'; value: Person }
  | { kind: 'label'; value: Label }
  | { kind: 'status'; value: CustomStatus }
  | { kind: 'builtinStatus'; value: BuiltinStatus }
  | { kind: 'statusCategory'; value: StatusCategory }
  | { kind: 'team'; value: Team }
  | { kind: 'issue'; value: Issue }
  | { kind: 'archive'; team: string; value: ArchivedIssue[] }
  | { kind: 'comment'; team: string; value: Comment }
  | { kind: 'project'; value: Project }
  | { kind: 'view'; value: View }
  | { kind: 'inbox'; login: string; value: InboxItem }
  | { kind: 'readState'; login: string; value: ReadState }

/** Which kind of file lives at `path`, and the ids its path carries. Null for files we don't know (README…). */
export function classify(path: string): { kind: Parsed['kind']; parts: string[] } | null {
  const rules: [RegExp, Parsed['kind']][] = [
    [/^sprawniej\.json$/, 'workspace'],
    [/^people\/([^/]+)\.json$/, 'person'],
    [/^labels\/([^/]+)\.json$/, 'label'],
    [/^statuses\/([^/]+)\.json$/, 'status'],
    [/^builtin-statuses\/([^/]+)\.json$/, 'builtinStatus'],
    [/^status-categories\/([^/]+)\.json$/, 'statusCategory'],
    [/^teams\/([^/]+)\/team\.json$/, 'team'],
    [/^teams\/([^/]+)\/issues\/([^/]+)\.md$/, 'issue'],
    [/^teams\/([^/]+)\/archive\/([^/]+)\.jsonl$/, 'archive'],
    [/^teams\/([^/]+)\/comments\/([^/]+)\/([^/]+)\.md$/, 'comment'],
    [/^projects\/([^/]+)\.json$/, 'project'],
    [/^views\/([^/]+)\.json$/, 'view'],
    [/^inbox\/([^/]+)\/([^/]+)\.json$/, 'inbox'],
    [/^state\/([^/]+)\.json$/, 'readState'],
  ]
  for (const [re, kind] of rules) {
    const m = re.exec(path)
    if (m) return { kind, parts: m.slice(1) }
  }
  return null
}

// ---------- Markdown with front matter ----------

export function splitFrontMatter(text: string): { fields: unknown; body: string } {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!t.startsWith('---\n')) return { fields: {}, body: t }
  const end = t.indexOf('\n---', 4)
  if (end === -1) return { fields: {}, body: t }
  const after = t.indexOf('\n', end + 4)
  const yaml = t.slice(4, end + 1)
  return { fields: quickYaml(yaml) ?? YAML.parse(yaml) ?? {}, body: after === -1 ? '' : t.slice(after + 1) }
}

const NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/
/** what YAML reads as a number in any spelling (01, +1, 1., 0x1F…); only the plain spelling above is quick */
const NUMBERISH = /^([-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?)$/
/** plain words YAML could read as something else, or that need its full rules */
const TRICKY = /^([-?:,[\]{}#&*!|>'"%@`~]|\.|0[box]|[+-]?\.?(inf|nan)$)|: |:$| #|^(null|true|false|yes|no|on|off|y|n)$/i

function scalar(raw: string): { v: unknown } | null {
  if (raw === 'null' || raw === '~') return { v: null }
  if (raw === 'true') return { v: true }
  if (raw === 'false') return { v: false }
  if (raw === '[]') return { v: [] }
  if (NUMBER.test(raw)) return { v: Number(raw) }
  if (NUMBERISH.test(raw)) return null
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) {
    // JSON's escapes are the common part of YAML's; anything else goes to the full reader
    if (/\\[^"\\/bfnrtu]/.test(raw)) return null
    try {
      return { v: JSON.parse(raw) }
    } catch {
      return null
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) {
    const inner = raw.slice(1, -1)
    return /'(?!')/.test(inner.replace(/''/g, '')) ? null : { v: inner.replace(/''/g, "'") }
  }
  if (!raw || TRICKY.test(raw) || raw !== raw.trim()) return null
  return { v: raw }
}

/**
 * A quick reader for the front matter this app writes: `key: value` lines and `- item` lists. Reading thousands of
 * issues at start-up is several times faster this way. Returns null for anything else (folded text, nested maps,
 * unusual quoting…), and then the full YAML reader takes over, so the result is always the same.
 */
export function quickYaml(yaml: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  let list: unknown[] | null = null
  for (const line of yaml.split('\n')) {
    if (!line) continue
    if (line.startsWith('  - ')) {
      if (!list) return null
      const item = scalar(line.slice(4))
      if (!item || Array.isArray(item.v)) return null
      list.push(item.v)
      continue
    }
    list = null
    const colon = line.indexOf(':')
    if (colon < 1) return null
    const key = line.slice(0, colon)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in out) return null
    const rest = line.slice(colon + 1)
    if (rest === '') {
      list = []
      out[key] = list
      continue
    }
    if (!rest.startsWith(' ')) return null
    const v = scalar(rest.slice(1))
    if (!v) return null
    out[key] = v.v
  }
  return out
}

export function joinFrontMatter(fields: Record<string, unknown>, body: string): string {
  const yaml = YAML.stringify(fields, { lineWidth: 0 })
  const text = body.replace(/\s+$/, '')
  return `---\n${yaml}---\n${text ? `${text}\n` : ''}`
}

/** front matter keys in a fixed, readable order; anything unknown keeps its place after them */
const ISSUE_ORDER = ['id', 'number', 'title', 'status', 'customStatus', 'priority', 'assignee', 'labels', 'project', 'parent', 'dueDate', 'estimate', 'sortOrder', 'createdBy', 'createdAt', 'updatedAt', 'completedAt', 'duplicateOf', 'subscribers', 'unsubscribed']

function ordered(obj: Record<string, unknown>, order: string[], drop: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of order) if (k in obj && obj[k] !== undefined) out[k] = obj[k]
  for (const [k, v] of Object.entries(obj)) if (!(k in out) && !drop.includes(k) && v !== undefined) out[k] = v
  return out
}

// ---------- statuses of the workspace's own ----------
// Files name a built-in status that stands in for one of the workspace's own (STAND_IN), next to the real one, so a
// version of the app from before workspace statuses reads every file, shows the issue under the stand-in and keeps
// the real one when it saves. In memory, `status` is simply the real one. `find` tells a status's group (the import
// passes the statuses it is about to write).
//
// Backwards compatibility: don't remove or simplify this, and don't write a workspace status id straight into
// `status`. Older versions of the app stay open for days and read the same files; they skip an issue whose status
// they don't know, and drop it from an archive month file they rewrite, so its data would be lost. Every file
// written here must stay readable by them (CLAUDE.md, docs/architecture.md "Older versions"; tests/files.test.ts).

function statusOut<T extends { status: string; customStatus?: unknown }>(fields: T, find: FindStatus): T {
  const { customStatus: _, ...rest } = fields
  if (isBuiltIn(fields.status)) return rest as T
  const as = STAND_IN[find(fields.status).group]
  return { ...rest, status: as, customStatus: { id: fields.status, as } } as T
}

/** the real status; if an older version changed `status` since, its change wins */
function statusIn<T extends { status: string; customStatus?: { id: string; as: string } }>(fields: T): T {
  const { customStatus, ...rest } = fields
  return (customStatus && customStatus.as === rest.status ? { ...rest, status: customStatus.id } : rest) as T
}

function filtersOut(f: Filters, find: FindStatus): Filters {
  const { customStatuses: _, ...rest } = f
  const own = (f.statuses ?? []).filter((id) => !isBuiltIn(id))
  if (!own.length) return rest
  const builtIn = f.statuses!.filter(isBuiltIn)
  const customStatuses = own.map((id) => {
    const as = STAND_IN[find(id).group]
    return { id, as, ...(!builtIn.includes(as) && { added: true }) }
  })
  return { ...rest, statuses: [...new Set([...builtIn, ...customStatuses.map((c) => c.as)])], customStatuses }
}

function filtersIn(f: Filters): Filters {
  const { customStatuses, ...rest } = f
  if (!customStatuses?.length) return rest
  // one whose stand-in an older version took out of the filter is gone with it
  const live = customStatuses.filter((c) => rest.statuses?.includes(c.as))
  const added = new Set(live.filter((c) => c.added).map((c) => c.as))
  return { ...rest, statuses: [...(rest.statuses ?? []).filter((s) => !added.has(s)), ...live.map((c) => c.id)] }
}

export function issueToFile(issue: Issue, find: FindStatus = statusOf): string {
  const { description, ...rest } = statusOut(issue, find)
  return joinFrontMatter(ordered(rest, ISSUE_ORDER, ['team']), description)
}

export function viewToFile(view: View, find: FindStatus = statusOf): string {
  return jsonToFile({ ...view, filters: filtersOut(view.filters, find) })
}

export function inboxToFile(item: InboxItem, find: FindStatus = statusOf): string {
  const { customStatus: _, ...rest } = item
  if (!item.status || isBuiltIn(item.status)) return jsonToFile(rest)
  return jsonToFile({ ...rest, status: STAND_IN[find(item.status).group], customStatus: item.status })
}

export function commentToFile(c: Comment): string {
  const { body, ...rest } = c
  return joinFrontMatter(ordered(rest, ['id', 'issue', 'author', 'createdAt', 'editedAt']), body)
}

export const jsonToFile = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

// ---------- the archive ----------

/**
 * Which month file an archived issue goes in: the month it was finished (so archiving the same issue on two
 * computers picks the same file), or for an issue archived unfinished, the month it was archived.
 */
export function archiveMonth(issue: Pick<Issue, 'status' | 'completedAt' | 'updatedAt'>, archivedAt: string, find: FindStatus = statusOf): string {
  const closed = ['completed', 'canceled'].includes(find(issue.status).group)
  return (closed ? (issue.completedAt ?? issue.updatedAt) : archivedAt).slice(0, 7)
}

/** one archived issue as a line: its fields in the usual order, then the description and comments */
export function archivedToLine(a: ArchivedIssue, find: FindStatus = statusOf): string {
  const { description, comments, archivedAt, archivedBy, ...rest } = statusOut(a, find)
  const fields = ordered(rest, ISSUE_ORDER, ['team'])
  return JSON.stringify({
    ...fields,
    description,
    archivedAt,
    archivedBy,
    comments: comments.map((c) => ordered(c as unknown as Record<string, unknown>, ['id', 'issue', 'author', 'createdAt', 'editedAt', 'body'])),
  })
}

/**
 * a month file: one issue per line, sorted by id, so files change little and read well side by side. `unread`: lines
 * this version couldn't read (see archiveLinesUnread), kept as they are so a newer version's issues aren't lost.
 */
export function archiveToFile(records: ArchivedIssue[], unread: string[] = [], find: FindStatus = statusOf): string | null {
  const lines = [...[...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((a) => archivedToLine(a, find)), ...unread]
  return lines.length ? `${lines.join('\n')}\n` : null
}

/**
 * the lines of a month file this version can't read (written by a newer one, say). Backwards compatibility: they're
 * written back untouched, so archiving with this version never loses what a newer one wrote; don't drop them.
 */
export function archiveLinesUnread(path: string, team: string, text: string): string[] {
  const read = new Set(parseArchive(path, team, text, true).map((a) => a.id))
  return text.split('\n').filter((line) => {
    if (!line.trim()) return false
    try {
      return !read.has((JSON.parse(line) as { id?: unknown }).id as string)
    } catch {
      return true
    }
  })
}

/** Read a month file. A line that can't be read is skipped with a warning; the rest still count. */
export function parseArchive(path: string, team: string, text: string, quiet = false): ArchivedIssue[] {
  const out: ArchivedIssue[] = []
  for (const [n, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    try {
      const v = statusIn(check(archivedIssueSchema, JSON.parse(line), `${path} line ${n + 1}`))
      out.push({ ...v, team, description: v.description.replace(/\s+$/, ''), comments: v.comments.map((c) => ({ ...c, body: c.body.replace(/\s+$/, '') })) })
    } catch (e) {
      if (!quiet) console.warn(`Sprawniej skipped an archived issue it couldn't read: ${(e as Error).message}`)
    }
  }
  return out
}

// ---------- parsing ----------

function check<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const r = schema.safeParse(value)
  if (!r.success) throw new Error(`${path}: ${r.error.issues[0]?.message ?? 'not valid'}`)
  return r.data
}

/** Read one file. Throws (with the path in the message) when the file is broken; the caller skips it. */
export function parseFile(path: string, text: string): Parsed | null {
  const c = classify(path)
  if (!c) return null
  const json = () => JSON.parse(text) as unknown
  switch (c.kind) {
    case 'workspace':
      return { kind: 'workspace', value: check(workspaceSchema, json(), path) }
    case 'person':
      return { kind: 'person', value: check(personSchema, json(), path) }
    case 'label':
      return { kind: 'label', value: check(labelSchema, json(), path) }
    case 'status':
      return { kind: 'status', value: check(customStatusSchema, json(), path) }
    case 'builtinStatus':
      return { kind: 'builtinStatus', value: check(builtinStatusSchema, json(), path) }
    case 'statusCategory':
      return { kind: 'statusCategory', value: check(statusCategorySchema, json(), path) }
    case 'team':
      return { kind: 'team', value: check(teamSchema, json(), path) }
    case 'issue': {
      const { fields, body } = splitFrontMatter(text)
      const f = statusIn(check(issueFieldsSchema, fields, path))
      return { kind: 'issue', value: { ...f, team: c.parts[0], description: body.replace(/\s+$/, '') } }
    }
    case 'archive':
      return { kind: 'archive', team: c.parts[0], value: parseArchive(path, c.parts[0], text) }
    case 'comment': {
      const { fields, body } = splitFrontMatter(text)
      return { kind: 'comment', team: c.parts[0], value: { ...check(commentFieldsSchema, fields, path), body: body.replace(/\s+$/, '') } }
    }
    case 'project':
      return { kind: 'project', value: check(projectSchema, json(), path) }
    case 'view':
      const v = check(viewSchema, json(), path)
      return { kind: 'view', value: { ...v, filters: filtersIn(v.filters) } }
    case 'inbox':
      const { customStatus, ...n } = check(inboxItemSchema, json(), path)
      return { kind: 'inbox', login: c.parts[0], value: customStatus ? { ...n, status: customStatus } : n }
    case 'readState':
      return { kind: 'readState', login: c.parts[0], value: check(readStateSchema, json(), path) }
  }
}
