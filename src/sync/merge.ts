/**
 * Three-way merge of one file: what it was when we last synced (base), our unsaved version (ours) and what a
 * teammate saved (theirs). Rules, from docs/architecture.md:
 *  - different fields both survive; the same field changed on both sides → ours (we're the later save)
 *  - lists of ids (labels, members…) merge as sets: additions and removals from both sides apply
 *  - descriptions merge line by line; overlapping lines → ours
 *  - an edit beats a delete
 * `null` = the file doesn't exist (deleted, or never was).
 */
import { diff3Merge } from 'node-diff3'
import { classify, joinFrontMatter, splitFrontMatter } from '@/data/files'

export interface MergeResult {
  text: string | null
  /**
   * Both sides rewrote the same lines of a description or comment, and ours was kept. The only clash worth a quiet
   * notice: everything else (the same field changed twice) simply goes to the later save, like any app would.
   */
  lostLines: boolean
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isPrimList = (v: unknown): v is (string | number | null)[] => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')

interface Ctx {
  /** the same field changed on both sides (ours kept) */
  conflicts: number
  /** the same lines of text changed on both sides (ours kept) */
  textConflicts?: number
}

export function mergeValue(base: unknown, ours: unknown, theirs: unknown, ctx: Ctx = { conflicts: 0 }): unknown {
  if (same(ours, theirs)) return ours
  if (base !== undefined && same(ours, base)) return theirs
  if (base !== undefined && same(theirs, base)) return ours
  if (isObj(ours) && isObj(theirs) && (base === undefined || isObj(base))) {
    const b = (base ?? {}) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const v = mergeValue(b[k], ours[k], theirs[k], ctx)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (isPrimList(ours) && isPrimList(theirs) && (base === undefined || isPrimList(base))) {
    const b = new Set(base ?? [])
    const t = new Set(theirs)
    const out = ours.filter((x) => !(b.has(x) && !t.has(x))) // theirs removed it
    for (const x of theirs) if (!b.has(x) && !out.includes(x)) out.push(x) // theirs added it
    return out
  }
  if (base === undefined && (ours === undefined || theirs === undefined)) return ours ?? theirs
  ctx.conflicts++
  return ours
}

/** line-by-line merge; overlapping changes keep our lines */
export function mergeText(base: string, ours: string, theirs: string, ctx: Ctx = { conflicts: 0 }): string {
  if (ours === theirs || theirs === base) return ours
  if (ours === base) return theirs
  const lines = (s: string) => s.split('\n')
  const out: string[] = []
  for (const region of diff3Merge(lines(ours), lines(base), lines(theirs))) {
    if (region.ok) out.push(...region.ok)
    else if (region.conflict) {
      ctx.textConflicts = (ctx.textConflicts ?? 0) + 1
      out.push(...region.conflict.a)
    }
  }
  return out.join('\n')
}

function mergeFrontMatterFile(base: string | null, ours: string, theirs: string, ctx: Ctx, isIssue: boolean): string {
  const b = base === null ? null : splitFrontMatter(base)
  const o = splitFrontMatter(ours)
  const t = splitFrontMatter(theirs)
  if (isIssue) {
    // "last touched" is the newer of the two, whoever wins the other fields; it is never a clash
    const of = o.fields as Record<string, unknown>
    const tf = t.fields as Record<string, unknown>
    const newest = [of.updatedAt, tf.updatedAt].filter((x): x is string => typeof x === 'string').sort().at(-1)
    if (newest) of.updatedAt = tf.updatedAt = newest
  }
  const fields = mergeValue(b?.fields, o.fields, t.fields, ctx) as Record<string, unknown>
  let body = o.body
  if (b) body = mergeText(b.body, o.body, t.body, ctx)
  else if (o.body !== t.body) ctx.textConflicts = (ctx.textConflicts ?? 0) + 1
  return joinFrontMatter(fields, body)
}

/** one record per line, keyed by id (archive month files) */
function records(text: string | null): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      const v = JSON.parse(line) as Record<string, unknown>
      if (typeof v.id === 'string') out.set(v.id, v)
    } catch {
      /* a broken line drops out */
    }
  }
  return out
}

