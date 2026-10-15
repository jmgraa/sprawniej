/**
 * Files → store. When files change (loaded at start, edited here, or arriving from teammates) we parse just
 * those files and update the store. A file that can't be read is skipped with a warning.
 */
import type { Comment, Person } from '@/model/schema'
import { classify, parseFile, type Parsed } from './files'
import { useData, type DataState } from './store'

/** what each path held last time, so a deleted or changed file can be taken out of the store */
const index = new Map<string, Parsed>()

/**
 * Archive month files as text. They're read only when something needs archived issues (an old link, search, the
 * Archived tab), so a big archive costs nothing when the app opens.
 */
const archiveText = new Map<string, string>()
let archiveOn = false

/** people GitHub says have access but who haven't opened the workspace yet (no people/ file) */
let collaborators: Record<string, Person> = {}

export function resetProjection() {
  index.clear()
  archiveText.clear()
  archiveOn = false
  numbers.clear()
  collaborators = {}
}

/** Read the archive into the store (once; later changes to it are read as they come). */
export function loadArchive() {
  if (archiveOn) return
  archiveOn = true
  applyFiles(new Map(archiveText), useData.getState().me?.login ?? null)
  useData.setState({ archiveLoaded: true })
}

/** the archive month files as they are now (path → text), for actions that change them */
export function archiveFiles(): ReadonlyMap<string, string> {
  return archiveText
}

const numbers = new Map<string, { text: string; max: number }>()
/** the highest number among a team's archived issues, without reading the archive properly */
export function highestArchived(team: string): number {
  let max = 0
  for (const [path, text] of archiveText) {
    if (!path.startsWith(`teams/${team}/archive/`)) continue
    let known = numbers.get(path)
    if (known?.text !== text) {
      let m = 0
      for (const hit of text.matchAll(/"number":(\d+)/g)) m = Math.max(m, Number(hit[1]))
      known = { text, max: m }
      numbers.set(path, known)
    }
    max = Math.max(max, known.max)
  }
  return max
}

type Draft = Pick<DataState, 'workspace' | 'people' | 'labels' | 'teams' | 'issues' | 'archive' | 'projects' | 'views' | 'comments' | 'inbox' | 'readState'>

function remove(d: Draft, p: Parsed) {
  switch (p.kind) {
    case 'workspace':
      d.workspace = null
      break
    case 'person':
      delete d.people[p.value.login]
      if (collaborators[p.value.login]) d.people[p.value.login] = collaborators[p.value.login]
      break
    case 'label':
      delete d.labels[p.value.id]
      break
    case 'team':
      delete d.teams[p.value.key]
      break
    case 'issue':
      delete d.issues[p.value.id]
      break
    case 'archive':
      for (const a of p.value) delete d.archive[a.id]
      break
    case 'comment': {
      const list = (d.comments[p.value.issue] ?? []).filter((c) => c.id !== p.value.id)
      if (list.length) d.comments[p.value.issue] = list
      else delete d.comments[p.value.issue]
      break
    }
    case 'project':
      delete d.projects[p.value.id]
      break
    case 'view':
      delete d.views[p.value.id]
      break
    case 'inbox':
      d.inbox = d.inbox.filter((n) => n.id !== p.value.id)
      break
    case 'readState':
      d.readState = { readUntil: null, read: [] }
      break
  }
}

