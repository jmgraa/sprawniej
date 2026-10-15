/** "Update available" in the top bar, next to the save chip, from the moment a new version is ready (src/app/updates.ts). */
import { CircleArrowUp, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { applyUpdate, useUpdate } from './updates'

export function UpdateButton() {
  const { ready, applying } = useUpdate()
  if (!ready) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          disabled={applying}
          className="flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm text-foreground hover:bg-accent disabled:opacity-70"
          aria-label="Update available: switch to the new version of Sprawniej"
        >
          {applying ? <Loader2 className="size-4 animate-spin" /> : <CircleArrowUp className="size-4" />}
          <span className="hidden sm:inline">{applying ? 'Updating…' : 'Update available'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">A new version of Sprawniej is ready. Your changes are saved first, then the page reloads.</TooltipContent>
    </Tooltip>
  )
}
