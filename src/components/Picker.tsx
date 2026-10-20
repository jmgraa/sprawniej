/**
 * A searchable menu for picking one value (status, assignee…) or several (labels). It opens from any trigger,
 * filters as you type, works with the keyboard, and can offer "Create …" for what doesn't exist yet.
 * The open state can be controlled from outside, so keyboard shortcuts can open a picker too.
 */
import { useState, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { plainFilter } from '@/lib/fuzzy'
import { plain } from '@/lib/plain'
import { cn } from '@/lib/utils'

export interface PickerItem<V> {
  value: V
  label: string
  icon?: ReactNode
  /** extra words to match when searching (e.g. a login) */
  keywords?: string[]
  hint?: string
}

interface Common<V> {
  items: PickerItem<V>[]
  placeholder: string
  children: ReactNode
  /** create something new from the typed text (e.g. a label) */
  onCreate?: (text: string) => void
  createLabel?: (text: string) => string
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** the trigger is not a button of its own (it's wrapped) */
  asChild?: boolean
}

type Props<V> = Common<V> & ({ multiple?: false; value: V; onSelect: (v: V) => void } | { multiple: true; value: V[]; onSelect: (v: V[]) => void })

const keyOf = (v: unknown) => JSON.stringify(v)

/** cmdk's usual matching, except that typing an item's exact keyword ("ENG-1") puts it first, ahead of ENG-12 */
const exactFirst = (value: string, search: string, keywords?: string[]) => {
  const q = plain(search.trim())
  if (q && keywords?.some((k) => plain(k) === q)) return 1
  return plainFilter(value, search, keywords) * 0.99
}

export function Picker<V>(props: Props<V>) {
  const { items, placeholder, children, onCreate, createLabel, align = 'start', asChild = true } = props
  const [ownOpen, setOwnOpen] = useState(false)
  const [query, setQuery] = useState('')
  const open = props.open ?? ownOpen
  const setOpen = (o: boolean) => {
    if (!o) setQuery('')
    setOwnOpen(o)
    props.onOpenChange?.(o)
  }
  const chosen = new Set(props.multiple ? props.value.map(keyOf) : [keyOf(props.value)])
  const exact = items.some((i) => i.label.toLowerCase() === query.trim().toLowerCase())

  function pick(v: V) {
    if (props.multiple) {
      const k = keyOf(v)
      props.onSelect(chosen.has(k) ? props.value.filter((x) => keyOf(x) !== k) : [...props.value, v])
    } else {
      props.onSelect(v)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={asChild}>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <Command filter={exactFirst}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{onCreate ? 'Nothing yet. Type a name to create it.' : 'Nothing found.'}</CommandEmpty>
            <CommandGroup>
              {items.map((i) => (
                <CommandItem key={keyOf(i.value)} value={`${i.label} ${(i.keywords ?? []).join(' ')} ${keyOf(i.value)}`} keywords={i.keywords} onSelect={() => pick(i.value)}>
                  {i.icon}
                  <span className="truncate">{i.label}</span>
                  {i.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{i.hint}</span>}
                  <Check className={cn('ml-auto size-4', !chosen.has(keyOf(i.value)) && 'invisible', i.hint && 'ml-2')} />
                </CommandItem>
              ))}
              {onCreate && query.trim() && !exact && (
                <CommandItem
                  value={`create ${query}`}
                  onSelect={() => {
                    onCreate(query.trim())
                    setQuery('')
                  }}
                >
                  <Plus />
                  {createLabel ? createLabel(query.trim()) : `Create “${query.trim()}”`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
