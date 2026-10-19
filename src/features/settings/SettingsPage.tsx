/**
 * Settings: a few pages behind a menu. Your account; and for the workspace: its name, the people in it (and inviting
 * more), labels, statuses, the archive and the Linear import.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Archive, CircleDot, CircleUser, Copy, Download, ExternalLink, Link2, Loader2, LogOut, Repeat, Search, SlidersHorizontal, Tag, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Link, useParams } from 'wouter'
import { useShallow } from 'zustand/react/shallow'
import { useCrumbs } from '@/app/chrome'
import { switchWorkspace } from '@/app/signOut'
import { useSignOut } from '@/components/SignOut'
import { PersonAvatar } from '@/components/Avatar'
import { PagedList } from '@/components/PagedList'
import { fuzzy } from '@/lib/fuzzy'
import { renameMe, renameWorkspace, setAutoArchive } from '@/data/actions'
import { AUTO_ARCHIVE_MONTHS, isGuest, type Person } from '@/model/schema'
import { useData } from '@/data/store'
import { inviteMessage, joinLink } from '@/features/onboarding/joinLink'
import { Problem } from '@/features/onboarding/Step'
import { getRepo, GitHubError, invite, listSentInvitations, plainError, repoKey, type SentInvitation } from '@/github/api'
import { useSession } from '@/session'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { ImportPage } from '@/features/import/ImportPage'
import { cn } from '@/lib/utils'
import { LabelsSettings } from './LabelsSettings'
import { StatusesSettings } from './StatusesSettings'
import { LinkPersonDialog } from './LinkPersonDialog'
import { useUnlinked, workOf } from './unlinked'

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
  /** the link dialog: just invited (a GitHub login) or a person from Linear */
  const [linking, setLinking] = useState<{ login: string } | { guest: Person }>()
  const unlinked = useUnlinked()
  const [query, setQuery] = useState('')
  const work = useData(useShallow((s) => Object.fromEntries(unlinked.map((g) => [g.login, workOf(s, g.login)]))))

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
      // people from Linear still to link: maybe it's one of them
      if (unlinked.length && !people.some((p) => p.login === who && !isGuest(p.login) && (p as { linearIds?: unknown }).linearIds)) setLinking({ login: who })
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

  const invitedLogins = sent.map((i) => i.invitee?.login).filter((l): l is string => !!l)
  // an admin links people from Linear below; an invited person who was linked already shows once, as invited
  const listed = people.filter((p) => !invitedLogins.includes(p.login) && !(admin && isGuest(p.login)))
  type Row = { person: Person; invite?: undefined } | { person?: Person; invite: SentInvitation }
  const rows: Row[] = [...listed.map((p) => ({ person: p })), ...sent.map((i) => ({ invite: i, person: people.find((p) => p.login === i.invitee?.login) }))]
  const searching = !!query.trim()
  const rowWords = (r: Row) => [r.person?.name ?? '', r.person?.login ?? r.invite?.invitee?.login ?? '']
  const shown = fuzzy(rows, query, rowWords)
  const shownUnlinked = admin ? fuzzy(unlinked, query, (g) => [g.name]) : []
  return (
    <div className="flex flex-col gap-8">
      {rows.length + (admin ? unlinked.length : 0) > 10 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search people…"
            aria-label="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
        </div>
      )}
      {searching && !shown.length && !shownUnlinked.length && <p className="text-muted-foreground">Nobody here matches “{query.trim()}”.</p>}
      {shown.length > 0 && (
        <PagedList
          key={query.trim()}
          items={shown}
          noun="people"
          className="flex flex-col gap-1"
          row={(r) => (r.invite ? <InviteRow key={r.invite.id} invite={r.invite} known={r.person} link={r.invite.invitee && linkFor(r.invite.invitee.login)} /> : <PersonRow key={r.person.login} person={r.person} />)}
        />
      )}

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

      {admin && shownUnlinked.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">People from Linear</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            They came with the Linear import and aren't linked to a GitHub account yet. Link each one, and their issues, comments and views become theirs.
          </p>
          <PagedList
            key={query.trim()}
            items={shownUnlinked}
            noun="people from Linear"
            className="flex flex-col gap-1"
            row={(g) => (
              <li key={g.login} className="flex items-center gap-3 py-1.5">
                <PersonAvatar person={g} className="size-8 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{work[g.login] || 'Nothing of theirs yet'}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => setLinking({ guest: g })}>
                  <Link2 /> Link to GitHub account
                </Button>
              </li>
            )}
          />
        </div>
      )}

      {linking &&
        ('login' in linking ? (
          <LinkPersonDialog from="invite" login={linking.login} onClose={() => setLinking(undefined)} />
        ) : (
          <LinkPersonDialog from="linear" guest={linking.guest} invited={invitedLogins} onClose={() => setLinking(undefined)} />
        ))}
    </div>
  )
}

