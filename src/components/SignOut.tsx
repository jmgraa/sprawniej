/**
 * Signing out, the safe way: changes still waiting are sent first, and if some can't be (offline, or another
 * workspace changed earlier), we say so before the browser's copies are wiped.
 */
import { useState } from 'react'
import { signOutEverywhere } from '@/app/signOut'
import { useSession } from '@/session'
import { workspace } from '@/sync/engine'
import { unsavedElsewhere } from '@/sync/local'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/ui/dialog'

/** `then` = where to land after signing out (default: the welcome screen) */
export function useSignOut(then?: string) {
  /** what isn't saved yet: 'here' = the open workspace, else the other workspaces with changes still waiting */
  const [unsaved, setUnsaved] = useState<'here' | string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function signOut(force = false) {
    setBusy(true)
    const ws = workspace()
    if (!force) {
      if (ws?.hasUnsaved) await ws.flush()
      // signing out wipes every workspace's copy in this browser, including changes made elsewhere and not saved yet
      const waiting = ws?.hasUnsaved ? 'here' : await unsavedElsewhere(useSession.getState().workspace ?? undefined)
      if (waiting === 'here' || waiting.length) {
        setBusy(false)
        setUnsaved(waiting)
        return
      }
    }
    await signOutEverywhere(then)
  }

  const dialog = (
    <Dialog open={!!unsaved} onOpenChange={(open) => !open && setUnsaved(null)}>
      <DialogContent>
        <DialogTitle>Some changes haven't been saved to GitHub yet</DialogTitle>
        <DialogDescription>
          {unsaved === 'here' || !unsaved
            ? 'You seem to be offline. If you sign out now, those changes are lost. Connect to the internet and wait for "Saved" first.'
            : `You changed ${unsaved.length === 1 ? 'another workspace' : 'other workspaces'} (${unsaved.join(', ')}) and those changes haven't reached GitHub. If you sign out now, they are lost. Open ${unsaved.length === 1 ? 'it' : 'each one'} while online and wait for "Saved" first.`}
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUnsaved(null)}>
            Stay signed in
          </Button>
          <Button variant="destructive" onClick={() => void signOut(true)}>
            Sign out anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { signOut: () => void signOut(), busy, dialog }
}
