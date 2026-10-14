/**
 * Run `fn` when the tab is hidden or closed, before the save that follows (src/sync/engine.ts listens on the
 * document; this listens earlier, on the way down from the window). Fields that wait a moment before handing over
 * what you typed use it, so closing the tab right after typing keeps the last words.
 */
export function onBeforeHide(fn: () => void): () => void {
  const hidden = () => document.visibilityState === 'hidden' && fn()
  window.addEventListener('visibilitychange', hidden, true)
  window.addEventListener('pagehide', fn, true)
  return () => {
    window.removeEventListener('visibilitychange', hidden, true)
    window.removeEventListener('pagehide', fn, true)
  }
}
