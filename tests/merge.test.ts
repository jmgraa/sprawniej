import { describe, expect, test } from 'bun:test'
import { issueToFile, jsonToFile, parseFile, paths } from '@/data/files'
import { sampleData } from '@/data/sample'
import { mergeFile, mergeIncoming, mergeText, mergeValue } from '@/sync/merge'
import { commentToFile } from '@/data/files'
import { tidyMarkdown } from '@/editor/tidy'
import { renumber } from '@/sync/renumber'
import type { Issue } from '@/model/schema'

const base = sampleData().issues['sample-01']
const path = paths.issue(base)
const file = (i: Issue) => issueToFile(i)
const read = (text: string | null) => parseFile(path, text!)!.value as Issue

describe('issues changed by two people', () => {
  test('different fields: both changes survive', () => {
    const ours = { ...base, status: 'done' as const, updatedAt: '2026-10-07T10:00:00.000Z' }
    const theirs = { ...base, assignee: 'zosia', updatedAt: '2026-10-07T09:00:00.000Z' }
    const m = mergeFile(path, file(base), file(ours), file(theirs))
    expect(m.lostLines).toBe(false)
    const r = read(m.text)
    expect(r.status).toBe('done')
    expect(r.assignee).toBe('zosia')
    expect(r.updatedAt).toBe('2026-10-07T10:00:00.000Z')
  })
  test('same field: the later save (ours) wins, silently', () => {
    const m = mergeFile(path, file(base), file({ ...base, title: 'Ours' }), file({ ...base, title: 'Theirs' }))
    expect(m.lostLines).toBe(false)
    expect(read(m.text).title).toBe('Ours')
  })
  test('labels merge as sets', () => {
    const b = { ...base, labels: ['a', 'b'] }
    const m = mergeFile(path, file(b), file({ ...b, labels: ['a', 'b', 'c'] }), file({ ...b, labels: ['b', 'd'] }))
    expect(read(m.text).labels).toEqual(['b', 'c', 'd'])
    expect(m.lostLines).toBe(false)
  })
  test('descriptions merge line by line', () => {
    const b = { ...base, description: 'one\ntwo\nthree\nfour\nfive' }
    const ours = { ...b, description: 'ONE\ntwo\nthree\nfour\nfive' }
    const theirs = { ...b, description: 'one\ntwo\nthree\nfour\nFIVE' }
    const m = mergeFile(path, file(b), file(ours), file(theirs))
    expect(read(m.text).description).toBe('ONE\ntwo\nthree\nfour\nFIVE')
    expect(m.lostLines).toBe(false)
  })
  test('overlapping description lines keep ours, and that is the one thing reported', () => {
    expect(mergeText('a\nb\nc', 'a\nX\nc', 'a\nY\nc')).toBe('a\nX\nc')
    const b = { ...base, description: 'a\nb\nc' }
    const m = mergeFile(path, file(b), file({ ...b, description: 'a\nX\nc' }), file({ ...b, description: 'a\nY\nc' }))
    expect(m.lostLines).toBe(true)
  })
  test('an edit beats a delete, both ways', () => {
    const edited = file({ ...base, title: 'Edited' })
    expect(mergeFile(path, file(base), null, edited).text).toBe(edited)
    expect(mergeFile(path, file(base), edited, null).text).toBe(edited)
  })
  test('a delete on one side and nothing on the other deletes', () => {
    expect(mergeFile(path, file(base), null, file(base)).text).toBeNull()
  })
})

describe('json files', () => {
  test('team members join from both sides', () => {
    const t = sampleData().teams.ENG
    const p = paths.team('ENG')
    const m = mergeFile(p, jsonToFile(t), jsonToFile({ ...t, members: [...t.members, 'zosia'] }), jsonToFile({ ...t, name: 'Eng', members: [...t.members, 'kuba'] }))
    const r = JSON.parse(m.text!)
    expect(r.name).toBe('Eng')
    expect(r.members).toEqual([...t.members, 'zosia', 'kuba'])
  })
  test('nested objects merge per field', () => {
    expect(mergeValue({ d: { a: 1, b: 1 } }, { d: { a: 2, b: 1 } }, { d: { a: 1, b: 3 } })).toEqual({ d: { a: 2, b: 3 } })
  })
  test('both created the same new file: fields merge, clashes keep ours', () => {
    expect(mergeValue(undefined, { a: 1, b: 2 }, { a: 1, c: 3 })).toEqual({ a: 1, b: 2, c: 3 })
  })
})

