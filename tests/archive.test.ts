import { beforeEach, describe, expect, test } from 'bun:test'
import { archiveIssues, createComment, createIssue, nextNumber, restoreIssue, tidyArchive, updateIssue } from '@/data/actions'
import { archiveMonth, jsonToFile, parseFile, paths } from '@/data/files'
import { applyFiles, archiveFiles, loadArchive, resetProjection } from '@/data/project'
import { EMPTY, findArchivedByRef, useData } from '@/data/store'
import type { Person, Team } from '@/model/schema'
import { mergeArchive, mergeFile } from '@/sync/merge'

const person = (login: string): Person => ({ login, githubId: login.length, name: login.toUpperCase(), avatarUrl: '' })
const ana = person('ana')
const team: Team = { key: 'ENG', name: 'Engineering', emoji: '🚀', members: ['ana'], createdAt: '2026-01-01T00:00:00.000Z' }

beforeEach(() => {
  resetProjection()
  useData.setState({ ...EMPTY, me: ana, people: { ana } })
  applyFiles(new Map([[paths.team('ENG'), jsonToFile(team)]]), 'ana')
})

const state = () => useData.getState()

describe('archiving', () => {
  test('an issue and its comments move into the month file; its number is never given out again', () => {
    const a = createIssue({ team: 'ENG', title: 'Old bug' })
    const b = createIssue({ team: 'ENG', title: 'Newer' })
    createComment(b.id, 'Fixed it')
    updateIssue(b.id, { status: 'done' })
    expect(archiveIssues([b.id])).toBe(1)
    expect(state().issues[b.id]).toBeUndefined()
    expect(state().comments[b.id]).toBeUndefined()
    const month = archiveMonth(state().archive[b.id] ?? { ...b, status: 'done', completedAt: new Date().toISOString() }, new Date().toISOString())
    const text = archiveFiles().get(paths.archive('ENG', month))!
    expect(text.split('\n').filter(Boolean)).toHaveLength(1)
    expect(text).toContain('"body":"Fixed it"')
    expect(state().teams.ENG.lastNumber).toBe(2)
    expect(nextNumber('ENG')).toBe(3)
    // not read until something needs it
    expect(state().archive).toEqual({})
    loadArchive()
    expect(findArchivedByRef(state(), 'ENG-2')).toMatchObject({ title: 'Newer', archivedBy: 'ana' })
    expect(findArchivedByRef(state(), 'ENG-1')).toBeUndefined()
    expect(state().issues[a.id]).toBeTruthy()
  })

  test('sub-issues go with their parent; restoring brings the issue and its comments back and empties the file', () => {
    const parent = createIssue({ team: 'ENG', title: 'Parent' })
    const child = createIssue({ team: 'ENG', title: 'Child', parent: parent.id })
    createComment(parent.id, 'note')
    loadArchive()
    expect(archiveIssues([parent.id])).toBe(2)
    expect(Object.keys(state().archive).sort()).toEqual([parent.id, child.id].sort())
    restoreIssue(parent.id)
    // the sub-issue archived with it comes back too
    expect(state().issues[child.id]).toMatchObject({ title: 'Child', parent: parent.id, number: child.number })
    expect(state().issues[parent.id]).toMatchObject({ title: 'Parent', number: parent.number })
    expect(state().comments[parent.id]?.map((c) => c.body)).toEqual(['note'])
    expect(state().archive).toEqual({})
    expect([...archiveFiles().keys()]).toEqual([])
  })

  test('the daily tidy archives issues finished long ago, and only those', async () => {
    const old = createIssue({ team: 'ENG', title: 'Done long ago' })
    const recent = createIssue({ team: 'ENG', title: 'Done lately' })
    const open = createIssue({ team: 'ENG', title: 'Still open' })
    const long = '2025-01-10T00:00:00.000Z'
    for (const [i, at] of [[old, long], [recent, new Date().toISOString()], [open, long]] as const) {
      const status = i === open ? 'todo' : 'done'
      applyFiles(new Map([[paths.issue(i), (await import('@/data/files')).issueToFile({ ...state().issues[i.id], status, completedAt: status === 'done' ? at : null, updatedAt: at })]]), 'ana')
    }
    expect(await tidyArchive()).toBe(1)
    expect(state().issues[old.id]).toBeUndefined()
    expect(state().issues[recent.id]).toBeTruthy()
    expect(state().issues[open.id]).toBeTruthy()
    expect([...archiveFiles().keys()]).toEqual(['teams/ENG/archive/2025-01.jsonl'])
    // a team can turn it off
    applyFiles(new Map([[paths.team('ENG'), jsonToFile({ ...state().teams.ENG, autoArchive: 0 })]]), 'ana')
    updateIssue(recent.id, { status: 'done' })
    expect(await tidyArchive(Date.now() + 400 * 86_400_000)).toBe(0)
  })

  test('a restored old issue is not archived again the next day', async () => {
    const i = createIssue({ team: 'ENG', title: 'Old' })
    const long = '2025-01-10T00:00:00.000Z'
    applyFiles(new Map([[paths.issue(i), (await import('@/data/files')).issueToFile({ ...state().issues[i.id], status: 'done', completedAt: long, updatedAt: long })]]), 'ana')
    expect(await tidyArchive()).toBe(1)
    loadArchive()
    restoreIssue(i.id)
    expect(await tidyArchive(Date.now() + 86_400_000)).toBe(0)
    expect(state().issues[i.id]).toBeTruthy()
  })

  test('an issue someone edited while another archived it stays active, and the archive lets go of it', async () => {
    const i = createIssue({ team: 'ENG', title: 'Both' })
    const file = (paths.issue(i))
    const before = (await import('@/data/files')).issueToFile(state().issues[i.id])
    archiveIssues([i.id])
    // the edit wins over the removal when the two meet
    applyFiles(new Map([[file, before.replace('title: Both', 'title: Edited')]]), 'ana')
    await tidyArchive()
    expect(state().issues[i.id].title).toBe('Edited')
    expect([...archiveFiles().keys()]).toEqual([])
  })

  test("an issue brought back by someone's edit gets its comments back from the archive", async () => {
    const i = createIssue({ team: 'ENG', title: 'Edited meanwhile' })
    createComment(i.id, 'keep me')
    const before = (await import('@/data/files')).issueToFile(state().issues[i.id])
    archiveIssues([i.id])
    expect(state().comments[i.id]).toBeUndefined()
    // the edit wins over the removal: the file is back, the comment files are not
    applyFiles(new Map([[paths.issue(i), before.replace('title: Edited meanwhile', 'title: Edited')]]), 'ana')
    await tidyArchive()
    expect(state().comments[i.id]?.map((c) => c.body)).toEqual(['keep me'])
    expect([...archiveFiles().keys()]).toEqual([])
  })

  test('a comment edited while its issue was archived keeps the edit', async () => {
    const i = createIssue({ team: 'ENG', title: 'Quiet' })
    const c = createComment(i.id, 'first words')!
    archiveIssues([i.id])
    // the edited comment file comes back (edit beats delete), the issue stays archived
    applyFiles(new Map([[paths.comment('ENG', c), (await import('@/data/files')).commentToFile({ ...c, body: 'better words' })]]), 'ana')
    await tidyArchive()
    loadArchive()
    expect(state().archive[i.id].comments.map((x) => x.body)).toEqual(['better words'])
    expect(state().comments[i.id]).toBeUndefined()
  })

  test('a line that cannot be read is skipped, the rest still count', () => {
    const text = '{"id":"x"}\nnot json\n'
    const p = parseFile('teams/ENG/archive/2026-01.jsonl', text)
    expect(p).toMatchObject({ kind: 'archive', value: [] })
  })
})

