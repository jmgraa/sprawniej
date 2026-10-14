/**
 * This browser's copy of a workspace, in IndexedDB (one database per workspace):
 *   meta            which commit the copy is based on
 *   base:<path>     every file as it is on GitHub at that commit
 *   pending:<path>  our changes that haven't reached GitHub yet (null = deleted)
 *   messages        what those changes were, for the commit message
 * What you see = base with pending laid on top. Writes go to `pending` right away, so nothing is lost when the
 * tab closes or the computer crashes.
 */
import { clear, createStore, delMany, entries, get, set, setMany, type UseStore } from 'idb-keyval'
import { repoKey, type RepoRef } from '@/github/api'

export interface Meta {
  branch: string
  /** the commit `base` matches; null = the repo is empty */
  head: string | null
  /** that commit's tree */
  tree: string | null
}

export interface Snapshot {
  meta: Meta | undefined
  base: Map<string, string>
  pending: Map<string, string | null>
  messages: string[]
}

const dbName = (r: RepoRef) => `sprawniej:${repoKey(r).toLowerCase()}`

export class LocalCopy {
  private store: UseStore

  constructor(repo: RepoRef) {
    this.store = createStore(dbName(repo), 'files')
  }

  async load(): Promise<Snapshot> {
    const snap: Snapshot = { meta: undefined, base: new Map(), pending: new Map(), messages: [] }
    for (const [k, v] of await entries<string, unknown>(this.store)) {
      if (k === 'meta') snap.meta = v as Meta
      else if (k === 'messages') snap.messages = v as string[]
      else if (k.startsWith('base:')) snap.base.set(k.slice(5), v as string)
      else if (k.startsWith('pending:')) snap.pending.set(k.slice(8), v as string | null)
    }
    return snap
  }

  setMeta = (meta: Meta) => set('meta', meta, this.store)
  getMeta = () => get<Meta>('meta', this.store)
  setMessages = (messages: string[]) => set('messages', messages, this.store)

  putPending = (path: string, text: string | null) => set(`pending:${path}`, text, this.store)
  dropPending = (paths: string[]) => delMany(paths.map((p) => `pending:${p}`), this.store)

  /** files now on GitHub: text to store, null to forget */
  async putBase(files: Map<string, string | null>): Promise<void> {
    const put: [string, string][] = []
    const del: string[] = []
    for (const [p, t] of files) {
      if (t === null) del.push(`base:${p}`)
      else put.push([`base:${p}`, t])
    }
    if (put.length) await setMany(put, this.store)
    if (del.length) await delMany(del, this.store)
  }

  wipe = () => clear(this.store)
}

/** Remove every workspace copy from this browser (signing out on a shared computer). */
export async function wipeAllCopies(): Promise<void> {
  const dbs = (await indexedDB.databases?.()) ?? []
  await Promise.all(
    dbs
      .filter((d) => d.name?.startsWith('sprawniej:'))
      .map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!)
            req.onsuccess = req.onerror = req.onblocked = () => resolve()
          }),
      ),
  )
}

/** Workspaces (other than `except`) whose browser copy holds changes that never reached GitHub, as owner/repo. */
export async function unsavedElsewhere(except?: RepoRef): Promise<string[]> {
  const skip = except ? dbName(except) : null
  const dbs = ((await indexedDB.databases?.()) ?? []).filter((d) => d.name?.startsWith('sprawniej:') && d.name !== skip)
  const found = await Promise.all(
    dbs.map(
      (d) =>
        new Promise<string | null>((resolve) => {
          const req = indexedDB.open(d.name!)
          req.onerror = req.onblocked = () => resolve(null)
          req.onsuccess = () => {
            const db = req.result
            try {
              const keys = db.transaction('files').objectStore('files').count(IDBKeyRange.bound('pending:', 'pending:￿'))
              keys.onsuccess = () => {
                db.close()
                resolve(keys.result ? d.name!.slice('sprawniej:'.length) : null)
              }
              keys.onerror = () => {
                db.close()
                resolve(null)
              }
            } catch {
              db.close()
              resolve(null)
            }
          }
        }),
    ),
  )
  return found.filter((n): n is string => !!n)
}