describe('renumbering', () => {
  const at = (n: number, id: string, createdAt = '2026-10-07T00:00:00.000Z') => ({ ...base, id, number: n, createdAt })
  test('our unsaved issue moves to the next free number', () => {
    const remote = at(13, 'remote')
    const mine = at(13, 'mine')
    const baseFiles = new Map([[paths.issue(remote), file(remote)]])
    const pending = new Map<string, string | null>([[paths.issue(mine), file(mine)]])
    const r = renumber(baseFiles, pending)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ team: 'ENG', from: 13, to: 14 })
    expect(read(r[0].text).number).toBe(14)
  })
  test('only the clashing issue moves; our next one keeps its number', () => {
    const remote = at(5, 'remote')
    const five = at(5, 'mine5', '2026-10-07T01:00:00.000Z')
    const six = at(6, 'mine6', '2026-10-07T02:00:00.000Z')
    const pending = new Map<string, string | null>([[paths.issue(five), file(five)], [paths.issue(six), file(six)]])
    const r = renumber(new Map([[paths.issue(remote), file(remote)]]), pending)
    expect(r.map((x) => [x.from, x.to])).toEqual([[5, 7]])
  })
  test('no clash, no change', () => {
    const remote = at(13, 'remote')
    const mine = at(14, 'mine')
    expect(renumber(new Map([[paths.issue(remote), file(remote)]]), new Map([[paths.issue(mine), file(mine)]]))).toEqual([])
  })
  test("a clash never lands on a deleted issue's number", () => {
    const remote = at(13, 'remote')
    const mine = at(13, 'mine')
    const team = JSON.stringify({ key: 'ENG', name: 'Eng', emoji: 'x', members: [], createdAt: '', lastNumber: 20 })
    const r = renumber(new Map([[paths.issue(remote), file(remote)], ['teams/ENG/team.json', team]]), new Map([[paths.issue(mine), file(mine)]]))
    expect(r[0].to).toBe(21)
  })
  test('two of our own new issues with the same number: the newer one moves', () => {
    const a = at(5, 'a', '2026-10-07T01:00:00.000Z')
    const b = at(5, 'b', '2026-10-07T02:00:00.000Z')
    const r = renumber(new Map(), new Map([[paths.issue(b), file(b)], [paths.issue(a), file(a)]]))
    expect(r.map((x) => [x.path.includes('/b.md'), x.to])).toEqual([[true, 6]])
  })
})

