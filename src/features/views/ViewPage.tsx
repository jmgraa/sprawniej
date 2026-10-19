/**
 * One saved view. Its name, emoji, description, filters and display belong to the view, so changing them here
 * changes the view for everyone (and saves by itself).
 */
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbs } from '@/app/chrome'
import { NotFound } from '@/app/NotFound'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { deleteView, updateView } from '@/data/actions'
import { useData } from '@/data/store'
import { IssuesView } from '@/features/issues/IssuesView'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/dropdown-menu'

export function ViewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const view = useData((s) => s.views[id])
  const team = useData((s) => (view?.team ? s.teams[view.team] : undefined))
  const owner = useData((s) => (view ? s.people[view.owner] : undefined))
  const [confirmDelete, setConfirmDelete] = useState(false)
  useCrumbs(
    view
      ? [...(team ? [{ label: `${team.emoji} ${team.name}`, href: `/team/${team.key}/issues` }] : []), { label: 'Views', href: team ? `/team/${team.key}/views` : '/views' }, { label: `${view.emoji} ${view.name}` }]
      : [],
  )
  if (!view) return <NotFound />
  const back = team ? `/team/${team.key}/views` : '/views'

  return (
    <>
      <IssuesView
        key={view.id}
        page={`view:${view.id}`}
        filters={view.team ? { teams: [view.team] } : {}}
        hideFilters={view.team ? ['teams'] : undefined}
        saved={{
          filters: view.filters,
          display: view.display,
          onFilters: (filters) => updateView(view.id, { filters }),
          onDisplay: (patch) => updateView(view.id, { display: { ...view.display, ...patch } }),
        }}
        header={(tools) => (
          <PageHeader
            aside={tools}
            kind="view"
            emoji={view.emoji}
            onEmoji={(emoji) => updateView(view.id, { emoji })}
            name={view.name}
            onName={(name) => updateView(view.id, { name })}
            description={view.description}
            onDescription={(description) => updateView(view.id, { description })}
            menu={
              <>
                <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(location.href).then(() => toast('Link copied'))}>
                  <Link2 /> Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete view
                </DropdownMenuItem>
              </>
            }
          >
            <p className="text-sm text-muted-foreground">
              {team ? `${team.emoji} ${team.name}` : 'Whole workspace'} · made by {owner?.name ?? view.owner} · changes here change the view for everyone
            </p>
          </PageHeader>
        )}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${view.name}”?`}
        confirm="Delete view"
        onConfirm={() => {
          deleteView(view.id)
          navigate(back, { replace: true })
          toast(`Deleted the view ${view.emoji} ${view.name}`)
        }}
      >
        The view goes away for everyone. Its issues stay as they are.
      </ConfirmDialog>
    </>
  )
}
