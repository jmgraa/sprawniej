/**
 * Where a join link lands. One step per screen, for people who have never used GitHub:
 * welcome → GitHub account → GitHub key → (we accept the invitation for you) → that's you.
 */
import { useEffect, useMemo, useState } from 'react'
import { Redirect, useLocation } from 'wouter'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { acceptInvitation, getRepo, GitHubError, plainError, SIGN_UP_URL } from '@/github/api'
import { PersonAvatar } from '@/components/Avatar'
import { useSession } from '@/session'
import { useSignOut } from '@/components/SignOut'
import { Button } from '@/ui/button'
import { KeyStep } from './KeyStep'
import { Problem, Step } from './Step'
import { linkIsForSomeoneElse, readJoinLink } from './joinLink'
import { nameFromRepo } from './repoNames'

type Stage = 'welcome' | 'account' | 'signup' | 'key' | 'joining' | 'no-invite' | 'done'

export function JoinWizard() {
  const [, navigate] = useLocation()
  const link = useMemo(() => readJoinLink(location.hash), [])
  const session = useSession()
  const [stage, setStage] = useState<Stage>('welcome')
  const [problem, setProblem] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  // signs out the safe way (this browser's copies go too) and comes back to this link, to sign in again
  const { signOut: switchAccount, dialog: signOutDialog } = useSignOut(location.hash)

  const name = link?.ws ?? (link ? nameFromRepo(link.repo.repo) : 'your team')
  const signedIn = !!session.token && !!session.user

  useEffect(() => {
    if (stage !== 'joining' || !link) return
    let stop = false
    ;(async () => {
      setProblem(undefined)
      const token = useSession.getState().token
      try {
        try {
          await getRepo(token, link.repo)
        } catch (e) {
          if (!(e instanceof GitHubError && e.status === 404)) throw e
          // no access yet: accept the waiting invitation for them
          if (!(await acceptInvitation(token, link.repo))) {
            if (!stop) setStage('no-invite')
            return
          }
          await getRepo(token, link.repo)
        }
        if (!stop) setStage('done')
      } catch (e) {
        if (!stop) setProblem(plainError(e))
      }
    })()
    return () => {
      stop = true
    }
  }, [stage, attempt, link])

  if (!link) return <Redirect to="/" replace />

  const go = () => {
    session.open(link.repo)
    navigate('/', { replace: true })
  }

  switch (stage) {
    case 'welcome':
      return (
        <Step
          step={1}
          of={4}
          title={`Welcome to ${name}`}
          footer={
            <Button size="lg" onClick={() => setStage(signedIn ? 'joining' : 'account')}>
              Get started
            </Button>
          }
        >
          <p>
            {link.by ? <>@{link.by} invited you to </> : <>You're invited to </>}
            Sprawniej, where the team keeps track of work: tasks, bugs and ideas, in one place.
          </p>
          <p className="mt-3 text-muted-foreground">Getting in takes about three minutes. We'll walk you through it.</p>
        </Step>
      )
    case 'account':
      return (
        <Step
          step={2}
          of={4}
          title="Do you have a GitHub account?"
          footer={
            <>
              <Button size="lg" onClick={() => setStage('key')}>
                Yes, I have one
              </Button>
              <Button size="lg" variant="outline" onClick={() => setStage('signup')}>
                No, I need one
              </Button>
              <Button variant="ghost" onClick={() => setStage('welcome')}>
                Back
              </Button>
            </>
          }
        >
          <p>Sprawniej keeps the team's work on GitHub, so you sign in with a GitHub account. It's free.</p>
        </Step>
      )
    case 'signup':
      return (
        <Step
          step={2}
          of={4}
          title="Create a GitHub account"
          footer={
            <>
              <Button size="lg" onClick={() => setStage('key')}>
                I've created it
              </Button>
              <Button variant="ghost" onClick={() => setStage('account')}>
                Back
              </Button>
            </>
          }
        >
          <p>Press the button below. GitHub opens in a new tab; follow its steps, then come back to this tab.</p>
          <Button asChild size="lg" variant="outline" className="mt-5">
            <a href={SIGN_UP_URL} target="_blank" rel="noreferrer">
              Open GitHub sign-up <ExternalLink />
            </a>
          </Button>
          <p className="mt-5 text-sm text-muted-foreground">Tip: tell the person who invited you your new GitHub username, in case they need it.</p>
        </Step>
      )
    case 'key':
      return (
        <Step step={3} of={4} title="Make your GitHub key" wide footer={<Button variant="ghost" onClick={() => setStage('account')}>Back</Button>}>
          <KeyStep
            onDone={(token, me) => {
              session.signIn(token, me)
              setStage('joining')
            }}
          />
        </Step>
      )
    case 'joining':
      return (
        <Step step={3} of={4} title={`Joining ${name}…`}>
          {problem ? (
            <>
              <Problem>{problem}</Problem>
              <Button className="mt-5" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw /> Try again
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Accepting your invitation…
            </p>
          )}
        </Step>
      )
    case 'no-invite':
      if (linkIsForSomeoneElse(link, session.user?.login))
        return (
          <Step
            step={3}
            of={4}
            title="This invitation is for someone else"
            footer={
              <>
                <Button size="lg" onClick={switchAccount}>
                  Sign in as @{link.for}
                </Button>
                <Button variant="ghost" onClick={() => setStage('joining')}>
                  <RefreshCw /> Try again
                </Button>
              </>
            }
          >
            {signOutDialog}
            <p>
              This link was made for <b>@{link.for}</b>, but you're signed in as <b>@{session.user?.login}</b>.
            </p>
            <p className="mt-3">
              If @{link.for} is your other GitHub account, sign in with that one. If not, ask {link.by ? <b>@{link.by}</b> : 'the person who sent you the link'} to
              invite <b>@{session.user?.login}</b> instead, then press Try again.
            </p>
          </Step>
        )
      return (
        <Step
          step={3}
          of={4}
          title="We couldn't find your invitation"
          footer={
            <>
              <Button size="lg" onClick={() => setStage('joining')}>
                <RefreshCw /> Try again
              </Button>
              <Button variant="ghost" onClick={switchAccount}>
                Use a different GitHub account
              </Button>
            </>
          }
        >
          {signOutDialog}
          <p>
            You're signed in as <b>@{session.user?.login}</b>, but there's no invitation to {name} for this account yet.
          </p>
          <p className="mt-3">
            Ask {link.by ? <b>@{link.by}</b> : 'the person who sent you the link'} to invite <b>@{session.user?.login}</b> in Sprawniej (Settings → People), then press Try again.
          </p>
        </Step>
      )
    case 'done':
      return (
        <Step step={4} of={4} title={`That's you, ${session.user?.name?.split(' ')[0] ?? ''}!`} footer={<Button size="lg" onClick={go}>Let's go</Button>}>
          <div className="flex items-center gap-4 rounded-xl border p-4">
            <PersonAvatar person={session.user ?? undefined} className="size-14 text-lg" />
            <div>
              <div className="text-lg font-semibold">{session.user?.name}</div>
              <div className="text-muted-foreground">@{session.user?.login}</div>
            </div>
          </div>
          <p className="mt-5">You're in {name}. Everything you do saves by itself; there's no Save button to remember.</p>
        </Step>
      )
  }
}
