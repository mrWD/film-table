import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from 'tables-core'

/**
 * The on-device model, as the rest of the app sees it.
 *
 * Everything here runs on the phone; nothing is sent anywhere. What the model is asked
 * to do is deliberately narrow — read text this app already has and rephrase it. It is
 * never asked what it knows, because a model this size answers that question with
 * confident invention. Measurements behind that rule are in `docs/DECISIONS.md`.
 */

interface AIBridgePlugin {
  availability(): Promise<{ available: boolean; reason?: string }>
  generate(options: { prompt: string; instructions?: string }): Promise<{ text: string; ms: number }>
  warmUp(): Promise<void>
}

const AIBridge = registerPlugin<AIBridgePlugin>('AIBridge')

/**
 * Asked once per launch and remembered: the answer cannot change while the app is
 * running, and every caller wants it before deciding whether to show a button.
 */
let cachedAvailability: Promise<boolean> | null = null

export function aiAvailable(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false)
  cachedAvailability ??= AIBridge.availability()
    .then((res) => {
      // Loading the model takes about seven seconds; doing it now means the first real
      // request does not.
      if (res.available) void AIBridge.warmUp().catch(() => {})
      return res.available
    })
    .catch(() => false)
  return cachedAvailability
}

export async function summarise(text: string, instructions: string): Promise<string | null> {
  if (!(await aiAvailable())) return null
  try {
    const res = await AIBridge.generate({ prompt: text, instructions })
    return res.text.trim() || null
  } catch {
    return null
  }
}