function PersonRow({ person: p }: { person: Person }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <PersonAvatar person={p} className="size-8 text-xs" />
      <span className="font-medium">{p.name}</span>
      {isGuest(p.login) ? (
        <span className="rounded-full border px-2 text-xs leading-5 text-muted-foreground" title="Their issues and comments came with the import. An admin can link them to their GitHub account.">
          From Linear, hasn't joined
        </span>
      ) : (
        <span className="text-muted-foreground">@{p.login}</span>
      )}
    </li>
  )
}

/** someone invited who hasn't joined yet (with their name, when someone from Linear was linked to them) */
function InviteRow({ invite, known, link }: { invite: SentInvitation; known?: Person; link: string | null | undefined }) {
  return (
    <li className="flex items-center gap-3 py-1.5 text-muted-foreground">
      <PersonAvatar person={known} login={invite.invitee?.login ?? '?'} className="size-8 text-xs opacity-60" />
      {known && known.name !== known.login && <span className="font-medium text-foreground/80">{known.name}</span>}
      <span>@{invite.invitee?.login}</span>
      <span className="rounded-full border px-2 text-xs leading-5">Invited, hasn't joined yet</span>
      {link && (
        <Button variant="ghost" size="sm" onClick={() => copy(link, 'Link')}>
          <Copy /> Copy their join link
        </Button>
      )}
    </li>
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

/** your name as teammates see it; GitHub's until you type your own */
function MyName({ me, github }: { me: Person; github: string }) {
  const [draft, setDraft] = useState(me.name)
  const commit = () => {
    renameMe(draft)
    if (!draft.trim()) setDraft(github)
  }
  return (
    <div className="min-w-0 flex-1">
      <Input
        aria-label="Your name"
        className="h-10 max-w-sm font-semibold"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <p className="mt-1.5 text-sm text-muted-foreground">
        @{me.login} · How teammates see you here. Your GitHub profile stays as it is.
        {me.nameSetHere && github !== me.login && github !== me.name && (
          <Button variant="link" className="h-auto px-1 py-0 text-sm" onClick={() => renameMe('')}>
            Use your GitHub name ({github})
          </Button>
        )}
      </p>
    </div>
  )
}

function Account() {
  const user = useSession((s) => s.user)
  const mine = useData((s) => (user ? s.people[user.login] : undefined))
  const { signOut, busy, dialog } = useSignOut()
  const me = mine ?? user

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <PersonAvatar person={me ?? undefined} className="size-12 text-base" />
        {/* remount when the name changes elsewhere (another tab, "Use your GitHub name") */}
        {me && <MyName key={me.name} me={me} github={user?.name ?? me.login} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={() => void switchWorkspace()}>
          <Repeat /> Switch workspace
        </Button>
        <Button variant="outline" size="lg" disabled={busy} onClick={signOut}>
          {busy ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Signing out removes your GitHub key and the workspace copy from this browser. Do it on shared computers.</p>
      {dialog}
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

/** Settings is a few pages; the menu on the left (on a phone: the Settings page itself) leads to them */
interface SettingsPageDef {
  id: string
  group: 'Your account' | 'Workspace'
  title: string
  icon: ReactNode
  description?: string
  body: () => ReactNode
  /** brings its own page (the import wizard) */
  whole?: boolean
}

function General() {
  const repo = useSession((s) => s.workspace)
  return (
    <>
      <WorkspaceName />
      {repo && (
        <a href={`https://github.com/${repoKey(repo)}`} target="_blank" rel="noreferrer" className="mt-3 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          Stored on GitHub in {repoKey(repo)} <ExternalLink className="size-3.5" />
        </a>
      )}
    </>
  )
}

const PAGES: SettingsPageDef[] = [
  { id: 'account', group: 'Your account', title: 'Account', icon: <CircleUser />, body: () => <Account /> },
  { id: 'workspace', group: 'Workspace', title: 'General', icon: <SlidersHorizontal />, description: 'The workspace’s name, and where it is stored.', body: () => <General /> },
  { id: 'people', group: 'Workspace', title: 'People', icon: <Users />, description: 'Everyone here can see and change every issue in the workspace.', body: () => <People /> },
  { id: 'labels', group: 'Workspace', title: 'Labels', icon: <Tag />, description: 'Labels sort issues across teams. Renaming or recolouring one changes it on every issue.', body: () => <LabelsSettings /> },
  {
    id: 'statuses',
    group: 'Workspace',
    title: 'Statuses',
    icon: <CircleDot />,
    description: 'Every team has the built-in statuses. Add your own to any kind, like Blocked under Canceled: its issues get that kind’s icon in your colour and show on the same tabs.',
    body: () => <StatusesSettings />,
  },
  {
    id: 'archive',
    group: 'Workspace',
    title: 'Archive',
    icon: <Archive />,
    description: 'Finished issues leave the lists some time after they’re done, so the lists stay short and the app stays quick. Archived issues can still be opened, found and brought back.',
    body: () => <ArchiveSettings />,
  },
  { id: 'import', group: 'Workspace', title: 'Import from Linear', icon: <Download />, body: () => <ImportPage />, whole: true },
]

/** where /settings goes on a big screen */
const FIRST = 'workspace'

function SettingsMenu({ current, className }: { current: string | undefined; className?: string }) {
  return (
    <nav aria-label="Settings" className={cn('flex flex-col gap-5', className)}>
      {(['Your account', 'Workspace'] as const).map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <div className="px-2 pb-1 text-[13px] text-muted-foreground">{group}</div>
          {PAGES.filter((p) => p.group === group).map((p) => (
            <Link
              key={p.id}
              href={`/settings/${p.id}`}
              aria-current={p.id === current ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-2.5 rounded-md px-2 text-[15px] text-foreground/85 hover:bg-accent/60 md:h-9 [&_svg]:size-4 [&_svg]:text-muted-foreground',
                p.id === current && 'bg-accent text-foreground',
              )}
            >
              {p.icon} {p.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Page({ page }: { page: SettingsPageDef }) {
  useCrumbs([{ label: 'Settings', href: '/settings' }, { label: page.title }])
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8">
      <div className="mx-auto max-w-3xl py-8">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        {page.description && <p className="mt-1 text-[15px] text-muted-foreground">{page.description}</p>}
        <div className="mt-6">{page.body()}</div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { page: id } = useParams<{ page?: string }>()
  const page = PAGES.find((p) => p.id === id)
  const shown = page ?? PAGES.find((p) => p.id === FIRST)!
  return (
    <div className="flex min-h-0 flex-1">
      {/* a phone shows the menu on /settings and the page on /settings/<page>; a big screen shows both */}
      <div className={cn('w-full shrink-0 overflow-y-auto border-r px-3 py-6 md:block md:w-56', page ? 'hidden' : 'block')}>
        <SettingsMenu current={page ? page.id : undefined} className="md:hidden" />
        <SettingsMenu current={shown.id} className="hidden md:flex" />
      </div>
      <div className={cn('min-w-0 flex-1 flex-col', page ? 'flex' : 'hidden md:flex')}>{shown.whole ? shown.body() : <Page key={shown.id} page={shown} />}</div>
      {!page && <MenuCrumbs />}
    </div>
  )
}

/** on /settings itself (the menu, on a phone) the breadcrumbs just say Settings */
function MenuCrumbs() {
  useCrumbs([{ label: 'Settings' }])
  return null
}
