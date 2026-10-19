/**
 * A Linear custom view's filter (its `filterData`) → Sprawniej filters. Linear's filters can say much more than
 * ours: we keep status, assignee, subscribers, priority, labels, project and team with "is" and "is any of", and
 * anything joined with "and" ("assigned to Jan or Jan is subscribed" too, which here is "Jan follows it"). Everything
 * else ("is not", other "or"s across fields, dates, cycles, text…) is left out, and the
 * view is reported as not exact, so the import can say which views to check. Pure, tested in
 * tests/linearImport.test.ts.
 *
 * What Linear's app saves looks like this (each field holds a list of choices, labels also match their sub-labels):
 *   { and: [{ assignee: { or: [{ id: { in: ['u1'] } }] } },
 *           { labels: { and: [{ or: [{ name: { eq: 'AI' } }, { parent: { name: { eq: 'AI' } } }] }] } }] }
 */
import type { Filters } from '@/model/schema'
import type { Status, StatusId } from '@/model/status'
import { STATE_GROUPS } from './linearMap'
import type { LLabel, LState } from './linearApi'

export interface FilterContext {
  /** workflow states by id */
  states: Map<string, LState>
  /** a Linear state → its status here */
  status: (state: LState | { name: string; type: string }) => StatusId
  /** every status here, the ones this import brings included */
  statuses: Status[]
  /** a Linear user → a login here; undefined = nobody here (unmatched) */
  person: (linearUserId: string) => string | undefined
  /** every Linear label (not just the ones issues use) */
  labels: LLabel[]
  /** a Linear label → its label id here, bringing it over if no issue brought it */
  label: (l: LLabel) => string
  /** a label here with this name (one made here, not from Linear) */
  labelHere: (name: string) => string | undefined
  project: (linearProjectId: string) => string | undefined
  /** a Linear team, by id or by key → a team key here */
  team: (linearTeamIdOrKey: string) => string | undefined
}

export interface MappedFilter {
  filters: Filters
  /** every condition came over as it was */
  exact: boolean
  /** the view had conditions, and none of them could come over (it would show everything) */
  nothing: boolean
}

type Key = 'statuses' | 'assignees' | 'subscribers' | 'priorities' | 'labels' | 'projects' | 'teams'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** the values a comparator allows: { eq: x }, { in: [x, y] }, { null: true }; null when it's anything else */
function allowed(cmp: unknown): unknown[] | null {
  if (!isObj(cmp)) return null
  const keys = Object.keys(cmp)
  if (keys.length !== 1) return null
  if ('eq' in cmp) return [cmp.eq]
  if ('in' in cmp && Array.isArray(cmp.in)) return cmp.in
  if ('null' in cmp && cmp.null === true) return [null]
  return null
}

/** Linear's state types → every status here in that group */

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x) => b.includes(x))

