import { describe, expect, test } from 'bun:test'
import { sampleData } from '@/data/sample'
import { archiveLinesUnread, archiveToFile, archivedToLine, classify, commentToFile, inboxToFile, issueToFile, joinFrontMatter, jsonToFile, parseArchive, parseFile, paths, splitFrontMatter, viewToFile } from '@/data/files'
import { STATUSES } from '@/model/status'
import type { ArchivedIssue, View } from '@/model/schema'

const data = sampleData()
const issue = data.issues['sample-01']

describe('issue files', () => {
  test('round trip keeps every field and the description', () => {
    const text = issueToFile(issue)
    const back = parseFile(paths.issue(issue), text)
    expect(back?.kind).toBe('issue')
    expect(back?.value).toEqual(issue)
  })
  test('front matter is readable YAML with the id first and no team field', () => {
    const text = issueToFile(issue)
    expect(text.startsWith('---\nid: sample-01\nnumber: 1\n')).toBe(true)
    expect(text).not.toContain('team:')
    expect(text).toContain('\n---\nCharts should be easier')
  })
  test('titles with colons, quotes and backticks survive', () => {
    const tricky = { ...issue, title: 'Fix: "quotes", `code` and # hashes', description: '' }
    const back = parseFile(paths.issue(tricky), issueToFile(tricky))
    expect(back?.value).toEqual(tricky)
  })
  test('unknown fields are kept', () => {
    const text = issueToFile(issue).replace('number: 1\n', 'number: 1\nlinearId: abc-123\n')
    const back = parseFile(paths.issue(issue), text)!
    expect((back.value as Record<string, unknown>).linearId).toBe('abc-123')
    expect(issueToFile(back.value as typeof issue)).toContain('linearId: abc-123')
  })
  test('a broken file throws with its path', () => {
    expect(() => parseFile('teams/ENG/issues/x.md', '---\nid: x\n---\n')).toThrow('teams/ENG/issues/x.md')
  })
  test('Windows line endings are fine', () => {
    const text = issueToFile(issue).replace(/\n/g, '\r\n')
    expect(parseFile(paths.issue(issue), text)?.value).toEqual(issue)
  })
})

describe('other files', () => {
  test('comment round trip', () => {
    const c = data.comments['sample-01'][0]
    expect(parseFile(paths.comment('ENG', c), commentToFile(c))?.value).toEqual(c)
  })
  test('team and view round trip', () => {
    const t = data.teams.ENG
    expect(parseFile(paths.team('ENG'), jsonToFile(t))?.value).toEqual(t)
    const v = data.views['v-bugs']
    expect(parseFile(paths.view(v.id), jsonToFile(v))?.value).toEqual(v)
  })
  test('files we do not manage are ignored', () => {
    expect(classify('README.md')).toBeNull()
    expect(parseFile('.github/workflows/x.yml', 'anything')).toBeNull()
  })
  test('front matter split handles a body that contains ---', () => {
    const { body } = splitFrontMatter('---\na: 1\n---\nline\n---\nmore\n')
    expect(body).toBe('line\n---\nmore\n')
  })
})

describe('a workspace’s own statuses in the files', () => {
  const blocked = { id: 'st-blocked', name: 'Blocked', group: 'canceled' as const, color: '#eb5757' }
  const find = (id: string) => (id === 'st-blocked' ? blocked : STATUSES.find((s) => s.id === id)!)
  const stuck = { ...issue, status: 'st-blocked' }
  const builtIn = new Set(STATUSES.map((s) => s.id))

  test('an issue: a built-in stand-in for older versions, the real status for this one', () => {
    const text = issueToFile(stuck, find)
    const fields = splitFrontMatter(text).fields as Record<string, unknown>
    expect(fields.status).toBe('canceled')
    expect(builtIn.has(fields.status as string)).toBe(true)
    expect(fields.customStatus).toEqual({ id: 'st-blocked', as: 'canceled' })
    expect(parseFile(paths.issue(stuck), text)?.value).toEqual(stuck)
    // back to a built-in status: the extra field goes
    expect(issueToFile({ ...stuck, status: 'todo' }, find)).not.toContain('customStatus')
  })
  test('an older version that changes the status wins; one that saves without changing it keeps it', () => {
    const { fields, body } = splitFrontMatter(issueToFile(stuck, find))
    const changed = joinFrontMatter({ ...(fields as Record<string, unknown>), status: 'todo' }, body)
    expect((parseFile(paths.issue(stuck), changed)!.value as typeof stuck).status).toBe('todo')
    const touched = joinFrontMatter({ ...(fields as Record<string, unknown>), title: 'Renamed' }, body)
    expect((parseFile(paths.issue(stuck), touched)!.value as typeof stuck).status).toBe('st-blocked')
  })
  test('a view’s filter', () => {
    const view: View = { id: 'v1', name: 'Stuck', emoji: '🧱', description: '', owner: 'ana-n', team: null, filters: { statuses: ['todo', 'st-blocked'] }, display: data.views[Object.keys(data.views)[0]]?.display ?? { layout: 'list', grouping: 'status', ordering: 'manual', showCompleted: true, showSubIssues: true }, createdAt: 'x' }
    const viewOf = (t: string) => parseFile(paths.view('v1'), t)!.value as View
    const text = viewToFile(view, find)
    const raw = JSON.parse(text) as View
    expect(raw.filters.statuses).toEqual(['todo', 'canceled'])
    expect(viewOf(text).filters.statuses).toEqual(['todo', 'st-blocked'])
    // Canceled chosen itself stays when the stand-in goes
    const both = viewToFile({ ...view, filters: { statuses: ['canceled', 'st-blocked'] } }, find)
    expect(viewOf(both).filters.statuses).toEqual(['canceled', 'st-blocked'])
    // an older version took Canceled out of the filter: Blocked goes with it
    const older = JSON.stringify({ ...raw, filters: { ...raw.filters, statuses: ['todo'] } })
    expect(viewOf(older).filters.statuses).toEqual(['todo'])
  })
  test('an inbox note', () => {
    const note = { id: 'n1', type: 'status' as const, issue: issue.id, actor: 'ana-n', at: 'x', status: 'st-blocked' }
    const text = inboxToFile(note, find)
    expect(JSON.parse(text)).toMatchObject({ status: 'canceled', customStatus: 'st-blocked' })
    expect(parseFile(paths.inbox('bstone', 'n1'), text)?.value).toEqual(note)
  })
  test('archive lines round trip, and lines this version can’t read are kept when the file is written again', () => {
    const a: ArchivedIssue = { ...stuck, archivedAt: '2026-01-01T00:00:00.000Z', archivedBy: 'ana-n', comments: [] }
    const path = paths.archive(a.team, '2026-01')
    expect(parseArchive(path, a.team, archivedToLine(a, find))).toEqual([a])
    const future = '{"id":"zz-future","number":"not a number"}'
    const text = `${archivedToLine(a, find)}\n${future}\n`
    expect(archiveLinesUnread(path, a.team, text)).toEqual([future])
    expect(archiveToFile([], archiveLinesUnread(path, a.team, text))).toBe(`${future}\n`)
  })
})
