import { beforeEach, describe, expect, test } from 'bun:test'
import { linkPerson } from '@/data/actions'
import { issueToFile, commentToFile, jsonToFile, parseFile, type Parsed } from '@/data/files'
import { applyFiles, archiveFiles, parsedFiles, resetProjection } from '@/data/project'
import { linkedPerson, relinkArchiveLine, relinkFiles, sameName } from '@/data/relink'
import { EMPTY, useData } from '@/data/store'
import type { Comment, Issue, Person, Project, Team, View } from '@/model/schema'

const me = { login: 'ana', githubId: 1, name: 'Ana', avatarUrl: '' }
const guest = { login: '~darek-smith', githubId: 0, name: 'Darek Smith', avatarUrl: 'https://linear/darek.png', linearId: 'u-darek' } as Person
const darek: Person = { login: 'darekk', githubId: 42, name: 'darekk', avatarUrl: 'https://github/darekk.png' }

const issue = (id: string, more: Partial<Issue>): Issue =>
  ({ id, team: 'ENG', number: Number(id.replace(/\D/g, '')) || 1, title: id, description: '', status: 'todo', priority: 0, assignee: null, labels: [], project: null, parent: null, sortOrder: 'a0', createdBy: 'ana', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...more }) as Issue
const team: Team = { key: 'ENG', name: 'Engineering', emoji: '🛠️', members: ['ana'], createdAt: 'x' }
const ops: Team = { key: 'OPS', name: 'Ops', emoji: '⚙️', members: ['ana'], createdAt: 'x' }
const comment: Comment = { id: 'c1', issue: 'i1', author: '~darek-smith', createdAt: 'x', body: 'Hi' }
const project: Project = { id: 'p1', name: 'Charts', emoji: '📊', description: '', status: 'planned', lead: '~darek-smith', teams: ['ENG'], targetDate: null, createdAt: 'x' }
const view: View = {
  id: 'v1',
  name: 'Darek’s',
  emoji: '🔎',
  description: '',
  owner: '~darek-smith',
  team: null,
  filters: { assignees: ['~darek-smith', null], subscribers: ['~darek-smith', 'darekk'] },
  display: { layout: 'list', grouping: 'status', ordering: 'manual', showCompleted: true, showSubIssues: true },
  createdAt: 'x',
}
const archivedLine = JSON.stringify({ id: 'a1', number: 9, title: 'Old', status: 'done', priority: 0, assignee: '~darek-smith', labels: [], project: null, parent: null, sortOrder: 'a0', createdBy: 'ana', createdAt: 'x', updatedAt: 'x', archivedBy: 'ana', subscribers: ['~darek-smith'], description: '', archivedAt: 'x', comments: [{ id: 'c9', issue: 'a1', author: '~darek-smith', createdAt: 'x', body: 'old' }] })

function workspaceFiles(): Map<string, string> {
  return new Map([
    ['people/ana.json', jsonToFile(me)],
    ['people/~darek-smith.json', jsonToFile(guest)],
    ['teams/ENG/team.json', jsonToFile(team)],
    ['teams/OPS/team.json', jsonToFile(ops)],
    ['teams/ENG/issues/i1.md', issueToFile(issue('i1', { assignee: '~darek-smith', subscribers: ['~darek-smith', 'bob'] }))],
    ['teams/ENG/issues/i2.md', issueToFile(issue('i2', { createdBy: '~darek-smith', unsubscribed: ['~darek-smith'] }))],
    ['teams/OPS/issues/i3.md', issueToFile(issue('i3', { team: 'OPS', assignee: 'ana' }))],
    ['teams/ENG/comments/i1/c1.md', commentToFile(comment)],
    ['projects/p1.json', jsonToFile(project)],
    ['views/v1.json', jsonToFile(view)],
    ['teams/ENG/archive/2026-01.jsonl', `${archivedLine}\nnot json\n`],
  ])
}

const parsed = (files: Map<string, string>) => [...files].map(([path, text]) => [path, parseFile(path, text)!] as [string, Parsed])
const archive = (files: Map<string, string>) => new Map([...files].filter(([p]) => p.includes('/archive/')))

