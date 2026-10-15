/** What's new: every release, newest first, from the same list that makes CHANGELOG.md (src/version.ts). */
import { useCrumbs } from '@/app/chrome'
import { APP_VERSION, CHANGELOG } from '@/version'

const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

export function WhatsNewPage() {
  useCrumbs([{ label: 'What’s new' }])
  return (
    <div className="flex-1 overflow-y-auto px-4 py-10 md:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">What’s new</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">You’re on Sprawniej {APP_VERSION}. New versions arrive by themselves; the newest is at the top.</p>
        <ol className="mt-8 flex flex-col">
          {CHANGELOG.map((r) => (
            <li key={r.version} className="border-t py-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">{r.title}</h2>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {r.version} · {day(r.date)}
                </span>
                {r.version === APP_VERSION && <span className="rounded-full border px-2 text-xs leading-5 text-muted-foreground">You have this one</span>}
              </div>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[15px] marker:text-muted-foreground">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
