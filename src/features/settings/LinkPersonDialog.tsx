/**
 * "Is @darekk someone from Linear?" Linking moves everything that pointed at someone the Linear import brought
 * (issues, comments, projects, views) to a GitHub account (linkPerson in actions.ts). It opens two ways:
 *   - right after an invite: pick which person from Linear the new account is (or Skip);
 *   - from Settings › People: pick which GitHub account a person from Linear is.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { PersonAvatar } from '@/components/Avatar'
import { linkPerson } from '@/data/actions'
import { sameName } from '@/data/relink'
import { useData } from '@/data/store'
import { getUser, plainError, toPerson } from '@/github/api'
import { isGuest, type Person } from '@/model/schema'
import { useSession } from '@/session'
import { Button } from '@/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/ui/dialog'
import { cn } from '@/lib/utils'
import { useUnlinked, workOf } from './unlinked'

/** a GitHub account as a person, from GitHub itself (their own profile file, if any, wins when linking) */
async function accountOf(token: string, login: string): Promise<Person> {
  try {
    return toPerson(await getUser(token, login))
  } catch {
    return { login, githubId: 0, name: login, avatarUrl: `https://github.com/${encodeURIComponent(login)}.png` }
  }
}

interface Choice {
  key: string
  person: Person
  hint: string
}

type Props =
  /** right after inviting @login: which person from Linear are they? */
  | { from: 'invite'; login: string; onClose: () => void }
  /** a person from Linear: which GitHub account are they? `invited`: logins invited but not here yet */
  | { from: 'linear'; guest: Person; invited: string[]; onClose: () => void }

export function LinkPersonDialog(props: Props) {
  const token = useSession((s) => s.token)
  const s = useData(useShallow((st) => ({ people: st.people, issues: st.issues, comments: st.comments })))
  const guests = useUnlinked()
  /** the invited account, as GitHub knows it (for its name and picture) */
  const [account, setAccount] = useState<Person | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inviteLogin = props.from === 'invite' ? props.login : null

  useEffect(() => {
    if (!inviteLogin) return
    let on = true
    void accountOf(token, inviteLogin).then((a) => on && setAccount(a))
    return () => {
      on = false
    }
  }, [token, inviteLogin])

  const choices: Choice[] = useMemo(() => {
    if (props.from === 'invite') return guests.map((g) => ({ key: g.login, person: g, hint: workOf(s, g.login) || 'Nothing of theirs yet' }))
    const here = Object.values(s.people).filter((p) => !isGuest(p.login))
    const known = new Set(here.map((p) => p.login))
    const invited = props.invited.filter((l) => !known.has(l)).map((login) => ({ login, githubId: 0, name: login, avatarUrl: `https://github.com/${encodeURIComponent(login)}.png` }))
    return [
      ...here.map((p) => ({ key: p.login, person: p, hint: `@${p.login}` })),
      ...invited.map((p) => ({ key: p.login, person: p, hint: `@${p.login}, invited` })),
    ].sort((a, b) => a.person.name.localeCompare(b.person.name))
  }, [props, guests, s])

  // the likely match is picked to start with (same name), until you pick someone yourself
  const guess = useMemo(() => {
    if (props.from === 'invite') return account ? (guests.find((g) => sameName(g.name, account))?.login ?? null) : null
    return choices.find((c) => sameName(props.guest.name, c.person))?.key ?? null
  }, [props, account, guests, choices])
  const chosen = picked ?? guess
  /** the row the keyboard is on; it starts on the likely match (once known), so Enter picks them */
  const [active, setActive] = useState<string>()
  const [seenGuess, setSeenGuess] = useState(guess)
  if (guess !== seenGuess) {
    setSeenGuess(guess)
    setActive(undefined)
  }
  const choice = choices.find((c) => c.key === chosen)

  async function link() {
    if (!choice) return
    setBusy(true)
    try {
      if (props.from === 'invite') {
        linkPerson(choice.key, account ?? (await accountOf(token, props.login)))
        toast(`${choice.person.name} is now @${props.login}`, { description: 'Their issues, comments and views are theirs.' })
      } else {
        linkPerson(props.guest.login, await accountOf(token, choice.key))
        toast(`${props.guest.name} is now @${choice.key}`, { description: 'Their issues, comments and views are theirs.' })
      }
      props.onClose()
    } catch (e) {
      toast(plainError(e))
    } finally {
      setBusy(false)
    }
  }

  const title = props.from === 'invite' ? `Is @${props.login} someone from Linear?` : `Who is ${props.guest.name} on GitHub?`
  const guest = props.from === 'invite' ? choice?.person : props.guest
  const target = props.from === 'invite' ? `@${props.login}` : choice && `@${choice.key}`
  const moved = guest && workOf(s, guest.login)
  const button = props.from === 'invite' ? (choice ? `Link to ${choice.person.name}` : 'Link') : choice ? `Link to @${choice.key}` : 'Link'

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {props.from === 'invite'
            ? 'If they used Linear before, pick who they were there. Their issues, comments and views move to their account.'
            : 'Pick their account. Their issues, comments and views move to it. Not here yet? Invite them first, then link them.'}
        </DialogDescription>
        <Command className="rounded-lg border" value={active ?? chosen ?? ''} onValueChange={setActive}>
          <CommandInput placeholder={props.from === 'invite' ? 'Search people from Linear…' : 'Search people…'} />
          <CommandList className="max-h-72">
            <CommandEmpty>Nobody by that name.</CommandEmpty>
            {choices.map((c) => (
              <CommandItem key={c.key} value={c.key} keywords={[c.person.name, c.key]} onSelect={() => setPicked(c.key)} className="gap-3 py-2">
                <PersonAvatar person={c.person} className="size-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.person.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>
                </span>
                <Check className={cn('size-4', c.key === chosen ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        {choice && guest && target && (
          <p className="text-sm text-muted-foreground">
            {moved ? `${moved} ${/^1 \w+$/.test(moved) ? 'moves' : 'move'} to ${target}.` : `${guest.name} becomes ${target}.`} This can’t be undone.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={props.onClose}>
            {props.from === 'invite' ? 'Skip' : 'Cancel'}
          </Button>
          <Button disabled={!choice || busy} onClick={() => void link()}>
            {busy && <Loader2 className="animate-spin" />} {button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
