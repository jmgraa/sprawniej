/**
 * Linear data → workspace files. Pure (no store, no network), so every rule is unit-tested
 * (tests/linearImport.test.ts). docs/linear-import.md describes the same mapping in plain words.
 *
 * Every imported file keeps its Linear id in `linearId`, so running the import again updates what came over
 * the first time instead of making copies.
 */
import { generateNKeysBetween } from 'fractional-indexing'
import { archiveMonth, archiveToFile, commentToFile, issueToFile, jsonToFile, paths } from '@/data/files'
import { linearIdsOf, linkedPerson, plainName as plain, relinkArchived, relinkIssue, relinkProject, relinkView } from '@/data/relink'
import { STATUSES, type Priority, type StatusId } from '@/model/status'
import { AUTO_ARCHIVE_MONTHS, isGuest, type ArchivedIssue, type Comment, type Issue, type Label, type Person, type Project, type Team, type View } from '@/model/schema'
import { SUBSCRIBERS_READ, type LIssue, type LinearData, type LLabel, type LTeam, type LUser } from './linearApi'
import { mapViewFilter, type FilterContext } from './linearFilters'

// ---------- people ----------

/** a Linear person's best guess among the workspace's people: linked to them before, same name, or a login like theirs */
export function guessPerson(u: LUser, people: Person[]): string | null {
  const linked = people.find((p) => linearIdsOf(p).includes(u.id))
  if (linked) return linked.login
  const names = [u.name, u.displayName].filter(Boolean).map(plain)
  const local = u.email ? plain(u.email.split('@')[0]) : ''
  const hit =
    people.find((p) => p.name && names.includes(plain(p.name))) ??
    people.find((p) => names.includes(plain(p.login)) || (local && plain(p.login) === local))
  return hit?.login ?? null
}

/** Linear user ids a view's filter names (assignee, subscribers, creator…) */
export function viewPeople(filterData: unknown): string[] {
  const out: string[] = []
  const walk = (x: unknown, inPerson: boolean) => {
    if (typeof x === 'string' && inPerson) out.push(x)
    else if (Array.isArray(x)) x.forEach((y) => walk(y, inPerson))
    else if (x && typeof x === 'object')
      for (const [k, v] of Object.entries(x)) walk(v, inPerson || k === 'assignee' || k === 'subscribers' || k === 'creator')
  }
  walk(filterData, false)
  return out
}

