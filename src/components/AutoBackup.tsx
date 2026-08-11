import { useEffect } from 'react'
import { isNativeApp } from 'tables-core'
import { useAutoBackup } from '../store/backup'
import { IconDownload } from './Icons'

/**
 * The only copy that survives someone clearing site data is one outside the browser.
 * On Chromium the app can keep such a file up to date by itself, once the person picks
 * it; elsewhere the API does not exist and the manual export stays the answer.
 */
export function AutoBackup() {
  const { state, fileName, lastWriteAt, init, choose, resume, disable } = useAutoBackup()

  useEffect(() => {
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isNativeApp()) {
    return (
      <p className="chips-hint">
        Your library is stored inside the app, where clearing a browser cannot reach it.
        Deleting the app still takes it — export a copy now and then.
      </p>
    )
  }

  if (state === 'unsupported') {
    return (
      <p className="chips-hint">
        This browser cannot keep a backup file up to date on its own. Export one now and
        then — it is the only copy that survives clearing your browsing data.
      </p>
    )
  }

  if (state === 'off') {
    return (
      <>
        <button className="datarow" onClick={() => void choose()}>
          <IconDownload size={20} />
          <div>
            <div className="datarow-title">Keep a backup file up to date</div>
            <div className="datarow-sub">
              Pick a file once; the app rewrites it as your library changes
            </div>
          </div>
        </button>
        <p className="chips-hint">
          A file on your disk is the one copy that clearing your browsing data cannot
          reach.
        </p>
      </>
    )
  }

  if (state === 'needs-permission') {
    return (
      <>
        <button className="datarow" onClick={() => void resume()}>
          <IconDownload size={20} />
          <div>
            <div className="datarow-title">Resume automatic backup</div>
            <div className="datarow-sub">
              {fileName ? `${fileName} needs permission again` : 'Permission needed again'}
            </div>
          </div>
        </button>
      </>
    )
  }

  return (
    <>
      <div className="datarow static">
        <IconDownload size={20} />
        <div>
          <div className="datarow-title">Backing up to {fileName}</div>
          <div className="datarow-sub">
            {lastWriteAt
              ? `Last written ${new Date(lastWriteAt).toLocaleTimeString()}`
              : 'Written whenever your library changes'}
          </div>
        </div>
      </div>
      <button className="textbtn" onClick={() => void disable()}>
        Stop automatic backup
      </button>
    </>
  )
}
