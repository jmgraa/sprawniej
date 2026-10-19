import { beforeEach, describe, expect, test } from 'bun:test'
import {
  acceptIssue,
  autoCloseStale,
  createIssue,
  createProject,
  createStatus,
  createView,
  declineIssue,
  deleteProject,
  removeStatusFromTeam,
  reorderStatuses,
  resetBuiltinStatus,
  setDefaultStatus,
  setTeamAutomation,
  setTeamTriage,
  snoozeIssue,
  updateIssue,
  updateStatus,
  updateView,
} from '@/data/actions'
import { inTab } from '@/data/select'
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


describe('team workflows', () => {
  const team = (key: string, members = ['ana']) => ({ key, name: key, emoji: '🚀', members, createdAt: 'x' })
  const setup = () => useData.setState({ teams: { ENG: team('ENG'), DES: team('DES') } })
  const names = (t: string, category: string) => allStatuses(t).filter((s) => s.category === category).map((s) => s.name)
  const issue = (id: string) => useData.getState().issues[id]

  test('a status added for a team is that team’s; the same name added for another team joins it', () => {
    setup()
    const qa = createStatus('started', ' QA ', { team: 'ENG' })!
    expect(names('ENG', 'started')).toEqual(['In Progress', 'In Review', 'QA'])
    expect(names('DES', 'started')).toEqual(['In Progress', 'In Review'])
    expect(createStatus('started', 'qa', { team: 'DES' })).toBe(qa)
    expect(names('DES', 'started')).toContain('QA')
    expect(createStatus('started', 'QA', { team: 'ENG' })).toBeUndefined()
  })
  test('built-in statuses: renamed for everyone, reordered with the others, reset; issues keep the built-in id', () => {
    setup()
    updateStatus('todo', { name: 'To do', color: '#26b5ce' })
    expect(allStatuses('ENG').find((s) => s.id === 'todo')?.name).toBe('To do')
    // never in statuses/: a version that knows statuses/ but not builtin-statuses/ would list Todo twice
    expect(paths.builtinStatus('todo')).toBe('builtin-statuses/todo.json')
    expect(useData.getState().statuses).toEqual({})
    const qa = createStatus('started', 'QA', { team: 'ENG' })!
    reorderStatuses(['in_progress', qa, 'in_review'])
    expect(names('ENG', 'started')).toEqual(['In Progress', 'QA', 'In Review'])
    resetBuiltinStatus('todo')
    expect(allStatuses().find((s) => s.id === 'todo')?.name).toBe('Todo')
    expect(names('ENG', 'started')).toEqual(['In Progress', 'QA', 'In Review'])
  })
  test('removing a status from a team moves its issues; its category has to keep one; Duplicate stays', () => {
    setup()
    const i = createIssue({ team: 'ENG', title: 'Review me', status: 'in_review' })
    const d = createIssue({ team: 'DES', title: 'Theirs', status: 'in_review' })
    removeStatusFromTeam('in_review', 'ENG', 'in_progress')
    expect(names('ENG', 'started')).toEqual(['In Progress'])
    expect(names('DES', 'started')).toEqual(['In Progress', 'In Review'])
    expect(issue(i.id).status).toBe('in_progress')
    expect(issue(d.id).status).toBe('in_review')
    removeStatusFromTeam('in_progress', 'ENG', 'todo') // the last of its category: not allowed
    expect(names('ENG', 'started')).toEqual(['In Progress'])
    removeStatusFromTeam('duplicate', 'ENG', 'canceled')
    expect(names('ENG', 'duplicate')).toEqual(['Duplicate'])
    const blocked = createStatus('canceled', 'Blocked', { team: 'ENG' })!
    removeStatusFromTeam(blocked, 'ENG', 'canceled')
    expect(useData.getState().statuses[blocked]).toBeUndefined() // no team has it any more
  })
  test('a team’s default status is where its new issues start', () => {
    setup()
    setDefaultStatus('ENG', 'backlog')
    expect(createIssue({ team: 'ENG', title: 'New' }).status).toBe('backlog')
    expect(createIssue({ team: 'DES', title: 'New' }).status).toBe('todo')
  })
  test('triage: issues from outside the team wait in it; accept, decline, snooze; turning it off empties it', () => {
    useData.setState({ teams: { ENG: team('ENG', ['bob']) } })
    setTeamTriage('ENG', true)
    expect(names('ENG', 'triage')).toEqual(['Triage'])
    const outside = createIssue({ team: 'ENG', title: 'From outside' }) // ana isn't in ENG
    expect(allStatuses().find((s) => s.id === outside.status)?.triage).toBe(true)
    expect(inTab(issue(outside.id), 'triage')).toBe(true)
    expect(inTab(issue(outside.id), 'all')).toBe(false)
    snoozeIssue(outside.id, '2999-01-01T09:00:00.000Z')
    expect(inTab(issue(outside.id), 'triage')).toBe(false)
    acceptIssue(outside.id)
    expect(issue(outside.id).status).toBe('todo')
    expect(issue(outside.id).snoozedUntil).toBeUndefined()
    const other = createIssue({ team: 'ENG', title: 'Another' })
    declineIssue(other.id)
    expect(issue(other.id).status).toBe('canceled')
    const waiting = createIssue({ team: 'ENG', title: 'Still waiting' })
    setTeamTriage('ENG', false)
    expect(names('ENG', 'triage')).toEqual([])
    expect(issue(waiting.id).status).toBe('backlog')
  })
  test('closing a parent closes its sub-issues; the last sub-issue closing closes the parent', () => {
    setup()
    setTeamAutomation('ENG', { closeSubIssuesWithParent: true, closeParentWithSubIssues: true })
    const p = createIssue({ team: 'ENG', title: 'Parent' })
    const a = createIssue({ team: 'ENG', title: 'A', parent: p.id })
    const b = createIssue({ team: 'ENG', title: 'B', parent: p.id })
    updateIssue(a.id, { status: 'done' })
    expect(issue(p.id).status).toBe('todo')
    updateIssue(b.id, { status: 'done' })
    expect(issue(p.id).status).toBe('done')
    const q = createIssue({ team: 'ENG', title: 'Parent 2' })
    const c = createIssue({ team: 'ENG', title: 'C', parent: q.id })
    updateIssue(q.id, { status: 'canceled' })
    expect(issue(c.id).status).toBe('canceled')
  })
  test('auto-close cancels untouched issues that haven’t started', () => {
    setup()
    setTeamAutomation('ENG', { autoClose: 3 })
    const old = createIssue({ team: 'ENG', title: 'Old idea' })
    const started = createIssue({ team: 'ENG', title: 'Being done', status: 'in_progress' })
    const due = createIssue({ team: 'ENG', title: 'Due later', dueDate: '2999-01-01' })
    const later = Date.now() + 200 * 24 * 3600 * 1000
    autoCloseStale(later)
    expect(issue(old.id).status).toBe('canceled')
    expect(issue(started.id).status).toBe('in_progress')
    expect(issue(due.id).status).toBe('todo')
  })
})
