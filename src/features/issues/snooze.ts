/** How long an issue can be snoozed in Triage, for the Triage bar and the right-click menu. */

/** when a snooze ends: tomorrow, next week or next month, at 9 in the morning */
export const SNOOZES: [string, (d: Date) => void][] = [
  ['Until tomorrow', (d) => d.setDate(d.getDate() + 1)],
  ['For a week', (d) => d.setDate(d.getDate() + 7)],
  ['For a month', (d) => d.setMonth(d.getMonth() + 1)],
]

export function snoozeUntil(step: (d: Date) => void): string {
  const d = new Date()
  step(d)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}
