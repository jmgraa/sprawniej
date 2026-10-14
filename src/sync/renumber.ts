/**
 * Issue numbers once on GitHub are final. Two people can still create ENG-12 at the same time while offline;
 * after a merge, the issue that hasn't reached GitHub yet takes the next free number.
 */
import { classify, joinFrontMatter, splitFrontMatter } from '@/data/files'

export interface Renumbered {
  path: string
  text: string
  team: string
  from: number
  to: number
}

function numberOf(text: string): { fields: Record<string, unknown>; body: string; number: number } | null {
  try {
    const { fields, body } = splitFrontMatter(text)
    const f = fields as Record<string, unknown>
    return typeof f.number === 'number' ? { fields: f, body, number: f.number } : null
  } catch {
    return null
  }
}

export function renumber(base: Map<string, string>, pending: Map<string, string | null>): Renumbered[] {
  const used = new Map<string, Set<number>>() // team → numbers taken by issues on GitHub
  const take = (team: string, n: number) => (used.get(team) ?? used.set(team, new Set()).get(team)!).add(n)

  // numbers of deleted or moved-away issues, which are never given out again (team.json `lastNumber`)
  const floor = new Map<string, number>()
  for (const [path, text] of base) {
    const c = classify(path)
    if (c?.kind === 'team') {
      try {
        const n = (JSON.parse(pending.get(path) ?? text) as { lastNumber?: unknown }).lastNumber
        if (typeof n === 'number') floor.set(c.parts[0], n)
      } catch {
        /* a broken team file: no floor */
      }
    }
    if (c?.kind !== 'issue') continue
    const latest = pending.has(path) ? pending.get(path) : text
    if (latest === null || latest === undefined) continue
    const n = numberOf(latest)
    if (n) take(c.parts[0], n.number)
  }

  const fresh: { path: string; team: string; parsed: NonNullable<ReturnType<typeof numberOf>> }[] = []
  for (const [path, text] of pending) {
    const c = classify(path)
    if (c?.kind !== 'issue' || base.has(path) || text === null) continue
    const parsed = numberOf(text)
    if (parsed) fresh.push({ path, team: c.parts[0], parsed })
  }
  // oldest first keeps its number when two of ours clash with each other
  fresh.sort((a, b) => String(a.parsed.fields.createdAt).localeCompare(String(b.parsed.fields.createdAt)))

  // first every new issue whose number is still free keeps it; only then do the clashing ones move up, past all of
  // them (else moving WEB-5 up to WEB-6 would push our own WEB-6 along too, for no reason)
  const clashing: typeof fresh = []
  for (const f of fresh) {
    const taken = used.get(f.team) ?? new Set<number>()
    if (taken.has(f.parsed.number)) clashing.push(f)
    else take(f.team, f.parsed.number)
  }
  const out: Renumbered[] = []
  for (const f of clashing) {
    const taken = used.get(f.team) ?? new Set<number>()
    const next = Math.max(floor.get(f.team) ?? 0, ...taken) + 1
    take(f.team, next)
    out.push({ path: f.path, team: f.team, from: f.parsed.number, to: next, text: joinFrontMatter({ ...f.parsed.fields, number: next }, f.parsed.body) })
  }
  return out
}