/**
 * Archive month files merge issue by issue: issues archived on either side are all kept, an issue restored on one
 * side and untouched on the other goes, and the same issue changed on both sides merges like any other fields.
 */
export function mergeArchive(base: string | null, ours: string, theirs: string, ctx: Ctx): string | null {
  const b = records(base)
  const o = records(ours)
  const t = records(theirs)
  const out: Record<string, unknown>[] = []
  for (const id of new Set([...o.keys(), ...t.keys(), ...b.keys()])) {
    const [bv, ov, tv] = [b.get(id), o.get(id), t.get(id)]
    if (!ov && !tv) continue
    if (bv && !ov && same(tv, bv)) continue // we restored it, they didn't touch it
    if (bv && !tv && same(ov, bv)) continue // they restored it
    if (!ov || !tv) out.push((ov ?? tv)!) // added on one side, or changed on one side and restored on the other
    else out.push(mergeValue(bv, ov, tv, ctx) as Record<string, unknown>)
  }
  if (!out.length) return null
  out.sort((x, y) => (String(x.id) < String(y.id) ? -1 : 1))
  return `${out.map((r) => JSON.stringify(r)).join('\n')}\n`
}

export function mergeFile(path: string, base: string | null, ours: string | null, theirs: string | null): MergeResult {
  if (ours === theirs) return { text: ours, lostLines: false }
  if (ours === base) return { text: theirs, lostLines: false }
  if (theirs === base) return { text: ours, lostLines: false }
  // one side deleted, the other changed it: keep the changed one
  if (ours === null) return { text: theirs, lostLines: false }
  if (theirs === null) return { text: ours, lostLines: false }

  const ctx: Ctx = { conflicts: 0 }
  const kind = classify(path)?.kind
  try {
    if (kind === 'issue' || kind === 'comment') {
      const text = mergeFrontMatterFile(base, ours, theirs, ctx, kind === 'issue')
      return { text, lostLines: (ctx.textConflicts ?? 0) > 0 }
    }
    if (kind === 'archive') return { text: mergeArchive(base, ours, theirs, ctx), lostLines: false }
    if (path.endsWith('.json')) {
      const v = mergeValue(base === null ? undefined : JSON.parse(base), JSON.parse(ours), JSON.parse(theirs), ctx) as Record<string, unknown>
      // a team's highest used number only ever goes up, whoever saved last
      if (kind === 'team') {
        const highest = Math.max(...[ours, theirs].map((x) => Number((JSON.parse(x) as { lastNumber?: number }).lastNumber ?? 0)))
        if (highest > 0) v.lastNumber = highest
      }
      return { text: `${JSON.stringify(v, null, 2)}\n`, lostLines: false }
    }
  } catch {
    /* a file we can't read: fall through to "ours wins" */
  }
  return { text: ours, lostLines: false }
}

// ---------- everything a pull brings in ----------

/** issues and comments keep their id when they move to another team (the folder changes, the file name doesn't) */
function identity(path: string): string | null {
  const c = classify(path)
  if (c?.kind === 'issue') return `issue:${c.parts[1]}`
  if (c?.kind === 'comment') return `comment:${c.parts[2]}`
  return null
}

export interface IncomingMerge {
  /** what pending becomes for each touched path: text/null to keep pending, undefined to drop it */
  pending: Map<string, string | null | undefined>
  /** what the screen shows for each touched path */
  shown: Map<string, string | null>
  /** paths where both sides rewrote the same lines (ours kept) */
  lostLines: string[]
}