export function mapViewFilter(filterData: unknown, ctx: FilterContext): MappedFilter {
  const out = new Map<Key, unknown[]>()
  let exact = true
  let conditions = 0
  const lose = () => {
    exact = false
  }
  /** a field's values; a second condition on the same field narrows it */
  const put = (key: Key, values: unknown[]) => {
    const unique = [...new Set(values)]
    const before = out.get(key)
    if (!before) return out.set(key, unique)
    if (same(before, unique)) return
    // labels: "has one of A" and "has one of B" can't be said as one "has any of"; keep the first, which shows more
    if (key === 'labels') return lose()
    out.set(key, before.filter((v) => unique.includes(v)))
  }
  /** turn Linear values into ours; any that can't be turned means the view isn't exact */
  const convert = <T,>(values: unknown[], one: (v: unknown) => T | T[] | undefined): T[] => {
    const res: T[] = []
    for (const v of values) {
      const r = one(v)
      if (r === undefined) lose()
      else res.push(...(Array.isArray(r) ? r : [r]))
    }
    return res
  }

  /**
   * The values one field's condition allows here. `prop` handles one property of it ({ id: { in: […] } }, or a bare
   * { eq: 2 }) and gives null when it can't. Choices in `or` add up, `and` narrows. undefined = no condition at all.
   */
  type Prop = (name: string, value: unknown) => unknown[] | null
  const fieldValues = (f: unknown, prop: Prop): unknown[] | null | undefined => {
    if (!isObj(f)) return null
    let res: unknown[] | undefined
    const narrow = (vals: unknown[]) => {
      res = res ? res.filter((v) => vals.includes(v)) : [...new Set(vals)]
    }
    for (const [k, v] of Object.entries(f)) {
      if ((k === 'or' || k === 'and') && Array.isArray(v)) {
        const parts = v.map((x) => fieldValues(x, prop))
        // a choice we can't read: leaving it out shows fewer issues ("or") or more ("and"); either way, not exact
        if (parts.some((p) => p === null)) lose()
        const known = parts.filter((p): p is unknown[] | undefined => p !== null)
        if (!known.length) {
          if (v.length) return null
          continue
        }
        if (k === 'or') {
          if (known.some((p) => p === undefined)) continue // one choice is "anything"
          narrow(known.flatMap((p) => p!))
        } else for (const p of known) if (p) narrow(p)
        continue
      }
      const vals = prop(k, v)
      if (vals === null) {
        lose()
        continue
      }
      narrow(vals)
    }
    return res
  }

  /** one field: count it, read it, keep what came over */
  const field = (key: Key, f: unknown, prop: Prop) => {
    conditions++
    const vals = fieldValues(f, prop)
    if (vals === null) return lose()
    if (vals !== undefined) put(key, vals)
  }

  /** { id: { in: […] } } style properties, each turned by its own function */
  const byProp =
    (turn: Record<string, (vals: unknown[]) => unknown[]>, extra?: Prop): Prop =>
    (name, value) => {
      if (turn[name]) {
        const vals = allowed(value)
        return vals && turn[name](vals)
      }
      return extra ? extra(name, value) : null
    }
  /** { null: true } on the field itself: "no assignee", "no project" */
  const noneProp: Prop = (name, value) => (name === 'null' && value === true ? [null] : null)

  const personIds = (vals: unknown[]) => convert(vals, (v) => (typeof v === 'string' ? ctx.person(v) : undefined))
  const linearLabelsWhere = (match: (l: LLabel) => boolean) => ctx.labels.filter((l) => !l.isGroup && match(l)).map(ctx.label)
  const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : undefined)

  const FIELDS: Record<string, (f: unknown) => void> = {
    state: (f) =>
      field(
        'statuses',
        f,
        byProp({
          id: (vals) => convert(vals, (v) => (typeof v === 'string' && ctx.states.get(v) ? ctx.status(ctx.states.get(v)!) : undefined)),
          name: (vals) =>
            convert(vals, (v) => {
              if (typeof v !== 'string') return undefined
              const state = [...ctx.states.values()].find((s) => s.name.toLowerCase() === v.toLowerCase())
              return ctx.status(state ?? { name: v, type: '' })
            }),
          type: (vals) => convert<StatusId>(vals, (v) => (typeof v === 'string' && STATE_GROUPS[v] ? ctx.statuses.filter((s) => s.group === STATE_GROUPS[v]).map((s) => s.id) : undefined)),
        }),
      ),
    assignee: (f) => field('assignees', f, byProp({ id: personIds }, noneProp)),
    subscribers: (f) => field('subscribers', f, byProp({ id: personIds })),
    priority: (f) =>
      field('priorities', f, (name, value) => {
        const vals = allowed({ [name]: value })
        return vals && convert(vals, (v) => (typeof v === 'number' && v >= 0 && v <= 4 ? v : undefined))
      }),
    labels: (f) => {
      const label: Prop = byProp(
        {
          id: (vals) => convert(vals, (v) => (typeof v === 'string' && ctx.labels.some((l) => l.id === v && !l.isGroup) ? linearLabelsWhere((l) => l.id === v) : undefined)),
          name: (vals) =>
            convert(vals, (v) => {
              const found = linearLabelsWhere((l) => l.name.toLowerCase() === lower(v))
              const here = typeof v === 'string' ? ctx.labelHere(v) : undefined
              const all = [...new Set([...found, ...(here ? [here] : [])])]
              // a group's own name matches no issue; its sub-labels come in through "parent"
              const group = ctx.labels.some((l) => l.isGroup && l.name.toLowerCase() === lower(v))
              return all.length || group ? all : undefined
            }),
        },
        (name, value) => {
          // "has a label from this group": { parent: { name: { eq: 'Area' } } }
          if (name === 'parent' && isObj(value)) {
            const ids = new Set<string>()
            for (const [p, cmp] of Object.entries(value)) {
              const vals = allowed(cmp)
              if (!vals || (p !== 'id' && p !== 'name')) return null
              for (const v of vals) for (const id of linearLabelsWhere((l) => !!l.parent && (p === 'id' ? l.parent.id === v : l.parent.name.toLowerCase() === lower(v)))) ids.add(id)
            }
            return [...ids]
          }
          // "has any label that…": { some: { … } }
          if (name === 'some') return fieldValues(value, label) ?? null
          return null
        },
      )
      field('labels', f, label)
    },
    project: (f) => field('projects', f, byProp({ id: (vals) => convert(vals, (v) => (typeof v === 'string' ? ctx.project(v) : undefined)) }, noneProp)),
    team: (f) => {
      const one = (vals: unknown[]) => convert(vals, (v) => (typeof v === 'string' ? ctx.team(v) : undefined))
      field('teams', f, byProp({ id: one, key: one }))
    },
  }

  /**
   * "Assigned to Jan, or Jan is subscribed": here people follow what they're assigned to, so that's "Jan follows it".
   * Other people on each side (assigned to Ana or Jan is subscribed) become "Ana or Jan follows it", which shows more.
   */
  const personOr = (items: unknown[]): boolean => {
    const sets: unknown[][] = []
    for (const item of items) {
      const keys = isObj(item) ? Object.keys(item) : []
      if (keys.length !== 1 || (keys[0] !== 'assignee' && keys[0] !== 'subscribers')) return false
      const vals = fieldValues((item as Record<string, unknown>)[keys[0]], byProp({ id: personIds }))
      if (!vals) return false
      sets.push(vals)
    }
    conditions++
    if (!sets.every((x) => same(x, sets[0]))) lose()
    put('subscribers', sets.flat())
    return true
  }

  const walk = (f: unknown) => {
    if (!isObj(f)) return
    for (const [k, v] of Object.entries(f)) {
      if (k === 'and' && Array.isArray(v)) v.forEach(walk)
      else if (k === 'or' && Array.isArray(v) && v.length <= 1) v.forEach(walk) // Linear saves an empty "or" now and then
      else if (k === 'or' && Array.isArray(v) && personOr(v)) continue
      else if (FIELDS[k]) FIELDS[k](v)
      else {
        conditions++
        lose()
      }
    }
  }
  walk(filterData)

  const filters: Filters = {}
  for (const [k, vals] of out) {
    // nothing left would read as "no filter" here, which shows everything: leave it out and say so
    if (!vals.length) lose()
    else (filters as Record<string, unknown[]>)[k] = vals
  }
  return { filters, exact, nothing: conditions > 0 && !Object.keys(filters).length && !exact }
}
