/**
 * The new issue dialog (C anywhere, the pencil in the sidebar, or + on a group). Only the title is needed;
 * properties are optional chips. ⌘/Ctrl + Enter creates. "Create more" keeps the dialog open for the next one.
 */
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { Box, CalendarClock, CircleSlash, Tag } from 'lucide-react'
import { PersonAvatar } from '@/components/Avatar'
import { Picker } from '@/components/Picker'
import { createIssue, createLabel, type NewIssue } from '@/data/actions'
import { issueRef, useData } from '@/data/store'
import { Editor } from '@/editor/LazyEditor'
import { PRIORITY_NAMES, statusOf } from '@/model/status'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog'
import { useComposer } from './composer'
import { PriorityIcon, StatusIcon } from './icons'
import { DueDatePicker, EstimateIcon } from './DueDate'
import { dayName, estimateName } from './format'
import { estimateItems, priorityItems, useLabelItems, useParentItems, usePeopleItems, useProjectItems, useStatusItems } from './pickers'

const chip =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm text-foreground/90 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent/60'

type Draft = Required<Omit<NewIssue, 'description'>> & { description: string }

function fresh(d: Partial<NewIssue>, fallbackTeam: string): Draft {
  return {
    team: d.team ?? fallbackTeam,
    title: d.title ?? '',
    description: d.description ?? '',
    status: d.status ?? 'todo',
    priority: d.priority ?? 0,
    assignee: d.assignee ?? null,
    labels: d.labels ?? [],
    project: d.project ?? null,
    parent: d.parent ?? null,
    dueDate: d.dueDate ?? null,
    estimate: d.estimate ?? null,
  }
}

/** what was typed into a dialog that was closed without creating (Esc, a click outside): it comes back next time */
let unsent: { title: string; description: string } | null = null
const keepUnsent = (title: string, description: string) => (unsent = title.trim() || description.trim() ? { title, description } : null)

