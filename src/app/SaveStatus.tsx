/** The small save chip in the top bar. Everyday words only: never commit, push or merge (CLAUDE.md, writing). */
import { CloudAlert, CloudCheck, CloudOff, KeyRound, Loader2 } from 'lucide-react'
import { useSync } from '@/sync/engine'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function SaveStatus() {
  const { state, detail, pending } = useSync()
  const view = {
    loading: { icon: <Loader2 className="size-4 animate-spin" />, label: 'Loading…', tip: 'Getting the latest from your team.' },
    saving: {
      icon: <Loader2 className="size-4 animate-spin" />,
      label: 'Saving…',
      tip: `Your changes are safe on this device and on their way to your team.${detail ? ` ${detail}` : ''}`,
    },
    saved: { icon: <CloudCheck className="size-4" />, label: 'Saved', tip: 'Everything is saved, and your team can see it.' },
    offline: {
      icon: <CloudOff className="size-4" />,
      label: 'Offline',
      tip: pending ? 'You’re offline. Your changes are safe on this device and will be saved when you’re back online.' : 'You’re offline. Changes you make are kept on this device.',
    },
    error: { icon: <CloudAlert className="size-4 text-urgent" />, label: 'Not saved yet', tip: `Your changes are safe on this device. We’ll keep trying.${detail ? ` ${detail}` : ''}` },
    'bad-key': { icon: <KeyRound className="size-4 text-urgent" />, label: 'Key expired', tip: 'Your GitHub key stopped working. Make a new one to keep saving.' },
  }[state]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite" data-state={state} data-tour="saved">
          {view.icon}
          <span className="hidden sm:inline">{view.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{view.tip}</TooltipContent>
    </Tooltip>
  )
}
