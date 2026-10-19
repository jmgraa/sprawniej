import { beforeEach, describe, expect, test } from 'bun:test'
import { createIssue, createProject, createStatus, createView, deleteProject, deleteStatus, moveStatus, updateStatus, updateView } from '@/data/actions'
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
  test('add, rename, describe, limit to teams, move', () => {
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
    moveStatus(waiting.id, -1)
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
