/**
 * Settings › Import from Linear: a short wizard. Key → teams → people → check → import → done.
 * Reading happens straight from Linear; the import is written like any other change (actions.importFiles).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { ulid } from 'ulid'
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { useCrumbs } from '@/app/chrome'
import { PersonAvatar } from '@/components/Avatar'
import { importFiles } from '@/data/actions'
import { loadArchive } from '@/data/project'
import { useData } from '@/data/store'
import { Problem } from '@/features/onboarding/Step'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { LinearError, readBasics, readTeams, type LinearData } from './linearApi'
import { buildImport, emojiFor, guessPerson, guestLogins, involvedUsers, linearName, type ImportChoices, type ImportResult } from './linearMap'
import { isGuest } from '@/model/schema'

type Stage =
  | { at: 'key' }
  | { at: 'teams'; basics: Pick<LinearData, 'org' | 'teams' | 'users'> }
  | { at: 'people'; data: LinearData }
  | { at: 'check'; data: LinearData }
  | { at: 'saving'; saved: number; total: number }
  | { at: 'done'; result: ImportResult; keys: string[] }

const STEPS = ['Key', 'Teams', 'People', 'Import']
const NOBODY = '__nobody'
const KEY_RE = /^[A-Z][A-Z0-9]{0,6}$/

function Steps({ now }: { now: number }) {
  return (
    <ol className="mb-8 flex gap-6 text-sm" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-2 text-muted-foreground', i === now && 'text-foreground', i < now && 'text-foreground/70')} aria-current={i === now ? 'step' : undefined}>
          <span className={cn('flex size-6 items-center justify-center rounded-full border text-xs', i === now && 'border-foreground', i < now && 'bg-foreground text-background')}>{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

function Panel({ step, title, children, footer }: { step: number; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8">
      <div className="mx-auto max-w-2xl py-10">
        <Steps now={step} />
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="mt-4 text-[15px] leading-relaxed text-foreground/85">{children}</div>
        {footer && <div className="mt-8 flex flex-wrap items-center gap-3">{footer}</div>}
      </div>
    </div>
  )
}

/** "412 issues, 980 comments and 6 views are here." */
function doneText(c: ImportResult['counts']): string {
  const n = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`
  const parts = [n(c.issues, 'issue', 'issues'), n(c.comments, 'comment', 'comments'), ...(c.views ? [n(c.views, 'view', 'views')] : [])]
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)} are here.`
}