describe('a pull, as a whole', () => {
  const p = (i: Issue) => paths.issue(i)
  test('comments on the same issue never clash: each is its own file', () => {
    const ours = { id: 'c-ours', issue: base.id, author: 'a', createdAt: '2026-10-07T10:00:00.000Z', body: 'mine' }
    const theirs = { ...ours, id: 'c-theirs', author: 'b', body: 'theirs' }
    const r = mergeIncoming(new Map(), new Map([[paths.comment('ENG', ours), commentToFile(ours)]]), new Map([[paths.comment('ENG', theirs), commentToFile(theirs)]]))
    expect([...r.shown.keys()]).toEqual([paths.comment('ENG', theirs)])
    expect(r.pending.size).toBe(0) // ours is untouched and still waiting to be saved
    expect(r.lostLines).toEqual([])
  })
  test('two people editing one view: both filter changes survive', () => {
    const v = sampleData().views['v-bugs']
    const vp = paths.view(v.id)
    const r = mergeIncoming(
      new Map([[vp, jsonToFile(v)]]),
      new Map([[vp, jsonToFile({ ...v, filters: { labels: ['bug', 'feature'] } })]]),
      new Map([[vp, jsonToFile({ ...v, emoji: '🐛', display: { ...v.display, layout: 'list' } })]]),
    )
    const merged = JSON.parse(r.shown.get(vp)!)
    expect(merged.filters.labels).toEqual(['bug', 'feature'])
    expect(merged.emoji).toBe('🐛')
    expect(merged.display.layout).toBe('list')
    expect(r.lostLines).toEqual([])
  })
  test('they moved an issue to another team, we edited it: one issue, in the new team, with our edit', () => {
    const moved = { ...base, team: 'DES', number: 9 }
    const r = mergeIncoming(
      new Map([[p(base), file(base)]]),
      new Map([[p(base), file({ ...base, status: 'done' })]]),
      new Map<string, string | null>([[p(base), null], [p(moved), file(moved)]]),
    )
    expect(r.shown.get(p(base))).toBeNull()
    expect(r.pending.get(p(base))).toBeUndefined()
    const now = parseFile(p(moved), r.shown.get(p(moved))!)!.value as Issue
    expect([now.team, now.number, now.status]).toEqual(['DES', 9, 'done'])
  })
  test('we moved an issue, they edited it: our move stands and their edit comes along', () => {
    const moved = { ...base, team: 'DES', number: 9 }
    const r = mergeIncoming(
      new Map([[p(base), file(base)]]),
      new Map<string, string | null>([[p(base), null], [p(moved), file(moved)]]),
      new Map([[p(base), file({ ...base, assignee: 'zosia' })]]),
    )
    expect(r.shown.get(p(base))).toBeNull()
    expect(r.pending.get(p(base))).toBeNull() // still to be deleted on GitHub
    const now = parseFile(p(moved), r.pending.get(p(moved))!)!.value as Issue
    expect([now.team, now.number, now.assignee]).toEqual(['DES', 9, 'zosia'])
  })
  test('an unchanged pending file that matches theirs stops being pending', () => {
    const edited = file({ ...base, title: 'Same edit' })
    const r = mergeIncoming(new Map([[p(base), file(base)]]), new Map([[p(base), edited]]), new Map([[p(base), edited]]))
    expect(r.pending.has(p(base))).toBe(true)
    expect(r.pending.get(p(base))).toBeUndefined()
  })
})

describe('tidy Markdown', () => {
  test('links that show their own address become bare addresses', () => {
    expect(tidyMarkdown('see [https://example.com](https://example.com) or [docs](https://x.dev)')).toBe('see https://example.com or [docs](https://x.dev)')
    // empty lines typed at the end (or start) don't end up in the file as &nbsp;
    expect(tidyMarkdown('&nbsp;\n\nhi\n\n&nbsp;\n\nthere\n\n&nbsp;\n\n&nbsp;')).toBe('hi\n\n&nbsp;\n\nthere')
  })
  test('blank lines at the start and end go', () => {
    expect(tidyMarkdown('\n\n  \nHello\n\n')).toBe('Hello')
  })
})

describe('edit beats delete, comments included', () => {
  const comment = { id: 'c1', issue: base.id, author: 'ana', createdAt: '2026-10-07T00:00:00.000Z', body: 'keep me' }
  const cPath = paths.comment(base.team, comment)
  const start = new Map([[path, file(base)], [cPath, commentToFile(comment)]])
  const edited = file({ ...base, title: 'Edited' })
  test('they deleted it, we edited it: the issue and its comment stay', () => {
    const r = mergeIncoming(start, new Map([[path, edited]]), new Map<string, string | null>([[path, null], [cPath, null]]))
    expect(r.shown.get(path)).toBe(edited)
    expect(r.pending.get(cPath)).toBe(commentToFile(comment))
    expect(r.shown.get(cPath)).toBe(commentToFile(comment))
  })
  test('we deleted it, they edited it: our delete of the comment is dropped too', () => {
    const r = mergeIncoming(start, new Map<string, string | null>([[path, null], [cPath, null]]), new Map([[path, edited]]))
    expect(r.shown.get(path)).toBe(edited)
    expect(r.pending.has(cPath) && r.pending.get(cPath)).toBe(undefined)
    expect(r.shown.get(cPath)).toBe(commentToFile(comment))
  })
})
