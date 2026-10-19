/** The icon in front of a group's title: the status, priority or person the group stands for. */
import { Box } from 'lucide-react'
import { PersonAvatar } from '@/components/Avatar'
import type { Group } from '@/data/select'
import { useData } from '@/data/store'
import { isStatus, type Priority } from '@/model/status'
import { PriorityIcon, StatusIcon } from './icons'

export function GroupIcon({ group }: { group: Group }) {
  const person = useData((s) => (typeof group.value === 'string' ? s.people[group.value] : undefined))
  const project = useData((s) => (typeof group.value === 'string' ? s.projects[group.value] : undefined))
  if (typeof group.value === 'string' && isStatus(group.value)) return <StatusIcon status={group.value} />
  if (typeof group.value === 'number') return <PriorityIcon priority={group.value as Priority} />
  if (person) return <PersonAvatar person={person} />
  if (project) return <span className="text-sm leading-none">{project.emoji}</span>
  if (group.key === 'nobody') return <PersonAvatar login={null} />
  if (group.key === 'none') return <Box className="size-4 text-muted-foreground" />
  return null
}
