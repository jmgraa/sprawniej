/**
 * A made-up workspace so the screens have something to show before sign-in and syncing exist (milestone 0).
 * Also handy in tests. Not used once a real workspace is open.
 */
import { generateNKeysBetween } from 'fractional-indexing'
import type { Issue, Label, Person, Project, Team, View } from '@/model/schema'
import type { Priority, StatusId } from '@/model/status'
import type { DataState } from './store'

const at = (daysAgo: number) => new Date(Date.UTC(2026, 9, 6) - daysAgo * 86_400_000).toISOString()

const people: Person[] = [
  { login: 'mikolajpochec', githubId: 1, name: 'Mikołaj Pocheć', avatarUrl: '' },
  { login: 'ania-k', githubId: 2, name: 'Ania Kowalska', avatarUrl: '' },
  { login: 'bartek', githubId: 3, name: 'Bartek Nowak', avatarUrl: '' },
  { login: 'zosia', githubId: 4, name: 'Zosia Wiśniewska', avatarUrl: '' },
]

const labels: Label[] = [
  { id: 'bug', name: 'Bug', color: '#eb5757' },
  { id: 'feature', name: 'Feature', color: '#bb87fc' },
  { id: 'performance', name: 'Performance', color: '#4cb782' },
  { id: 'insights', name: 'Insights', color: '#f2c94c' },
]

const teams: Team[] = [
  { key: 'ENG', name: 'Engineering', emoji: '🛠️', members: ['mikolajpochec', 'ania-k', 'bartek'], createdAt: at(90) },
  { key: 'DES', name: 'Design', emoji: '🎨', members: ['mikolajpochec', 'zosia'], createdAt: at(90) },
]

const projects: Project[] = [
  {
    id: 'p-insights',
    name: 'Insights page',
    emoji: '📊',
    description: 'Charts that explain where the money goes.',
    status: 'in_progress',
    lead: 'ania-k',
    teams: ['ENG', 'DES'],
    targetDate: '2026-11-15',
    createdAt: at(40),
  },
  {
    id: 'p-speed',
    name: 'Faster start',
    emoji: '🏎️',
    description: 'Open the app in under a second.',
    status: 'planned',
    lead: 'bartek',
    teams: ['ENG'],
    targetDate: null,
    createdAt: at(20),
  },
]

type Row = [team: string, title: string, status: StatusId, priority: Priority, assignee: string | null, labels: string[], project?: string, parent?: number]

const rows: Row[] = [
  ['ENG', 'Simplify `Insights` graphs and move row detail into tooltips', 'in_review', 1, 'ania-k', ['insights'], 'p-insights'],
  ['ENG', 'Mark the in-progress period so a partial period doesn’t read as a drop', 'in_review', 1, 'ania-k', ['insights'], 'p-insights', 1],
  ['ENG', 'Line chart’s line and points', 'done', 2, 'bartek', ['insights'], 'p-insights', 1],
  ['ENG', 'Bar chart’s bars', 'in_progress', 2, 'ania-k', ['insights'], 'p-insights', 1],
  ['ENG', 'Group-by button', 'todo', 0, 'bartek', ['insights'], 'p-insights', 1],
  ['ENG', 'Show a discard-changes prompt when switching tabs with unsaved values', 'in_review', 3, 'mikolajpochec', ['feature']],
  ['ENG', 'Link on the expense toast is not underlined in high contrast mode', 'in_progress', 3, 'mikolajpochec', ['bug']],
  ['ENG', 'User is logged out after closing and reopening the app', 'todo', 1, 'bartek', ['bug']],
  ['ENG', 'Decompose list item', 'in_progress', 3, 'mikolajpochec', ['performance'], 'p-speed'],
  ['ENG', 'Defer work until after the first paint', 'todo', 2, 'bartek', ['performance'], 'p-speed'],
  ['ENG', 'Show skeleton loaders on the first load of Home', 'backlog', 4, null, ['feature'], 'p-speed'],
  ['ENG', 'Instant spinner, core implementation', 'backlog', 0, null, []],
  ['ENG', 'Deep links refactor', 'done', 3, 'ania-k', []],
  ['ENG', 'Old crash reporter', 'canceled', 0, null, []],
  ['DES', 'Empty states for every list', 'in_progress', 2, 'zosia', ['feature']],
  ['DES', 'Chart colours that work for colour-blind people', 'todo', 2, 'zosia', ['insights'], 'p-insights'],
  ['DES', 'New app icon', 'backlog', 4, null, []],
]

