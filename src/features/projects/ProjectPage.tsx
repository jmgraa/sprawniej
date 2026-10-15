/** One project: its details (edited in place), how far along it is, and its issues. */
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { Link2, Plus, SquareStack, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbs } from '@/app/chrome'
import { NotFound } from '@/app/NotFound'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { deleteProject, updateProject } from '@/data/actions'
import { projectProgress } from '@/data/select'
import { useData } from '@/data/store'
import { openComposer } from '@/features/issues/composer'
import { IssuesView } from '@/features/issues/IssuesView'
import { Button } from '@/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/dropdown-menu'
import { ProjectProperties } from './ProjectProperties'
import { useProgressIssues } from './useProjectIssues'

export function ProjectPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const project = useData((s) => s.projects[id])
  const issues = useProgressIssues(id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useCrumbs(project ? [{ label: 'Projects', href: '/projects' }, { label: `${project.emoji} ${project.name}` }] : [])
  if (!project) return <NotFound />
  const { done, total } = projectProgress(project.id, issues)
  // every issue in it, canceled ones too (progress leaves those out)
  const inProject = Object.values(issues).filter((i) => i.project === project.id).length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <>
      <IssuesView
        key={project.id}
        page={`project:${project.id}`}
        filters={{ projects: [project.id] }}
        hideFilters={['projects']}
        viewScope={null}
        empty={
          <EmptyState
            icon={<SquareStack />}
            title="No issues in this project yet"
            action={
              <Button variant="outline" onClick={() => openComposer({ project: project.id, ...(project.teams.length === 1 ? { team: project.teams[0] } : {}) })}>
                <Plus /> New issue
              </Button>
            }
          >
            Add new issues here, or pick this project on any issue.
          </EmptyState>
        }
        header={
          <PageHeader
            kind="project"
            emoji={project.emoji}
            onEmoji={(emoji) => updateProject(project.id, { emoji })}
            name={project.name}
            onName={(name) => updateProject(project.id, { name })}
            description={project.description}
            onDescription={(description) => updateProject(project.id, { description })}
            menu={
              <>
                <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(location.href).then(() => toast('Link copied'))}>
                  <Link2 /> Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete project
                </DropdownMenuItem>
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              <ProjectProperties value={project} onChange={(patch) => updateProject(project.id, patch)} />
              <span className="flex items-center gap-2 text-sm text-muted-foreground" aria-label={`${pct}% done`}>
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-status-done" style={{ width: `${pct}%` }} />
                </span>
                {done} of {total} done
              </span>
            </div>
          </PageHeader>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${project.name}”?`}
        confirm="Delete project"
        onConfirm={() => {
          deleteProject(project.id)
          navigate('/projects', { replace: true })
          toast(`Deleted the project ${project.emoji} ${project.name}`)
        }}
      >
        The project goes away for everyone. {inProject === 0 ? 'It has no issues.' : <>Its {inProject === 1 ? 'issue stays' : `${inProject} issues stay`}, just without a project.</>}
      </ConfirmDialog>
    </>
  )
}
