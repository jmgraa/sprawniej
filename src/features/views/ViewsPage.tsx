/**
 * The list of saved views: emoji, name, description, owner. "New view" makes one. Each row's emoji can be changed
 * in place, and its ⋯ menu renames or deletes the view (the view's own page edits everything too).
 */
import { useState } from 'react'
import { Link, useParams } from 'wouter'
import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCrumbs } from '@/app/chrome'
import { PersonAvatar } from '@/components/Avatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmojiPicker } from '@/components/EmojiPicker'
import { EmptyState } from '@/components/EmptyState'
import { InlineText } from '@/components/InlineText'
import { deleteView, updateView } from '@/data/actions'
import { useData } from '@/data/store'
import type { Person, View } from '@/model/schema'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { NewViewDialog } from './NewViewDialog'

function ViewRow({ view, owner }: { view: View; owner?: Person }) {
  const [renaming, setRenaming] = useState(false)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="group flex items-center gap-4 rounded-md px-4 py-2 hover:bg-accent/60">
      <EmojiPicker value={view.emoji} onChange={(emoji) => updateView(view.id, { emoji })} label={`Change the emoji of ${view.name}`} className="size-9 border-transparent text-lg hover:border-border" />
      {renaming ? (
        <span className="min-w-0 flex-1 py-1">
          <InlineText value={view.name} onSave={(name) => updateView(view.id, { name })} label="View name" required autoFocus onDone={() => setRenaming(false)} className="text-[15px] font-medium" />
        </span>
      ) : (
        <Link href={`/view/${view.id}`} className="min-w-0 flex-1 py-1">
          <span className="block truncate text-[15px] font-medium">{view.name}</span>
          {view.description && <span className="block truncate text-sm text-muted-foreground">{view.description}</span>}
        </Link>
      )}
      <span className="hidden w-56 items-center gap-2 truncate text-[15px] sm:flex">
        <PersonAvatar person={owner} login={view.owner} />
        <span className="truncate">{owner?.name ?? view.owner}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${view.name}`} className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
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
            <Trash2 /> Delete view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete “${view.name}”?`} confirm="Delete view" onConfirm={() => deleteView(view.id)}>
        The view goes away for everyone. Its issues stay as they are.
      </ConfirmDialog>
    </div>
  )
}

export function ViewsPage() {
  const { key } = useParams<{ key?: string }>()
  const team = useData((s) => (key ? s.teams[key] : undefined))
  const views = useData(useShallow((s) => Object.values(s.views).filter((v) => (key ? v.team === key : true))))
  const people = useData((s) => s.people)
  useCrumbs(team ? [{ label: `${team.emoji} ${team.name}` }, { label: 'Views' }] : [{ label: 'Views' }])
  const [creating, setCreating] = useState(false)
  const sorted = [...views].sort((a, b) => a.name.localeCompare(b.name))
  const dialog = creating && <NewViewDialog open onOpenChange={setCreating} preset={{ team: key ?? null }} />
  const newButton = (
    <Button variant="outline" onClick={() => setCreating(true)}>
      <Plus /> New view
    </Button>
  )
  if (!sorted.length) {
    return (
      <>
        <EmptyState icon={<Layers />} title="No views yet" action={newButton}>
          A view is a saved filter with its own emoji, for example “🐞 Open bugs”. Make one here, or filter any list of issues and press Save as view.
        </EmptyState>
        {dialog}
      </>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6">
      <div className="mb-4 flex justify-end">{newButton}</div>
      <div className="flex h-10 items-center border-b px-4 text-sm text-muted-foreground">
        <span>Name</span>
        <span className="ml-auto hidden w-56 sm:block">Owner</span>
        <span className="w-8" />
      </div>
      {sorted.map((v) => (
        <ViewRow key={v.id} view={v} owner={people[v.owner]} />
      ))}
      {dialog}
    </div>
  )
}
