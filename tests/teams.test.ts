import { beforeEach, describe, expect, test } from 'bun:test'
import { archiveIssues, createComment, createIssue, createLabel, createProject, createView, deleteLabel, deleteProject, deleteTeam, joinTeam, leaveTeam, updateIssue, updateTeam } from '@/data/actions'
import { issueToFile, jsonToFile, paths } from '@/data/files'
import { applyFiles, archiveFiles, parsedFiles, resetProjection } from '@/data/project'
import { EMPTY, useData } from '@/data/store'
import { DEFAULT_DISPLAY } from '@/data/displays'
import type { Person, Team } from '@/model/schema'

const person = (login: string): Person => ({ login, githubId: login.length, name: login.toUpperCase(), avatarUrl: '' })
const ana = person('ana')
const eng: Team = { key: 'ENG', name: 'Engineering', emoji: '🚀', members: ['ana'], createdAt: '2026-01-01T00:00:00.000Z' }
const des: Team = { key: 'DES', name: 'Design', emoji: '🎨', members: [], createdAt: '2026-01-01T00:00:00.000Z' }

beforeEach(() => {
  resetProjection()
  useData.setState({ ...EMPTY, me: ana, people: { ana } })
  applyFiles(new Map([[paths.team('ENG'), jsonToFile(eng)], [paths.team('DES'), jsonToFile(des)]]), 'ana')
})
const state = () => useData.getState()

describe('teams', () => {
  test('rename and change the emoji; the key stays', () => {
    updateTeam('ENG', { name: '  Platform ', emoji: '🛠️' })
    expect(state().teams.ENG).toMatchObject({ key: 'ENG', name: 'Platform', emoji: '🛠️', members: ['ana'] })
    updateTeam('ENG', { name: '   ' }) // a team needs a name
    expect(state().teams.ENG.name).toBe('Platform')
  })

  test('join and leave', () => {
    joinTeam('DES')
    expect(state().teams.DES.members).toEqual(['ana'])
    leaveTeam('DES')
    expect(state().teams.DES.members).toEqual([])
    expect(state().teams.DES).toBeDefined() // leaving doesn't touch the team
  })

  test('delete: the team, its issues, comments, archive and own views go; others lose only the link', () => {
    const a = createIssue({ team: 'ENG', title: 'Parent' })
    createComment(a.id, 'note')
    const old = createIssue({ team: 'ENG', title: 'Old' })
    updateIssue(old.id, { status: 'done' })
    archiveIssues([old.id])
    const child = createIssue({ team: 'DES', title: 'Child', parent: a.id })
    const keep = createIssue({ team: 'DES', title: 'Unrelated' })
    const project = createProject({ name: 'Both', emoji: '📦', teams: ['ENG', 'DES'] })
    const engView = createView({ name: 'ENG bugs', emoji: '🐞', team: 'ENG', filters: {}, display: DEFAULT_DISPLAY })
    const wide = createView({ name: 'Everything', emoji: '🌍', team: null, filters: {}, display: DEFAULT_DISPLAY })
    expect([...archiveFiles().keys()].some((p) => p.startsWith('teams/ENG/archive/'))).toBe(true)

    deleteTeam('ENG')
    const s = state()
    expect(s.teams.ENG).toBeUndefined()
    expect(s.issues[a.id]).toBeUndefined()
    expect(s.comments[a.id]).toBeUndefined()
    expect([...parsedFiles()].map(([p]) => p).filter((p) => p.startsWith('teams/ENG/'))).toEqual([])
    expect([...archiveFiles().keys()].filter((p) => p.startsWith('teams/ENG/'))).toEqual([])
    expect(s.issues[child.id].parent).toBeNull()
    expect(s.issues[keep.id]).toBeDefined()
    expect(s.projects[project.id].teams).toEqual(['DES'])
    expect(s.views[engView.id]).toBeUndefined()
    expect(s.views[wide.id]).toBeDefined()
  })
})

test('an issue that moved to another team stays on screen, whichever order the paths arrive in', () => {
  const issue = createIssue({ team: 'ENG', title: 'Moves around' })
  const moved = { ...issue, team: 'DES', number: 1 }
  // the new place first, then the old one gone (the order a pull can bring them in)
  applyFiles(new Map([[paths.issue(moved), issueToFile(moved)], [paths.issue(issue), null]]), 'ana')
  expect(state().issues[issue.id]).toMatchObject({ team: 'DES', number: 1 })
})

test('deleting a label, project or team takes it out of saved views', () => {
  const label = createLabel('Bug')
  const keep = createLabel('Design')
  const project = createProject({ name: 'Launch', emoji: '🚀', teams: ['ENG'] })
  const view = createView({ name: 'Mixed', emoji: '🧪', team: null, filters: { labels: [label.id, keep.id], projects: [project.id], teams: ['DES', 'ENG'] }, display: DEFAULT_DISPLAY })
  deleteLabel(label.id)
  deleteProject(project.id)
  deleteTeam('DES')
  expect(state().views[view.id].filters).toEqual({ labels: [keep.id], teams: ['ENG'] })
})