describe('linking someone from Linear to a GitHub account', () => {
  const files = workspaceFiles()
  const out = relinkFiles(guest, darek, parsed(files), archive(files))
  const get = (path: string) => parseFile(path, out.get(path)!)!.value as never

  test('their issues, comments, projects and views move over', () => {
    expect(get<Issue>('teams/ENG/issues/i1.md')).toMatchObject({ assignee: 'darekk', subscribers: ['darekk', 'bob'] })
    expect(get<Issue>('teams/ENG/issues/i2.md')).toMatchObject({ createdBy: 'darekk', unsubscribed: ['darekk'] })
    expect(out.has('teams/OPS/issues/i3.md')).toBe(false) // nothing of theirs: untouched
    expect(get<Comment>('teams/ENG/comments/i1/c1.md')).toMatchObject({ author: 'darekk', body: 'Hi' })
    expect(get<Project>('projects/p1.json').lead).toBe('darekk')
    // a filter that named both doesn't name the account twice
    expect(get<View>('views/v1.json')).toMatchObject({ owner: 'darekk', filters: { assignees: ['darekk', null], subscribers: ['darekk'] } })
  })

  test('archived issues and their comments too, and a line that can’t be read stays as it is', () => {
    const text = out.get('teams/ENG/archive/2026-01.jsonl')!
    const [first, second] = text.split('\n')
    expect(JSON.parse(first)).toMatchObject({ assignee: 'darekk', subscribers: ['darekk'], comments: [{ author: 'darekk' }] })
    expect(second).toBe('not json')
    expect(Object.keys(JSON.parse(first))).toEqual(Object.keys(JSON.parse(archivedLine)))
  })

  test('they join the teams their issues are in', () => {
    expect(get<Team>('teams/ENG/team.json').members).toEqual(['ana', 'darekk'])
    expect(out.has('teams/OPS/team.json')).toBe(false)
  })

  test('the Linear profile goes; the account gets a profile that remembers the Linear id', () => {
    expect(out.get('people/~darek-smith.json')).toBeNull()
    // no name on GitHub: the Linear name reads better until they set one
    expect(get<Person>('people/darekk.json')).toMatchObject({ login: 'darekk', githubId: 42, name: 'Darek Smith', avatarUrl: 'https://github/darekk.png', linearIds: ['u-darek'] })
  })

  test('someone who has opened the workspace keeps their own profile', () => {
    const own = { ...darek, name: 'Darek S.', theme: 'dark' } as Person
    const withOwn = new Map([...files, ['people/darekk.json', jsonToFile(own)]])
    const p = parseFile('people/darekk.json', relinkFiles(guest, { ...darek, name: 'Other' }, parsed(withOwn), archive(withOwn)).get('people/darekk.json')!)!.value
    expect(p).toMatchObject({ name: 'Darek S.', theme: 'dark', linearIds: ['u-darek'] })
  })

  test('two Linear accounts can be the same person', () => {
    const once = linkedPerson(undefined, darek, guest)
    const twice = linkedPerson(once, darek, { ...guest, login: '~darek-2', linearId: 'u-darek-2' } as Person)
    expect((twice as { linearIds?: string[] }).linearIds).toEqual(['u-darek', 'u-darek-2'])
  })

  test('an archive line keeps its exact text when nothing in it changes', () => {
    const line = '{"id":"x","assignee":"bob"}'
    expect(relinkArchiveLine(line, (l) => (l === '~z' ? 'z' : l))).toBe(line)
  })

  test('names that probably match', () => {
    expect(sameName('Darek Smith', { login: 'darekk', name: 'Darek Smith' })).toBe(true)
    expect(sameName('Łukasz Bąk', { login: 'lb', name: 'Lukasz Bak' })).toBe(true)
    expect(sameName('Darek', { login: 'darek' })).toBe(true)
    expect(sameName('Darek Smith', { login: 'darekk', name: null })).toBe(false)
  })
})

describe('linkPerson', () => {
  beforeEach(() => {
    resetProjection()
    useData.setState({ ...EMPTY, me })
  })

  test('the screen shows the account everywhere at once', () => {
    applyFiles(workspaceFiles(), 'ana')
    linkPerson('~darek-smith', darek)
    const s = useData.getState()
    expect(s.people['~darek-smith']).toBeUndefined()
    expect(s.people.darekk.name).toBe('Darek Smith')
    expect(s.issues.i1.assignee).toBe('darekk')
    expect(s.comments.i1[0].author).toBe('darekk')
    expect(s.views.v1.owner).toBe('darekk')
    expect(s.teams.ENG.members).toContain('darekk')
    expect([...archiveFiles().values()][0]).toContain('"assignee":"darekk"')
    expect([...parsedFiles()].some(([, p]) => p.kind === 'person' && p.value.login === '~darek-smith')).toBe(false)
  })

  test('only someone from Linear, and only to a GitHub account', () => {
    applyFiles(workspaceFiles(), 'ana')
    linkPerson('ana', darek)
    linkPerson('~darek-smith', { ...darek, login: '~someone' })
    expect(useData.getState().issues.i1.assignee).toBe('~darek-smith')
  })
})
