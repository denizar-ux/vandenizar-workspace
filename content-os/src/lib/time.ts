// Time helpers. Instants are stored as ISO UTC strings; date-only values as 'YYYY-MM-DD'
// interpreted in the workspace time zone.

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function partsFmt(tz: string) {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    })
    dtfCache.set(tz, f)
  }
  return f
}

export interface ZParts { y: number; m: number; d: number; h: number; mi: number; s: number; dow: number }
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }

export function zparts(date: Date | string | number, tz: string): ZParts {
  const dt = date instanceof Date ? date : new Date(date)
  const p: Record<string, string> = {}
  for (const x of partsFmt(tz).formatToParts(dt)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, dow: DOW[p.weekday] ?? 0 }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(date: Date | string | number, tz: string): string {
  const p = zparts(date, tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

export function timeKey(date: Date | string | number, tz: string): string {
  const p = zparts(date, tz)
  return `${pad(p.h)}:${pad(p.mi)}`
}

export function todayKey(tz: string, now: Date = new Date()): string {
  return dateKey(now, tz)
}

/** Convert a wall-clock date + time in `tz` to an ISO UTC instant. */
export function zonedToIso(dk: string, hm: string, tz: string): string {
  const [y, m, d] = dk.split('-').map(Number)
  const [h, mi] = (hm || '00:00').split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess
  for (let i = 0; i < 3; i++) {
    const p = zparts(t, tz)
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi)
    const diff = asUtc - guess
    if (diff === 0) break
    t -= diff
  }
  return new Date(t).toISOString()
}

export function addDays(dk: string, n: number): string {
  const [y, m, d] = dk.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function dowOf(dk: string): number {
  const [y, m, d] = dk.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Monday of the week containing dk */
export function weekStart(dk: string): string {
  const dow = dowOf(dk)
  return addDays(dk, dow === 0 ? -6 : 1 - dow)
}

export function monthKey(dk: string) { return dk.slice(0, 7) }

export function addMonths(mk: string, n: number): string {
  const [y, m] = mk.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

export function daysInMonth(mk: string) {
  const [y, m] = mk.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const DAYS_S = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export function tzLabel(tz: string): string {
  if (tz === 'Asia/Jakarta' || tz === 'Asia/Pontianak') return 'WIB'
  if (tz === 'Asia/Makassar') return 'WITA'
  if (tz === 'Asia/Jayapura') return 'WIT'
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date())
    return p.find((x) => x.type === 'timeZoneName')?.value || tz
  } catch { return tz }
}

export function fmtHM(hm: string, hour12 = false): string {
  const [h, m] = hm.split(':').map(Number)
  if (!hour12) return `${pad(h)}.${pad(m)}`
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}.${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

export function fmtTime(iso: string, tz: string, hour12 = false) {
  return fmtHM(timeKey(iso, tz), hour12)
}

/** "Jumat, 23 Okt" */
export function fmtDay(dk: string, opts: { long?: boolean; year?: boolean } = {}) {
  const [y, m, d] = dk.split('-').map(Number)
  const dow = dowOf(dk)
  const mon = opts.long ? MONTHS[m - 1] : MONTHS_S[m - 1]
  return `${DAYS[dow]}, ${d} ${mon}${opts.year ? ' ' + y : ''}`
}

/** "23 Okt" or "23 Okt 2027" if different year from today */
export function fmtShort(dk: string, tz: string) {
  const [y, m, d] = dk.split('-').map(Number)
  const ty = +todayKey(tz).slice(0, 4)
  return `${d} ${MONTHS_S[m - 1]}${y !== ty ? ' ' + y : ''}`
}

export function fmtDateTime(iso: string, tz: string, hour12 = false) {
  return `${fmtShort(dateKey(iso, tz), tz)}, ${fmtTime(iso, tz, hour12)}`
}

export function relDay(dk: string, tz: string): string {
  const t = todayKey(tz)
  if (dk === t) return 'Hari ini'
  if (dk === addDays(t, 1)) return 'Besok'
  if (dk === addDays(t, -1)) return 'Kemarin'
  return fmtDay(dk)
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'baru saja'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} menit lalu`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} hari lalu`
  const mo = Math.round(d / 30)
  return `${mo} bulan lalu`
}

export function minutesBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export function fmtDuration(min: number) {
  if (min < 60) return `${min} menit`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} jam ${m} menit` : `${h} jam`
}

export const isValidDateKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const isValidIso = (s: unknown): s is string => typeof s === 'string' && !isNaN(Date.parse(s))