function add(d: Draft, p: Parsed, me: string | null) {
  switch (p.kind) {
    case 'workspace':
      d.workspace = p.value
      break
    case 'person':
      d.people[p.value.login] = p.value
      break
    case 'label':
      d.labels[p.value.id] = p.value
      break
    case 'team':
      d.teams[p.value.key] = p.value
      break
    case 'issue':
      d.issues[p.value.id] = p.value
      break
    case 'archive':
      for (const a of p.value) if (!d.archive[a.id] || d.archive[a.id].archivedAt <= a.archivedAt) d.archive[a.id] = a
      break
    case 'comment': {
      const list: Comment[] = [...(d.comments[p.value.issue] ?? []).filter((c) => c.id !== p.value.id), p.value]
      d.comments[p.value.issue] = list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      break
    }
    case 'project':
      d.projects[p.value.id] = p.value
      break
    case 'view':
      d.views[p.value.id] = p.value
      break
    case 'inbox':
      if (p.login === me) d.inbox = [p.value, ...d.inbox.filter((n) => n.id !== p.value.id)].sort((a, b) => b.at.localeCompare(a.at))
      break
    case 'readState':
      if (p.login === me) d.readState = p.value
      break
  }
}

/** which part of the store each kind of file lives in */
const FIELD = {
  workspace: 'workspace',
  person: 'people',
  label: 'labels',
  team: 'teams',
  issue: 'issues',
  archive: 'archive',
  comment: 'comments',
  project: 'projects',
  view: 'views',
  inbox: 'inbox',
  readState: 'readState',
} as const satisfies Record<Parsed['kind'], keyof Draft>

/**
 * Apply changed files (null = deleted) to the store. `me` decides whose inbox and read marks we keep.
 * Only the parts of the store these files touch get a new object, so a screen about labels doesn't redraw
 * because an issue changed.
 */
export function applyFiles(changes: Map<string, string | null>, me: string | null): string[] {
  const broken: string[] = []
  const parsed = new Map<string, Parsed | null>()
  const touched = new Set<keyof Draft>()
  for (const [path, text] of changes) {
    if (classify(path)?.kind === 'archive') {
      if (text === null) archiveText.delete(path)
      else archiveText.set(path, text)
      if (!archiveOn) continue
    }
    const old = index.get(path)
    if (old) touched.add(FIELD[old.kind])
    let p: Parsed | null = null
    if (text !== null) {
      try {
        p = parseFile(path, text)
      } catch (e) {
        console.warn(`Sprawniej skipped a file it couldn't read: ${(e as Error).message}`)
        broken.push(path)
      }
    }
    if (p) touched.add(FIELD[p.kind])
    parsed.set(path, p)
  }
  if (!touched.size) {
    for (const path of changes.keys()) index.delete(path)
    return broken
  }

  const s = useData.getState()
  const d: Partial<Draft> = {}
  for (const f of touched) {
    const v = s[f]
    // records are copied so we can change them; the rest are replaced whole by remove/add
    d[f] = (v && typeof v === 'object' && !Array.isArray(v) && f !== 'workspace' && f !== 'readState' ? { ...v } : v) as never
  }
  const draft = d as Draft
  // everything old goes first: a thing that moved (an issue to another team) is removed at its old path and added
  // at its new one, whichever order the paths came in
  for (const path of parsed.keys()) {
    const old = index.get(path)
    if (!old) continue
    remove(draft, old)
    index.delete(path)
  }
  for (const [path, p] of parsed) {
    if (!p) continue
    index.set(path, p)
    add(draft, p, me)
  }
  useData.setState(d)
  return broken
}

/** People with access according to GitHub. Their own people/ file, when there is one, wins. */
export function setCollaborators(list: Person[]) {
  collaborators = Object.fromEntries(list.map((p) => [p.login, p]))
  const s = useData.getState()
  const people = { ...collaborators }
  for (const p of index.values()) if (p.kind === 'person') people[p.value.login] = p.value
  useData.setState({ people: { ...s.people, ...people } })
}

/** the path a parsed thing came from, e.g. to find an issue's file before it moves */
export function pathOf(match: (p: Parsed) => boolean): string | undefined {
  for (const [path, p] of index) if (match(p)) return path
  return undefined
}

/** every file we know of, parsed (including other people's inbox items, which the store leaves out) */
export function* parsedFiles(): Generator<[path: string, parsed: Parsed]> {
  yield* index
}
