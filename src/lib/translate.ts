import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from 'tables-core'

/**
 * Descriptions in the reader's own language, translated on the device.
 *
 * TVmaze writes its episode summaries in English and offers nothing else. So does Open
 * Library, and Steam only sometimes. For anyone not reading English that is most of the
 * text in the app.
 *
 * This is Apple's Translation framework, not the language model, and the choice is
 * deliberate on both counts. It runs on any iPhone from iOS 17.4 instead of the few with
 * Apple Intelligence, and it translates instead of paraphrasing — a model asked to put a
 * synopsis into Russian will eventually improve it, and an invented plot point in a
 * translated summary is indistinguishable from the real thing.
 *
 * Nothing is sent anywhere; the pack lives on the phone.
 */

export type TranslateStatus = 'installed' | 'supported' | 'unsupported'

interface TranslateBridgePlugin {
  availability(options: { from: string; to?: string }): Promise<{ status: TranslateStatus }>
  translate(options: {
    texts: string[]
    from: string
    to?: string
  }): Promise<{ texts: string[]; ms: number }>
}

const TranslateBridge = registerPlugin<TranslateBridgePlugin>('TranslateBridge')

let cached: Promise<TranslateStatus> | null = null

/**
 * Asked once per launch. `supported` means real but not yet downloaded — the first
 * translation puts up the system's own prompt, so it is still worth offering.
 *
 * Which language the reader wants is left entirely to the native side, and that is not
 * fussiness. `navigator.language` reports the app's localization rather than the phone's
 * setting, so in an English-only app it says "en" on a Russian phone — and gating on it
 * here meant the button never appeared on the device it was built for.
 */
export function translateAvailability(): Promise<TranslateStatus> {
  if (!isNativeApp()) return Promise.resolve('unsupported')
  cached ??= TranslateBridge.availability({ from: 'en' })
    .then((res) => res.status)
    .catch(() => 'unsupported' as const)
  return cached
}

/**
 * null when it could not be done — the caller keeps showing the English it already has,
 * which is the honest fallback and the one that loses nothing.
 */
export async function translate(texts: string[]): Promise<string[] | null> {
  if (texts.length === 0) return []
  if ((await translateAvailability()) === 'unsupported') return null
  try {
    const res = await TranslateBridge.translate({ texts, from: 'en' })
    return res.texts
  } catch {
    return null
  }
}
