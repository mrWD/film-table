import { useState } from 'react'
import { IconMail, IconLinkedIn } from './Icons'

/**
 * Feedback without a backend.
 *
 * The app has no server for user data and is not getting one for this, so "submit"
 * cannot mean POST. The box below composes a message and hands it to the device's own
 * mail client: nothing is transmitted until the person presses send in their own app,
 * and nothing about them is stored here. The plain address is shown too, because
 * mailto: does nothing on a device with no mail client configured.
 */

const EMAIL = 'lvigtor@gmail.com'
const LINKEDIN = 'https://www.linkedin.com/in/viktor-lavrov'
const SUBJECT = 'FilmTable feedback'

export function Feedback() {
  const [text, setText] = useState('')

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}${
    text.trim() ? `&body=${encodeURIComponent(text)}` : ''
  }`

  return (
    <div className="feedback">
      <p className="support-text">
        Something broken, or something missing? Both are worth writing — a bug, a wish,
        or a show the catalogue gets wrong. It is the only way I hear about any of it.
      </p>

      <textarea
        className="feedback-box"
        rows={4}
        value={text}
        placeholder="What went wrong, or what you wish it did…"
        onChange={(e) => setText(e.target.value)}
      />

      <a className="feedback-send" href={mailto}>
        <IconMail size={18} />
        <span>{text.trim() ? 'Send by email' : 'Write an email'}</span>
      </a>

      <p className="feedback-note">
        This opens your mail app with the message ready — nothing is sent from here, and
        nothing you type is stored.
      </p>

      <div className="feedback-contacts">
        <a href={`mailto:${EMAIL}`} className="feedback-contact">
          <IconMail size={17} />
          <span>{EMAIL}</span>
        </a>
        <a
          href={LINKEDIN}
          className="feedback-contact"
          target="_blank"
          rel="noreferrer noopener"
        >
          <IconLinkedIn size={17} />
          <span>LinkedIn</span>
        </a>
      </div>
    </div>
  )
}
