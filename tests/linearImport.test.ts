import { describe, expect, test } from 'bun:test'
import { parseFile } from '@/data/files'
import { buildImport, guestLogins, emojiFor, freeKey, guessPerson, involvedUsers, mapStatus, rewriteLinks, type Existing, type ImportChoices } from '@/features/import/linearMap'
import type { ArchivedIssue, Comment, Issue, Label, Project, Team, View } from '@/model/schema'
import { linearFixture as data } from './fixtures/linear'

const person = (login: string, name: string) => ({ login, githubId: 1, name, avatarUrl: '' })
const people = [person('ana-n', 'Ana Nowak'), person('bstone', 'Robert'), person('mikolaj', 'Mikołaj Pocheć')]

describe('matching people', () => {
  test('by name, ignoring accents, or by the e-mail name', () => {
    expect(guessPerson(data.users[0], people)).toBe('ana-n')
    expect(guessPerson(data.users[1], people)).toBe('bstone')
    expect(guessPerson({ ...data.users[2], name: 'Mikolaj Pochec' }, people)).toBe('mikolaj')
    expect(guessPerson(data.users[2], people)).toBeNull()
  })
  test('only people who appear in the issues and views', () => {
    expect(involvedUsers({ ...data, issues: data.issues.slice(1, 3), comments: [], views: [] }).map((u) => u.id)).toEqual(['u-ana', 'u-old'])
    // subscribers and people a view filters by count too
    expect(involvedUsers({ ...data, comments: [], views: [] }).map((u) => u.id)).toContain('u-cat')
    expect(involvedUsers({ ...data, issues: [], comments: [], views: data.views!.filter((v) => v.id === 'v-cat') }).map((u) => u.id)).toEqual(['u-cat'])
  })
  test('people who aren’t here get a ~login of their own, kept from one import to the next', () => {
    const g = guestLogins(data.users, {})
    expect(g.get('u-old')).toBe('~old-timer')
    expect(g.get('u-cat')).toBe('~cat-wong')
    const taken = guestLogins(data.users, { '~cat-wong': { login: '~cat-wong', githubId: 0, name: 'Another Cat', avatarUrl: '' } })
    expect(taken.get('u-cat')).toMatch(/^~cat-wong-/)
    const kept = guestLogins(data.users, { '~catw': { login: '~catw', githubId: 0, name: 'Cat Wong', avatarUrl: '', linearId: 'u-cat' } as never })
    expect(kept.get('u-cat')).toBe('~catw')
    // Linear sometimes only knows an e-mail address as the name
    const mail = guestLogins([{ ...data.users[3], id: 'u-mail', name: 'jan.kowalski@acme.dev', displayName: 'jan' }], {})
    expect(mail.get('u-mail')).toBe('~jan')
    expect(guestLogins([{ ...data.users[3], id: 'u-l', name: 'Łukasz Bąk' }], {}).get('u-l')).toBe('~lukasz-bak')
  })
  test('someone linked to an account before is matched to it, whatever their name', () => {
    const linked = { ...person('dk', 'Somebody Else'), linearIds: ['u-old'] }
    expect(guessPerson(data.users.find((u) => u.id === 'u-old')!, [...people, linked])).toBe('dk')
  })
})

describe('mapping', () => {
  test('statuses by name, then by kind', () => {
    expect(mapStatus({ name: 'In Review', type: 'started' })).toBe('in_review')
    expect(mapStatus({ name: 'QA', type: 'started' })).toBe('in_progress')
    expect(mapStatus({ name: 'Triage', type: 'triage' })).toBe('backlog')
    expect(mapStatus({ name: 'Cancelled', type: 'canceled' })).toBe('canceled')
    expect(mapStatus({ name: 'Duplicate', type: 'canceled' })).toBe('duplicate')
  })
  test('icons', () => {
    expect(emojiFor('Rocket', '📦')).toBe('🚀')
    expect(emojiFor('🎨', '📦')).toBe('🎨')
    expect(emojiFor('SomethingElse', '📦')).toBe('📦')
  })
  test('free keys', () => {
    expect(freeKey('ENG', new Set(['ENG', 'ENG2']))).toBe('ENG3')
    expect(freeKey('des', new Set())).toBe('DES')
  })
  test('links to imported issues become references', () => {
    expect(rewriteLinks('a https://linear.app/acme/issue/ENG-2/fix and [x](https://linear.app/acme/issue/ENG-2/fix) and https://linear.app/acme/issue/OPS-1/y', new Set(['ENG-2']))).toBe(
      'a ENG-2 and ENG-2 and https://linear.app/acme/issue/OPS-1/y',
    )
  })
})

