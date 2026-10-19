/**
 * The shape of every file in a workspace repo. docs/data-format.md describes the same thing in plain words,
 * with examples; keep the two in step. Files are checked with these schemas when they are read, and a file that
 * doesn't fit is skipped with a warning instead of breaking the app.
 *
 * `.passthrough()` keeps fields we don't know yet, so an older app never deletes what a newer one wrote.
 */
import { z } from 'zod'
import { PRIORITY_IDS, STATUS_GROUPS } from './status'

/** Bump only together with a MAJOR release and a migration (see CLAUDE.md). */
export const FORMAT_VERSION = 1

const iso = z.string() // ISO 8601 date-time
const login = z.string() // GitHub login

/** sprawniej.json at the repo root */
export const workspaceSchema = z
  .object({
    name: z.string(),
    format: z.number().int(),
    createdAt: iso,
  })
  .passthrough()
export type Workspace = z.infer<typeof workspaceSchema>

/**
 * people/<login>.json, written by that person when they first open the workspace (or before that, when someone from
 * Linear is linked to their account; `linearIds` remembers who they were in Linear, see src/data/relink.ts)
 */
export const personSchema = z
  .object({
    login,
    githubId: z.number().int(),
    name: z.string(),
    avatarUrl: z.string(),
    /** they typed their name in Sprawniej (Settings › Your account): their GitHub name doesn't replace it */
    nameSetHere: z.boolean().optional(),
  })
  .passthrough()
export type Person = z.infer<typeof personSchema>

/**
 * Someone the Linear import brought who isn't in the workspace yet: `people/~jan-kowalski.json`, written by whoever
 * imported. Their issues, comments and views keep pointing at them; linking them to a GitHub account (Settings, or a
 * later import that matches them) moves all of that over. A `~` can't start a GitHub login, so they never clash, and they get no inbox notes.
 */
export const isGuest = (login: string | null | undefined): boolean => !!login && login.startsWith('~')

/** labels/<id>.json */
export const labelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  })
  .passthrough()
export type Label = z.infer<typeof labelSchema>

/** statuses/<id>.json: a status of the workspace's own, on top of the built-in ones (src/model/status.ts) */
export const customStatusSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** decides its icon, where it sits and which tab shows its issues */
    group: z.enum(STATUS_GROUPS),
    color: z.string(),
    /** its place among the other statuses of its group, lowest first (they all come after the built-in ones) */
    position: z.number().optional(),
    /** the teams that use it (keys); missing or empty = every team */
    teams: z.array(z.string()).optional(),
    /** what it means, in a sentence */
    description: z.string().optional(),
    /** where new issues wait to be looked at (Linear's triage); a backlog status with its own icon */
    triage: z.boolean().optional(),
  })
  .passthrough()
export type CustomStatus = z.infer<typeof customStatusSchema>

/** months after which finished issues are archived, unless a team says otherwise (team.autoArchive) */
export const AUTO_ARCHIVE_MONTHS = 6

/** teams/<KEY>/team.json */
export const teamSchema = z
  .object({
    key: z.string().regex(/^[A-Z][A-Z0-9]{0,6}$/),
    name: z.string(),
    emoji: z.string(),
    members: z.array(login),
    createdAt: iso,
    /** the highest number a deleted, moved-away or archived issue had, so numbers are never given out twice */
    lastNumber: z.number().int().optional(),
    /** finished issues are archived this many months after they were finished; 0 = never; missing = 6 */
    autoArchive: z.number().int().nonnegative().optional(),
  })
  .passthrough()
export type Team = z.infer<typeof teamSchema>

/** The front matter of teams/<KEY>/issues/<id>.md. The Markdown body after it is the description. */
export const issueFieldsSchema = z
  .object({
    id: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    /** a built-in status id ("in_progress") or the id of one of statuses/ */
    status: z.string().min(1),
    /**
     * a status of the workspace's own (statuses/<id>.json). `status` then holds the built-in one standing in for it
     * (`as`), for versions of the app that don't know workspace statuses; one of those changing `status` ends it.
     */
    customStatus: z.object({ id: z.string(), as: z.string() }).passthrough().optional(),
    priority: z.union(PRIORITY_IDS.map((p) => z.literal(p))),
    assignee: login.nullable(),
    labels: z.array(z.string()),
    project: z.string().nullable(),
    parent: z.string().nullable(),
    /** a day, "2026-10-31" (no time: it's the same day for everyone) */
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    /** how big it is, in points (see ESTIMATES) */
    estimate: z.number().nonnegative().nullable().optional(),
    /** fractional index (see fractional-indexing): a drag rewrites only the moved issue */
    sortOrder: z.string(),
    createdBy: login,
    createdAt: iso,
    updatedAt: iso,
    completedAt: iso.nullable().optional(),
    duplicateOf: z.string().nullable().optional(),
    /** people who asked to follow it, on top of those who follow it anyway (see notify.ts, followers) */
    subscribers: z.array(login).optional(),
    /** people who asked not to follow it */
    unsubscribed: z.array(login).optional(),
    /** the numbers it had before it moved to another team ("WEB-2"), so old links and mentions still find it */
    formerRefs: z.array(z.string()).optional(),
  })
  .passthrough()
