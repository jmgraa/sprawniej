/**
 * New versions of Sprawniej. GitHub Pages ships a new one on every release; the browser downloads it in the
 * background (the service worker), and it would only take over once every Sprawniej tab is closed. We look for one
 * every minute and whenever you come back to the tab, then tell you: a small toast once, and an "Update available"
 * button in the top bar until you update. Nothing switches by itself: you choose when, and whatever is still waiting
 * to be saved is sent first.
 */
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import { create } from 'zustand'
import { workspace } from '@/sync/engine'

const CHECK_EVERY = 60_000

interface UpdateState {
  /** a new version is downloaded and waiting */
  ready: boolean
  /** switching to it right now (saving first) */
  applying: boolean
}

export const useUpdate = create<UpdateState>(() => ({ ready: false, applying: false }))

let registration: ServiceWorkerRegistration | undefined
let switchOver: ((reload?: boolean) => Promise<void>) | undefined

/** save what's waiting, then load the new version */
export async function applyUpdate() {
  if (useUpdate.getState().applying) return
  useUpdate.setState({ applying: true })
  // anything not saved yet stays on this device anyway; this just sends it before the page reloads
  await Promise.race([workspace()?.flush().catch(() => {}), new Promise((r) => setTimeout(r, 8_000))])
  // the new version waits in this browser: let it take over (it reloads the page). Another tab may have done that
  // already, in which case a plain reload picks it up.
  if (registration?.waiting && switchOver) await switchOver(true)
  else location.reload()
}

export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return
  let told = false
  switchOver = registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return
      registration = r
      const check = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) r.update().catch(() => {})
      }
      setInterval(check, CHECK_EVERY)
      document.addEventListener('visibilitychange', check)
      window.addEventListener('focus', check)
    },
    onNeedRefresh() {
      useUpdate.setState({ ready: true })
      if (told) return
      told = true
      toast('A new version of Sprawniej is ready', {
        description: 'It loads next time you open Sprawniej.',
        duration: 10_000,
        action: { label: 'Update now', onClick: () => void applyUpdate() },
      })
    },
    onRegisterError(e) {
      console.warn('Sprawniej couldn’t set up updates', e)
    },
  })
}
