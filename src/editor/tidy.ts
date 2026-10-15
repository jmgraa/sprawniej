/**
 * Small clean-ups so files read well on GitHub: a link whose text is its own address becomes the bare address
 * ([https://x.com](https://x.com) → https://x.com), and blank lines at the start and end go.
 */
export function tidyMarkdown(md: string): string {
  return (
    md
      .replace(/\[(https?:\/\/[^\]\s]+)\]\(\1\)/g, '$1')
      // empty paragraphs at the start and end (the editor writes them as &nbsp;) go too
      .replace(/^(\s*(&nbsp;|\u00a0)?\s*\n)+/, '')
      .replace(/(\n\s*(&nbsp;|\u00a0)\s*)+$/, '')
      .replace(/\s+$/, '')
  )
}