/** the Linear people who show up in these issues, comments and views (assignees, creators, commenters, subscribers) */
export function involvedUsers(data: Pick<LinearData, 'users' | 'issues' | 'comments'> & { views?: LinearData['views'] }): LUser[] {
  const ids = new Set<string>()
  for (const i of data.issues) {
    for (const u of [i.assignee, i.creator]) if (u) ids.add(u.id)
    for (const u of i.subscribers?.nodes ?? []) ids.add(u.id)
  }
  for (const c of data.comments) if (c.user) ids.add(c.user.id)
  for (const v of data.views ?? []) for (const id of viewPeople(v.filterData)) ids.add(id)
  return data.users.filter((u) => ids.has(u.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/** how a Linear person is called: their name, unless Linear only knows their e-mail address */
export const linearName = (u: LUser): string => (u.name.includes('@') ? u.displayName || u.name.split('@')[0] : u.name || u.displayName)

/**
 * The login each Linear person gets if nobody here is them: `~jan-kowalski` (see `isGuest`). Someone an earlier
 * import already brought keeps theirs; two people with the same name get told apart.
 */
export function guestLogins(users: LUser[], people: Record<string, Person>): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set(Object.keys(people))
  for (const p of Object.values(people)) {
    const id = linearIdOf(p)
    if (id && isGuest(p.login)) out.set(id, p.login)
  }
  for (const u of users) {
    if (out.has(u.id)) continue
    const slug =
      linearName(u)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'someone'
    let login = `~${slug}`
    if (taken.has(login)) login = `~${slug}-${u.id.replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase()}`
    taken.add(login)
    out.set(u.id, login)
  }
  return out
}

// ---------- statuses, teams, emoji ----------

const STATE_TYPES: Record<string, StatusId> = {
  triage: 'backlog',
  backlog: 'backlog',
  unstarted: 'todo',
  started: 'in_progress',
  completed: 'done',
  canceled: 'canceled',
}

/** by name first ("In Review"), then by Linear's kind of state */
export function mapStatus(state: { name: string; type: string }): StatusId {
  const name = plain(state.name.replace(/cancelled/i, 'canceled'))
  return STATUSES.find((s) => plain(s.name) === name)?.id ?? STATE_TYPES[state.type] ?? 'backlog'
}

const PROJECT_STATES: Record<string, Project['status']> = {
  backlog: 'backlog',
  planned: 'planned',
  started: 'in_progress',
  paused: 'paused',
  completed: 'completed',
  canceled: 'canceled',
}

/** Linear icons are names ("Rocket") or emoji; names we know become their emoji */
const ICONS: Record<string, string> = {
  rocket: '🚀', bug: '🐞', code: '💻', terminal: '💻', design: '🎨', palette: '🎨', brush: '🎨', mobile: '📱', phone: '📱',
  chart: '📊', barchart: '📊', megaphone: '📣', book: '📚', cube: '📦', box: '📦', flag: '🚩', star: '⭐', heart: '❤️',
  lightning: '⚡', bolt: '⚡', globe: '🌍', world: '🌍', server: '🖥️', computer: '🖥️', gear: '⚙️', settings: '⚙️',
  people: '👥', users: '👥', team: '👥', target: '🎯', shield: '🛡️', lock: '🔒', money: '💰', dollar: '💰', briefcase: '💼',
  lab: '🧪', flask: '🧪', tools: '🛠️', wrench: '🛠️', calendar: '📅', mail: '✉️', chat: '💬', home: '🏠', music: '🎵', camera: '📷',
}

export function emojiFor(icon: string | null, fallback: string): string {
  if (!icon) return fallback
  if (/\p{Extended_Pictographic}/u.test(icon)) return icon
  return ICONS[plain(icon)] ?? fallback
}

const TEAM_EMOJI = ['🚀', '🛠️', '🎨', '📦', '🧪', '📣', '🌍', '⚡']

/** a key for a team that isn't taken (ENG, then ENG2, ENG3…) */
export function freeKey(key: string, taken: Set<string>): string {
  const base = key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'T'
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`.slice(0, 7))) return `${base}${n}`.slice(0, 7)
}

// ---------- descriptions ----------

/** links to Linear issues that came over become plain references (ENG-12), which open here */
export function rewriteLinks(md: string, imported: Set<string>): string {
  const ref = (r: string, whole: string) => (imported.has(r) ? r : whole)
  return md
    .replace(/\[([^\]\n]*)\]\(https:\/\/linear\.app\/[^/\s)]+\/issue\/([A-Z][A-Z0-9]*-\d+)[^)\s]*\)/g, (whole, _text: string, r: string) => ref(r, whole))
    .replace(/<?https:\/\/linear\.app\/[^/\s)]+\/issue\/([A-Z][A-Z0-9]*-\d+)[^\s)>]*>?/g, (whole, r: string) => ref(r, whole))
}

// ---------- the whole import ----------

/** what the person chose in the wizard */
export interface ImportChoices {
  /** Linear team id → the key it gets here (its own key, or another one when that is taken) */
  teamKeys: Record<string, string>
  /** Linear user id → GitHub login here, a `~name` (someone who hasn't joined, see `guestLogins`), or null for nobody */
  people: Record<string, string | null>
}

/** the workspace as it is now */
export interface Existing {
  me: string
  /** everyone here, including people an earlier import brought who haven't joined */
  people?: Record<string, Person>
  teams: Record<string, Team>
  issues: Record<string, Issue>
  labels: Record<string, Label>
  projects: Record<string, Project>
  comments: Record<string, Comment[]>
  /** archived issues (loaded), so a second import knows them too */
  archive?: Record<string, ArchivedIssue>
  views?: Record<string, View>
}

export interface ImportResult {
  files: Map<string, string | null>
  /** `archived`: of the issues, how many are in the archive (finished long ago, or archived here since) */
  counts: { teams: number; labels: number; projects: number; issues: number; comments: number; archived: number; views: number }
  /** imported issues that couldn't keep their number, because the team here already used it */
  renumbered: { from: string; to: string }[]
  /** views whose Linear filters couldn't all come over, by name */
  inexactViews: string[]
  /** views none of whose filters could come over, so they're left out, by name */
  skippedViews: string[]
}

const linearIdOf = (x: object): string | undefined => {
  const v = (x as { linearId?: unknown }).linearId
  return typeof v === 'string' ? v : undefined
}

function byLinearId<T extends object>(things: Iterable<T>): Map<string, T> {
  const m = new Map<string, T>()
  for (const t of things) {
    const id = linearIdOf(t)
    if (id) m.set(id, t)
  }
  return m
}

/** Linear sends higher numbers for later in a list; this turns their order into ours, team by team */
function orderKeys(issues: LIssue[]): Map<string, string> {
  const out = new Map<string, string>()
  const byTeam = new Map<string, LIssue[]>()
  for (const i of issues) byTeam.set(i.team.id, [...(byTeam.get(i.team.id) ?? []), i])
  for (const list of byTeam.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)
    const keys = generateNKeysBetween(null, null, list.length)
    list.forEach((i, n) => out.set(i.id, keys[n]))
  }
  return out
}

export function buildImport(data: LinearData, choices: ImportChoices, ws: Existing, newId: () => string, now: string): ImportResult {
  const files = new Map<string, string | null>()
  const counts = { teams: 0, labels: 0, projects: 0, issues: 0, comments: 0, archived: 0, views: 0 }
  const renumbered: ImportResult['renumbered'] = []
  const login = (u: { id: string } | null | undefined) => (u ? (choices.people[u.id] ?? null) : null)
  const teams = data.teams.filter((t) => choices.teamKeys[t.id])
  const teamIds = new Set(teams.map((t) => t.id))
  const issues = data.issues.filter((i) => teamIds.has(i.team.id))
  const keyOf = (t: { id: string }) => choices.teamKeys[t.id]

  // people who haven't joined: a file each, so their name and picture show (made once; later imports leave it)
  const people = ws.people ?? {}
  for (const u of data.users) {
    const l = choices.people[u.id]
    if (!isGuest(l) || people[l!]) continue
    const guest: Person & { linearId: string } = { login: l!, githubId: 0, name: linearName(u), avatarUrl: u.avatarUrl ?? '', linearId: u.id }
    files.set(paths.person(guest.login), jsonToFile(guest))
  }
  // someone who has joined since an earlier import and is matched now: what pointed at them moves to their account
  const relinked = new Map<string, string>()
  for (const p of Object.values(people)) {
    const id = linearIdOf(p)
    const match = id ? choices.people[id] : undefined
    if (!isGuest(p.login) || !match || isGuest(match)) continue
    relinked.set(p.login, match)
    files.set(paths.person(p.login), null)
    // their account remembers the Linear id, so the next import matches them by itself
    files.set(paths.person(match), jsonToFile(linkedPerson(people[match], people[match] ?? { login: match, githubId: 0, name: match, avatarUrl: '' }, p)))
  }
  const relink = (l: string) => relinked.get(l) ?? l

  // teams: new ones get a file; ones that are already here stay as they are
  const members = new Map<string, Set<string>>()
  for (const i of issues) for (const p of [login(i.assignee), login(i.creator)]) if (p && !isGuest(p)) members.set(i.team.id, (members.get(i.team.id) ?? new Set()).add(p))
  teams.forEach((t: LTeam, n) => {
    const here = ws.teams[keyOf(t)]
    if (here) {
      // remember which Linear team it is, so the next import picks it again
      if (linearIdOf(here) !== t.id) files.set(paths.team(here.key), jsonToFile({ ...here, linearId: t.id }))
      return
    }
    const team: Team & { linearId: string } = {
      key: keyOf(t),
      name: t.name,
      emoji: emojiFor(t.icon, TEAM_EMOJI[n % TEAM_EMOJI.length]),
      members: [...new Set([ws.me, ...(members.get(t.id) ?? [])])],
      createdAt: now,
      linearId: t.id,
    }
    files.set(paths.team(team.key), jsonToFile(team))
    counts.teams++
  })

  // labels: group labels are flattened ("Area: Charts"); the same name in several teams becomes one label
  const usedLabels = new Set(issues.flatMap((i) => i.labels.nodes.map((l) => l.id)))
  const labelsByLinear = byLinearId(Object.values(ws.labels))
  const labelsByName = new Map(Object.values(ws.labels).map((l) => [l.name.toLowerCase(), l]))
  const labelId = new Map<string, string>()
  /** a Linear label → its label here, made if it's new (views bring over labels no issue uses yet) */
  const bringLabel = (l: LLabel): string => {
    const known = labelId.get(l.id)
    if (known) return known
    const name = l.parent ? `${l.parent.name}: ${l.name}` : l.name
    const found = labelsByLinear.get(l.id) ?? labelsByName.get(name.toLowerCase())
    if (found) {
      labelId.set(l.id, found.id)
      return found.id
    }
    const label: Label & { linearId: string } = { id: newId(), name, color: l.color, linearId: l.id }
    files.set(paths.label(label.id), jsonToFile(label))
    labelsByName.set(name.toLowerCase(), label)
    labelId.set(l.id, label.id)
    counts.labels++
    return label.id
  }
  for (const l of data.labels) if (!l.isGroup && usedLabels.has(l.id)) bringLabel(l)

  // projects: the ones these teams' issues belong to, or that belong to these teams
  const usedProjects = new Set(issues.flatMap((i) => (i.project ? [i.project.id] : [])))
  const projectsByLinear = byLinearId(Object.values(ws.projects))
  const projectId = new Map<string, string>()
  for (const p of data.projects) {
    if (!usedProjects.has(p.id) && !p.teams.nodes.some((t) => teamIds.has(t.id))) continue
    const old = projectsByLinear.get(p.id)
    const state = p.status?.type ?? p.state ?? 'planned'
    const project: Project & { linearId: string } = {
      ...old,
      id: old?.id ?? newId(),
      name: p.name,
      emoji: emojiFor(p.icon, old?.emoji ?? '📦'),
      description: p.description ?? '',
      status: PROJECT_STATES[state] ?? 'planned',
      lead: login(p.lead),
      teams: p.teams.nodes.filter((t) => teamIds.has(t.id)).map(keyOf),
      targetDate: p.targetDate,
      createdAt: old?.createdAt ?? p.createdAt,
      linearId: p.id,
    }
    files.set(paths.project(project.id), jsonToFile(project))
    projectId.set(p.id, project.id)
    counts.projects++
  }

  // issues: keep numbers unless the team here already used one for something else
  const issuesByLinear = byLinearId(Object.values(ws.issues))
  // issues archived here since an earlier import stay as they are
  const archived = Object.values(ws.archive ?? {})
    .filter((a) => !ws.issues[a.id])
    .map((a) => (relinked.size ? relinkArchived(a, relink) : a))
  /** archived records that pointed at someone who has joined since: their month files are written again */
  const relinkedArchive = new Set(relinked.size ? archived.filter((a) => JSON.stringify(a) !== JSON.stringify(ws.archive![a.id])).map((a) => a.id) : [])
  const archivedByLinear = byLinearId(archived)
  const order = orderKeys(issues)
  const idOf = new Map(issues.map((i) => [i.id, issuesByLinear.get(i.id)?.id ?? archivedByLinear.get(i.id)?.id ?? newId()]))
  const refs = new Set(issues.map((i) => `${keyOf(i.team)}-${i.number}`))
  const taken = new Map<string, Set<number>>()
  // every number in use here counts, including issues an earlier import brought in: they keep theirs
  for (const i of [...Object.values(ws.issues), ...archived]) taken.set(i.team, (taken.get(i.team) ?? new Set()).add(i.number))
  const highest = new Map<string, number>()
  const raise = (team: string, n: number) => highest.set(team, Math.max(highest.get(team) ?? 0, n))
  for (const [team, used] of taken) for (const n of used) raise(team, n)
  for (const t of Object.values(ws.teams)) raise(t.key, t.lastNumber ?? 0)
  for (const li of issues) {
    const old = issuesByLinear.get(li.id)
    raise(old?.team ?? keyOf(li.team), old?.number ?? li.number)
  }
  const plan: { li: LIssue; team: string; number: number }[] = []
  for (const li of [...issues].sort((a, b) => a.number - b.number)) {
    if (archivedByLinear.has(li.id)) {
      // archived here since: it stays as it is, and counts as in the archive
      counts.issues++
      counts.archived++
      continue
    }
    const old = issuesByLinear.get(li.id)
    const team = old?.team ?? keyOf(li.team)
    const used = taken.get(team) ?? new Set<number>()
    taken.set(team, used)
    let number = old?.number ?? li.number
    // a number is never given out twice, even if the issue that had it was deleted here (lastNumber remembers)
    if (!old && (used.has(number) || number <= (ws.teams[team]?.lastNumber ?? 0))) {
      const n = (highest.get(team) ?? 0) + 1
      raise(team, n)
      renumbered.push({ from: `${team}-${number}`, to: `${team}-${n}` })
      number = n
    }
    used.add(number)
    plan.push({ li, team, number })
  }
  const pathOfIssue = new Map<string, Issue>()
  // new issues finished longer ago than their team keeps finished issues go straight into the archive
  const toArchive = new Map<string, ArchivedIssue>()
  const archiveBefore = (team: string) => {
    const months = ws.teams[team]?.autoArchive ?? AUTO_ARCHIVE_MONTHS
    if (!months) return null
    const d = new Date(now)
    d.setMonth(d.getMonth() - months)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  // who commented on what, so subscribers who follow an issue anyway (by commenting) aren't listed twice
  const commenters = new Map<string, Set<string>>()
  for (const c of data.comments) {
    const who = login(c.user)
    if (c.issue && who) commenters.set(c.issue.id, (commenters.get(c.issue.id) ?? new Set()).add(who))
  }
  for (const { li, team, number } of plan) {
    const old = issuesByLinear.get(li.id)
    const assignee = login(li.assignee)
    const createdBy = login(li.creator) ?? (old?.createdBy && relink(old.createdBy)) ?? ws.me
    const implicit = new Set([assignee, createdBy, ...(commenters.get(li.id) ?? [])])
    // Linear's subscribers, plus anyone who subscribed here since an earlier import
    const theirs = new Set((li.subscribers?.nodes ?? []).map((u) => login(u)).filter((l): l is string => !!l))
    const subscribers = [...new Set([...(old?.subscribers ?? []).map(relink), ...theirs])].filter((l) => !implicit.has(l)).sort()
    // Linear subscribes creators, assignees and commenters by itself: one missing from its list unsubscribed there
    // (only when the list came in whole)
    const whole = !!li.subscribers && li.subscribers.nodes.length < SUBSCRIBERS_READ
    const left = whole ? [...implicit].filter((l): l is string => !!l && !theirs.has(l)) : []
    const unsubscribed = [...new Set([...(old?.unsubscribed ?? []).map(relink), ...left])].filter((l) => !theirs.has(l)).sort()
    const issue: Issue & { linearId: string } = {
      ...old,
      id: idOf.get(li.id)!,
      team,
      number,
      title: li.title,
      description: rewriteLinks(li.description ?? '', refs).replace(/\s+$/, ''),
      status: mapStatus(li.state),
      priority: (li.priority >= 0 && li.priority <= 4 ? li.priority : 0) as Priority,
      assignee,
      labels: [...new Set(li.labels.nodes.map((l) => labelId.get(l.id)).filter((x): x is string => !!x))],
      project: li.project ? (projectId.get(li.project.id) ?? null) : null,
      parent: li.parent ? (idOf.get(li.parent.id) ?? null) : null,
      ...(li.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(li.dueDate) ? { dueDate: li.dueDate } : old?.dueDate && { dueDate: null }),
      ...(typeof li.estimate === 'number' && li.estimate >= 0 ? { estimate: li.estimate } : old?.estimate != null && { estimate: null }),
      sortOrder: order.get(li.id)!,
      createdBy,
      ...(subscribers.length ? { subscribers } : old?.subscribers && { subscribers: [] }),
      ...(unsubscribed.length ? { unsubscribed } : old?.unsubscribed && { unsubscribed: [] }),
      createdAt: li.createdAt,
      updatedAt: li.updatedAt,
      completedAt: li.completedAt ?? li.canceledAt ?? null,
      linearId: li.id,
    }
    const before = archiveBefore(team)
    if (!old && before && ['done', 'canceled', 'duplicate'].includes(issue.status) && (issue.completedAt ?? issue.updatedAt) < before) {
      toArchive.set(issue.id, { ...issue, archivedAt: now, archivedBy: ws.me, comments: [] })
      counts.archived++
    } else files.set(paths.issue(issue), issueToFile(issue))
    pathOfIssue.set(li.id, issue)
    counts.issues++
  }

  // comments: matched authors keep their name; others are written by you, saying who wrote them
  const commentsByLinear = byLinearId(Object.values(ws.comments).flat())
  /** issues archived here (by an earlier import or by hand) that get new comments from Linear */
  const archivedWithNew = new Map<string, ArchivedIssue>()
  for (const c of [...data.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!c.body.trim() || !c.issue) continue
    const kept = archivedByLinear.get(c.issue.id)
    if (kept && !pathOfIssue.has(c.issue.id)) {
      // a comment written in Linear after the issue was archived here joins it in the archive
      if (kept.comments.some((k) => (k as { linearId?: string }).linearId === c.id)) continue
      const record = archivedWithNew.get(kept.id) ?? { ...kept, comments: [...kept.comments] }
      const author = login(c.user)
      const body = rewriteLinks(c.body, refs).replace(/\s+$/, '')
      record.comments.push({
        id: newId(),
        issue: kept.id,
        author: author ?? ws.me,
        createdAt: c.createdAt,
        body: author ? body : `*From Linear: ${c.user?.name ?? 'someone'}*\n\n${body}`,
        linearId: c.id,
      } as Comment)
      archivedWithNew.set(kept.id, record)
      counts.comments++
      continue
    }
    const issue = pathOfIssue.get(c.issue.id)
    if (!issue) continue
    const author = login(c.user)
    const old = commentsByLinear.get(c.id)
    const body = rewriteLinks(c.body, refs).replace(/\s+$/, '')
    const comment: Comment & { linearId: string } = {
      ...old,
      id: old?.id ?? newId(),
      issue: issue.id,
      author: author ?? ws.me,
      createdAt: c.createdAt,
      body: author ? body : `*From Linear: ${c.user?.name ?? 'someone'}*\n\n${body}`,
      linearId: c.id,
    }
    const record = toArchive.get(issue.id)
    if (record) record.comments.push(comment)
    else files.set(paths.comment(issue.team, comment), commentToFile(comment))
    counts.comments++
  }

  // issues made here that pointed at someone who has joined since: move them over too
  if (relinked.size) {
    const imported = new Set([...pathOfIssue.values()].map((i) => i.id))
    for (const i of Object.values(ws.issues)) {
      if (imported.has(i.id)) continue
      const next = relinkIssue(i, relink)
      if (JSON.stringify(next) !== JSON.stringify(i)) files.set(paths.issue(next), issueToFile(next))
    }
    const importedProjects = new Set(projectId.values())
    for (const p of Object.values(ws.projects)) {
      if (!importedProjects.has(p.id) && p.lead && relinked.has(p.lead)) files.set(paths.project(p.id), jsonToFile(relinkProject(p, relink)))
    }
  }

  // archived issues, one file per team and month, next to what those files hold already
  const byFile = new Map<string, ArchivedIssue[]>()
  const into = (a: ArchivedIssue) => {
    const path = paths.archive(a.team, archiveMonth(a, a.archivedAt))
    byFile.set(path, [...(byFile.get(path) ?? []), a])
  }
  toArchive.forEach(into)
  archivedWithNew.forEach(into)
  for (const a of archived) if (!archivedWithNew.has(a.id) && relinkedArchive.has(a.id)) into(a)
  const touched = new Set(byFile.keys())
  for (const a of archived) if (!archivedWithNew.has(a.id) && !relinkedArchive.has(a.id) && touched.has(paths.archive(a.team, archiveMonth(a, a.archivedAt)))) into(a)
  for (const [path, records] of byFile) files.set(path, archiveToFile(records))

  // views: the chosen teams' and the whole workspace's, with the filters that can come over
  const inexactViews: string[] = []
  const skippedViews: string[] = []
  const viewsByLinear = byLinearId(Object.values(ws.views ?? {}))
  const ctx: FilterContext = {
    states: new Map((data.states ?? []).map((st) => [st.id, st])),
    // someone matched to "no one" can't stand in a filter: "assigned to Bob" mustn't become "assigned to no one"
    person: (id) => choices.people[id] ?? undefined,
    labels: data.labels,
    label: bringLabel,
    labelHere: (name) => labelsByName.get(name.toLowerCase())?.id,
    project: (id) => projectId.get(id),
    team: (idOrKey) => {
      const t = teams.find((x) => x.id === idOrKey || x.key === idOrKey)
      return t ? keyOf(t) : undefined
    },
  }
  if (relinked.size) {
    const fromLinear = new Set((data.views ?? []).map((v) => v.id))
    for (const v of Object.values(ws.views ?? {})) {
      const id = linearIdOf(v)
      if (id && fromLinear.has(id)) continue
      const next = relinkView(v, relink)
      if (JSON.stringify(next) !== JSON.stringify(v)) files.set(paths.view(v.id), jsonToFile(next))
    }
  }
  for (const v of data.views ?? []) {
    if (v.team && !teamIds.has(v.team.id)) continue
    const old = viewsByLinear.get(v.id)
    const { filters, exact, nothing } = mapViewFilter(v.filterData, ctx)
    if (nothing) {
      // it would show every issue, which is worse than no view: leave it out (and drop what an earlier import made)
      skippedViews.push(v.name)
      if (old) files.set(paths.view(old.id), null)
      continue
    }
    if (v.team) delete filters.teams // a team's view is about that team already
    const view: View & { linearId: string } = {
      ...old,
      id: old?.id ?? newId(),
      name: v.name,
      emoji: emojiFor(v.icon, old?.emoji ?? '🔎'),
      description: v.description ?? '',
      owner: (v.owner && choices.people[v.owner.id]) || old?.owner || ws.me,
      team: v.team ? keyOf(v.team) : null,
      filters,
      // how it looks is chosen here (a later import keeps it)
      display: old?.display ?? { layout: 'list', grouping: 'status', ordering: 'manual', showCompleted: true, showSubIssues: true },
      createdAt: old?.createdAt ?? v.createdAt,
      linearId: v.id,
    }
    files.set(paths.view(view.id), jsonToFile(view))
    counts.views++
    if (!exact) inexactViews.push(v.name)
  }

  return { files, counts, renumbered, inexactViews, skippedViews }
}
