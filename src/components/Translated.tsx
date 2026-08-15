import { useEffect, useState } from 'react'
import { translate, translateAvailability } from '../lib/translate'

/**
 * A description with the option of reading it in your own language.
 *
 * The English stays available in one tap, always. A translation is not the source: names
 * come out mangled often enough that someone who half-recognises a title needs to be able
 * to see what was actually written, and hiding that behind nothing would be worse than
 * not translating at all.
 *
 * The button appears only where it can do something — a device set to English is already
 * reading the original, and the plugin says so rather than making this decide.
 */
export function Translated({
  text,
  className,
  onClick,
}: {
  text: string
  className?: string
  /** The show page expands its description on a tap; that behaviour is not this one's. */
  onClick?: () => void
}) {
  const [offered, setOffered] = useState(false)
  const [translated, setTranslated] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void translateAvailability().then((s) => setOffered(s !== 'unsupported'))
  }, [])
  // A different description is a different translation.
  useEffect(() => {
    setTranslated(null)
    setShowing(false)
    setFailed(false)
  }, [text])

  if (!text.trim()) return null

  const show = async () => {
    if (translated) {
      setShowing(true)
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      const [out] = (await translate([text])) ?? []
      // The framework hands back the original when it cannot do better, and showing that
      // under a "in Russian" label would be a small lie.
      if (out && out !== text) {
        setTranslated(out)
        setShowing(true)
      } else {
        setFailed(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className={className} onClick={onClick}>
        {showing && translated ? translated : text}
      </p>
      {offered && (
        <button
          className="textbtn"
          disabled={busy}
          onClick={() => (showing ? setShowing(false) : void show())}
        >
          {/* The rest of the app speaks English, and the target language is whatever the
              phone is set to — so the label says what happens, not which language. */}
          {busy ? 'Translating…' : showing ? 'Show the original' : 'Read in your language'}
        </button>
      )}
      {failed && <p className="hint">Could not translate this — showing the original.</p>}
    </>
  )
}
