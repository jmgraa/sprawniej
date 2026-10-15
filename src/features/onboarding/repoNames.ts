/**
 * Repositories Sprawniej creates are all named workspace-sprawniej-<name>, so they're easy to spot on GitHub and
 * come first when you choose a workspace. Repositories without the prefix still open fine.
 */
export const WORKSPACE_PREFIX = 'workspace-sprawniej-'

/** "Software Mansion" → "software-mansion" (letters, digits and dashes only) */
export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** the full repository name for a workspace name or a typed suffix */
export const workspaceRepoName = (name: string) => WORKSPACE_PREFIX + (slug(name) || 'team')

export const isWorkspaceRepo = (repoName: string) => repoName.toLowerCase().startsWith(WORKSPACE_PREFIX)

/** workspaces first, everything else after; each group keeps its order (most recently changed first) */
export function workspacesFirst<T extends { name: string }>(repos: T[]): T[] {
  return [...repos.filter((r) => isWorkspaceRepo(r.name)), ...repos.filter((r) => !isWorkspaceRepo(r.name))]
}

/** a readable name when all we have is the repository's: "workspace-sprawniej-acme-studio" → "Acme studio" */
export function nameFromRepo(repoName: string): string {
  const words = (isWorkspaceRepo(repoName) ? repoName.slice(WORKSPACE_PREFIX.length) : repoName).replace(/[-_.]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : repoName
}
