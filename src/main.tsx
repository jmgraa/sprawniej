import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { Crash } from '@/app/Crash'
import * as actions from '@/data/actions'
import { useSync, workspace } from '@/sync/engine'
import './index.css'

// for scripted checks (CLAUDE.md, testing)
window.sprawniej = { ...window.sprawniej, actions: { ...actions }, sync: { status: useSync, workspace } }

// a page that loaded fine clears the "reloaded once for a new version" mark, so the next update can do it again
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('sprawniej:reloaded-for-update'), 10_000))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
