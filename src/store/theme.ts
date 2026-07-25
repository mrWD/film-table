import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeChoice = 'system' | 'light' | 'dark'

const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#f2f2f2',
  dark: '#0e0e10',
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice
}

/** Drives the CSS palette and the browser chrome colour (PWA status bar). */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', THEME_COLORS[resolveTheme(choice)])
}

interface ThemeState {
  theme: ThemeChoice
  setTheme: (t: ThemeChoice) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'filmtable-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)

/** While following the system, track changes to it so the chrome colour keeps up. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return () => {}
  const onChange = () => {
    if (useTheme.getState().theme === 'system') applyTheme('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
