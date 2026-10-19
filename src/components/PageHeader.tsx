/** The top of a view's or project's page: emoji, name and description, all edited in place, plus a ⋯ menu. */
import type { ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/ui/dropdown-menu'
import { EmojiPicker } from './EmojiPicker'
import { InlineText } from './InlineText'

interface Props {
  emoji: string
  onEmoji: (emoji: string) => void
  name: string
  onName: (name: string) => void
  description: string
  onDescription: (text: string) => void
  /** what kind of thing it is, for labels ("view", "project") */
  kind: string
  /** items for the ⋯ menu */
  menu?: ReactNode
  /** more under the description, e.g. a project's properties */
  children?: ReactNode
  /** beside the description, on the right (the Filter, Display and List / Board buttons) */
  aside?: ReactNode
}

const editable = '-mx-2 rounded-md px-2 hover:bg-accent/50 focus:bg-accent/50'

export function PageHeader({ emoji, onEmoji, name, onName, description, onDescription, kind, menu, children, aside }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <EmojiPicker value={emoji} onChange={onEmoji} label={`Change the ${kind}'s emoji`} />
        {/* a light background on hover shows the name can be changed in place */}
        <InlineText value={name} onSave={onName} label={`${kind[0].toUpperCase()}${kind.slice(1)} name`} required className={`${editable} text-2xl font-semibold`} />
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* the buttons line up with the description; on a narrow screen they wrap below it */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <InlineText value={description} onSave={onDescription} label="Description" placeholder="Add a description…" lines="many" className={`${editable} text-[15px] text-muted-foreground`} />
          {children}
        </div>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
    </div>
  )
}
