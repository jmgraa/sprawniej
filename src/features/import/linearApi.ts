/**
 * Reading a Linear workspace with a personal API key, straight from the browser (Linear's GraphQL API allows it).
 * Only reads; the key is kept in memory for this import and never saved. docs/linear-import.md has the mapping.
 */

const URL = 'https://api.linear.app/graphql'

export interface LTeam {
  id: string
  key: string
  name: string
  icon: string | null
}
export interface LUser {
  id: string
  name: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  active: boolean
}
export interface LLabel {
  id: string
  name: string
  color: string
  isGroup: boolean
  parent: { id: string; name: string } | null
}
export interface LProject {
  id: string
  name: string
  icon: string | null
  description: string
  targetDate: string | null
  createdAt: string
  status: { type: string } | null
  state?: string | null
  lead: { id: string } | null
  teams: { nodes: { id: string }[] }
}
/** how many subscribers of an issue are read; a full page means there may be more */
export const SUBSCRIBERS_READ = 30

export interface LIssue {
  id: string
  /** in Linear's trash (deleted) */
  trashed?: boolean | null
  number: number
  title: string
  description: string | null
  priority: number
  sortOrder: number
  /** "2026-10-31" */
  dueDate?: string | null
  estimate?: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  canceledAt: string | null
  state: { name: string; type: string }
  team: { id: string }
  assignee: { id: string } | null
  creator: { id: string } | null
  project: { id: string } | null
  parent: { id: string } | null
  labels: { nodes: { id: string }[] }
  /** people subscribed to it (Linear subscribes creators, assignees and commenters by itself too) */
  subscribers?: { nodes: { id: string }[] }
}
export interface LComment {
  id: string
  body: string
  createdAt: string
  user: { id: string; name: string } | null
  issue: { id: string } | null
}

/** a custom view; `filterData` is Linear's issue filter (fields, comparators like eq / in, and/or groups) */
export interface LView {
  id: string
  name: string
  description: string | null
  icon: string | null
  filterData: Record<string, unknown> | null
  shared: boolean
  team: { id: string } | null
  owner: { id: string } | null
  createdAt: string
}
/** a workflow state, so a view's "status is In Review" can be read */
export interface LState {
  id: string
  name: string
  type: string
}

export interface LinearData {
  org: { name: string; urlKey: string }
  teams: LTeam[]
  users: LUser[]
  labels: LLabel[]
  projects: LProject[]
  issues: LIssue[]
  comments: LComment[]
  views?: LView[]
  states?: LState[]
  /** Linear wouldn't share the views (the rest still comes over) */
  viewsFailed?: boolean
}

export class LinearError extends Error {
  readonly badKey: boolean
  constructor(message: string, badKey = false) {
    super(message)
    this.badKey = badKey
  }
}

async function query<T>(key: string, q: string, variables: Record<string, unknown> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: key.trim() },
      body: JSON.stringify({ query: q, variables }),
    })
  } catch {
    throw new LinearError('We couldn’t reach Linear. Check your internet connection and try again.')
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string; extensions?: { code?: string; type?: string } }[] }
  const err = body.errors?.[0]
  if (res.status === 401 || err?.extensions?.code === 'AUTHENTICATION_ERROR' || err?.extensions?.type === 'authentication error') {
    throw new LinearError('Linear didn’t accept this key. Check that you copied all of it, or make a new one.', true)
  }
  if (res.status === 429 || err?.extensions?.code === 'RATELIMITED') throw new LinearError('Linear asks us to slow down. Wait a few minutes and try again.')
  if (!body.data) throw new LinearError(err?.message ? `Linear says: ${err.message}` : `Linear answered with an error (${res.status}).`)
  return body.data
}

