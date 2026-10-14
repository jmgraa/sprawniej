/**
 * Keeps this browser's copy of a workspace and GitHub in step. See docs/architecture.md for the full story.
 *
 *   write()  → pending (IndexedDB) → store → save soon
 *   save     → one tree on top of GitHub's latest, one commit, move the branch; if someone saved first: pull, retry
 *   pull     → "anything new?" (free when nothing is) → changed files only → merge with pending → store
 *
 * Only one save or pull runs at a time (`lock`), and only one tab per workspace runs them: the leader (tabs.ts).
 * Other tabs are followers. They send each change to the leader and show the files it sends back.
 */
import { toast } from 'sonner'
import { create } from 'zustand'
import {
  compare,
  createCommit,
  createFirstFile,
  createTree,
  fileHistory,
  getBlobs,
  getCommit,
  getFiles,
  getHead,
  getRepo,
  GitHubError,
  isBadKey,
  isOffline,
  moveBranch,
  NotFastForward,
  type Author,
  type FileVersion,
  type RepoRef,
} from '@/github/api'
import { classify, WORKSPACE_FILE } from '@/data/files'
import { applyFiles, resetProjection } from '@/data/project'
import { EMPTY, useData } from '@/data/store'
import type { Person } from '@/model/schema'
import { LocalCopy, type Meta } from './local'
import { mergeFile, mergeIncoming } from './merge'
import { keepRecent, saveDelay } from './pace'
import { renumber } from './renumber'
import { blobSha } from './sha'
import { Tabs, type TabMsg } from './tabs'

export type SyncState = 'loading' | 'saved' | 'saving' | 'offline' | 'error' | 'bad-key'

export interface SyncStatus {
  state: SyncState
  /** what went wrong (or why we're waiting), in plain words */
  detail?: string
  /** changes not on GitHub yet */
  pending: number
  /** first download of a workspace: how far along */
  progress?: string
  /** this tab has brought in teammates' changes at least once since the workspace opened */
  synced?: boolean
}

export const useSync = create<SyncStatus>()(() => ({ state: 'loading', pending: 0 }))

const PULL_EVERY = 30_000
/** followers ask "anything new?" when they get focus; the leader answers at most this often */
const SYNC_AT_MOST_EVERY = 5_000
/** a follower waiting for the leader to save gives up after this */
const FOLLOWER_WAIT = 15_000

type WriteMsg = Extract<TabMsg, { t: 'write' }>

export class Workspace {
  private local: LocalCopy
  private meta!: Meta
  private loaded = false
  private base = new Map<string, string>()
  private pending = new Map<string, string | null>()
  private messages: string[] = []
  private etag: string | undefined
  private chain: Promise<unknown> = Promise.resolve()
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private retryDelay = 5_000
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private closed = false
  /** when recent saves happened, to save in bigger batches in a busy hour (pace.ts) */
  private saves: number[] = []
  /** GitHub asked us to wait until then */
  private pausedUntil = 0
  private lastSync = 0

  private tabs: Tabs
  /** this tab talks to GitHub; false = it sends its changes to the tab that does */
  private leader = true
  /** follower: every file, as the leader last told us */
  private view = new Map<string, string>()
  /** follower: our changes the leader hasn't confirmed yet, oldest first */
  private unconfirmed = new Map<number, WriteMsg>()
  private seq = 0
  private ready: () => void = () => {}
  private waiters = new Set<() => void>()
  private stopStatus: (() => void) | undefined

  readonly repo: RepoRef
  readonly me: Person
  private token: string

  private constructor(repo: RepoRef, token: string, me: Person) {
    this.repo = repo
    this.token = token
    this.me = me
    this.local = new LocalCopy(repo)
    this.tabs = new Tabs(`${repo.owner}/${repo.repo}`)
    this.tabs.onMessage = (m) => this.onTabMessage(m)
  }

  private get author(): Author {
    return { name: this.me.name || this.me.login, email: `${this.me.githubId}+${this.me.login}@users.noreply.github.com` }
  }