const empty = (): Existing => ({ me: 'mikolaj', teams: {}, issues: {}, labels: {}, projects: {}, comments: {} })
const choices: ImportChoices = { teamKeys: { 't-eng': 'ENG' }, people: { 'u-ana': 'ana-n', 'u-bob': 'bstone', 'u-old': null } }
const ids = () => {
  let n = 0
  return () => `id${++n}`
}

/** the import's files as workspace data, the way the app would read them */
function read(files: Map<string, string | null>): Existing {
  const ws = empty()
  for (const [path, text] of files) {
    const p = text && parseFile(path, text)
    if (!p) continue
    if (p.kind === 'team') ws.teams[p.value.key] = p.value as Team
    if (p.kind === 'issue') ws.issues[p.value.id] = p.value as Issue
    if (p.kind === 'label') ws.labels[p.value.id] = p.value as Label
    if (p.kind === 'project') ws.projects[p.value.id] = p.value as Project
    if (p.kind === 'comment') ws.comments[p.value.issue] = [...(ws.comments[p.value.issue] ?? []), p.value as Comment]
    if (p.kind === 'view') (ws.views ??= {})[p.value.id] = p.value as View
  }
  return ws
}

describe('building the import', () => {
  const r = buildImport(data, choices, empty(), ids(), '2026-03-01T00:00:00.000Z')
  const ws = read(r.files)
  const byTitle = (t: string) => Object.values(ws.issues).find((i) => i.title === t)!

  test('only the chosen team, with numbers, statuses and people', () => {
    expect(r.counts).toEqual({ teams: 1, labels: 3, projects: 1, issues: 3, comments: 2, archived: 0, views: 9 })
    expect(ws.teams.ENG).toMatchObject({ name: 'Engineering', emoji: '🚀' })
    expect(ws.teams.ENG.members.sort()).toEqual(['ana-n', 'bstone', 'mikolaj'])
    const charts = byTitle('Charts are slow')
    expect(charts).toMatchObject({ number: 1, status: 'in_review', priority: 2, assignee: 'bstone', createdBy: 'ana-n', dueDate: '2026-11-03', estimate: 5 })
    expect('dueDate' in byTitle('Old idea')).toBe(false)
    expect(byTitle('Old idea')).toMatchObject({ status: 'backlog', createdBy: 'mikolaj' })
    expect(byTitle('Fix the axis')).toMatchObject({ status: 'done', completedAt: '2026-02-01T00:00:00.000Z', parent: charts.id })
  })
  test('labels are flattened and merged by name; only used ones come (and ones a view needs)', () => {
    expect(Object.values(ws.labels).map((l) => l.name).sort()).toEqual(['Area: Charts', 'Bug', 'Unused'])
    expect(byTitle('Fix the axis').labels).toEqual(byTitle('Charts are slow').labels.slice(0, 1))
  })
  test('projects, order, links and comments', () => {
    const project = Object.values(ws.projects)[0]
    expect(project).toMatchObject({ name: 'Launch', emoji: '🚩', status: 'in_progress', lead: 'ana-n', teams: ['ENG'], targetDate: '2026-12-01' })
    expect(byTitle('Charts are slow').project).toBe(project.id)
    const order = Object.values(ws.issues).sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1)).map((i) => i.number)
    expect(order).toEqual([2, 3, 1])
    expect(byTitle('Charts are slow').description).toBe('See ENG-2 and ENG-2 and https://linear.app/acme/issue/OPS-9/x')
    const comments = ws.comments[byTitle('Charts are slow').id]
    expect(comments.map((c) => [c.author, c.body])).toEqual([
      ['bstone', 'On it'],
      ['mikolaj', '*From Linear: Old Timer*\n\nBack in my day'],
    ])
  })

  test('running it again updates instead of copying', () => {
    const again = buildImport({ ...data, issues: data.issues.map((i) => (i.id === 'i-3' ? { ...i, title: 'Old idea, renamed' } : i)) }, choices, { ...ws, me: 'mikolaj' }, ids(), 'later')
    expect(again.counts).toMatchObject({ teams: 0, labels: 0, issues: 3, comments: 2 })
    const ws2 = read(again.files)
    expect(Object.keys(ws2.issues).sort()).toEqual(Object.keys(ws.issues).sort())
    expect(Object.values(ws2.issues).find((i) => i.number === 3)?.title).toBe('Old idea, renamed')
    expect(Object.keys(ws2.projects)).toEqual(Object.keys(ws.projects))
  })

  test('views: the chosen teams’ and the workspace’s, with the filters that fit', () => {
    const views = Object.values(ws.views ?? {})
    const byName = (n: string) => views.find((v) => v.name === n)!
    expect(views.map((v) => v.name).sort()).toEqual(['@ Area', '@ Unused', 'Ana', 'Bob follows', 'Bob’s or followed', 'Bob’s urgent work', 'Nobody’s', 'Open bugs', 'Recent launch work'])
    const bug = Object.values(ws.labels).find((l) => l.name === 'Bug')!.id
    expect(byName('Open bugs')).toMatchObject({ team: 'ENG', emoji: '🐞', owner: 'ana-n', description: 'Bugs still to fix', filters: { statuses: ['todo', 'in_progress', 'in_review'], labels: [bug] } })
    expect(byName('Bob’s urgent work')).toMatchObject({ team: null, owner: 'bstone', filters: { assignees: ['bstone'], priorities: [1, 2], teams: ['ENG'], statuses: ['in_review'] } })
    expect(byName('Nobody’s').filters).toEqual({ assignees: [null] })
    expect(byName('Recent launch work').filters).toEqual({ projects: [Object.values(ws.projects)[0].id] })
    expect(byName('Recent launch work').owner).toBe('mikolaj') // matched to no one: you
    expect(r.inexactViews).toEqual(['Recent launch work'])
  })

  test('views saved by Linear’s app: choices inside each field, labels with their sub-labels', () => {
    const views = Object.values(ws.views ?? {})
    const byName = (n: string) => views.find((v) => v.name === n)!
    const label = (n: string) => Object.values(ws.labels).find((l) => l.name === n)?.id
    expect(byName('@ Area').filters).toEqual({ labels: [label('Area: Charts')] })
    // no issue has it, but the view needs it, so it comes over (the view starts empty, as in Linear)
    expect(byName('@ Unused').filters).toEqual({ labels: [label('Unused')] })
    expect(label('Unused')).toBeDefined()
    expect(byName('Ana').filters).toEqual({ assignees: ['ana-n'] })
    // "subscribed", and "assigned or subscribed" (people follow what they're assigned to): both are "Bob follows it"
    expect(byName('Bob follows').filters).toEqual({ subscribers: ['bstone'] })
    expect(byName('Bob’s or followed').filters).toEqual({ subscribers: ['bstone'] })
    expect(r.inexactViews).not.toContain('Bob’s or followed')
    // Cat is matched to no one, so nothing here can say "Cat follows it": left out instead of showing every issue
    expect(r.skippedViews).toEqual(['Cat'])
  })

  test('subscribers come over, without the people who follow the issue anyway', () => {
    // Bob is assigned and Ana created it: they follow it anyway; Cat is matched to no one
    expect(byTitle('Charts are slow').subscribers).toBeUndefined()
    const withCat = read(buildImport(data, { ...choices, people: { ...choices.people, 'u-cat': 'cwong' } }, empty(), ids(), '2026-03-01T00:00:00.000Z').files)
    expect(Object.values(withCat.issues).find((i) => i.title === 'Charts are slow')?.subscribers).toEqual(['cwong'])
    // the creator who isn't on Linear's list unsubscribed there; Linear didn't send a list for the others
    const gone = buildImport({ ...data, issues: data.issues.map((i) => (i.id === 'i-1' ? { ...i, subscribers: { nodes: [{ id: 'u-bob' }] } } : i)) }, choices, empty(), ids(), '2026-03-01T00:00:00.000Z')
    const w = read(gone.files)
    expect(Object.values(w.issues).find((i) => i.title === 'Charts are slow')?.unsubscribed).toEqual(['ana-n'])
    expect(Object.values(w.issues).find((i) => i.title === 'Old idea')?.unsubscribed).toBeUndefined()
  })

  test('people who aren’t here come as someone who hasn’t joined, and keep their work', () => {
    const guests = { ...choices, people: { ...choices.people, 'u-old': '~old-timer', 'u-cat': '~cat-wong' } }
    const g = buildImport(data, guests, empty(), ids(), '2026-03-01T00:00:00.000Z')
    expect(g.files.get('people/~old-timer.json')).toContain('"name": "Old Timer"')
    expect(g.files.get('people/~cat-wong.json')).toContain('https://example.com/cat.png')
    const w = read(g.files)
    const old = Object.values(w.issues).find((i) => i.title === 'Old idea')!
    expect(old.createdBy).toBe('~old-timer')
    expect(Object.values(w.issues).find((i) => i.title === 'Charts are slow')?.subscribers).toEqual(['~cat-wong'])
    // their comment is theirs, with no "From Linear" line
    const theirs = Object.values(w.comments).flat().find((c) => c.author === '~old-timer')!
    expect(theirs.body).toBe('Back in my day')
    // their view works, and they're never made a team member
    expect(Object.values(w.views ?? {}).find((v) => v.name === 'Cat')?.filters).toEqual({ subscribers: ['~cat-wong'] })
    expect(g.skippedViews).toEqual([])
    expect(w.teams.ENG.members).not.toContain('~old-timer')
  })

  test('once someone has joined and is matched, a later import moves their work to their account', () => {
    const guests = { ...choices, people: { ...choices.people, 'u-old': '~old-timer', 'u-cat': '~cat-wong' } }
    const first = buildImport(data, guests, empty(), ids(), '2026-03-01T00:00:00.000Z')
    const w = read(first.files)
    const people = Object.fromEntries([...first.files].filter(([p]) => p.startsWith('people/')).map(([, t]) => JSON.parse(t!)).map((p) => [p.login, p]))
    // an issue made here, assigned to Cat, and a view made here about her
    const mine = { id: 'local-1', team: 'ENG', number: 50, title: 'Made here', description: '', status: 'todo', priority: 0, assignee: '~cat-wong', labels: [], project: null, parent: null, sortOrder: 'a0', createdBy: 'mikolaj', createdAt: 'x', updatedAt: 'x', completedAt: null } as Issue
    const view = { id: 'vh', name: 'Cat’s', emoji: '🐱', description: '', owner: '~cat-wong', team: null, filters: { assignees: ['~cat-wong'] }, display: Object.values(w.views!)[0].display, createdAt: 'x' } as View
    const after = buildImport(data, { ...guests, people: { ...guests.people, 'u-cat': 'cwong' } }, { ...w, me: 'mikolaj', people, issues: { ...w.issues, [mine.id]: mine }, views: { ...w.views, vh: view } }, ids(), '2026-03-02T00:00:00.000Z')
    expect(after.files.get('people/~cat-wong.json')).toBeNull()
    expect(after.files.has('people/~old-timer.json')).toBe(false) // still not here: left alone
    const w2 = read(after.files)
    expect(Object.values(w2.issues).find((i) => i.title === 'Charts are slow')?.subscribers).toEqual(['cwong'])
    expect(w2.issues['local-1']?.assignee).toBe('cwong')
    expect(w2.views?.vh).toMatchObject({ owner: 'cwong', filters: { assignees: ['cwong'] } })
    expect(Object.values(w2.views ?? {}).find((v) => v.name === 'Cat')?.filters).toEqual({ subscribers: ['cwong'] })
    // their account remembers the Linear id, so the next import matches them by itself
    expect(JSON.parse(after.files.get('people/cwong.json')!)).toMatchObject({ login: 'cwong', name: 'Cat Wong', linearIds: ['u-cat'] })
  })

  test('a later import that matches someone moves their archived issues and the projects they lead too', () => {
    const guests = { ...choices, people: { ...choices.people, 'u-cat': '~cat-wong' } }
    const first = buildImport(data, guests, empty(), ids(), '2026-03-01T00:00:00.000Z')
    const w = read(first.files)
    const people = Object.fromEntries([...first.files].filter(([p]) => p.startsWith('people/')).map(([, t]) => JSON.parse(t!)).map((p) => [p.login, p]))
    const old = { id: 'arch-1', team: 'ENG', number: 70, title: 'Archived here', description: '', status: 'done', priority: 0, assignee: '~cat-wong', labels: [], project: null, parent: null, sortOrder: 'a0', createdBy: 'mikolaj', createdAt: 'x', updatedAt: '2026-01-05T00:00:00.000Z', completedAt: '2026-01-05T00:00:00.000Z', archivedAt: 'y', archivedBy: 'mikolaj', comments: [{ id: 'k', issue: 'arch-1', author: '~cat-wong', createdAt: 'x', body: 'hm' }] } as ArchivedIssue
    const lead = { id: 'pl', name: 'Made here', emoji: '📦', description: '', status: 'planned', lead: '~cat-wong', teams: [], targetDate: null, createdAt: 'x' } as Project
    const after = buildImport(data, { ...guests, people: { ...guests.people, 'u-cat': 'cwong' } }, { ...w, me: 'mikolaj', people, archive: { [old.id]: old }, projects: { ...w.projects, pl: lead } }, ids(), '2026-03-02T00:00:00.000Z')
    const month = after.files.get('teams/ENG/archive/2026-01.jsonl')!
    expect(JSON.parse(month)).toMatchObject({ assignee: 'cwong', comments: [{ author: 'cwong' }] })
    expect(JSON.parse(after.files.get('projects/pl.json')!).lead).toBe('cwong')
  })

  test('a person matched to no one: their view is left out', () => {
    const noAna = buildImport(data, { ...choices, people: { ...choices.people, 'u-ana': null } }, empty(), ids(), '2026-03-01T00:00:00.000Z')
    expect(noAna.skippedViews).toContain('Ana')
  })

  test('a view made by an earlier import that can’t come over now goes away', () => {
    const v = Object.values(ws.views ?? {}).find((x) => x.name === 'Ana')!
    const again = buildImport(data, { ...choices, people: { ...choices.people, 'u-ana': null } }, { ...ws, me: 'mikolaj' }, ids(), '2026-03-02T00:00:00.000Z')
    expect(again.files.get(`views/${v.id}.json`)).toBeNull()
  })

  test('a second import updates views and keeps how they look', () => {
    const v = Object.values(ws.views ?? {}).find((x) => x.name === 'Open bugs')!
    const mine = { ...ws, me: 'mikolaj', views: { ...ws.views, [v.id]: { ...v, display: { ...v.display, layout: 'board' as const } } } }
    const again = buildImport({ ...data, views: data.views!.map((x) => (x.id === 'v-bugs' ? { ...x, name: 'Open bugs!' } : x)) }, choices, mine, ids(), '2026-03-02T00:00:00.000Z')
    const after = read(again.files).views!
    expect(Object.keys(after).sort()).toEqual(Object.keys(ws.views!).sort())
    expect(after[v.id]).toMatchObject({ name: 'Open bugs!', display: { layout: 'board' } })
  })

  test('issues finished long ago go straight into the archive; a second import leaves them there', () => {
    const later = buildImport(data, choices, empty(), ids(), '2026-10-07T00:00:00.000Z')
    expect(later.counts).toMatchObject({ issues: 3, archived: 1 })
    const month = [...later.files.keys()].filter((p) => p.includes('/archive/'))
    expect(month).toEqual(['teams/ENG/archive/2026-02.jsonl'])
    const archived = parseFile(month[0], later.files.get(month[0])!)
    expect(archived).toMatchObject({ kind: 'archive', value: [{ title: 'Fix the axis', number: 2, archivedBy: 'mikolaj' }] })
    const ws3 = read(later.files)
    expect(Object.values(ws3.issues).map((i) => i.title).sort()).toEqual(['Charts are slow', 'Old idea'])
    const archive = Object.fromEntries((archived as { value: ArchivedIssue[] }).value.map((a) => [a.id, a]))
    const again = buildImport(data, choices, { ...ws3, me: 'mikolaj', archive }, ids(), '2026-10-08T00:00:00.000Z')
    expect(again.counts).toMatchObject({ issues: 3, archived: 1 })
    expect([...again.files.keys()].some((p) => p.includes('/archive/') || p.includes(archive[Object.keys(archive)[0]].id))).toBe(false)
    // the sub-issue's parent link still points at the same issue
    expect(Object.values(read(again.files).issues).find((i) => i.title === 'Charts are slow')?.id).toBe(Object.values(ws3.issues).find((i) => i.title === 'Charts are slow')?.id)

    // a comment written in Linear later joins the archived issue, once
    const withComment = { ...data, comments: [...data.comments, { id: 'c-late', body: 'Still broken?', createdAt: '2026-10-01T00:00:00.000Z', user: { id: 'u-bob', name: 'Bob Stone' }, issue: { id: 'i-2' } }] }
    const third = buildImport(withComment, choices, { ...ws3, me: 'mikolaj', archive }, ids(), '2026-10-09T00:00:00.000Z')
    const file = third.files.get('teams/ENG/archive/2026-02.jsonl')!
    const records = (parseFile('teams/ENG/archive/2026-02.jsonl', file) as { value: ArchivedIssue[] }).value
    expect(records[0].comments.map((c) => [c.author, c.body])).toEqual([['bstone', 'Still broken?']])
    const archive2 = Object.fromEntries(records.map((a) => [a.id, a]))
    const fourth = buildImport(withComment, choices, { ...ws3, me: 'mikolaj', archive: archive2 }, ids(), '2026-10-10T00:00:00.000Z')
    expect([...fourth.files.keys()].some((p) => p.includes('/archive/'))).toBe(false)
  })

  test('into a team that already has issues: clashing numbers move up', () => {
    const mine: Issue = { id: 'mine', team: 'ENG', number: 2, title: 'Made here', description: '', status: 'todo', priority: 0, assignee: null, labels: [], project: null, parent: null, sortOrder: 'a0', createdBy: 'mikolaj', createdAt: '', updatedAt: '' }
    const existing = { ...empty(), teams: { ENG: { key: 'ENG', name: 'Eng', emoji: '🛠️', members: [], createdAt: '' } }, issues: { mine } }
    const r2 = buildImport(data, choices, existing, ids(), 'now')
    expect(r2.counts.teams).toBe(0)
    expect(r2.renumbered).toEqual([{ from: 'ENG-2', to: 'ENG-4' }])
  })
})

