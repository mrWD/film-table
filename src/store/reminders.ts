import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requestReminderPermission, rescheduleEpisodeAlerts } from '../lib/reminders'
import { useUi } from './ui'

/**
 * The one preference behind episode alerts. It stays `false` until the system actually
 * granted permission — storing the wish without the grant would show the toggle as on
 * while nothing can ever fire, which reads as a broken feature rather than a denied
 * permission.
 *
 * The permission is requested here, from the person's own tap on the toggle, and never
 * on launch: an app that asks for notifications before it has shown anything is asking
 * to be declined — twice, counting the store review.
 */
interface RemindersState {
  enabled: boolean
  setEnabled: (on: boolean) => Promise<void>
}

export const useReminders = create<RemindersState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: async (on) => {
        if (!on) {
          set({ enabled: false })
          await rescheduleEpisodeAlerts(false)
          return
        }
        const granted = await requestReminderPermission()
        if (!granted) {
          set({ enabled: false })
          useUi.getState().showToast('Notifications are off for this app in system settings')
          return
        }
        set({ enabled: true })
        await rescheduleEpisodeAlerts(true)
      },
    }),
    { name: 'filmtable-reminders-v1' },
  ),
)