/**
 * Merge a teammate's saved changes (`incoming`, null = deleted) into our unsaved ones (`pending`), given what both
 * started from (`base`). Pure, so every rule is unit-tested (tests/merge.test.ts).
 *
 * Besides the per-file rules above, it handles moves: an issue moved to another team on one side and edited on the
 * other ends up as one issue, in its new team, with the edit applied. (Plain "edit beats delete" would bring the old
 * file back and show the issue twice.)
 */
export function mergeIncoming(base: Map<string, string>, pending: Map<string, string | null>, incoming: Map<string, string | null>): IncomingMerge {
  const out: IncomingMerge = { pending: new Map(), shown: new Map(), lostLines: [] }
  const done = new Set<string>()
  const settle = (path: string, merged: MergeResult, theirs: string | null) => {
    out.pending.set(path, merged.text === theirs ? undefined : merged.text)
    out.shown.set(path, merged.text)
    if (merged.lostLines) out.lostLines.push(path)
    done.add(path)
  }

  const added = (m: Map<string, string | null>) => {
    const byId = new Map<string, string>()
    for (const [p, t] of m) {
      const id = identity(p)
      if (id && t !== null && !base.has(p)) byId.set(id, p)
    }
    return byId
  }
  const theirsNew = added(incoming)
  const oursNew = added(pending)

  for (const [oldPath, theirs] of incoming) {
    const id = identity(oldPath)
    if (!id || !base.has(oldPath)) continue
    const ours = pending.get(oldPath)
    // they moved it, we edited it in its old place → apply our edit at the new place
    const movedTo = theirsNew.get(id)
    if (theirs === null && typeof ours === 'string' && movedTo && movedTo !== oldPath) {
      const merged = mergeFile(movedTo, base.get(oldPath)!, ours, incoming.get(movedTo)!)
      settle(movedTo, merged, incoming.get(movedTo)!)
      out.pending.set(oldPath, undefined)
      out.shown.set(oldPath, null)
      done.add(oldPath)
      continue
    }
    // we moved it, they edited it in its old place → bring their edit along, keep the old place deleted
    const ourMove = oursNew.get(id)
    if (theirs !== null && ours === null && ourMove && ourMove !== oldPath) {
      const merged = mergeFile(ourMove, base.get(oldPath)!, pending.get(ourMove)!, theirs)
      out.pending.set(ourMove, merged.text)
      out.shown.set(ourMove, merged.text)
      if (merged.lostLines) out.lostLines.push(ourMove)
      out.pending.set(oldPath, null)
      out.shown.set(oldPath, null)
      done.add(oldPath)
      done.add(ourMove)
    }
  }

  for (const [path, theirs] of incoming) {
    if (done.has(path)) continue
    if (!pending.has(path)) {
      out.shown.set(path, theirs)
      continue
    }
    settle(path, mergeFile(path, base.get(path) ?? null, pending.get(path)!, theirs), theirs)
  }

  // edit beats delete: an issue that stays keeps its comments too, which the delete took along with it
  const revived = new Set<string>()
  for (const [p, t] of out.shown) {
    const c = classify(p)
    if (c?.kind !== 'issue' || t === null) continue
    const theyDeleted = incoming.get(p) === null && typeof pending.get(p) === 'string'
    const weDeleted = pending.get(p) === null && typeof incoming.get(p) === 'string'
    if (theyDeleted || weDeleted) revived.add(c.parts[1])
  }
  if (revived.size) {
    for (const [p, text] of base) {
      const c = classify(p)
      if (c?.kind !== 'comment' || !revived.has(c.parts[1])) continue
      if (incoming.get(p) === null && !pending.has(p)) {
        // they deleted it with the issue: we put it back
        out.pending.set(p, text)
        out.shown.set(p, text)
      } else if (pending.get(p) === null && !incoming.has(p)) {
        // we deleted it with the issue: we don't anymore
        out.pending.set(p, undefined)
        out.shown.set(p, text)
      }
    }
  }
  return out
}