  /**
   * Open a workspace. The leading tab shows the browser copy at once (downloading it first if there is none).
   * Any other tab asks the leader for what it has.
   */
  static async open(repo: RepoRef, token: string, me: Person, signal?: AbortSignal): Promise<Workspace> {
    const ws = new Workspace(repo, token, me)
    // given up on (the screen went away) before it finished opening: let go of the lock and stop
    signal?.addEventListener('abort', () => ws.close())
    resetProjection()
    useData.setState({ ...EMPTY, me })
    useSync.setState({ state: 'loading', pending: 0, detail: undefined, progress: undefined, synced: false })
    try {
      const leads = await ws.tabs.lead(() => void ws.takeOver())
      if (leads) await ws.lead()
      else await ws.follow()
    } catch (e) {
      // a half-opened leader would keep the lock and leave every later try waiting for it
      ws.close()
      throw e
    }
    return ws
  }

  /** load the browser copy and start talking to GitHub. `shown` = what this tab shows already (taking over). */
  private async lead(shown?: Map<string, string>) {
    const snap = await this.local.load()
    this.base = snap.base
    this.pending = snap.pending
    this.messages = snap.messages
    // only now: a change made while the browser copy was loading went the follower's way (unconfirmed), and is
    // taken in below instead of landing in a `pending` that the snapshot just replaced
    this.leader = true
    if (snap.meta) this.meta = snap.meta
    else await this.lock(() => this.download())
    if (this.closed) return
    this.loaded = true

    if (shown) {
      // redraw only what differs from what this tab was showing
      const diff = new Map<string, string | null>()
      for (const p of new Set([...shown.keys(), ...this.paths()])) if ((shown.get(p) ?? null) !== this.read(p)) diff.set(p, this.read(p))
      applyFiles(diff, this.me.login)
    } else this.showAll()
    // our changes the old leader never confirmed
    for (const w of this.unconfirmed.values()) this.takeWrite(w)
    this.unconfirmed.clear()

    useSync.setState({ state: this.pending.size ? 'saving' : 'saved', pending: this.pending.size, progress: undefined })
    // the other tabs mirror our save chip
    this.stopStatus = useSync.subscribe((s) => this.tabs.post({ t: 'status', status: { state: s.state, detail: s.detail, pending: s.pending } }))
    this.tabs.post({ t: 'all', files: this.everything(), status: useSync.getState() })
    this.startPolling()
    void this.syncNow()
  }

  /** another tab leads: ask it for everything, then show what it sends */
  private follow() {
    this.leader = false
    useSync.setState({ progress: 'Opening your workspace…' })
    const ready = new Promise<void>((r) => (this.ready = r))
    this.tabs.post({ t: 'hello', from: this.tabs.id })
    this.startPolling()
    return ready
  }

  /** the leading tab closed and this one is next in line */
  private async takeOver() {
    if (this.closed) return
    this.stopPolling()
    // the follower's view stays in use until lead() has loaded, for changes made meanwhile
    await this.lead(new Map(this.view))
    this.view = new Map()
    this.ready()
  }

  close() {
    this.closed = true
    clearTimeout(this.saveTimer)
    clearTimeout(this.retryTimer)
    this.stopPolling()
    this.stopStatus?.()
    this.tabs.close()
    for (const w of this.waiters) w()
  }

  // ---------- reading ----------

  /** the file as you see it: your unsaved version if there is one, else GitHub's */
  read(path: string): string | null {
    if (!this.leader) return this.view.get(path) ?? null
    if (this.pending.has(path)) return this.pending.get(path) ?? null
    return this.base.get(path) ?? null
  }

  /** every path that currently exists */
  paths(): string[] {
    if (!this.leader) return [...this.view.keys()]
    const all = new Set([...this.base.keys(), ...this.pending.keys()])
    return [...all].filter((p) => this.read(p) !== null)
  }

  get hasUnsaved() {
    if (!this.leader) return this.unconfirmed.size > 0 || useSync.getState().pending > 0
    return this.pending.size > 0
  }

  private everything(): [string, string][] {
    return this.paths().map((p) => [p, this.read(p)!])
  }

  private showAll() {
    applyFiles(new Map(this.everything()), this.me.login)
  }