interface Page<T> {
  nodes: T[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

/** every page of a list; `pick` finds the list in the answer */
async function all<T>(key: string, q: string, vars: Record<string, unknown>, pick: (d: never) => Page<T>, onPage?: (count: number) => void): Promise<T[]> {
  const out: T[] = []
  let after: string | null = null
  for (;;) {
    const page: Page<T> = pick(await query<never>(key, q, { ...vars, after }))
    out.push(...page.nodes)
    onPage?.(out.length)
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return out
    after = page.pageInfo.endCursor
  }
}

const PAGE = 'pageInfo { hasNextPage endCursor }'

/** step 1: who you are in Linear, its teams and people */
export async function readBasics(key: string): Promise<Pick<LinearData, 'org' | 'teams' | 'users'>> {
  const d = await query<{ viewer: { organization: { name: string; urlKey: string } } }>(key, '{ viewer { id organization { name urlKey } } }')
  const teams = await all<LTeam>(key, `query($after: String) { teams(first: 100, after: $after) { nodes { id key name icon } ${PAGE} } }`, {}, (x: { teams: Page<LTeam> }) => x.teams)
  const users = await all<LUser>(
    key,
    `query($after: String) { users(first: 100, after: $after, includeDisabled: true) { nodes { id name displayName email avatarUrl active } ${PAGE} } }`,
    {},
    (x: { users: Page<LUser> }) => x.users,
  )
  return { org: d.viewer.organization, teams: teams.sort((a, b) => a.name.localeCompare(b.name)), users }
}

const PROJECT_FIELDS = 'id name icon description targetDate createdAt lead { id } teams(first: 20) { nodes { id } }'

async function readProjects(key: string): Promise<LProject[]> {
  const q = (status: string) => `query($after: String) { projects(first: 50, after: $after) { nodes { ${PROJECT_FIELDS} ${status} } ${PAGE} } }`
  const pick = (x: { projects: Page<LProject> }) => x.projects
  try {
    return await all<LProject>(key, q('status { type }'), {}, pick)
  } catch (e) {
    // older workspaces describe a project's progress with `state`
    if (e instanceof LinearError && !e.badKey) return all<LProject>(key, q('state'), {}, pick)
    throw e
  }
}

/** step 2: everything in the chosen teams. `progress` gets a line to show while it reads. */
export async function readTeams(
  key: string,
  teamIds: string[],
  progress: (text: string) => void,
): Promise<Pick<LinearData, 'labels' | 'projects' | 'issues' | 'comments' | 'views' | 'states' | 'viewsFailed'>> {
  progress('Reading labels and projects…')
  const labels = await all<LLabel>(
    key,
    `query($after: String) { issueLabels(first: 100, after: $after) { nodes { id name color isGroup parent { id name } } ${PAGE} } }`,
    {},
    (x: { issueLabels: Page<LLabel> }) => x.issueLabels,
  )
  const projects = await readProjects(key)
  const issues = await all<LIssue>(
    key,
    `query($after: String, $teams: [ID!]) { issues(first: 50, after: $after, includeArchived: true, filter: { team: { id: { in: $teams } } }) { nodes {
      id number title description priority sortOrder dueDate estimate createdAt updatedAt completedAt canceledAt trashed
      state { name type } team { id } assignee { id } creator { id } project { id } parent { id } labels(first: 50) { nodes { id } } subscribers(first: ${SUBSCRIBERS_READ}) { nodes { id } }
    } ${PAGE} } }`,
    { teams: teamIds },
    (x: { issues: Page<LIssue> }) => x.issues,
    (n) => progress(`Reading issues… ${n.toLocaleString()} so far`),
  )
  const comments = await all<LComment>(
    key,
    `query($after: String, $teams: [ID!]) { comments(first: 100, after: $after, includeArchived: true, filter: { issue: { team: { id: { in: $teams } } } }) { nodes {
      id body createdAt user { id name } issue { id }
    } ${PAGE} } }`,
    { teams: teamIds },
    (x: { comments: Page<LComment> }) => x.comments,
    (n) => progress(`Reading comments… ${n.toLocaleString()} so far`),
  )
  progress('Reading views…')
  const extra = await readViews(key).catch((e: unknown) => {
    if (e instanceof LinearError && e.badKey) throw e
    return { views: [], states: [], viewsFailed: true }
  })
  // archived issues come along (Linear archives finished work after a while); ones in Linear's trash don't
  const kept = issues.filter((i) => !i.trashed)
  const keptIds = new Set(kept.map((i) => i.id))
  return { labels, projects, issues: kept, comments: comments.filter((c) => !c.issue || keptIds.has(c.issue.id)), ...extra }
}

/** custom views, and the workflow states their filters name; views are a nice extra, so a failure here isn't fatal */
async function readViews(key: string): Promise<{ views: LView[]; states: LState[] }> {
  const views = await all<LView>(
    key,
    `query($after: String) { customViews(first: 50, after: $after) { nodes { id name description icon filterData shared team { id } owner { id } createdAt } ${PAGE} } }`,
    {},
    (x: { customViews: Page<LView> }) => x.customViews,
  )
  const states = views.length
    ? await all<LState>(key, `query($after: String) { workflowStates(first: 100, after: $after) { nodes { id name type } ${PAGE} } }`, {}, (x: { workflowStates: Page<LState> }) => x.workflowStates)
    : []
  return { views, states }
}
