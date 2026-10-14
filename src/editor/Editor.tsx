/**
 * The rich text editor for descriptions and comments. It formats as you type (**bold**, "- " lists, "[] " checklists,
 * ``` code), turns pasted links into links (paste a link onto selected words to link them), and stores plain Markdown.
 *
 * Saving: `onChange` gets the Markdown a moment after you stop typing, and at once when you leave the field.
 * A teammate's change shows up here too, unless you're typing in this field right now.
 */
import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { createLowlight } from 'lowlight'
import { toast } from 'sonner'
import { addImage } from '@/data/actions'
import { assetUrl } from '@/data/assets'
import { cn } from '@/lib/utils'
import { MentionSuggest } from './MentionSuggest'
import { References } from './references'
import { LANGUAGES } from './languages'
import { tidyMarkdown } from './tidy'
import { mergeText } from '@/sync/merge'

const lowlight = createLowlight(LANGUAGES)

const SAVE_AFTER = 400

/** pictures keep their workspace address in the Markdown and show from the app's own copy */
const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-src') ?? el.getAttribute('src'),
        renderHTML: (attrs: { src?: string | null }) => ({ src: assetUrl(attrs.src), 'data-src': attrs.src }),
      },
    }
  },
})

interface Props {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  /** ⌘/Ctrl + Enter, with the text as it is right now */
  onSubmit?: (markdown: string) => void
  /** the field's accessible name */
  label?: string
}

export function Editor({ value, onChange, placeholder = 'Add a description…', autoFocus, className, onSubmit, label = 'Description' }: Props) {
  const lastSent = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const changeRef = useRef(onChange)
  const submitRef = useRef(onSubmit)
  useEffect(() => {
    changeRef.current = onChange
    submitRef.current = onSubmit
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Markdown,
      References,
      MentionSuggest,
      Picture,
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'prose-sprawniej tiptap-editor outline-none', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => addPictures(event.clipboardData?.files) || pasteMarkdown(event),
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        return addPictures(event.dataTransfer?.files, at)
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && submitRef.current) {
          flush()
          submitRef.current(lastSent.current)
          return true
        }
        return false
      },
    },
    onUpdate: () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_AFTER)
    },
    onBlur: () => flush(),
  })

  // the paste handler is set up once; it finds the editor here
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  /**
   * Plain text that's written in Markdown (from a README, a note, a chat) comes in formatted, the way it will look
   * once saved. Text copied from a web page (it brings its own formatting) and text pasted into code is left alone.
   */
  function pasteMarkdown(event: ClipboardEvent): boolean {
    const editor = editorRef.current
    const data = event.clipboardData
    if (!editor || !data || data.types.includes('text/html') || editor.isActive('codeBlock')) return false
    const text = data.getData('text/plain')
    if (!looksLikeMarkdown(text)) return false
    return editor.commands.insertContent(text, { contentType: 'markdown' })
  }

  /** pasted or dropped pictures: kept in the workspace, then shown where they landed */
  function addPictures(files: FileList | undefined, at?: number): boolean {
    const pictures = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!pictures.length) return false
    for (const f of pictures) {
      addImage(f).then(
        (src) => {
          if (!editor || editor.isDestroyed) return
          const chain = editor.chain().focus()
          ;(at === undefined ? chain : chain.setTextSelection(at)).setImage({ src, alt: f.name.replace(/\.[^.]+$/, '') }).run()
        },
        (e: Error) => toast(e.message),
      )
    }
    return true
  }

  function flush() {
    clearTimeout(timer.current)
    if (!editor || editor.isDestroyed) return
    const md = tidyMarkdown(editor.getMarkdown())
    if (md === lastSent.current) return
    lastSent.current = md
    changeRef.current(md)
  }

  // leaving the page while a save is waiting: send it now
  useEffect(() => () => flush(), [editor]) // oxlint-disable-line react-hooks/exhaustive-deps

  // someone else changed it: show the new text. If you're writing here, their change is merged into yours line by
  // line (yours wins where you both changed the same lines), so saving your text never undoes theirs.
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === lastSent.current) return
    const base = lastSent.current
    lastSent.current = value
    if (!editor.isFocused) {
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
      return
    }
    const mine = tidyMarkdown(editor.getMarkdown())
    const merged = mine === base ? value : mergeText(base, mine, value)
    if (merged === mine) return
    const { from, to } = editor.state.selection
    editor.commands.setContent(merged, { contentType: 'markdown', emitUpdate: false })
    const end = editor.state.doc.content.size
    editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) })
    // what you added is still to be saved: `lastSent` is their text, the editor has both
    if (merged !== value) {
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_AFTER)
    }
  }, [value, editor]) // oxlint-disable-line react-hooks/exhaustive-deps

  return <EditorContent editor={editor} className={cn('min-h-24 cursor-text', className)} />
}

/** headings, lists, checklists, quotes, code fences, bold or links at the start of a line or inline */
const looksLikeMarkdown = (text: string) => /^(#{1,6} |[-*+] |\d+\. |> |```|[-*] \[[ xX]\] )/m.test(text) || /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/.test(text)
