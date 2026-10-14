/** Settings: the workspace's name, the people in it (and inviting more), labels, and your account. */
import { useEffect, useState, type ReactNode } from 'react'
import { Copy, ExternalLink, Loader2, LogOut, Repeat, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'wouter'
import { useShallow } from 'zustand/react/shallow'
import { useCrumbs } from '@/app/chrome'
import { signOutEverywhere, switchWorkspace } from '@/app/signOut'
import { PersonAvatar } from '@/components/Avatar'
import { renameWorkspace, setAutoArchive } from '@/data/actions'
import { AUTO_ARCHIVE_MONTHS, isGuest } from '@/model/schema'
import { useData } from '@/data/store'
import { inviteMessage, joinLink } from '@/features/onboarding/joinLink'
import { Problem } from '@/features/onboarding/Step'
import { getRepo, GitHubError, invite, listSentInvitations, plainError, repoKey, type SentInvitation } from '@/github/api'
import { useSession } from '@/session'
import { workspace } from '@/sync/engine'
import { unsavedElsewhere } from '@/sync/local'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/ui/dialog'
import { Input } from '@/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { LabelsSettings } from './LabelsSettings'

function Section({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-b py-8 last:border-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function WorkspaceName() {
  const name = useData((s) => s.workspace?.name ?? '')
  // remount when a teammate renames it, so the field shows the new name
  return <NameField key={name} name={name} />
}

function NameField({ name }: { name: string }) {
  const [draft, setDraft] = useState(name)
  const commit = () => {
    if (draft.trim() && draft.trim() !== name) renameWorkspace(draft)
    else setDraft(name)
  }
  return (
    <Input
      aria-label="Workspace name"
      className="h-10 max-w-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast(`${what} copied`))
}

function People() {
  const { token, workspace: repo, user } = useSession()
  const people = useData(useShallow((s) => Object.values(s.people).sort((a, b) => a.name.localeCompare(b.name))))
  const wsName = useData((s) => s.workspace?.name ?? '')
  const [admin, setAdmin] = useState(false)
  const [sent, setSent] = useState<SentInvitation[]>([])
  const [login, setLogin] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string>()
  /** who was just invited, so we can hand over their join link */
  const [invited, setInvited] = useState<string>()

  useEffect(() => {
    if (!repo) return
    getRepo(token, repo).then((r) => {
      const isAdmin = !!r.permissions?.admin
      setAdmin(isAdmin)
      if (isAdmin) listSentInvitations(token, repo).then(setSent, () => {})
    }, () => {})
  }, [token, repo])

  if (!repo) return null
  const linkFor = (who: string) => joinLink({ repo, ws: wsName, by: user?.login, for: who })

  async function send() {
    const who = login.trim().replace(/^@/, '')
    if (!who || !repo) return
    setBusy(true)
    setProblem(undefined)
    setInvited(undefined)
    try {
      const r = await invite(token, repo, who)
      setLogin('')
      setInvited(who)
      if (r === 'member') toast(`@${who} already has access`)
      else {
        toast(`Invited @${who}`, { description: 'Now send them their join link.' })
        listSentInvitations(token, repo).then(setSent, () => {})
      }
    } catch (e) {
      setProblem(
        e instanceof GitHubError && e.status === 404
          ? `There's no GitHub account called @${who}. Check the spelling with them.`
          : e instanceof GitHubError && e.status === 403
            ? 'You can’t invite people to this workspace. Ask its owner to do it, or to make you an admin on GitHub.'
            : plainError(e),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-1">
        {people.map((p) => (
          <li key={p.login} className="flex items-center gap-3 py-1.5">
            <PersonAvatar person={p} className="size-8 text-xs" />
            <span className="font-medium">{p.name}</span>
            {isGuest(p.login) ? (
              <span className="rounded-full border px-2 text-xs leading-5 text-muted-foreground" title="Their issues and comments came with the import. Invite them, then import again to link everything to their account.">
                From Linear, hasn't joined
              </span>
            ) : (
              <span className="text-muted-foreground">@{p.login}</span>
            )}
          </li>
        ))}
        {sent.map((i) => {
          const link = i.invitee && linkFor(i.invitee.login)
          return (
            <li key={i.id} className="flex items-center gap-3 py-1.5 text-muted-foreground">
              <PersonAvatar login={i.invitee?.login ?? '?'} className="size-8 text-xs opacity-60" />
              <span>@{i.invitee?.login}</span>
              <span className="rounded-full border px-2 text-xs leading-5">Invited, hasn't joined yet</span>
              {link && (
                <Button variant="ghost" size="sm" onClick={() => copy(link, 'Link')}>
                  <Copy /> Copy their join link
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {admin ? (
        <div>
          <h3 className="mb-1 font-medium">Invite someone</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Type their GitHub username. No account yet? Ask them to make one at github.com (it's free), then invite them here.
          </p>
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <Input className="h-10" placeholder="GitHub username" value={login} onChange={(e) => setLogin(e.target.value)} aria-label="GitHub username" />
            <Button type="submit" size="lg" variant="outline" disabled={busy || !login.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite
            </Button>
          </form>
          <Problem>{problem}</Problem>
          {invited && <JoinLinkFor login={invited} link={linkFor(invited)} wsName={wsName} />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only the workspace's admins can invite people. Ask one of them; they'll get a join link to send.</p>
      )}
    </div>
  )
}

/** shown right after an invite: the link made for that one person */
function JoinLinkFor({ login, link, wsName }: { login: string; link: string | null; wsName: string }) {
  return (
    <div className="mt-6 max-w-2xl rounded-xl border p-4">
      <h3 className="mb-1 font-medium">Copy the join link for @{login}</h3>
      {link ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">Send it to them. It walks them through getting in, step by step.</p>
          <div className="flex gap-2">
            <Input readOnly value={link} className="h-10 font-mono text-sm" onFocus={(e) => e.target.select()} aria-label={`Join link for @${login}`} />
            <Button variant="outline" size="lg" onClick={() => copy(link, 'Link')}>
              <Copy /> Copy link
            </Button>
          </div>
          <Button variant="link" className="mt-1 px-0" onClick={() => copy(inviteMessage(link, wsName), 'Message')}>
            Copy a ready-to-send message instead
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sprawniej is running on this computer only, so there's no link to share. Join links appear here in the published app.</p>
      )}
    </div>
  )
}

function Account() {
  const user = useSession((s) => s.user)
  const repo = useSession((s) => s.workspace)
  /** what isn't saved yet: 'here' = this workspace, else the other workspaces with changes still waiting */
  const [unsaved, setUnsaved] = useState<'here' | string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function signOut(force = false) {
    setBusy(true)
    const ws = workspace()
    if (!force) {
      if (ws?.hasUnsaved) await ws.flush()
      // signing out wipes every workspace's copy in this browser, including changes made elsewhere and not saved yet
      const waiting = ws?.hasUnsaved ? 'here' : await unsavedElsewhere(repo ?? undefined)
      if (waiting === 'here' || waiting.length) {
        setBusy(false)
        setUnsaved(waiting)
        return
      }
    }
    await signOutEverywhere()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <PersonAvatar person={user ?? undefined} className="size-12 text-base" />
        <div>
          <div className="font-semibold">{user?.name}</div>
          <div className="text-muted-foreground">@{user?.login}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={() => void switchWorkspace()}>
          <Repeat /> Switch workspace
        </Button>
        <Button variant="outline" size="lg" disabled={busy} onClick={() => void signOut()}>
          {busy ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Signing out removes your GitHub key and the workspace copy from this browser. Do it on shared computers.</p>
      <Dialog open={!!unsaved} onOpenChange={(open) => !open && setUnsaved(null)}>
        <DialogContent>
          <DialogTitle>Some changes haven't been saved to GitHub yet</DialogTitle>
          <DialogDescription>
            {unsaved === 'here' || !unsaved
              ? 'You seem to be offline. If you sign out now, those changes are lost. Connect to the internet and wait for "Saved" first.'
              : `You changed ${unsaved.length === 1 ? 'another workspace' : 'other workspaces'} (${unsaved.join(', ')}) and those changes haven't reached GitHub. If you sign out now, they are lost. Open ${unsaved.length === 1 ? 'it' : 'each one'} while online and wait for "Saved" first.`}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnsaved(null)}>
              Stay signed in
            </Button>
            <Button variant="destructive" onClick={() => void signOut(true)}>
              Sign out anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const ARCHIVE_CHOICES = [1, 3, 6, 12, 0]

/** per team: how long finished issues stay in the lists before they're archived */
function ArchiveSettings() {
  const teams = useData(useShallow((s) => Object.values(s.teams).sort((a, b) => a.name.localeCompare(b.name))))
  return (
    <ul className="flex flex-col gap-2">
      {teams.map((t) => (
        <li key={t.key} className="flex items-center gap-3">
          <span className="w-5 text-center">{t.emoji}</span>
          <span className="min-w-0 flex-1 truncate text-[15px]">{t.name}</span>
          <Select value={String(t.autoArchive ?? AUTO_ARCHIVE_MONTHS)} onValueChange={(v) => setAutoArchive(t.key, Number(v))}>
            <SelectTrigger className="w-44" aria-label={`When ${t.name} archives finished issues`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARCHIVE_CHOICES.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m === 0 ? 'Never' : `After ${m} ${m === 1 ? 'month' : 'months'}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  )
}

export function SettingsPage() {
  const repo = useSession((s) => s.workspace)
  useCrumbs([{ label: 'Settings' }])
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8">
      <div className="mx-auto max-w-3xl py-4">
        <Section title="Workspace">
          <WorkspaceName />
          {repo && (
            <a href={`https://github.com/${repoKey(repo)}`} target="_blank" rel="noreferrer" className="mt-3 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              Stored on GitHub in {repoKey(repo)} <ExternalLink className="size-3.5" />
            </a>
          )}
        </Section>
        <Section title="People" description="Everyone here can see and change every issue in the workspace.">
          <People />
        </Section>
        <Section title="Labels" description="Labels sort issues across teams. Renaming or recolouring one changes it on every issue.">
          <LabelsSettings />
        </Section>
        <Section
          title="Archive"
          description="Finished issues leave the lists some time after they're done, so the lists stay short and the app stays quick. Archived issues can still be opened, found and brought back."
        >
          <ArchiveSettings />
        </Section>
        <Section title="Import" description="Bring teams, issues, comments, projects and labels over from Linear. You can run it again later to bring in new changes.">
          <Button asChild variant="outline">
            <Link href="/settings/import">Import from Linear</Link>
          </Button>
        </Section>
        <Section title="Your account">
          <Account />
        </Section>
      </div>
    </div>
  )
}