export function ImportPage() {
  useCrumbs([{ label: 'Settings', href: '/settings' }, { label: 'Import from Linear' }])
  const [stage, setStage] = useState<Stage>({ at: 'key' })
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [people, setPeople] = useState<Record<string, string | null>>({})
  const ws = useData((s) => s)
  // a second import has to know the issues archived since the first
  useEffect(() => loadArchive(), [])

  async function run(what: string, fn: () => Promise<void>) {
    setBusy(what)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      setProblem(e instanceof LinearError ? e.message : `Something went wrong: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const choices: ImportChoices = { teamKeys: picked, people }
  const plan = useMemo(
    () => (stage.at === 'check' && ws.me ? buildImport(stage.data, { teamKeys: picked, people }, { ...ws, me: ws.me.login }, ulid, new Date().toISOString()) : null),
    // the plan is made once when you reach the check step
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [stage],
  )

  if (stage.at === 'key') {
    return (
      <Panel
        step={0}
        title="Import from Linear"
        footer={
          <Button
            disabled={!key.trim() || !!busy}
            onClick={() =>
              run('Checking the key…', async () => {
                const basics = await readBasics(key)
                const linked = new Map(Object.values(ws.teams).flatMap((t) => (typeof t.linearId === 'string' ? [[t.linearId, t.key] as const] : [])))
                setPicked(Object.fromEntries(basics.teams.filter((t) => linked.has(t.id)).map((t) => [t.id, linked.get(t.id)!])))
                setStage({ at: 'teams', basics })
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : null} Continue
          </Button>
        }
      >
        <p>Bring your teams, issues, comments, projects and labels over from Linear. Nothing changes in Linear.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5">
          <li>
            In Linear, open{' '}
            <a className="underline underline-offset-2" href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
              Settings › Security &amp; access <ExternalLink className="inline size-3.5" />
            </a>
            .
          </li>
          <li>Under Personal API keys, make a new key and copy it.</li>
          <li>Paste it here. It's used for this import only and isn't saved anywhere.</li>
        </ol>
        <Input
          className="mt-5"
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="lin_api_…"
          aria-label="Linear API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Problem>{problem}</Problem>
      </Panel>
    )
  }

  if (stage.at === 'teams') {
    const { basics } = stage
    const keys = Object.values(picked)
    const bad = keys.find((k) => !KEY_RE.test(k)) ?? keys.find((k, i) => keys.indexOf(k) !== i)
    return (
      <Panel
        step={1}
        title={`Which teams from ${basics.org.name}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setStage({ at: 'key' })}>
              Back
            </Button>
            <Button
              disabled={!keys.length || !!bad || !!busy}
              onClick={() =>
                run('Reading…', async () => {
                  const rest = await readTeams(key, Object.keys(picked), setBusy)
                  const data: LinearData = { ...basics, ...rest }
                  const here = Object.values(ws.people).filter((p) => !isGuest(p.login))
                  const users = involvedUsers(data)
                  const guests = guestLogins(users, ws.people)
                  // nobody here by that name: they come as someone who hasn't joined, so their work stays theirs
                  setPeople(Object.fromEntries(users.map((u) => [u.id, people[u.id] !== undefined ? people[u.id] : (guessPerson(u, here) ?? guests.get(u.id)!)])))
                  setStage({ at: 'people', data })
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ?? 'Continue'}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">Each team keeps its key, so ENG-123 stays ENG-123. If the key is already used here, the issues join that team.</p>
        <ul className="mt-5 flex flex-col gap-2">
          {basics.teams.map((t) => {
            const on = picked[t.id] !== undefined
            const target = on ? ws.teams[picked[t.id]] : undefined
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={on}
                  aria-label={t.name}
                  onChange={(e) =>
                    setPicked(({ [t.id]: _drop, ...rest }) => (e.target.checked ? { ...rest, [t.id]: t.key } : rest))
                  }
                />
                <span className="w-5 text-center">{emojiFor(t.icon, '📁')}</span>
                <span className="flex-1">
                  {t.name}
                  {on && (
                    <span className="block text-sm text-muted-foreground">
                      {target ? (typeof target.linearId === 'string' && target.linearId === t.id ? 'Imported before: brings in what changed' : `Joins your team ${target.emoji} ${target.name}`) : 'Becomes a new team'}
                    </span>
                  )}
                </span>
                {on && (
                  <Input
                    className="w-24 uppercase"
                    aria-label={`Key for ${t.name}`}
                    value={picked[t.id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) }))}
                  />
                )}
              </li>
            )
          })}
        </ul>
        <Problem>{problem ?? (bad !== undefined ? 'Each team needs its own key: a letter, then up to 6 letters or digits.' : null)}</Problem>
      </Panel>
    )
  }

  if (stage.at === 'people') {
    const users = involvedUsers(stage.data)
    const guests = guestLogins(users, ws.people)
    const here = Object.values(ws.people)
      .filter((p) => !isGuest(p.login))
      .sort((a, b) => (a.name || a.login).localeCompare(b.name || b.login))
    return (
      <Panel
        step={2}
        title="Who's who?"
        footer={
          <>
            <Button variant="outline" onClick={() => setStage({ at: 'teams', basics: stage.data })}>
              Back
            </Button>
            <Button onClick={() => setStage({ at: 'check', data: stage.data })}>Continue</Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          We matched people by name. Fix anyone we got wrong. Someone who isn't here yet still comes over with their name, so their issues, comments
          and views stay theirs. Invite them later and import again: everything moves to their account.
        </p>
        <ul className="mt-5 flex flex-col divide-y rounded-lg border">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{u.name}</span>
                {u.email && <span className="block truncate text-sm text-muted-foreground">{u.email}</span>}
              </span>
              <Select value={people[u.id] ?? NOBODY} onValueChange={(v) => setPeople((p) => ({ ...p, [u.id]: v === NOBODY ? null : v }))}>
                <SelectTrigger className="w-60" aria-label={`Who is ${u.name} here`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={guests.get(u.id)!}>
                    <PersonAvatar login={guests.get(u.id)} className="size-5 text-[8px]" /> {linearName(u)} (hasn’t joined)
                  </SelectItem>
                  <SelectItem value={NOBODY}>No one</SelectItem>
                  {here.map((p) => (
                    <SelectItem key={p.login} value={p.login}>
                      <PersonAvatar person={p} className="size-5 text-[8px]" /> {p.name || p.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
          {!users.length && <li className="px-4 py-3 text-muted-foreground">Nobody to match: these teams have no issues yet.</li>}
        </ul>
      </Panel>
    )
  }

  if (stage.at === 'check' && plan) {
    const c = plan.counts
    const rows: [string, string, number][] = [
      ['new team', 'new teams', c.teams],
      ['issue', 'issues', c.issues],
      ['comment', 'comments', c.comments],
      ['project', 'projects', c.projects],
      ['new label', 'new labels', c.labels],
      ['view', 'views', c.views],
    ]
    return (
      <Panel
        step={3}
        title="Ready to import"
        footer={
          <>
            <Button variant="outline" onClick={() => setStage({ at: 'people', data: stage.data })}>
              Back
            </Button>
            <Button
              disabled={!plan.files.size}
              onClick={() => {
                const keys = [...new Set(Object.values(choices.teamKeys))]
                setStage({ at: 'saving', saved: 0, total: plan.files.size })
                // everything is kept on this device as it goes; if sending stalls, it carries on by itself like any change
                void importFiles(plan.files, `Import from Linear: ${c.issues} issues`, (saved, total) => setStage({ at: 'saving', saved, total }))
                  .catch((e: unknown) => console.warn('Sprawniej: the import is still being saved', e))
                  .finally(() => setStage({ at: 'done', result: plan, keys }))
              }}
            >
              Import
            </Button>
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map(([one, many, n]) => (
            <li key={many} className="rounded-lg border px-4 py-3">
              <span className="block text-2xl font-semibold tabular-nums">{n.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">{n === 1 ? one : many}</span>
            </li>
          ))}
        </ul>
        {c.archived > 0 && (
          <p className="mt-5 text-sm text-muted-foreground">
            {c.archived === 1 ? 'One of the issues was finished long ago, so it goes' : `${c.archived.toLocaleString()} of the issues were finished long ago, so they go`} to the
            archive. You can still find and open {c.archived === 1 ? 'it' : 'them'}.
          </p>
        )}
        {plan.skippedViews.length > 0 && (
          <div className="mt-5 text-sm text-muted-foreground">
            <p>
              {plan.skippedViews.length === 1 ? 'One view stays' : `${plan.skippedViews.length} views stay`} in Linear: none of {plan.skippedViews.length === 1 ? 'its' : 'their'} filters can
              come over (like “is not”, dates, or people you set to “No one”), and without them {plan.skippedViews.length === 1 ? 'it' : 'they'} would show
              every issue.
            </p>
            <p className="mt-1 text-foreground/80">{plan.skippedViews.map((n) => `“${n}”`).join(', ')}</p>
          </div>
        )}
        {plan.inexactViews.length > 0 && (
          <div className="mt-5 text-sm text-muted-foreground">
            <p>
              {plan.inexactViews.length === 1 ? 'One view keeps' : `${plan.inexactViews.length} views keep`} only the filters that fit, so {plan.inexactViews.length === 1 ? 'it' : 'they'}{' '}
              may not show quite the same issues as in Linear. Check {plan.inexactViews.length === 1 ? 'it' : 'them'} after the import.
            </p>
            <p className="mt-1 text-foreground/80">{plan.inexactViews.map((n) => `“${n}”`).join(', ')}</p>
          </div>
        )}
        {stage.data.viewsFailed && <p className="mt-5 text-sm text-muted-foreground">Linear didn’t share its views with this key, so only issues and the rest come over.</p>}
        {plan.renumbered.length > 0 && (
          <p className="mt-5 text-sm text-muted-foreground">
            {plan.renumbered.length === 1 ? 'One issue gets' : `${plan.renumbered.length} issues get`} a new number, because the team here already
            used it: {plan.renumbered.slice(0, 5).map((r) => `${r.from} → ${r.to}`).join(', ')}
            {plan.renumbered.length > 5 ? '…' : '.'}
          </p>
        )}
        <p className="mt-5 text-sm text-muted-foreground">Images uploaded to Linear stay as links to Linear. You can run the import again later to bring in new changes.</p>
      </Panel>
    )
  }

  if (stage.at === 'saving') {
    return (
      <Panel step={3} title="Importing…">
        <p className="text-muted-foreground">Keep this page open until it's done.</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={stage.total} aria-valuenow={stage.saved}>
          <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * stage.saved) / Math.max(1, stage.total)}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          Saved {stage.saved.toLocaleString()} of {stage.total.toLocaleString()} files
        </p>
      </Panel>
    )
  }

  if (stage.at === 'done') {
    return (
      <Panel step={4} title="All done">
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-status-review" /> {doneText(stage.result.counts)}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {stage.keys.map((k) => (
            <Button key={k} asChild variant="outline">
              <Link href={`/team/${k}/issues/all`}>
                {ws.teams[k]?.emoji} {ws.teams[k]?.name ?? k}
              </Link>
            </Button>
          ))}
        </div>
      </Panel>
    )
  }
  return null
}