test('a second import never gives a new issue a number an earlier import already used', () => {
  const native = (n: number): Issue => ({ id: `mine${n}`, team: 'ENG', number: n, title: `Made here ${n}`, description: '', status: 'todo', priority: 0, assignee: null, labels: [], project: null, parent: null, sortOrder: `a${n}`, createdBy: 'mikolaj', createdAt: '', updatedAt: '' })
  const existing = { ...empty(), teams: { ENG: { key: 'ENG', name: 'Eng', emoji: '🛠️', members: [], createdAt: '' } }, issues: { mine1: native(1), mine2: native(2), mine3: native(3) } }
  const first = buildImport(data, choices, existing, ids(), 'now')
  const after = read(first.files)
  const ws2 = { ...existing, teams: { ...existing.teams, ...after.teams }, issues: { ...existing.issues, ...after.issues }, labels: after.labels, projects: after.projects }
  const more = { ...data, issues: [...data.issues, { ...data.issues[2], id: 'i-4', number: 4, title: 'Brand new' }, { ...data.issues[2], id: 'i-5', number: 5, title: 'Newer still' }] }
  const second = buildImport(more, choices, ws2, ids(), 'later')
  const final = { ...ws2.issues, ...read(second.files).issues }
  const eng = Object.values(final).filter((i) => i.team === 'ENG').map((i) => i.number)
  expect(new Set(eng).size).toBe(eng.length)
})

test('an import never hands out the number of an issue deleted here', () => {
  const existing = { ...empty(), teams: { ENG: { key: 'ENG', name: 'Eng', emoji: '🛠️', members: [], createdAt: '', lastNumber: 2 } } }
  const r = buildImport(data, choices, existing, ids(), 'now')
  const numbers = Object.values(read(r.files).issues).filter((i) => i.team === 'ENG').map((i) => i.number).sort()
  expect(numbers.some((n) => n <= 2)).toBe(false)
})

test('a Linear team that joins a team here is remembered', () => {
  const existing = { ...empty(), teams: { ENG: { key: 'ENG', name: 'Eng', emoji: '🛠️', members: ['mikolaj'], createdAt: '' } } }
  const r = buildImport(data, choices, existing, ids(), 'now')
  expect(read(r.files).teams.ENG).toMatchObject({ name: 'Eng', linearId: 't-eng' })
  expect(r.counts.teams).toBe(0)
})
