import { createDeviceStorage } from 'tables-core'
import { useUi } from '../store/ui'
import { native } from './native'

/**
 * The app's one storage instance. The adapter itself lives in `tables-core`, shared with
 * GamesTable and BooksTable; what belongs here is the database name, the native plugins
 * to hand it, and what a failed write should say to this app's user.
 *
 * In a browser this is IndexedDB. In the native app it is a file in private app storage,
 * which the OS cannot reclaim the way it reclaims a WebView's site data.
 */
export const deviceStorage = createDeviceStorage({
  dbName: 'filmtable-kv',
  native,
  onWriteError: () => useUi.getState().showToast('Saving failed — export a backup from your profile'),
})
