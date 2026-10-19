/**
 * One issue: title, description, sub-issues and comments on the left, properties on the right.
 * Everything saves by itself; there is no Save button anywhere (CLAUDE.md, golden rules).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { useShallow } from 'zustand/react/shallow'
import { Archive, Bell, BellOff, Link2, MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbs } from '@/app/chrome'
import { NotFound } from '@/app/NotFound'
import { PersonAvatar } from '@/components/Avatar'
import { LabelChip } from '@/components/LabelChip'
import { Picker, type PickerItem } from '@/components/Picker'
import { archiveIssues, createLabel, deleteIssue, markRead, moveIssueToTeam, setFollowers, subscribe, updateIssue } from '@/data/actions'
import { followers } from '@/data/notify'
import { isClosed, isUnread } from '@/data/select'
import { loadArchive } from '@/data/project'
import { findArchivedByRef, findByRef, issueRef, useData } from '@/data/store'
import { Editor } from '@/editor/LazyEditor'
import { useMedia } from '@/lib/useNarrow'
import { cn } from '@/lib/utils'
import { PRIORITY_NAMES, statusOf } from '@/model/status'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { PriorityIcon, StatusIcon } from './icons'
import { ArchivedIssuePage } from './ArchivedIssuePage'
import { Comments } from './Comments'
import { DueChip, DueDatePicker, EstimateIcon } from './DueDate'
import { estimateName, shortDate } from './format'
import { SubIssues } from './SubIssues'
import { TitleField } from './TitleField'
import { estimateItems, priorityItems, useLabelItems, useParentItems, usePeopleItems, useProjectItems, useStatusItems } from './pickers'

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const pick =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[15px] hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent/60'

export function IssuePage() {
  const { ref = '' } = useParams<{ ref: string }>()
  const [, navigate] = useLocation()
  const issue = useData((s) => findByRef(s.issues, ref))
  const archived = useData((s) => (issue ? undefined : findArchivedByRef(s, ref)))
  const archiveLoaded = useData((s) => s.archiveLoaded)
  // not an active issue: maybe an archived one (read only when needed)
  useEffect(() => {
    if (!issue && !archiveLoaded) loadArchive()
  }, [issue, archiveLoaded])
  const shown = issue ?? archived
  // opened by an old number (it moved to another team since): show its current one in the address
  const current = shown ? issueRef(shown) : undefined
  useEffect(() => {
    if (current && current.toUpperCase() !== decodeURIComponent(ref).toUpperCase()) navigate(`/issue/${current}`, { replace: true })
  }, [current, ref, navigate])
  const team = useData((s) => (shown ? s.teams[shown.team] : undefined))
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  const people = useData((s) => s.people)
  const labels = useData((s) => s.labels)
  const project = useData((s) => (issue?.project ? s.projects[issue.project] : undefined))
  const parent = useData((s) => (issue?.parent ? s.issues[issue.parent] : undefined))
  // opening an issue reads its notes in your inbox
  const unread = useData(useShallow((s) => (issue ? s.inbox.filter((n) => n.issue === issue.id && isUnread(n, s.readState)).map((n) => n.id) : [])))
  useEffect(() => {
    if (unread.length) markRead(unread)
  }, [unread])
  const statusItems = useStatusItems(issue?.team)
  const peopleItems = usePeopleItems()
  const followerItems = useMemo(() => peopleItems.filter((p) => p.value !== null) as PickerItem<string>[], [peopleItems])
  const comments = useData((s) => (issue ? s.comments[issue.id] : undefined))
  const me = useData((s) => s.me?.login)
  const followerList = useMemo(() => (issue ? followers(issue, comments ?? [], people) : []), [issue, comments, people])
  const following = !!me && followerList.includes(me)
  const labelItems = useLabelItems()
  const projectItems = useProjectItems(issue?.team)
  const parentItems = useParentItems(issue)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // under 1024 px the properties sit under the title instead of in a column of their own
  const stacked = useMedia('(max-width: 1023px)')
  useCrumbs(shown && team ? [{ label: `${team.emoji} ${team.name}`, href: `/team/${team.key}/issues` }, { label: issueRef(shown) }] : [])
  if (!issue) return archived ? <ArchivedIssuePage issue={archived} /> : archiveLoaded ? <NotFound /> : null
  const assignee = issue.assignee ? people[issue.assignee] : undefined

  const properties = (
    <>
    <div className="flex flex-col gap-1">
      <Property label="Status">
        <Picker placeholder="Change status…" items={statusItems} value={issue.status} onSelect={(status) => updateIssue(issue.id, { status })}>
          <button type="button" className={pick}>
            <StatusIcon status={issue.status} /> {statusOf(issue.status).name}
          </button>
        </Picker>
      </Property>
      <Property label="Priority">
        <Picker placeholder="Change priority…" items={priorityItems} value={issue.priority} onSelect={(priority) => updateIssue(issue.id, { priority })}>
          <button type="button" className={pick}>
            <PriorityIcon priority={issue.priority} /> {PRIORITY_NAMES[issue.priority]}
          </button>
        </Picker>
      </Property>
      <Property label="Assignee">
        <Picker placeholder="Assign to…" items={peopleItems} value={issue.assignee} onSelect={(assignee) => updateIssue(issue.id, { assignee })}>
          <button type="button" className={pick}>
            <PersonAvatar person={assignee} login={issue.assignee} />
            {issue.assignee ? (assignee?.name ?? issue.assignee) : <span className="text-muted-foreground">No one</span>}
          </button>
        </Picker>
      </Property>
      <Property label="Labels">
        <Picker
          multiple
          placeholder="Labels…"
          items={labelItems}
          value={issue.labels}
          onSelect={(ids) => updateIssue(issue.id, { labels: ids })}
          onCreate={(name) => updateIssue(issue.id, { labels: [...issue.labels, createLabel(name).id] })}
          createLabel={(name) => `Create label “${name}”`}
        >
          <button type="button" className={`${pick} flex-wrap`}>
            {issue.labels.filter((id) => labels[id]).length ? (
              issue.labels.map((id) => labels[id] && <LabelChip key={id} label={labels[id]} />)
            ) : (
              <span className="text-muted-foreground">Add labels</span>
            )}
          </button>
        </Picker>
      </Property>
      <Property label="Project">
        <Picker placeholder="Move to project…" items={projectItems} value={issue.project} onSelect={(p) => updateIssue(issue.id, { project: p })}>
          <button type="button" className={pick}>
            {project ? (
              <>
                <span className="w-4 text-center leading-none">{project.emoji}</span> {project.name}
              </>
            ) : (
              <span className="text-muted-foreground">No project</span>
            )}
          </button>
        </Picker>
      </Property>
      <Property label="Parent">
        <Picker placeholder="Make a sub-issue of…" items={parentItems} value={issue.parent} onSelect={(p) => updateIssue(issue.id, { parent: p })}>
          <button type="button" className={pick}>
            {parent ? (
              <span className="truncate">
                <span className="text-muted-foreground">{issueRef(parent)}</span> {parent.title}
              </span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </button>
        </Picker>
      </Property>
      <Property label="Due date">
        <DueDatePicker value={issue.dueDate} onChange={(dueDate) => updateIssue(issue.id, { dueDate })}>
          <button type="button" className={pick}>
            {issue.dueDate ? (
              <DueChip day={issue.dueDate} closed={isClosed(issue)} className="border-0 px-0 text-[15px]" />
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </button>
        </DueDatePicker>
      </Property>
      <Property label="Estimate">
        <Picker placeholder="Estimate…" items={estimateItems(issue.estimate)} value={issue.estimate ?? null} onSelect={(estimate) => updateIssue(issue.id, { estimate })}>
          <button type="button" className={pick}>
            {issue.estimate != null ? (
              <>
                <EstimateIcon /> {estimateName(issue.estimate)}
              </>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </button>
        </Picker>
      </Property>
      <Property label="Subscribers">
        <Picker multiple placeholder="Who hears about it…" items={followerItems} value={followerList} onSelect={(logins) => setFollowers(issue.id, logins)}>
          <button type="button" className={pick}>
            {followerList.length ? (
              <>
                <span className="flex -space-x-1.5">
                  {followerList.slice(0, 5).map((l) => (
                    <PersonAvatar key={l} person={people[l]} login={l} className="ring-2 ring-background" />
                  ))}
                </span>
                <span className="text-muted-foreground tabular-nums">{followerList.length}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No one</span>
            )}
          </button>
        </Picker>
      </Property>
      {teams.length > 1 && (
        <Property label="Team">
          <Picker
            placeholder="Move to team…"
            items={teams.map((t) => ({ value: t.key, label: t.name, icon: <span className="w-4 text-center leading-none">{t.emoji}</span> }))}
            value={issue.team}
            onSelect={(key) => {
              const moved = moveIssueToTeam(issue.id, key)
              if (moved && moved.team !== issue.team) navigate(`/issue/${issueRef(moved)}`, { replace: true })
            }}
          >
            <button type="button" className={pick}>
              <span className="w-4 text-center leading-none">{team?.emoji}</span> {team?.name}
            </button>
          </Picker>
        </Property>
      )}
    </div>
    <p className={cn('px-2 text-xs text-muted-foreground', stacked ? 'mt-3' : 'mt-8')}>
      Created {shortDate(issue.createdAt)} by {people[issue.createdBy]?.name ?? issue.createdBy}
      <br />
      Last changed {shortDate(issue.updatedAt)}
    </p>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1">
      <article className="min-w-0 flex-1 overflow-y-auto px-4 py-6 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-3xl">
          {parent && (
            <Link href={`/issue/${issueRef(parent)}`} className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <StatusIcon status={parent.status} /> Sub-issue of {issueRef(parent)} {parent.title}
            </Link>
          )}
          <div className="flex items-start gap-2">
            <TitleField key={issue.id} id={issue.id} value={issue.title} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={following ? 'Unsubscribe' : 'Subscribe'} aria-pressed={following} onClick={() => subscribe(issue.id, !following)}>
                  {following ? <Bell /> : <BellOff className="text-muted-foreground" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{following ? 'You hear about comments and status changes. Click to stop.' : 'Hear about comments and status changes'}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard.writeText(`${location.origin}${location.pathname}#/issue/${issueRef(issue)}`).then(() => toast('Link copied'))
                  }}
                >
                  <Link2 /> Copy link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const n = archiveIssues([issue.id])
                    toast(`Archived ${issueRef(issue)}${n > 1 ? ` and ${n - 1} sub-issue${n > 2 ? 's' : ''}` : ''}`, {
                      description: 'It’s out of every list. You can still open it from here or from search.',
                    })
                  }}
                >
                  <Archive /> Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete issue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {stacked && <div className="mt-4 rounded-lg border px-2 py-2">{properties}</div>}
          <Editor key={issue.id} value={issue.description} onChange={(description) => updateIssue(issue.id, { description })} className="mt-4" />

          <SubIssues issue={issue} />
          <Comments issue={issue} />
        </div>
      </article>

      {!stacked && <aside className="w-80 shrink-0 overflow-y-auto border-l px-5 py-8">{properties}</aside>}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Delete {issueRef(issue)}?</DialogTitle>
          <DialogDescription>“{issue.title}” and its comments will be removed for everyone. Its sub-issues stay.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const back = `/team/${issue.team}/issues`
                deleteIssue(issue.id)
                setConfirmDelete(false)
                navigate(back, { replace: true })
                toast(`Deleted ${issueRef(issue)}`)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