const description = `Charts should be easier to read at a glance.

- Move the per-row numbers into **tooltips**
- Keep the legend short, see [the design file](https://example.com/design)
- Ask @zosia about colours

\`\`\`ts
const total = rows.reduce((sum, r) => sum + r.amount, 0)
\`\`\``

function buildIssues(): Issue[] {
  const counters: Record<string, number> = {}
  const keys = generateNKeysBetween(null, null, rows.length)
  const ids = rows.map((_, i) => `sample-${String(i + 1).padStart(2, '0')}`)
  return rows.map(([team, title, status, priority, assignee, labelIds, project, parent], i) => {
    counters[team] = (counters[team] ?? 0) + 1
    return {
      id: ids[i],
      team,
      number: counters[team],
      title,
      status,
      priority,
      assignee,
      labels: labelIds,
      project: project ?? null,
      parent: parent ? ids[parent - 1] : null,
      sortOrder: keys[i],
      createdBy: 'mikolajpochec',
      createdAt: at(30 - i),
      updatedAt: at(i % 7),
      completedAt: status === 'done' ? at(2) : null,
      description: i === 0 ? description : '',
    }
  })
}

const views: View[] = [
  {
    id: 'v-insights',
    name: 'Insights',
    emoji: '📊',
    description: 'Issues tagged with the Insights label',
    owner: 'ania-k',
    team: null,
    filters: { labels: ['insights'] },
    display: { layout: 'list', grouping: 'status', ordering: 'manual', showCompleted: false, showSubIssues: true },
    createdAt: at(10),
  },
  {
    id: 'v-bugs',
    name: 'Bugs',
    emoji: '🐞',
    description: 'Every open bug, most urgent first',
    owner: 'mikolajpochec',
    team: 'ENG',
    filters: { labels: ['bug'] },
    display: { layout: 'board', grouping: 'status', ordering: 'priority', showCompleted: false, showSubIssues: true },
    createdAt: at(8),
  },
  {
    id: 'v-speed',
    name: 'Performance',
    emoji: '⚡',
    description: '',
    owner: 'bartek',
    team: null,
    filters: { labels: ['performance'] },
    display: { layout: 'list', grouping: 'assignee', ordering: 'manual', showCompleted: true, showSubIssues: true },
    createdAt: at(5),
  },
]

const byKey = <T,>(xs: T[], key: (x: T) => string) => Object.fromEntries(xs.map((x) => [key(x), x]))

export function sampleData(): DataState {
  const issues = buildIssues()
  return {
    workspace: { name: 'Software Mansion', format: 1, createdAt: at(90) },
    me: people[0],
    people: byKey(people, (p) => p.login),
    labels: byKey(labels, (l) => l.id),
    statuses: {},
    builtinStatuses: {},
    statusCategories: {},
    teams: byKey(teams, (t) => t.key),
    archive: {},
    archiveLoaded: false,
    issues: byKey(issues, (i) => i.id),
    projects: byKey(projects, (p) => p.id),
    views: byKey(views, (v) => v.id),
    comments: {
      [issues[0].id]: [
        { id: 'c1', issue: issues[0].id, author: 'zosia', createdAt: at(3), body: 'Colours are ready, see the **Chart colours** issue.' },
        { id: 'c2', issue: issues[0].id, author: 'ania-k', createdAt: at(2), body: 'Thanks! Using them now.' },
      ],
    },
    inbox: [
      { id: 'n1', type: 'assigned', issue: issues[6].id, actor: 'ania-k', at: at(1) },
      { id: 'n2', type: 'mentioned', issue: issues[0].id, actor: 'zosia', at: at(3), comment: 'c1' },
    ],
    readState: { readUntil: null, read: [] },
  }
}