function Composer() {
  const [, navigate] = useLocation()
  const defaults = useComposer((s) => s.defaults)
  const teams = useData(useShallow((s) => Object.values(s.teams)))
  const people = useData((s) => s.people)
  const labels = useData((s) => s.labels)
  const projects = useData((s) => s.projects)
  const issues = useData((s) => s.issues)
  const [draft, setDraft] = useState<Draft>(() => {
    const d = fresh(defaults, teams[0]?.key ?? '')
    // opened for something specific (a sub-issue with its title): the unsent text waits for a plain "new issue"
    if (!unsent || defaults.title) return d
    const back = { ...d, title: unsent.title, description: unsent.description }
    unsent = null
    return back
  })
  // the editor's latest text, kept as you type (it hands it over a moment later, or as the dialog closes)
  const typed = useRef({ title: draft.title, description: draft.description })
  const [startedWith] = useState(draft.description)
  /** created and closing: nothing is left over */
  const created = useRef(false)
  const [more, setMore] = useState(false)
  // the editor keeps its own text; a new key empties it after "create more"
  const [round, setRound] = useState(0)
  const statusItems = useStatusItems(draft.team)
  const peopleItems = usePeopleItems()
  const labelItems = useLabelItems()
  const projectItems = useProjectItems(draft.team)
  const parentItems = useParentItems(undefined, draft.team)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const team = teams.find((t) => t.key === draft.team)

  /** `description`: the editor's text at ⌘Enter, which may be newer than the draft */
  function submit(description?: string) {
    if (!draft.title.trim() || !team) return
    const issue = createIssue(description === undefined ? draft : { ...draft, description })
    typed.current = { title: '', description: '' }
    unsent = null
    created.current = !more
    toast(`Created ${issueRef(issue)}`, { description: issue.title, action: { label: 'Open', onClick: () => navigate(`/issue/${issueRef(issue)}`) } })
    if (more) {
      setDraft((d) => ({ ...d, title: '', description: '' }))
      setRound((r) => r + 1)
    } else useComposer.setState({ open: false })
  }

  const assignee = draft.assignee ? people[draft.assignee] : undefined
  const project = draft.project ? projects[draft.project] : undefined
  const parent = draft.parent ? issues[draft.parent] : undefined

  return (
    <DialogContent
      className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-2xl"
      onOpenAutoFocus={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // ⌘/Ctrl + Enter creates, wherever focus is in the dialog (unless the title or the editor already did)
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
          e.preventDefault()
          submit()
        }
      }}
    >
      <div className="flex items-center gap-2 px-5 pt-4 text-sm text-muted-foreground">
        {teams.length > 1 ? (
          <Picker
            placeholder="Team…"
            items={teams.map((t) => ({ value: t.key, label: t.name, icon: <span className="w-4 text-center">{t.emoji}</span> }))}
            value={draft.team}
            onSelect={(key) => set({ team: key, project: null, parent: null })}
          >
            <button type="button" className={chip}>
              {team?.emoji} {team?.name}
            </button>
          </Picker>
        ) : (
          <span>
            {team?.emoji} {team?.name}
          </span>
        )}
        <span>›</span>
        <DialogTitle className="text-sm font-normal">New issue</DialogTitle>
        <DialogDescription className="sr-only">Give the issue a title. Everything else is optional.</DialogDescription>
      </div>
      <div className="px-5 pt-3">
        <textarea
          autoFocus
          value={draft.title}
          onChange={(e) => {
            const title = e.target.value.replace(/\n/g, ' ')
            set({ title })
            typed.current.title = title
            keepUnsent(title, typed.current.description)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.metaKey || e.ctrlKey) submit()
              else (e.currentTarget.closest('[role=dialog]')?.querySelector('.tiptap-editor') as HTMLElement | null)?.focus()
            }
          }}
          rows={1}
          placeholder="Issue title"
          aria-label="Title"
          className="field-sizing-content w-full resize-none bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/70"
        />
        <Editor
          key={round}
          value={round === 0 ? startedWith : ''}
          onChange={(description) => {
            set({ description })
            typed.current.description = description
            if (!created.current) keepUnsent(typed.current.title, description)
          }}
          onSubmit={submit} className="mt-2 max-h-[40vh] min-h-20 overflow-y-auto" />
      </div>
      <div className="flex flex-wrap gap-2 px-5 pt-3 pb-4">
        <Picker placeholder="Status…" items={statusItems} value={draft.status} onSelect={(status) => set({ status })}>
          <button type="button" className={chip}>
            <StatusIcon status={draft.status} /> {statusOf(draft.status).name}
          </button>
        </Picker>
        <Picker placeholder="Priority…" items={priorityItems} value={draft.priority} onSelect={(priority) => set({ priority })}>
          <button type="button" className={chip}>
            <PriorityIcon priority={draft.priority} /> {draft.priority ? PRIORITY_NAMES[draft.priority] : 'Priority'}
          </button>
        </Picker>
        <Picker placeholder="Assign to…" items={peopleItems} value={draft.assignee} onSelect={(a) => set({ assignee: a })}>
          <button type="button" className={chip}>
            <PersonAvatar person={assignee} login={draft.assignee} className="size-4 text-[7px]" /> {assignee?.name ?? 'Assignee'}
          </button>
        </Picker>
        <Picker
          multiple
          placeholder="Labels…"
          items={labelItems}
          value={draft.labels}
          onSelect={(ids) => set({ labels: ids })}
          onCreate={(name) => set({ labels: [...draft.labels, createLabel(name).id] })}
          createLabel={(name) => `Create label “${name}”`}
        >
          <button type="button" className={chip}>
            {draft.labels.length ? (
              draft.labels.map((id) => labels[id] && <span key={id} className="size-2 rounded-full" style={{ background: labels[id].color }} />)
            ) : (
              <Tag className="size-3.5" />
            )}
            {draft.labels.length === 1 ? labels[draft.labels[0]]?.name : draft.labels.length ? `${draft.labels.length} labels` : 'Labels'}
          </button>
        </Picker>
        <Picker placeholder="Project…" items={projectItems} value={draft.project} onSelect={(p) => set({ project: p })}>
          <button type="button" className={chip}>
            {project ? <span>{project.emoji}</span> : <Box className="size-3.5" />} {project?.name ?? 'Project'}
          </button>
        </Picker>
        <Picker placeholder="Sub-issue of…" items={parentItems} value={draft.parent} onSelect={(p) => set({ parent: p })}>
          <button type="button" className={chip}>
            <CircleSlash className="size-3.5" /> {parent ? `Sub-issue of ${issueRef(parent)}` : 'Parent'}
          </button>
        </Picker>
        <DueDatePicker value={draft.dueDate} onChange={(dueDate) => set({ dueDate })}>
          <button type="button" className={chip}>
            <CalendarClock className="size-3.5" /> {draft.dueDate ? `Due ${dayName(draft.dueDate)}` : 'Due date'}
          </button>
        </DueDatePicker>
        <Picker placeholder="Estimate…" items={estimateItems(draft.estimate)} value={draft.estimate} onSelect={(estimate) => set({ estimate })}>
          <button type="button" className={chip}>
            <EstimateIcon /> {draft.estimate != null ? estimateName(draft.estimate) : 'Estimate'}
          </button>
        </Picker>
      </div>
      <div className="flex items-center gap-3 border-t px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} className="accent-foreground" />
          Create more
        </label>
        <span className="ml-auto text-xs text-muted-foreground">⌘ Enter</span>
        <Button onClick={() => submit()} disabled={!draft.title.trim() || !team}>
          Create issue
        </Button>
      </div>
    </DialogContent>
  )
}

export function NewIssueDialog() {
  const open = useComposer((s) => s.open)
  const defaults = useComposer((s) => s.defaults)
  return (
    <Dialog open={open} onOpenChange={(o) => useComposer.setState({ open: o })}>
      {/* a fresh form every time it opens, with that moment's presets */}
      {open && <Composer key={JSON.stringify(defaults)} />}
    </Dialog>
  )
}
