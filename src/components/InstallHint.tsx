import { useEffect, useState } from 'react'
import { isIosSafari, isStandalone } from 'tables-core'
import { IconX } from './Icons'

/**
 * Nudge to install the app to the home screen.
 *
 * This is not a growth banner — it protects the data. The library lives on the device,
 * and Safari's tracking prevention clears script-writable storage for sites not visited
 * for several days. A page kept in a browser tab can therefore lose the library on its
 * own; the same page installed to the home screen is exempt. So the copy says why.
 *
 * Two paths exist because the platforms differ. Chromium fires `beforeinstallprompt` and
 * lets us open the real install dialog. iOS Safari fires nothing and offers no API — the
 * only honest thing there is to describe the two taps.
 */

const DISMISSED = 'filmtable-install-hint-dismissed'

interface PromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallHint() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)
  const [gone, setGone] = useState(() => localStorage.getItem(DISMISSED) === '1')

  useEffect(() => {
    if (gone || isStandalone()) return

    const onPrompt = (e: Event) => {
      // Keep the browser's own mini-infobar from firing as well.
      e.preventDefault()
      setPrompt(e as PromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // Nothing to wait for on iOS — the event never comes.
    if (isIosSafari()) setShowIos(true)

    const onInstalled = () => setGone(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [gone])

  const dismiss = () => {
    localStorage.setItem(DISMISSED, '1')
    setGone(true)
  }

  if (gone || (!prompt && !showIos)) return null

  return (
    <div className="installhint" role="note">
      <div className="installhint-body">
        <strong>Keep FilmTable on your home screen</strong>
        <p>
          {prompt
            ? 'It opens like an app, works offline, and your library is safe from being cleared with your browsing data.'
            : 'Tap Share, then “Add to Home Screen”. It opens like an app, works offline, and your library stops depending on Safari keeping it.'}
        </p>
        {prompt && (
          <button
            className="installhint-go"
            onClick={async () => {
              await prompt.prompt()
              await prompt.userChoice
              // Either way the offer has been made; do not ask twice.
              dismiss()
            }}
          >
            Install
          </button>
        )}
      </div>
      <button className="installhint-close" onClick={dismiss} aria-label="Dismiss">
        <IconX size={16} strokeWidth={2.4} />
      </button>
    </div>
  )
}
