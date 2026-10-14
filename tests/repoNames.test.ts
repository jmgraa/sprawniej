import { expect, test } from 'bun:test'
import { isWorkspaceRepo, nameFromRepo, workspaceRepoName, workspacesFirst } from '@/features/onboarding/repoNames'

test('new workspace repos get the prefix and a clean name', () => {
  expect(workspaceRepoName('Software Mansion')).toBe('workspace-sprawniej-software-mansion')
  expect(workspaceRepoName('Głodniej & Bardziej!')).toBe('workspace-sprawniej-glodniej-bardziej')
  expect(workspaceRepoName('🚀')).toBe('workspace-sprawniej-team')
})

test('workspaces come first, each group keeps its order', () => {
  const names = ['app', 'workspace-sprawniej-b', 'docs', 'Workspace-Sprawniej-A', 'sprawniej-e2e']
  expect(workspacesFirst(names.map((name) => ({ name }))).map((r) => r.name)).toEqual(['workspace-sprawniej-b', 'Workspace-Sprawniej-A', 'app', 'docs', 'sprawniej-e2e'])
  expect(isWorkspaceRepo('sprawniej-e2e')).toBe(false)
})

test('a readable name from a repository name', () => {
  expect(nameFromRepo('workspace-sprawniej-acme-studio')).toBe('Acme studio')
  expect(nameFromRepo('team_data')).toBe('Team data')
})
