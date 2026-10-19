import { beforeEach, describe, expect, test } from 'bun:test'
import { createIssue, createProject, createStatus, createStatusCategory, createView, deleteProject, deleteStatus, deleteStatusCategory, reorderStatuses, resetBuiltinStatus, updateStatus, updateView } from '@/data/actions'
import { paths } from '@/data/files'
import { allStatuses } from '@/model/status'
import { DEFAULT_DISPLAY } from '@/data/displays'
import { resetProjection } from '@/data/project'
import { EMPTY, useData } from '@/data/store'

const me = { login: 'ana', githubId: 1, name: 'Ana', avatarUrl: '' }

beforeEach(() => {
  resetProjection()
  useData.setState({ ...EMPTY, me })
})

describe('views', () => {
  test('a new view keeps its filters and owner', () => {
    const v = createView({ name: ' Open bugs ', emoji: '🐞', team: 'ENG', filters: { statuses: ['todo'] }, display: DEFAULT_DISPLAY })
    const saved = useData.getState().views[v.id]
    expect(saved.name).toBe('Open bugs')
    expect(saved.owner).toBe('ana')
    expect(saved.filters).toEqual({ statuses: ['todo'] })
  })
  test('empty filters are left out of the file', () => {
    const v = createView({ name: 'All', emoji: '🔍', team: null, display: DEFAULT_DISPLAY })
    updateView(v.id, { filters: { statuses: [], labels: ['l1'] } })
    expect(useData.getState().views[v.id].filters).toEqual({ labels: ['l1'] })
  })
})

describe('projects', () => {
  test('deleting a project keeps its issues, without the project', () => {
    const p = createProject({ name: 'Launch', emoji: '🚀' })
    const i = createIssue({ team: 'ENG', title: 'Write the post', project: p.id })
    expect(useData.getState().issues[i.id].project).toBe(p.id)
    deleteProject(p.id)
    expect(useData.getState().projects[p.id]).toBeUndefined()
    expect(useData.getState().issues[i.id].project).toBeNull()
  })
})

describe('issue numbers', () => {
  test('a deleted number is never given out again, in its team or after a move', async () => {
    const { createTeam, deleteIssue, moveIssueToTeam } = await import('@/data/actions')
    createTeam({ key: 'ENG', name: 'Eng', emoji: '🛠️' })
    createTeam({ key: 'DES', name: 'Design', emoji: '🎨' })
    const a = createIssue({ team: 'ENG', title: 'one' })
    const b = createIssue({ team: 'ENG', title: 'two' })
    expect([a.number, b.number]).toEqual([1, 2])
    deleteIssue(b.id)
    expect(useData.getState().teams.ENG.lastNumber).toBe(2)
    expect(createIssue({ team: 'ENG', title: 'three' }).number).toBe(3)
    const moved = moveIssueToTeam(a.id, 'DES')!
    expect(moved.number).toBe(1)
    expect(createIssue({ team: 'ENG', title: 'four' }).number).toBe(4)
  })
})

describe('statuses of the workspace’s own', () => {
  const team = { key: 'ENG', name: 'Engineering', emoji: '🚀', members: ['ana'], createdAt: 'x' }
  test('add, rename, describe, limit to teams, reorder', () => {
    useData.setState({ teams: { ENG: team } })
    const blocked = createStatus('canceled', ' Blocked ')!
    const waiting = createStatus('canceled', 'Waiting')!
    expect(createStatus('canceled', 'blocked')).toBeUndefined()
    expect(createStatus('started', 'In Progress')).toBeUndefined() // a built-in name
    updateStatus(blocked.id, { description: 'Stuck on someone else', teams: ['ENG'] })
    updateStatus(waiting.id, { name: 'Blocked' }) // taken: nothing changes
    expect(useData.getState().statuses[blocked.id]).toMatchObject({ name: 'Blocked', group: 'canceled', description: 'Stuck on someone else', teams: ['ENG'] })
    expect(useData.getState().statuses[waiting.id].name).toBe('Waiting')
    expect(allStatuses().filter((s) => s.custom).map((s) => s.name)).toEqual(['Blocked', 'Waiting'])
    reorderStatuses([waiting.id, blocked.id])
    expect(allStatuses().filter((s) => s.custom).map((s) => s.name)).toEqual(['Waiting', 'Blocked'])
    updateStatus(blocked.id, { description: ' ', teams: [] })
    expect(useData.getState().statuses[blocked.id]).not.toHaveProperty('description')
    expect(useData.getState().statuses[blocked.id]).not.toHaveProperty('teams')
  })
  test('deleting one moves its issues to the built-in status of its kind', () => {
    useData.setState({ teams: { ENG: team } })
    const blocked = createStatus('canceled', 'Blocked')!
    const issue = createIssue({ team: 'ENG', title: 'Stuck', status: blocked.id })
    expect(useData.getState().issues[issue.id].status).toBe(blocked.id)
    deleteStatus(blocked.id)
    expect(useData.getState().statuses[blocked.id]).toBeUndefined()
    expect(useData.getState().issues[issue.id].status).toBe('canceled')
  })
})

describe('built-in statuses and categories', () => {
  const team = { key: 'ENG', name: 'Engineering', emoji: '🚀', members: ['ana'], createdAt: 'x' }
  const names = (category: string) => allStatuses().filter((s) => s.category === category).map((s) => s.name)
  test('a built-in status can be renamed, recoloured and reset; its issues keep the built-in id', () => {
    useData.setState({ teams: { ENG: team } })
    updateStatus('todo', { name: 'To do', color: '#26b5ce', description: 'Next up' })
    expect(allStatuses().find((s) => s.id === 'todo')).toMatchObject({ name: 'To do', color: '#26b5ce', description: 'Next up' })
    // never in statuses/: a version that knows statuses/ but not builtin-statuses/ would list Todo twice
    expect(paths.builtinStatus('todo')).toBe('builtin-statuses/todo.json')
    expect(useData.getState().statuses).toEqual({})
    const issue = createIssue({ team: 'ENG', title: 'Next', status: 'todo' })
    expect(useData.getState().issues[issue.id].status).toBe('todo')
    resetBuiltinStatus('todo')
    expect(allStatuses().find((s) => s.id === 'todo')?.name).toBe('Todo')
  })
  test('built-in and own statuses are ordered together', () => {
    const qa = createStatus('started', 'QA')!
    expect(names('started')).toEqual(['In Progress', 'In Review', 'QA'])
    reorderStatuses(['in_progress', qa.id, 'in_review'])
    expect(names('started')).toEqual(['In Progress', 'QA', 'In Review'])
  })
  test('a category of the workspace’s own works like a built-in group and comes after it', () => {
    const blocked = createStatusCategory('Blocked', 'started')!
    expect(createStatusCategory('started', 'backlog')).toBeUndefined() // a built-in category's name
    const waiting = createStatus('started', 'Waiting on design', blocked.id)!
    const order = allStatuses().map((s) => s.category)
    expect(order.indexOf(blocked.id)).toBeGreaterThan(order.lastIndexOf('started'))
    expect(order.indexOf(blocked.id)).toBeLessThan(order.indexOf('completed'))
    expect(allStatuses().find((s) => s.id === waiting.id)).toMatchObject({ group: 'started', category: blocked.id })
    deleteStatusCategory(blocked.id)
    expect(allStatuses().find((s) => s.id === waiting.id)).toMatchObject({ group: 'started', category: 'started' })
  })
})
