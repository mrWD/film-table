import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell around the same Vite build the web gets.
 *
 * `webDir` is the ordinary `dist`: nothing is built twice, and a native release is
 * whatever `npm run build` produced plus `npx cap sync`. The app already uses
 * `HashRouter`, so routing needs no adjustment for the `capacitor://localhost` origin
 * the WebView serves from.
 *
 * `androidScheme: 'https'` keeps Android on `https://localhost` rather than the legacy
 * `http://`, which is what makes the WebView treat the app as a secure context — service
 * workers, crypto and IndexedDB persistence all depend on it.
 */
const config: CapacitorConfig = {
  appId: 'com.mrwd.filmtable',
  appName: 'FilmTable',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    // The app draws its own background; without this the WebView flashes white on
    // launch in dark mode before the first paint.
    backgroundColor: '#f2f2f2',
  },
  android: {
    backgroundColor: '#f2f2f2',
  },
  plugins: {
    SplashScreen: {
      // The library is read from a file before the first render, so there is a moment
      // with nothing to show. Auto-hiding on a timer would either cut that short or
      // outlast it; main.tsx hides the splash when the render actually happens.
      launchAutoHide: false,
      backgroundColor: '#f2f2f2',
      androidSplashResourceName: 'splash',
    },
  },
}

export default config
