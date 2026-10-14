/** The "new issue" dialog's open state, so any button, group "+" or the C key can open it with presets. */
import { create } from 'zustand'
import type { NewIssue } from '@/data/actions'
import { findByRef, useData } from '@/data/store'

interface Composer {
  open: boolean
  defaults: Partial<NewIssue>
}

export const useComposer = create<Composer>()(() => ({ open: false, defaults: {} }))

/** the team the current page is about (a team page, or an issue's team), else your first team */
export function currentTeam(): string | undefined {
  const s = useData.getState()
  const hash = location.hash
  const team = /^#\/team\/([^/]+)/.exec(hash)?.[1]
  if (team && s.teams[team]) return team
  const ref = /^#\/issue\/([^/?]+)/.exec(hash)?.[1]
  const issue = ref ? findByRef(s.issues, ref) : undefined
  if (issue) return issue.team
  const mine = Object.values(s.teams).find((t) => s.me && t.members.includes(s.me.login))
  return mine?.key ?? Object.keys(s.teams)[0]
}

export function openComposer(defaults: Partial<NewIssue> = {}) {
  // on a team's Backlog tab a new issue starts in Backlog, so it shows up right where you are
  const onBacklog = /^#\/team\/[^/]+\/issues\/backlog/.test(location.hash)
  useComposer.setState({ open: true, defaults: { team: currentTeam(), ...(onBacklog && { status: 'backlog' as const }), ...defaults } })
}
