import { Link, useParams } from 'wouter'
import { Inbox, Plus, SquareStack } from 'lucide-react'
import { Button } from '@/ui/button'
import { openComposer } from '@/features/issues/composer'
import { useCrumbs } from '@/app/chrome'
import { EmptyState } from '@/components/EmptyState'
import { LinkTabs } from '@/components/Tabs'
import { IssuesView } from '@/features/issues/IssuesView'
import { ArchiveList } from './ArchiveList'
import { NotFound } from '@/app/NotFound'
import { useData } from '@/data/store'
import { inTab } from '@/data/select'
import type { IssueTab } from '@/model/status'

const TABS: { tab: IssueTab; label: string }[] = [
  { tab: 'active', label: 'Active' },
  { tab: 'backlog', label: 'Backlog' },
  { tab: 'all', label: 'All issues' },
]

export function TeamIssuesPage() {
  const { key = '', tab = 'active' } = useParams<{ key: string; tab?: string }>()
  const team = useData((s) => s.teams[key])
  // issues waiting in Triage (not snoozed), for the tab's count
  const waiting = useData((s) => Object.values(s.issues).filter((i) => i.team === key && inTab(i, 'triage')).length)
  const shownTabs = team?.triage ? [{ tab: 'triage' as const, label: waiting ? `Triage ${waiting}` : 'Triage' }, ...TABS] : TABS
  const current = (shownTabs.find((t) => t.tab === tab)?.tab ?? 'active') as IssueTab
  useCrumbs(team ? [{ label: `${team.emoji} ${team.name}` }, { label: 'Issues' }] : [])
  if (!team) return <NotFound />
  const base = `/team/${team.key}/issues`
  const tabs = [...shownTabs.map((t) => ({ href: `${base}/${t.tab}`, label: t.label })), { href: `${base}/archived`, label: 'Archived' }]
  if (tab === 'archived') return <ArchiveList team={team.key} left={<LinkTabs current={`${base}/archived`} tabs={tabs} />} />
  return (
    <IssuesView
      page={`team:${team.key}:${current}`}
      filters={{ teams: [team.key] }}
      hideFilters={['teams']}
      viewScope={team.key}
      tab={current}
      baseDisplay={{ showCompleted: current === 'all' }}
      left={<LinkTabs current={`${base}/${current}`} tabs={tabs} />}
      empty={
        current === 'triage' ? (
          <EmptyState
            icon={<Inbox />}
            title="Nothing to triage"
            action={
              <Button variant="outline" asChild>
                <Link href="/settings/statuses">Triage settings</Link>
              </Button>
            }
          >
            Issues from people outside the team wait here until someone accepts, declines or marks them as a duplicate.
          </EmptyState>
        ) : (
        <EmptyState
          icon={<SquareStack />}
          title={current === 'backlog' ? 'The backlog is empty' : 'No issues here yet'}
          action={
            <Button variant="outline" onClick={() => openComposer({ team: team.key, ...(current === 'backlog' && { status: 'backlog' }) })}>
              <Plus /> New issue <kbd className="ml-1 rounded border px-1 text-xs">C</kbd>
            </Button>
          }
        >
          Issues are tasks, bugs or ideas your team wants to work on.
        </EmptyState>
        )
      }
    />
  )
}
