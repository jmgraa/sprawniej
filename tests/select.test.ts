import { describe, expect, test } from 'bun:test'
import { generateKeyBetween } from 'fractional-indexing'
import { sampleData } from '@/data/sample'
import { childIndex, groupIssues, inTab, matches, nestChildren, projectProgress } from '@/data/select'
import { findByRef, issueRef } from '@/data/store'
import { DEFAULT_DISPLAY } from '@/data/displays'
import type { Issue } from '@/model/schema'
import { issueFieldsSchema } from '@/model/schema'
import { allStatuses, isClosed, setCustomStatuses, statusOf } from '@/model/status'

const data = sampleData()
const issues = Object.values(data.issues)
const ctx = { people: data.people, projects: data.projects }

describe('sample data', () => {
  test('every issue fits the file schema', () => {
    for (const i of issues) expect(issueFieldsSchema.safeParse(i).success).toBe(true)
  })
  test('numbers count up per team', () => {
    expect(issues.filter((i) => i.team === 'DES').map((i) => i.number)).toEqual([1, 2, 3])
  })
})

describe('refs', () => {
  test('ENG-1 round trip, any case', () => {
    const first = issues[0]
    expect(issueRef(first)).toBe('ENG-1')
    expect(findByRef(data.issues, 'eng-1')?.id).toBe(first.id)
    expect(findByRef(data.issues, 'ENG-999')).toBeUndefined()
    expect(findByRef(data.issues, 'nonsense')).toBeUndefined()
  })
})

describe('filters and tabs', () => {
  test('empty filters match everything', () => {
    expect(issues.every((i) => matches(i, {}))).toBe(true)
  })
  test('different filters must all match, values inside one filter are alternatives', () => {
    const hit = issues.filter((i) => matches(i, { teams: ['ENG'], labels: ['bug', 'feature'] }))
    expect(hit.length).toBeGreaterThan(0)
    expect(hit.every((i) => i.team === 'ENG' && i.labels.some((l) => l === 'bug' || l === 'feature'))).toBe(true)
  })
  test('null assignee filter finds unassigned issues', () => {
    expect(issues.filter((i) => matches(i, { assignees: [null] })).every((i) => i.assignee === null)).toBe(true)
  })
  test('subscribers: anyone following the issue (made it, assigned, commented, subscribed), unless they unsubscribed', () => {
    const one = issues.find((i) => i.assignee && i.createdBy !== i.assignee)!
    const follow = { comments: { [one.id]: [{ id: 'c', issue: one.id, author: 'zed', createdAt: 'x', body: 'hi' }] }, people: { ...data.people, zed: { login: 'zed', githubId: 9, name: 'Zed', avatarUrl: '' } } }
    expect(matches(one, { subscribers: [one.assignee!] }, follow)).toBe(true)
    expect(matches(one, { subscribers: [one.createdBy] }, follow)).toBe(true)
    expect(matches(one, { subscribers: ['zed'] }, follow)).toBe(true)
    expect(matches({ ...one, subscribers: ['ghost'] }, { subscribers: ['ghost'] }, follow)).toBe(false) // not in the workspace
    expect(matches({ ...one, unsubscribed: ['zed'] }, { subscribers: ['zed'] }, follow)).toBe(false)
    expect(matches(one, { subscribers: ['nobody'] }, follow)).toBe(false)
  })
  test('Active is Todo, In Progress and In Review only', () => {
    const active = issues.filter((i) => inTab(i, 'active'))
    expect(new Set(active.map((i) => i.status))).toEqual(new Set(['todo', 'in_progress', 'in_review']))
  })
})

