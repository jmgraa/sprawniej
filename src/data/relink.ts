/**
 * Someone the Linear import brought who hadn't joined (`~darek-smith`) turns out to be a GitHub person (@darekk):
 * everything that pointed at them moves over. Used by Settings › People ("Link to GitHub account", or right after an
 * invite) and by the Linear import when it matches them. Pure, so it's tested (tests/relink.test.ts).
 */
import { archiveFiles, parsedFiles } from './project'
import { commentToFile, issueToFile, jsonToFile, classify, paths, type Parsed } from './files'
import type { ArchivedIssue, Comment, Issue, Person, Project, View } from '@/model/schema'

/** login → the login it is now */
export type Relink = (login: string) => string

/** a name made comparable: no accents, no case, letters and digits only ("Łukasz B." → "lukaszb") */
export const plainName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]/g, '')

/** probably the same person: the same name, or a login that is their name */
export function sameName(name: string, other: { login: string; name?: string | null }): boolean {
  const n = plainName(name)
  return !!n && ((!!other.name && plainName(other.name) === n) || plainName(other.login) === n)
}

const list = (logins: string[], r: Relink) => [...new Set(logins.map(r))]

export function relinkIssue<T extends Issue>(i: T, r: Relink): T {
  return {
    ...i,
    assignee: i.assignee && r(i.assignee),
    createdBy: r(i.createdBy),
    ...(i.subscribers && { subscribers: list(i.subscribers, r) }),
    ...(i.unsubscribed && { unsubscribed: list(i.unsubscribed, r) }),
  }
}

export function relinkArchived<T extends ArchivedIssue>(a: T, r: Relink): T {
  return { ...relinkIssue(a, r), archivedBy: r(a.archivedBy), comments: a.comments.map((c) => relinkComment(c, r)) }
}

export const relinkComment = <T extends Comment>(c: T, r: Relink): T => ({ ...c, author: r(c.author) })

export const relinkProject = (p: Project, r: Relink): Project => ({ ...p, lead: p.lead && r(p.lead) })

export function relinkView(v: View, r: Relink): View {
  const f = v.filters
  return {
    ...v,
    owner: r(v.owner),
    filters: {
      ...f,
      ...(f.assignees && { assignees: [...new Set(f.assignees.map((l) => l && r(l)))] }),
      ...(f.subscribers && { subscribers: list(f.subscribers, r) }),
    },
  }
}

/**
 * One line of an archive month file, as raw JSON so a line keeps its exact shape (and a line we can't read stays
 * as it is).
 */
export function relinkArchiveLine(line: string, r: Relink): string {
  let a: Record<string, unknown>
  try {
    a = JSON.parse(line)
  } catch {
    return line
  }
  const one = (k: string) => typeof a[k] === 'string' && (a[k] = r(a[k] as string))
  const many = (k: string) => Array.isArray(a[k]) && (a[k] = list(a[k] as string[], r))
  one('assignee')
  one('createdBy')
  one('archivedBy')
  many('subscribers')
  many('unsubscribed')
  if (Array.isArray(a.comments)) a.comments = a.comments.map((c: Record<string, unknown>) => (typeof c?.author === 'string' ? { ...c, author: r(c.author) } : c))
  const next = JSON.stringify(a)
  return next === JSON.stringify(JSON.parse(line)) ? line : next
}

/** the Linear ids a person stands for: a guest's own (`linearId`), and the ones linked to an account (`linearIds`) */
export function linearIdsOf(p: Person | undefined): string[] {
  const x = p as { linearId?: unknown; linearIds?: unknown } | undefined
  return [...new Set([...(typeof x?.linearId === 'string' ? [x.linearId] : []), ...(Array.isArray(x?.linearIds) ? x.linearIds.filter((i) => typeof i === 'string') : [])])]
}

/**
 * The account's people/ file after the link: their own file if they've opened the workspace, else one made from what
 * GitHub says (they replace it with their own profile when they first open it). It remembers the guest's Linear id,
 * so a later import matches them by itself.
 */
export function linkedPerson(own: Person | undefined, to: Person, guest: Person): Person {
  const base: Person = own ?? { login: to.login, githubId: to.githubId, name: to.name, avatarUrl: to.avatarUrl }
  // no name on GitHub (just the login): the name they had in Linear reads better until they set one
  const name = !base.name || base.name === base.login ? guest.name : base.name
  return { ...base, name, linearIds: [...new Set([...linearIdsOf(base), ...linearIdsOf(guest)])] }
}

const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)

/**
 * Every file that changes when `guest` becomes `to`: issues (live and archived), comments, project leads, views,
 * the teams their issues are in (they join them), the account's people/ file, and the guest's file (removed).
 */
export function relinkFiles(guest: Person, to: Person, files: Iterable<[string, Parsed]> = parsedFiles(), archive: ReadonlyMap<string, string> = archiveFiles()): Map<string, string | null> {
  const r: Relink = (l) => (l === guest.login ? to.login : l)
  const out = new Map<string, string | null>()
  const teamsOfTheirs = new Set<string>()
  const teams: [string, Extract<Parsed, { kind: 'team' }>['value']][] = []
  let own: Person | undefined
  for (const [path, p] of files) {
    if (p.kind === 'issue') {
      if (p.value.assignee === guest.login || p.value.createdBy === guest.login) teamsOfTheirs.add(p.value.team)
      const next = relinkIssue(p.value, r)
      if (changed(next, p.value)) out.set(path, issueToFile(next))
    } else if (p.kind === 'comment') {
      if (p.value.author === guest.login) out.set(path, commentToFile(relinkComment(p.value, r)))
    } else if (p.kind === 'project') {
      if (p.value.lead === guest.login) out.set(path, jsonToFile(relinkProject(p.value, r)))
    } else if (p.kind === 'view') {
      const next = relinkView(p.value, r)
      if (changed(next, p.value)) out.set(path, jsonToFile(next))
    } else if (p.kind === 'team') teams.push([path, p.value])
    else if (p.kind === 'person' && p.value.login === to.login) own = p.value
  }
  for (const [path, text] of archive) {
    if (classify(path)?.kind !== 'archive' || !text.includes(`"${guest.login}"`)) continue
    const next = text
      .split('\n')
      .map((line) => (line.trim() ? relinkArchiveLine(line, r) : line))
      .join('\n')
    if (next !== text) out.set(path, next)
  }
  for (const [path, team] of teams) {
    if (teamsOfTheirs.has(team.key) && !team.members.includes(to.login)) out.set(path, jsonToFile({ ...team, members: [...team.members, to.login] }))
  }
  out.set(paths.person(to.login), jsonToFile(linkedPerson(own, to, guest)))
  out.set(paths.person(guest.login), null)
  return out
}
