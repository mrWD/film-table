import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { NativeBridge } from 'tables-core'

/**
 * The Capacitor plugins, assembled into the shape `tables-core` expects.
 *
 * The core package deliberately imports no `@capacitor/*` — two of the three trackers
 * have no native shell yet — so the wiring lives here. Importing this module in a web
 * build is harmless: the plugins ship web implementations that simply report the
 * platform is not native, and nothing behind `isNativeApp()` ever calls them.
 *
 * The type arguments are not decoration: `NativeBridge` defaults them to `string` for
 * web callers, and accepting that default here would stop the real plugin — whose
 * options are typed with these enums — from fitting.
 */
export const native: NativeBridge<Directory, Encoding> = {
  fs: Filesystem,
  share: Share,
  directory: Directory.Data,
  cacheDirectory: Directory.Cache,
  encoding: Encoding.UTF8,
}
