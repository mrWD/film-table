export function pad2(n: number | null | undefined): string {
  if (n == null) return '??'
  return String(n).padStart(2, '0')
}

export function epCode(season: number, number: number | null): string {
  return `S${pad2(season)} | E${pad2(number)}`
}

export function epCodeShort(season: number, number: number | null): string {
  return `S${season}E${number ?? '?'}`
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function daysUntil(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000)
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

export function weekdayName(d: Date): string {
  return WEEKDAYS[d.getDay()]
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateNoYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatRuntime(min: number | null | undefined): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Long durations for stats: "3mo 12d", "2d 14h", "3h 20m" */
export function formatBigDuration(min: number): string {
  if (min <= 0) return '0m'
  const totalH = min / 60
  const totalD = totalH / 24
  if (totalD >= 60) {
    const mo = Math.floor(totalD / 30)
    const d = Math.floor(totalD - mo * 30)
    return d > 0 ? `${mo}mo ${d}d` : `${mo}mo`
  }
  if (totalD >= 2) {
    const d = Math.floor(totalD)
    const h = Math.floor(totalH - d * 24)
    return h > 0 ? `${d}d ${h}h` : `${d}d`
  }
  const h = Math.floor(totalH)
  const m = Math.round(min - h * 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').trim()
}

export function yearOf(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 4)
}
