/**
 * Text you edit in place (a name, a description). There's no Save button: it saves a moment after you stop typing
 * and when you leave the field. Enter leaves a one-line field; Esc puts back what was there. A teammate's change
 * shows up as soon as you're not typing in it.
 */
import { useEffect, useRef, useState } from 'react'
import { onBeforeHide } from '@/lib/beforeHide'
import { cn } from '@/lib/utils'

const SAVE_AFTER = 500

interface Props {
  value: string
  onSave: (text: string) => void
  placeholder?: string
  label: string
  className?: string
  /** one: a single line · wrap: one paragraph that wraps (a title) · many: Enter makes a new line (a description) */
  lines?: 'one' | 'wrap' | 'many'
  /** an empty value isn't allowed (a name): leaving it empty puts the old one back */
  required?: boolean
  /** a value that isn't allowed (a name taken by something else) isn't saved, and leaving puts the old one back */
  allowed?: (text: string) => boolean
  autoFocus?: boolean
  /** after you leave the field (renaming in a list goes back to showing the name) */
  onDone?: () => void
}

export function InlineText({ value, onSave, placeholder, label, className, lines = 'one', required, allowed, autoFocus, onDone }: Props) {
  const multiline = lines === 'many'
  const [text, setText] = useState(value)
  /** you typed something that isn't saved yet: a teammate's change waits until it is */
  const [typing, setTyping] = useState(false)
  const [seen, setSeen] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** what you typed and haven't saved; null = nothing (then leaving the field never saves an old text over a new one) */
  const typed = useRef<string | null>(null)
  if (value !== seen && !typing) {
    setSeen(value)
    setText(value)
  }

  const save = () => {
    clearTimeout(timer.current)
    if (typed.current === null) return
    const next = multiline ? typed.current.trimEnd() : typed.current.trim()
    if (required && !next) return
    if (allowed && !allowed(next)) return
    typed.current = null
    setTyping(false)
    if (next !== value) onSave(next)
  }
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => () => saveRef.current(), [])
  // closing the tab right after typing: hand it over now, not in half a second
  useEffect(() => onBeforeHide(() => saveRef.current()), [])

  const putBack = () => {
    clearTimeout(timer.current)
    typed.current = null
    setTyping(false)
    setText(value)
  }

  function change(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = multiline ? e.target.value : e.target.value.replace(/\n/g, ' ')
    setText(next)
    setTyping(true)
    typed.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveRef.current(), SAVE_AFTER)
  }
  function blur() {
    save()
    // still not saved: empty where a name is needed, or not allowed
    if (typed.current !== null) putBack()
    onDone?.()
    setSeen(value)
  }
  function key(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      putBack()
      e.currentTarget.blur()
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }
  const look = cn('w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/70', className)
  return lines === 'one' ? (
    <input value={text} placeholder={placeholder} aria-label={label} onChange={change} onFocus={(e) => autoFocus && e.target.select()} onBlur={blur} onKeyDown={key} className={look} autoFocus={autoFocus} />
  ) : (
    <textarea
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={change}
      onBlur={blur}
      onKeyDown={key}
      rows={1}
      className={cn(look, 'field-sizing-content')}
    />
  )
}
