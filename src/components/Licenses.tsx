import { useState } from 'react'

/**
 * The open-source licences the app is built with.
 *
 * The text is `licenses.txt`, a static file that scripts/gen-licenses.mjs writes before
 * every build — so it is in the native app's own assets and in the web build's precache,
 * and opens with no network. It is read and shown in place rather than linked to: inside
 * the native shell a plain link navigates the web view itself to a text file, and on iOS
 * there is no back button to come back from it.
 *
 * Collapsed by default, and fetched on first open: a few hundred kilobytes of licence text
 * is not worth reading on every visit to Profile.
 */
export function Licenses() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    setOpen((v) => !v)
    if (open || text !== null) return
    setFailed(false)
    fetch(`${import.meta.env.BASE_URL}licenses.txt`)
      .then((res) => {
        // A host with an SPA fallback answers a missing file with index.html and a 200.
        if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
          throw new Error(String(res.status))
        }
        return res.text()
      })
      .then(setText, () => setFailed(true))
  }

  return (
    <>
      <p className="attribution">
        <button type="button" className="linkbtn" onClick={toggle} aria-expanded={open}>
          {open ? 'Hide open-source licences' : 'Open-source licences'}
        </button>
      </p>
      {open && failed && <p className="attribution">The licence list could not be opened.</p>}
      {open && text !== null && (
        <pre className="licenses-text" tabIndex={0}>
          {text}
        </pre>
      )}
    </>
  )
}
