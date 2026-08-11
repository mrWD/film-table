/**
 * Getting a backup file out of the app, per platform.
 *
 * On iOS an `<a download>` click technically works, but lands in a download popup people
 * rarely find, and in home-screen web apps has been flaky across versions. The share
 * sheet is the platform's own way out: Save to Files, AirDrop, mail to yourself. Web
 * Share with files needs user activation, which an export button click provides.
 *
 * Everywhere else the plain download link stays: on desktop a share dialog for saving
 * a file would be a worse answer than the Downloads folder.
 */

/** iPadOS reports itself as a Mac, so touch support is part of the test. */
function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled'

export async function exportJsonFile(data: unknown, fileName: string): Promise<ExportOutcome> {
  const json = JSON.stringify(data, null, 2)

  if (isIos() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    const file = new File([json], fileName, { type: 'application/json' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return 'shared'
      } catch (err) {
        // Closing the sheet is a normal answer, not an error.
        if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
        // Anything else (a target that rejects files, a WebKit quirk) falls through
        // to the download path rather than losing the export.
      }
    }
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