export type IssueFields = z.infer<typeof issueFieldsSchema>

export interface Issue extends IssueFields {
  /** which team folder the file lives in */
  team: string
  /** Markdown */
  description: string
}

/** teams/<KEY>/comments/<issueId>/<id>.md: front matter + Markdown body, written only by its author */
export const commentFieldsSchema = z
  .object({
    id: z.string(),
    issue: z.string(),
    author: login,
    createdAt: iso,
    editedAt: iso.nullable().optional(),
  })
  .passthrough()
export interface Comment extends z.infer<typeof commentFieldsSchema> {
  body: string
}

/**
 * One line of teams/<KEY>/archive/<YYYY-MM>.jsonl: an archived issue with its description and comments, packed
 * together so old issues cost one small part of one file instead of a file each.
 */
export const archivedIssueSchema = issueFieldsSchema
  .extend({
    description: z.string(),
    archivedAt: iso,
    archivedBy: login,
    comments: z.array(commentFieldsSchema.extend({ body: z.string() }).passthrough()),
  })
  .passthrough()
export interface ArchivedIssue extends Issue {
  archivedAt: string
  archivedBy: string
  comments: Comment[]
}

export const PROJECT_STATUSES = ['backlog', 'planned', 'in_progress', 'paused', 'completed', 'canceled'] as const

/** projects/<id>.json */
export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    emoji: z.string(),
    description: z.string(),
    status: z.enum(PROJECT_STATUSES),
    lead: login.nullable(),
    teams: z.array(z.string()),
    targetDate: z.string().nullable(),
    createdAt: iso,
  })
  .passthrough()
export type Project = z.infer<typeof projectSchema>

export const GROUPINGS = ['status', 'assignee', 'priority', 'project', 'none'] as const
export type Grouping = (typeof GROUPINGS)[number]
export const ORDERINGS = ['manual', 'priority', 'due', 'updated', 'created'] as const
export type Ordering = (typeof ORDERINGS)[number]

export const filtersSchema = z
  .object({
    teams: z.array(z.string()).optional(),
    statuses: z.array(z.string()).optional(),
    assignees: z.array(login.nullable()).optional(),
    /** people following the issue (see src/data/notify.ts, `followers`) */
    subscribers: z.array(login).optional(),
    priorities: z.array(z.number().int()).optional(),
    labels: z.array(z.string()).optional(),
    projects: z.array(z.string().nullable()).optional(),
    /**
     * statuses of the workspace's own; `statuses` holds the built-in one standing in for each (`as`), for versions of
     * the app that don't know them. `added`: that stand-in is there only for it, not chosen itself.
     */
    customStatuses: z.array(z.object({ id: z.string(), as: z.string(), added: z.boolean().optional() }).passthrough()).optional(),
  })
  .passthrough()
export type Filters = z.infer<typeof filtersSchema>

export const displaySchema = z
  .object({
    layout: z.enum(['list', 'board']),
    grouping: z.enum(GROUPINGS),
    ordering: z.enum(ORDERINGS),
    showCompleted: z.boolean(),
    showSubIssues: z.boolean(),
  })
  .passthrough()
export type Display = z.infer<typeof displaySchema>

/** views/<id>.json: a saved filter with an emoji */
export const viewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    emoji: z.string(),
    description: z.string(),
    owner: login,
    /** null = the whole workspace, otherwise a team key */
    team: z.string().nullable(),
    filters: filtersSchema,
    display: displaySchema,
    createdAt: iso,
  })
  .passthrough()
export type View = z.infer<typeof viewSchema>

/** inbox/<recipient>/<id>.json, written by whoever caused it */
export const inboxItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(['assigned', 'mentioned', 'commented', 'status']),
    issue: z.string(),
    actor: login,
    at: iso,
    /** the comment it's about (mentioned in a comment, commented) */
    comment: z.string().optional(),
    /** the new status (status); for a status of the workspace's own, the built-in one standing in for it */
    status: z.string().optional(),
    /** the new status, when it's one of the workspace's own */
    customStatus: z.string().optional(),
  })
  .passthrough()
export type InboxItem = z.infer<typeof inboxItemSchema>

/** state/<login>.json: personal marks, written only by that person */
export const readStateSchema = z
  .object({
    /** everything at or before this moment counts as read */
    readUntil: iso.nullable(),
    /** single items read after that */
    read: z.array(z.string()),
  })
  .passthrough()
export type ReadState = z.infer<typeof readStateSchema>
