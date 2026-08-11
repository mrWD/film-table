import { App as CapApp } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from 'tables-core'

/**
 * The small pieces that make the wrapped app feel like an app rather than a page:
 * a status bar that follows the theme, a splash screen that hides once there is
 * something to show, the Android back button, and a tap you can feel.
 *
 * Everything here is a no-op in a browser. The guards are explicit rather than relying
 * on the plugins' web fallbacks, so a future plugin swap cannot quietly start throwing.
 */

/**
 * The status bar icons, matched to whatever is actually painted behind them.
 *
 * Measured on Android 16 (targetSdk 36): the web view does **not** run edge to edge —
 * it is inset by 24 CSS px top and bottom, `env(safe-area-inset-*)` reads 0 inside it,
 * and those two strips are painted with the window background. That background comes
 * from the `DayNight` theme, so it follows the **system** dark mode and ignores the
 * theme chosen inside the app. `setBackgroundColor` cannot repaint it either — Android
 * 15 made it a no-op — and neither `setOverlaysWebView`, `fitsSystemWindows="false"`,
 * nor `WindowCompat.setDecorFitsSystemWindows(window, false)` moved the web view.
 *
 * Hence the system preference here rather than the app's own theme. Driving the icons
 * from the app's theme is the intuitive thing to write and produces white icons on a
 * white strip the moment someone picks Dark on a light phone. Icons that follow the
 * strip's real colour stay readable in every combination.
 *
 * The remaining cost is honest and small: with the app's theme overridden against the
 * system, those two strips keep the system's colour. Making them follow the app would
 * mean genuine edge-to-edge work against AppCompat's decor, or switching the Android
 * night mode at runtime — which recreates the activity and reloads the web view.
 */
export function syncStatusBar(): void {
  if (!isNativeApp()) return
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  // Naming trap: Capacitor's `Style.Dark` means "drawn for a dark background", i.e.
  // light icons — not "dark icons".
  void StatusBar.setStyle({ style: systemDark ? Style.Dark : Style.Light }).catch(() => {})
}

/** The splash stays up (launchAutoHide: false) until hydration has something to show. */
export function hideSplash(): void {
  if (!isNativeApp()) return
  void SplashScreen.hide().catch(() => {})
}

/**
 * Android's back button. Inside the app's own history — a book page, Explore — it goes
 * back; at the root it minimises rather than exits, so the library is instant on return.
 * iOS never fires this listener.
 */
export function wireBackButton(): void {
  if (!isNativeApp()) return
  void CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void CapApp.minimizeApp()
  })
}

/** A light tick for checking an episode off. */
export function tapFeedback(): void {
  if (!isNativeApp()) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

/** Finishing a film or a season deserves slightly more than a tick. */
export function successFeedback(): void {
  if (!isNativeApp()) return
  void Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}
