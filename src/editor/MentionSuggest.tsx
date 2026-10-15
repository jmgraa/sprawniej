/** Type @ to pick a person. Inserts plain "@login " text (see references.ts). */
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { useData } from '@/data/store'
import { plain } from '@/lib/plain'
import { isGuest, type Person } from '@/model/schema'
import { PeopleList, type ListHandle } from './PeopleList'

function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return
  el.style.position = 'fixed'
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.bottom + 4}px`
  el.style.zIndex = '60'
}

export const MentionSuggest = Extension.create({
  name: 'mentionSuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion<Person, Person>({
        editor: this.editor,
        pluginKey: new PluginKey('mention-suggest'),
        char: '@',
        items: ({ query }) => {
          const q = plain(query)
          // people from Linear who haven't joined can't be mentioned (nobody would hear it)
          return Object.values(useData.getState().people)
            .filter((p) => !isGuest(p.login) && (plain(p.login).includes(q) || plain(p.name).includes(q)))
            .slice(0, 6)
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `@${props.login} `).run()
        },
        render: () => {
          let renderer: ReactRenderer<ListHandle> | null = null
          return {
            onStart: (props: SuggestionProps<Person, Person>) => {
              renderer = new ReactRenderer(PeopleList, { props, editor: props.editor })
              document.body.appendChild(renderer.element)
              place(renderer.element as HTMLElement, props.clientRect?.())
            },
            onUpdate: (props: SuggestionProps<Person, Person>) => {
              renderer?.updateProps(props)
              if (renderer) place(renderer.element as HTMLElement, props.clientRect?.())
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                renderer?.destroy()
                renderer?.element.remove()
                renderer = null
                return true
              }
              return renderer?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              renderer?.destroy()
              renderer?.element.remove()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
