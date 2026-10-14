/**
 * The last safety net: if a screen fails to draw, show a way out instead of a blank page. The usual cause is a part
 * of the app that couldn't be downloaded (offline, or a tab left open across a new version), which a reload fixes.
 * Your changes are already kept on this device, so reloading loses nothing.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/ui/button'

const RELOADED = 'sprawniej:reloaded-for-update'

const isMissingPart = (e: unknown) => /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported/i.test(String((e as Error)?.message ?? e))

export class Crash extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Sprawniej couldn’t show this screen', error, info.componentStack)
    // a newer version is out and this tab still asks for the old one's parts: one quiet reload picks up the new one
    if (isMissingPart(error) && navigator.onLine && !sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, '1')
      location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const offline = !navigator.onLine
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md rounded-xl border p-6">
          <h1 className="text-lg font-semibold">This screen didn’t load</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {offline
              ? 'You seem to be offline, and this part of Sprawniej hasn’t been opened on this device yet. Connect to the internet and reload.'
              : 'Reloading usually fixes it. Your changes are kept on this device, so nothing is lost.'}
          </p>
          <Button className="mt-5" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