  // ---------- writing ----------

  /** Change files (null = delete). The store updates at once; GitHub gets it a moment later. */
  write(files: Map<string, string | null>, message: string, ack?: { tab: string; seq: number }) {
    if (!this.leader) return this.forward(files, message)
    for (const [path, text] of files) {
      this.pending.set(path, text)
      void this.local.putPending(path, text)
    }
    if (message && this.messages.at(-1) !== message) {
      this.messages.push(message)
      void this.local.setMessages(this.messages)
    }
    applyFiles(files, this.me.login)
    this.tabs.post({ t: 'files', files: [...files], ack })
    if (Date.now() >= this.pausedUntil) useSync.setState({ state: navigator.onLine ? 'saving' : 'offline', pending: this.pending.size, detail: undefined })
    else useSync.setState({ pending: this.pending.size })
    this.scheduleSave()
  }

  /** follower: show the change here at once and hand it to the leader */
  private forward(changes: Map<string, string | null>, message: string) {
    const files: WriteMsg['files'] = []
    for (const [path, after] of changes) {
      files.push([path, this.view.get(path) ?? null, after])
      if (after === null) this.view.delete(path)
      else this.view.set(path, after)
    }
    const w: WriteMsg = { t: 'write', from: this.tabs.id, seq: ++this.seq, files, message }
    this.unconfirmed.set(w.seq, w)
    applyFiles(changes, this.me.login)
    useSync.setState({ state: navigator.onLine ? 'saving' : 'offline', pending: Math.max(useSync.getState().pending, 1), detail: undefined })
    this.tabs.post(w)
  }

  /** leader: a follower's change. If the file moved on since that tab last saw it, merge, as with a teammate. */
  private takeWrite(w: WriteMsg) {
    const files = new Map<string, string | null>()
    for (const [path, before, after] of w.files) {
      const now = this.read(path)
      files.set(path, now === before ? after : mergeFile(path, before, after, now).text)
    }
    this.write(files, w.message, { tab: w.from, seq: w.seq })
  }

