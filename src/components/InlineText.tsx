/**
 * Text you edit in place (a name, a description). There's no Save button: it saves a moment after you stop typing
 * and when you leave the field. Enter leaves a one-line field; Esc puts back what was there. A teammate's change
 * shows up as soon as you're not typing in it.
 */
import { useEffect, useRef, useState } from 'react'
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
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(value)
  if (value !== seen && !focused) {
    setSeen(value)
    setText(value)
  }

  const save = () => {
    clearTimeout(timer.current)
    const next = multiline ? latest.current.trimEnd() : latest.current.trim()
    if (required && !next) return
    if (allowed && !allowed(next)) return
    if (next !== value) onSave(next)
  }
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => () => saveRef.current(), [])

  function change(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = multiline ? e.target.value : e.target.value.replace(/\n/g, ' ')
    setText(next)
    latest.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_AFTER)
  }
  function blur() {
    setFocused(false)
    save()
    if ((required && !latest.current.trim()) || (allowed && !allowed(latest.current.trim()))) {
      latest.current = value
      setText(value)
    }
    onDone?.()
    setSeen(value)
  }
  function key(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      clearTimeout(timer.current)
      latest.current = value
      setText(value)
      e.currentTarget.blur()
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }
  const look = cn('w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/70', className)
  return lines === 'one' ? (
    <input value={text} placeholder={placeholder} aria-label={label} onChange={change} onFocus={(e) => (setFocused(true), autoFocus && e.target.select())} onBlur={blur} onKeyDown={key} className={look} autoFocus={autoFocus} />
  ) : (
    <textarea
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={change}
      onFocus={() => setFocused(true)}
      onBlur={blur}
      onKeyDown={key}
      rows={1}
      className={cn(look, 'field-sizing-content')}
    />
  )
}