describe('merging archive files', () => {
  const line = (id: string, extra = {}) => JSON.stringify({ id, number: 1, title: id, ...extra })
  const file = (...lines: string[]) => `${lines.join('\n')}\n`
  test('issues archived on both sides are all kept, in id order', () => {
    expect(mergeArchive(file(line('a')), file(line('a'), line('c')), file(line('a'), line('b')), { conflicts: 0 })).toBe(file(line('a'), line('b'), line('c')))
  })
  test('restored on one side and untouched on the other: gone; restored but changed on the other: kept', () => {
    expect(mergeArchive(file(line('a'), line('b')), file(line('b')), file(line('a'), line('b')), { conflicts: 0 })).toBe(file(line('b')))
    expect(mergeArchive(file(line('a')), file(line('a', { title: 'x' })), '', { conflicts: 0 })).toBe(file(line('a', { title: 'x' })))
    expect(mergeArchive(file(line('a')), '', file(line('a')), { conflicts: 0 })).toBeNull()
  })
  test("a team's highest number only goes up", () => {
    const t = (n?: number) => jsonToFile({ ...team, ...(n && { lastNumber: n }) })
    expect(JSON.parse(mergeFile('teams/ENG/team.json', t(), t(5), t(9)).text!).lastNumber).toBe(9)
    expect(JSON.parse(mergeFile('teams/ENG/team.json', t(), t(9), t(5)).text!).lastNumber).toBe(9)
  })
})