  private scheduleSave(delay = saveDelay(this.saves)) {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.syncNow(), delay)
  }

  /** save right away (leaving the page, hiding the tab) */
  flush(): Promise<void> {
    if (!this.leader) {
      this.tabs.post({ t: 'flush' })
      return this.followerSettled()
    }
    clearTimeout(this.saveTimer)
    return this.syncNow()
  }

  // ---------- other tabs ----------

  private onTabMessage(m: TabMsg) {
    if (m.t === 'restart') return location.reload()
    if (this.leader) {
      if (!this.loaded) return // lead() tells everyone once it's ready
      if (m.t === 'hello') this.tabs.post({ t: 'all', to: m.from, files: this.everything(), status: useSync.getState() })
      else if (m.t === 'write') this.takeWrite(m)
      else if (m.t === 'flush') void this.flush()
      else if (m.t === 'sync' && Date.now() - this.lastSync > SYNC_AT_MOST_EVERY) void this.syncNow()
      return
    }
    if (m.t === 'all') {
      if (m.to && m.to !== this.tabs.id) return
      const next = new Map(m.files)
      const waiting = this.waitingPaths()
      const diff = new Map<string, string | null>()
      for (const p of this.view.keys()) if (!next.has(p) && !waiting.has(p)) diff.set(p, null)
      for (const [p, t] of next) if (!waiting.has(p) && this.view.get(p) !== t) diff.set(p, t)
      for (const p of waiting) {
        const mine = this.view.get(p)
        if (mine === undefined) next.delete(p)
        else next.set(p, mine)
      }
      this.view = next
      applyFiles(diff, this.me.login)
      useSync.setState({ ...m.status, progress: undefined })
      // a new leader: send what the old one never confirmed
      if (!m.to) for (const w of this.unconfirmed.values()) this.tabs.post(w)
      this.ready()
    } else if (m.t === 'files') {
      if (m.ack?.tab === this.tabs.id) for (const seq of [...this.unconfirmed.keys()]) if (seq <= m.ack.seq) this.unconfirmed.delete(seq)
      // a file we changed and the leader hasn't confirmed yet keeps our version until it does
      const waiting = this.waitingPaths()
      const diff = new Map<string, string | null>()
      for (const [p, t] of m.files) {
        if (waiting.has(p)) continue
        if (t === null) this.view.delete(p)
        else this.view.set(p, t)
        diff.set(p, t)
      }
      applyFiles(diff, this.me.login)
    } else if (m.t === 'status') useSync.setState(m.status)
    for (const w of this.waiters) w()
  }

  private waitingPaths() {
    const out = new Set<string>()
    for (const w of this.unconfirmed.values()) for (const [p] of w.files) out.add(p)
    return out
  }

  /** follower: resolves once the leader has our changes and isn't saving any more (or after a while) */
  private followerSettled(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.closed || (!this.unconfirmed.size && useSync.getState().state !== 'saving')) done()
      }
      const done = () => {
        clearTimeout(timer)
        this.waiters.delete(check)
        resolve()
      }
      const timer = setTimeout(done, FOLLOWER_WAIT)
      this.waiters.add(check)
    })
  }

  /** Tell every other tab with this workspace to start over (signed out, or a new GitHub key). */
  restartOtherTabs() {
    this.tabs.post({ t: 'restart' })
  }

  // ---------- the loop ----------

  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn)
    this.chain = run.catch(() => {})
    return run
  }

  /** pull, then save what's pending; reports the outcome in the save chip */
  syncNow(): Promise<void> {
    if (!this.leader) {
      this.tabs.post({ t: 'sync' })
      return this.followerSettled()
    }
    return this.lock(async () => {
      if (this.closed) return
      if (Date.now() < this.pausedUntil) return // GitHub asked us to wait; retryTimer comes back then
      clearTimeout(this.retryTimer)
      this.lastSync = Date.now()
      try {
        if (!navigator.onLine) throw new TypeError('offline')
        await this.pull()
        await this.save()
        this.retryDelay = 5_000
        useSync.setState({ state: this.pending.size ? 'saving' : 'saved', pending: this.pending.size, detail: undefined, synced: true })
        if (this.pending.size) this.scheduleSave()
      } catch (e) {
        this.report(e)
      }
    })
  }

  private report(e: unknown) {
    if (isBadKey(e)) {
      useSync.setState({ state: 'bad-key', detail: 'Your GitHub key stopped working.' })
      return
    }
    if (isOffline(e)) {
      useSync.setState({ state: 'offline', pending: this.pending.size, detail: undefined })
      return // the 'online' event wakes us up
    }
    if (e instanceof GitHubError && e.retryAt) {
      // not a failure: GitHub wants fewer saves for a while. Changes are safe here; we save again after the wait.
      this.pausedUntil = e.retryAt
      const at = new Date(e.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      useSync.setState({ state: 'saving', pending: this.pending.size, detail: `GitHub asked us to slow down, so we’ll save again at ${at}.` })
      clearTimeout(this.retryTimer)
      this.retryTimer = setTimeout(() => void this.syncNow(), e.retryAt - Date.now() + 500)
      return
    }
    console.error('Sprawniej sync', e)
    useSync.setState({ state: 'error', pending: this.pending.size, detail: (e as Error).message })
    this.retryTimer = setTimeout(() => void this.syncNow(), this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 120_000)
  }

  private onWake = () => void this.syncNow()
  private onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.flush()
    else void this.syncNow()
  }

  /** every 30 s while you look at the tab, and whenever you come back to it */
  private startPolling() {
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow()
    }, PULL_EVERY)
    window.addEventListener('online', this.onWake)
    window.addEventListener('focus', this.onWake)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private stopPolling() {
    clearInterval(this.pollTimer)
    window.removeEventListener('online', this.onWake)
    window.removeEventListener('focus', this.onWake)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  // ---------- download, pull, save ----------

  /** first visit: fetch every file */
  private async download() {
    useSync.setState({ progress: 'Looking up your workspace…' })
    const info = await getRepo(this.token, this.repo)
    const branch = info.default_branch || 'main'
    const head = await getHead(this.token, this.repo, branch)
    this.meta = { branch, head: null, tree: null }
    if (head.sha) {
      const commit = await getCommit(this.token, this.repo, head.sha)
      const files = (await getFiles(this.token, this.repo, commit.tree.sha)).filter((f) => isOurs(f.path))
      useSync.setState({ progress: `Downloading ${files.length} files…` })
      const blobs = await getBlobs(this.token, this.repo, [...new Set(files.map((f) => f.sha))])
      const put = new Map<string, string | null>()
      for (const f of files) {
        this.base.set(f.path, blobs.get(f.sha)!)
        put.set(f.path, blobs.get(f.sha)!)
      }
      await this.local.putBase(put)
      this.meta = { branch, head: head.sha, tree: commit.tree.sha }
      this.etag = head.etag
    }
    await this.local.setMeta(this.meta)
  }

  /** bring in what teammates saved since our base */
  private async pull() {
    const head = await getHead(this.token, this.repo, this.meta.branch, this.etag)
    if (head.unchanged) return
    if (!head.sha || head.sha === this.meta.head) {
      this.etag = head.etag
      return
    }

    const commit = await getCommit(this.token, this.repo, head.sha)
    // which files changed, and their new blob ids (null = removed)
    const changed = new Map<string, string | null>()
    const listed = this.meta.head ? await compare(this.token, this.repo, this.meta.head, head.sha) : null
    if (listed) {
      for (const f of listed) {
        if (f.status === 'renamed' && f.previous_filename) changed.set(f.previous_filename, null)
        changed.set(f.filename, f.status === 'removed' ? null : f.sha)
      }
    } else {
      const remote = new Map((await getFiles(this.token, this.repo, commit.tree.sha)).map((f) => [f.path, f.sha]))
      for (const [p, sha] of remote) if (!this.base.has(p) || (await blobSha(this.base.get(p)!)) !== sha) changed.set(p, sha)
      for (const p of this.base.keys()) if (!remote.has(p)) changed.set(p, null)
    }
    for (const p of [...changed.keys()]) if (!isOurs(p)) changed.delete(p)

    const shas = [...new Set([...changed.values()].filter((s): s is string => !!s))]
    const blobs = shas.length ? await getBlobs(this.token, this.repo, shas) : new Map<string, string>()

    const incoming = new Map<string, string | null>()
    for (const [path, sha] of changed) incoming.set(path, sha ? blobs.get(sha)! : null)
    const merged = mergeIncoming(this.base, this.pending, incoming)
    for (const [path, text] of merged.pending) {
      if (text === undefined) {
        this.pending.delete(path)
        void this.local.dropPending([path])
      } else {
        this.pending.set(path, text)
        void this.local.putPending(path, text)
      }
    }
    const shown = merged.shown
    const baseUpdate = incoming
    for (const [p, t] of baseUpdate) {
      if (t === null) this.base.delete(p)
      else this.base.set(p, t)
    }
    this.meta = { ...this.meta, head: head.sha, tree: commit.tree.sha }
    // only now: had anything above failed, the next check must not be told "nothing new" and skip these changes
    this.etag = head.etag

    // two new issues with the same number: ours (not on GitHub yet) moves up
    for (const r of renumber(this.base, this.pending)) {
      this.pending.set(r.path, r.text)
      void this.local.putPending(r.path, r.text)
      shown.set(r.path, r.text)
      toast(`${r.team}-${r.from} is now ${r.team}-${r.to}`, { description: 'A teammate created an issue with the same number at the same time.' })
    }

    // show the merged result before anything else can run, so your next edit starts from it
    applyFiles(shown, this.me.login)
    this.tabs.post({ t: 'files', files: [...shown] })
    await this.local.putBase(baseUpdate)
    await this.local.setMeta(this.meta)
    // the same lines rewritten by both: ours is kept, theirs stays in the history. Nobody is asked to choose.
    if (merged.lostLines.length) console.info('Sprawniej kept your text where a teammate rewrote the same lines:', merged.lostLines)
  }

  /** send pending changes as one commit; retry after a pull when someone saved first */
  private async save() {
    for (let attempt = 0; attempt < 4; attempt++) {
      // drop changes that ended up equal to GitHub's version
      for (const [p, t] of [...this.pending]) {
        if (t === (this.base.get(p) ?? null)) {
          this.pending.delete(p)
          void this.local.dropPending([p])
        }
      }
      if (!this.pending.size) {
        if (this.messages.length) {
          this.messages = []
          void this.local.setMessages([])
        }
        return
      }
      const sent = new Map(this.pending)
      const msgCount = this.messages.length
      const message = commitMessage(this.messages)

      if (!this.meta.head) {
        await this.startRepo(sent)
        continue
      }
      const entries = [...sent].filter(([p, t]) => t !== null || this.base.has(p)).map(([path, content]) => ({ path, content }))
      const tree = await createTree(this.token, this.repo, this.meta.tree, entries)
      const commit = await createCommit(this.token, this.repo, message, tree, [this.meta.head], this.author)
      try {
        await moveBranch(this.token, this.repo, this.meta.branch, commit)
      } catch (e) {
        if (e instanceof NotFastForward) {
          this.etag = undefined
          // a short, random wait, so two people saving at once don't meet again
          await new Promise((r) => setTimeout(r, 150 + Math.random() * 600))
          await this.pull()
          continue
        }
        throw e
      }
      // saved: GitHub now has exactly `sent`
      const baseUpdate = new Map<string, string | null>()
      for (const [p, t] of sent) {
        baseUpdate.set(p, t)
        if (t === null) this.base.delete(p)
        else this.base.set(p, t)
        if (this.pending.get(p) === t) {
          this.pending.delete(p) // unless you kept typing meanwhile
          void this.local.dropPending([p])
        }
      }
      await this.local.putBase(baseUpdate)
      this.meta = { ...this.meta, head: commit, tree }
      this.etag = undefined
      await this.local.setMeta(this.meta)
      this.messages = this.messages.slice(msgCount)
      void this.local.setMessages(this.messages)
      this.saves = keepRecent([...this.saves, Date.now()])
      return
    }
    throw new Error('Teammates keep saving at the same moment. We’ll try again shortly.')
  }

  /** An empty repo can't take a tree yet: create sprawniej.json through the contents API first. */
  private async startRepo(sent: Map<string, string | null>) {
    const first = sent.get(WORKSPACE_FILE) ?? `${JSON.stringify({ name: this.repo.repo, format: 1, createdAt: new Date().toISOString() }, null, 2)}\n`
    const r = await createFirstFile(this.token, this.repo, WORKSPACE_FILE, first, 'Create the workspace', this.author)
    this.meta = { branch: r.branch, head: null, tree: null }
    this.etag = undefined
    // pull it in like any teammate's change, so base and meta are right
    const head = await getHead(this.token, this.repo, r.branch)
    const commit = await getCommit(this.token, this.repo, head.sha ?? r.commit)
    this.base.set(WORKSPACE_FILE, first)
    await this.local.putBase(new Map([[WORKSPACE_FILE, first]]))
    this.meta = { branch: r.branch, head: commit.sha, tree: commit.tree.sha }
    await this.local.setMeta(this.meta)
  }

  /** the saved versions of a file, newest first (issue history) */
  history(path: string): Promise<FileVersion[]> {
    return fileHistory(this.token, this.repo, path)
  }

  /** forget this browser's copy (signing out) */
  async wipe() {
    this.restartOtherTabs()
    this.close()
    await this.local.wipe()
  }
}

/** files Sprawniej manages; anything else in the repo (README, .github…) is left alone */
const isOurs = (path: string) => classify(path) !== null || path.startsWith('assets/')

function commitMessage(messages: string[]): string {
  const unique = [...new Set(messages)]
  if (!unique.length) return 'Update the workspace'
  if (unique.length === 1) return unique[0]
  const more = unique.length - 1
  return `${unique[0]} (and ${more} more change${more === 1 ? '' : 's'})\n\n${unique.map((m) => `- ${m}`).join('\n')}\n`
}

// ---------- the open workspace ----------

let current: Workspace | null = null

export const workspace = () => current
export function setWorkspace(ws: Workspace | null) {
  current?.close()
  current = ws
}
