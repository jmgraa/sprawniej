/**
 * Signed in, but no workspace open: invitations waiting for you, workspaces you opened before, any repository you
 * can save to, or a brand-new workspace.
 */
import { useEffect, useMemo, useState } from 'react'
import { Clock, Lock, Mail, Plus, Search } from 'lucide-react'
import { acceptInvitation, listMyInvitations, listMyRepos, plainError, repoKey, type MyInvitation, type RepoInfo, type RepoRef } from '@/github/api'
import { Logo } from '@/components/Logo'
import { useSession } from '@/session'
import { useSignOut } from '@/components/SignOut'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { NewWorkspace } from './NewWorkspace'
import { isWorkspaceRepo, workspacesFirst } from './repoNames'
import { Problem, Step } from './Step'

function Row({ title, sub, onClick, icon }: { title: string; sub?: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {sub && <span className="block truncate text-sm text-muted-foreground">{sub}</span>}
      </span>
    </button>
  )
}

export function PickWorkspace() {
  const { token, user, recent, open } = useSession()
  const { signOut, dialog: signOutDialog } = useSignOut()
  const [repos, setRepos] = useState<RepoInfo[] | null>(null)
  const [invites, setInvites] = useState<MyInvitation[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [problem, setProblem] = useState<string>()

  useEffect(() => {
    listMyRepos(token).then(setRepos, (e: unknown) => setProblem(plainError(e)))
    // only invitations to workspaces: accepting anything else here would be a surprise
    listMyInvitations(token).then((all) => setInvites(all.filter((i) => isWorkspaceRepo(i.repository.name))), () => {})
  }, [token])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = workspacesFirst((repos ?? []).filter((r) => !q || r.full_name.toLowerCase().includes(q)))
    // every workspace, then other repositories up to 30 rows in total
    const workspaces = found.filter((r) => isWorkspaceRepo(r.name))
    return [...workspaces, ...found.filter((r) => !isWorkspaceRepo(r.name)).slice(0, Math.max(0, 30 - workspaces.length))]
  }, [repos, query])

  async function join(inv: MyInvitation) {
    const ref: RepoRef = { owner: inv.repository.owner.login, repo: inv.repository.name }
    try {
      await acceptInvitation(token, ref)
      open(ref)
    } catch (e) {
      setProblem(plainError(e))
    }
  }

  if (creating) return <NewWorkspace onBack={() => setCreating(false)} />

  return (
    <Step
      wide
      title="Choose a workspace"
      footer={
        <>
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus /> Create a new workspace
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            Signed in as @{user?.login} ·{' '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={signOut}>
              sign out
            </button>
          </span>
        </>
      }
    >
      {signOutDialog}
      <Problem>{problem}</Problem>
      {invites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Invitations for you</h2>
          {invites.map((i) => (
            <Row key={i.id} icon={<Mail className="size-5 text-status-review" />} title={i.repository.full_name} sub={i.inviter ? `From @${i.inviter.login}` : undefined} onClick={() => void join(i)} />
          ))}
        </section>
      )}
      {recent.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Opened before</h2>
          {recent.map((r) => (
            <Row key={repoKey(r)} icon={<Clock className="size-5 text-muted-foreground" />} title={repoKey(r)} onClick={() => open(r)} />
          ))}
        </section>
      )}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Open a workspace you were given access to</h2>
        <div className="relative mb-2">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="h-10 pl-9" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {repos === null && !problem && <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>}
          {repos && !shown.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing found.</p>}
          {shown.map((r, i) => {
            const ws = isWorkspaceRepo(r.name)
            const groupStart = i === 0 || ws !== isWorkspaceRepo(shown[i - 1].name)
            return (
              <div key={r.full_name}>
                {groupStart && <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{ws ? 'Sprawniej workspaces' : 'Other places on GitHub'}</h3>}
                <Row
                  icon={ws ? <Logo className="size-4" /> : r.private ? <Lock className="size-4 text-muted-foreground" /> : <span className="size-4" />}
                  title={r.full_name}
                  onClick={() => open({ owner: r.owner.login, repo: r.name })}
                />
              </div>
            )
          })}
        </div>
      </section>
    </Step>
  )
}