describe('grouping', () => {
  test('status groups follow Linear order and include empty ones', () => {
    const groups = groupIssues(issues, DEFAULT_DISPLAY, ctx, 'all')
    expect(groups.map((g) => g.key)).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate'])
    expect(groups.find((g) => g.key === 'duplicate')!.issues).toEqual([])
  })
  test('a workspace’s own statuses: after the built-in ones of their group, only for their teams', () => {
    setCustomStatuses([
      { id: 'st-blocked', name: 'Blocked', group: 'canceled', color: '#eb5757', position: 6, teams: ['ENG'] },
      { id: 'st-qa', name: 'QA', group: 'started', color: '#f2994a', position: 2 },
    ])
    try {
      const blocked = { ...issues.find((i) => i.team === 'ENG')!, status: 'st-blocked' }
      const keys = groupIssues([blocked], DEFAULT_DISPLAY, ctx, 'all').map((g) => g.key)
      expect(keys).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'st-qa', 'done', 'canceled', 'duplicate', 'st-blocked'])
      expect(allStatuses('DES').map((s) => s.id)).not.toContain('st-blocked')
      expect(isClosed('st-blocked')).toBe(true)
      expect(inTab(blocked, 'active')).toBe(false)
      // on a team's page, an issue that came from another team keeps a group for its status
      expect(groupIssues([blocked], DEFAULT_DISPLAY, { ...ctx, team: 'DES' }, 'all').find((g) => g.key === 'st-blocked')?.issues).toHaveLength(1)
    } finally {
      setCustomStatuses([])
    }
    // a status whose file is gone still shows, by its id
    expect(statusOf('gone')).toMatchObject({ id: 'gone', name: 'gone' })
  })
  test('showCompleted off hides closed groups and issues', () => {
    const groups = groupIssues(issues, { ...DEFAULT_DISPLAY, showCompleted: false }, ctx, 'all')
    expect(groups.map((g) => g.key)).toEqual(['backlog', 'todo', 'in_progress', 'in_review'])
  })
  test('priority groups: urgent first, no priority last', () => {
    const groups = groupIssues(issues, { ...DEFAULT_DISPLAY, grouping: 'priority' }, ctx)
    expect(groups.map((g) => g.value)).toEqual([1, 2, 3, 4, 0])
  })
  test('assignee groups end with No assignee', () => {
    const groups = groupIssues(issues, { ...DEFAULT_DISPLAY, grouping: 'assignee' }, ctx)
    expect(groups.at(-1)!.title).toBe('No assignee')
    expect(groups.reduce((n, g) => n + g.issues.length, 0)).toBe(issues.length)
  })
  test('a board gets every status; the ones the tab leaves out are empty and marked outside', () => {
    const active = issues.filter((i) => inTab(i, 'active'))
    const groups = groupIssues(active, DEFAULT_DISPLAY, ctx, 'active', true)
    expect(groups.map((g) => g.key)).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate'])
    expect(groups.filter((g) => g.outside).map((g) => g.key)).toEqual(['backlog', 'done', 'canceled', 'duplicate'])
    expect(groups.filter((g) => g.outside).every((g) => g.issues.length === 0)).toBe(true)
    const off = groupIssues(issues, { ...DEFAULT_DISPLAY, showCompleted: false }, ctx, 'all', true)
    expect(off.filter((g) => g.outside).map((g) => g.key)).toEqual(['done', 'canceled', 'duplicate'])
  })
  test('a board grouped by person offers everyone, by project only open projects of the team', () => {
    const one = issues.filter((i) => i.assignee).slice(0, 1)
    const people = groupIssues(one, { ...DEFAULT_DISPLAY, grouping: 'assignee' }, ctx, 'all', true)
    expect(people.length).toBe(Object.keys(data.people).length + 1)
    const projects = groupIssues([], { ...DEFAULT_DISPLAY, grouping: 'project' }, { ...ctx, team: 'ENG' }, 'all', true)
    const open = Object.values(data.projects).filter((p) => !['completed', 'canceled'].includes(p.status) && (!p.teams.length || p.teams.includes('ENG')))
    expect(projects.length).toBe(open.length + 1)
  })
  test('manual order uses plain string order of sortOrder', () => {
    const a = issues[0]
    const moved: Issue = { ...issues[5], status: a.status, sortOrder: generateKeyBetween(null, a.sortOrder) }
    const groups = groupIssues([a, moved], DEFAULT_DISPLAY, ctx)
    expect(groups.find((g) => g.key === a.status)!.issues.map((i) => i.id)).toEqual([moved.id, a.id])
  })
})

describe('sub-issues', () => {
  test('children sit right under their parent', () => {
    const inReview = issues.filter((i) => i.status === 'in_review')
    const rows = nestChildren(inReview)
    const parentAt = rows.findIndex((r) => r.issue.id === 'sample-01')
    expect(rows[parentAt + 1]).toEqual({ issue: data.issues['sample-02'], depth: 1 })
  })
  test('a parent loop does not hang or drop issues', () => {
    const a: Issue = { ...issues[0], id: 'a', parent: 'b' }
    const b: Issue = { ...issues[1], id: 'b', parent: 'a' }
    expect(nestChildren([a, b]).length).toBe(2)
  })
  test('counter counts done children', () => {
    expect(childIndex(data.issues).get('sample-01')).toEqual({ done: 1, total: 4 })
    expect(childIndex(data.issues).get('sample-02')).toBeUndefined()
  })
  test('counters are built once per version of the issues', () => {
    expect(childIndex(data.issues)).toBe(childIndex(data.issues))
    expect(childIndex({ ...data.issues })).not.toBe(childIndex(data.issues))
  })
  test('project progress leaves canceled out', () => {
    const p = projectProgress('p-insights', issues)
    expect(p.total).toBe(6)
    expect(p.done).toBe(1)
  })
})

describe('due dates', () => {
  test('ordering by due date: soonest first, none last', () => {
    const [a, b, c] = issues.slice(0, 3)
    const list = [{ ...a, dueDate: null }, { ...b, dueDate: '2026-12-01' }, { ...c, dueDate: '2026-11-01' }]
    const groups = groupIssues(list, { ...DEFAULT_DISPLAY, grouping: 'none', ordering: 'due' }, ctx)
    expect(groups[0].issues.map((i) => i.id)).toEqual([c.id, b.id, a.id])
  })
})
