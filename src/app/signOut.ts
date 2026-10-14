import { useData, EMPTY } from '@/data/store'
import { resetProjection } from '@/data/project'
import { useSession } from '@/session'
import { setWorkspace, workspace } from '@/sync/engine'
import { wipeAllCopies } from '@/sync/local'

/** Forget the key and every workspace copy in this browser, then start over at the welcome screen (or at `then`). */
export async function signOutEverywhere(then = '#/') {
  workspace()?.restartOtherTabs() // other tabs with this workspace start over too
  setWorkspace(null)
  await wipeAllCopies()
  resetProjection()
  useData.setState({ ...EMPTY })
  useSession.getState().signOut()
  localStorage.removeItem('sprawniej-displays')
  location.hash = then
  location.reload() // closes the open databases so the wipe can finish
}

/** Back to the workspace list. Changes still waiting are sent first (they'd otherwise wait until you open it again). */
export async function switchWorkspace() {
  await workspace()?.flush().catch(() => {})
  useSession.getState().close()
}
