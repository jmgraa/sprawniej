/** First screen for someone who opens Sprawniej without a join link. */
import { useState } from 'react'
import { useSession } from '@/session'
import { Button } from '@/ui/button'
import { KeyStep } from './KeyStep'
import { Step } from './Step'

export function Welcome() {
  const signIn = useSession((s) => s.signIn)
  const [stage, setStage] = useState<'hello' | 'key'>('hello')
  if (stage === 'key') {
    return (
      <Step title="Sign in with a GitHub key" wide footer={<Button variant="ghost" onClick={() => setStage('hello')}>Back</Button>}>
        <KeyStep onDone={signIn} />
      </Step>
    )
  }
  return (
    <Step
      title="Welcome to Sprawniej"
      footer={
        <Button size="lg" onClick={() => setStage('key')}>
          Sign in with GitHub
        </Button>
      }
    >
      <p>Plan and track your team's work: issues, projects and views, on a list or a board. Everything is kept on GitHub, in a place your team owns.</p>
      <p className="mt-3 text-muted-foreground">
        <b className="text-foreground">Got a join link from a teammate?</b> Open that link instead; it takes you straight to your team.
      </p>
    </Step>
  )
}
