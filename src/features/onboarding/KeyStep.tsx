/**
 * "Make your key": the one technical step, made as gentle as we can. A button opens GitHub's token page with
 * everything filled in; three small pictures show what to do there; the pasted key is checked straight away and
 * problems are explained in plain words. We say "GitHub key", never "token" (CLAUDE.md, writing).
 */
import { useState, type ReactNode } from 'react'
import { ArrowDown, Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { checkKey, isBadKey, isOffline, MAKE_KEY_URL, plainError, toPerson } from '@/github/api'
import type { Person } from '@/model/schema'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Problem } from './Step'

function Picture({ n, caption, children }: { n: number; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex h-24 flex-col justify-center gap-1.5 overflow-hidden rounded-lg border bg-[#0d1117] p-3" aria-hidden>
        {children}
      </div>
      <figcaption className="text-sm text-muted-foreground">
        <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-foreground">{n}</span>
        {caption}
      </figcaption>
    </figure>
  )
}

const line = (w: string) => <span className="h-1.5 rounded-full bg-white/15" style={{ width: w }} />

export function KeyPictures() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Picture n={1} caption="Scroll to the bottom of the page">
        {line('80%')}
        {line('60%')}
        {line('70%')}
        <ArrowDown className="mx-auto size-5 animate-bounce text-white/70" />
      </Picture>
      <Picture n={2} caption={<>Press the green <b className="text-foreground">Generate token</b> button</>}>
        {line('50%')}
        <span className="mt-1 w-fit rounded-md bg-[#238636] px-2 py-1 text-[10px] font-semibold text-white ring-2 ring-[#3fb950] ring-offset-2 ring-offset-[#0d1117]">
          Generate token
        </span>
      </Picture>
      <Picture n={3} caption="Copy the key it shows you">
        <span className="flex items-center gap-1.5 rounded-md border border-[#3fb950]/50 bg-[#3fb950]/10 px-2 py-1.5 font-mono text-[10px] text-white/80">
          ghp_••••••••••
          <Copy className="ml-auto size-3 text-white" />
        </span>
      </Picture>
    </div>
  )
}

function explain(e: unknown): string {
  if (isBadKey(e)) return 'GitHub doesn’t recognise this key. Copy it again from GitHub; it starts with “ghp_”.'
  if (isOffline(e)) return 'You seem to be offline. Connect to the internet and try again.'
  return plainError(e)
}

/** Calls `onDone` with the key and who it belongs to, once the key is good. */
export function KeyStep({ onDone, intro }: { onDone: (token: string, me: Person) => void; intro?: ReactNode }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string>()

  async function check(value: string) {
    const k = value.trim()
    setProblem(undefined)
    if (!k) return
    if (k.startsWith('github_pat_')) {
      setProblem('This is a “fine-grained” key. Sprawniej needs a classic one: press “Open GitHub” above, it opens the right page.')
      return
    }
    setBusy(true)
    try {
      const { user, hasRepoScope } = await checkKey(k)
      if (!hasRepoScope) {
        setProblem('This key can’t open private workspaces. Make a new one with “Open GitHub” above; the right box is ticked for you.')
        return
      }
      onDone(k, toPerson(user))
    } catch (e) {
      setProblem(explain(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {intro ?? (
        <p>
          A GitHub key lets Sprawniej save your work to GitHub for you. You make it once, on GitHub, and paste it here. It stays in this browser.
        </p>
      )}
      <Button asChild size="lg" className="w-fit">
        <a href={MAKE_KEY_URL} target="_blank" rel="noreferrer">
          Open GitHub <ExternalLink />
        </a>
      </Button>
      <KeyPictures />
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void check(key)
        }}
      >
        <label htmlFor="github-key" className="text-sm font-medium">
          Paste your key here
        </label>
        <div className="flex gap-2">
          <Input
            id="github-key"
            type="password"
            value={key}
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_…"
            className="h-10 font-mono"
            onChange={(e) => setKey(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (text) {
                e.preventDefault()
                setKey(text.trim())
                void check(text)
              }
            }}
          />
          <Button type="submit" size="lg" variant="outline" disabled={busy || !key.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Check
          </Button>
        </div>
        <Problem>{problem}</Problem>
      </form>
    </div>
  )
}
