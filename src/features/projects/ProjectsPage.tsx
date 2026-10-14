/** Projects: name with emoji, status, lead, target date and how much is done. "New project" starts one. */
import { useState } from 'react'
import { Link, useParams } from 'wouter'
import { Box, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCrumbs } from '@/app/chrome'
import { PersonAvatar } from '@/components/Avatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmojiPicker } from '@/components/EmojiPicker'
import { EmptyState } from '@/components/EmptyState'
import { InlineText } from '@/components/InlineText'
import { deleteProject, updateProject } from '@/data/actions'
import { projectProgress } from '@/data/select'
import { useData } from '@/data/store'
import { shortDate } from '@/features/issues/format'
import type { Person, Project } from '@/model/schema'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { NewProjectDialog } from './NewProjectDialog'
import { StatusDot } from './ProjectProperties'
import { useProgressIssues } from './useProjectIssues'
import { PROJECT_STATUS_NAMES } from './status'

/** one project in the list: its emoji changes in place, and ⋯ renames or deletes it */
function ProjectRow({ project: p, pct, lead }: { project: Project; pct: number; lead?: Person }) {
  const [renaming, setRenaming] = useState(false)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="group flex items-center gap-4 rounded-md px-4 py-1.5 text-[15px] hover:bg-accent/60">
      <EmojiPicker value={p.emoji} onChange={(emoji) => updateProject(p.id, { emoji })} label={`Change the emoji of ${p.name}`} className="size-9 border-transparent text-lg hover:border-border" />
      {renaming ? (
        <span className="min-w-0 flex-1">
          <InlineText value={p.name} onSave={(name) => updateProject(p.id, { name })} label="Project name" required autoFocus onDone={() => setRenaming(false)} className="font-medium" />
        </span>
      ) : (
        <Link href={`/project/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-1.5">
          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
          <span className="flex w-32 items-center gap-2 text-muted-foreground">
            <StatusDot status={p.status} /> {PROJECT_STATUS_NAMES[p.status]}
          </span>
          <span className="flex w-44 items-center gap-2 truncate">
            {p.lead ? (
              <>
                <PersonAvatar person={lead} login={p.lead} />
                <span className="truncate">{lead?.name ?? p.lead}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No lead</span>
            )}
          </span>
          <span className="w-28 text-muted-foreground">{p.targetDate ? shortDate(p.targetDate) : '–'}</span>
          <span className="flex w-40 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-status-done" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-10 text-right text-sm text-muted-foreground tabular-nums">{pct}%</span>
          </span>
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${p.name}`} className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        {/* focus goes to the name field (or the dialog) next, not back to this button */}
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true))}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete “${p.name}”?`} confirm="Delete project" onConfirm={() => deleteProject(p.id)}>
        The project goes away for everyone. Its issues stay, just without a project.
      </ConfirmDialog>
    </div>
  )
}

export function ProjectsPage() {
  const { key } = useParams<{ key?: string }>()
  const team = useData((s) => (key ? s.teams[key] : undefined))
  const projects = useData(useShallow((s) => Object.values(s.projects).filter((p) => (key ? p.teams.includes(key) : true))))
  const issues = useProgressIssues()
  const people = useData((s) => s.people)
  useCrumbs(team ? [{ label: `${team.emoji} ${team.name}` }, { label: 'Projects' }] : [{ label: 'Projects' }])
  const [creating, setCreating] = useState(false)
  const dialog = creating && <NewProjectDialog onOpenChange={setCreating} team={key} />
  const newButton = (
    <Button variant="outline" onClick={() => setCreating(true)}>
      <Plus /> New project
    </Button>
  )
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name))
  if (!sorted.length) {
    return (
      <>
        <EmptyState icon={<Box />} title="No projects yet" action={newButton}>
          A project is a bigger goal made of several issues, like “New onboarding”. It shows how much is done.
        </EmptyState>
        {dialog}
      </>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6">
      <div className="mb-4 flex justify-end">{newButton}</div>
      <div className="flex h-10 items-center gap-4 border-b px-4 text-sm text-muted-foreground">
        <span className="flex-1 pl-12">Name</span>
        <span className="w-32">Status</span>
        <span className="w-44">Lead</span>
        <span className="w-28">Target date</span>
        <span className="w-40">Progress</span>
        <span className="w-8" />
      </div>
      {sorted.map((p) => {
        const { done, total } = projectProgress(p.id, issues)
        const pct = total ? Math.round((done / total) * 100) : 0
        return (
          <ProjectRow key={p.id} project={p} pct={pct} lead={p.lead ? people[p.lead] : undefined} />
        )
      })}
      {dialog}
    </div>
  )
}
