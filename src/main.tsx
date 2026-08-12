import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import App from './App'
import { whenHydrated } from 'tables-core'
import { hideSplash, wireBackButton } from './lib/native-ui'
import { useLibrary } from './store/library'
import { useShowCache } from './store/cache'

registerSW({ immediate: true })
wireBackButton()

// The library hydrates from IndexedDB in a browser and from a file in the native app —
// asynchronous either way. Rendering before it settles would flash an empty library (and
// let startup effects act on one), so the first render waits. In the browser the page
// background covers the wait; natively the splash screen does (launchAutoHide is off),
// and is dismissed here once there is something behind it.
void whenHydrated([useLibrary, useShowCache]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  hideSplash()
})
