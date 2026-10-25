// Calendar days are 'YYYY-MM-DD' in WIB (Asia/Jakarta), like the other Vandenizar apps.
export const TZ = 'Asia/Jakarta'

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export const today = () => ymdFmt.format(new Date())
export const nowTime = () => hmFmt.format(new Date()).replace(/^24/, '00')
export const hourNow = () => +nowTime().slice(0, 2)

const toUTC = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86400000)
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000)
export const daysInMonth = (d: string) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }
/** 0 = Monday … 6 = Sunday */
export const dow = (d: string) => (new Date(toUTC(d)).getUTCDay() + 6) % 7
export const startOfWeek = (d: string) => addDays(d, -dow(d))
export const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7) }
/** Same day of month n months later, clamped (31 Jan + 1 → 28/29 Feb). anchorDay keeps the original day. */
export function addMonths(d: string, n: number, anchorDay = +d.slice(8)) {
  const ym = shiftYm(d.slice(0, 7), n)
  return `${ym}-${String(Math.min(anchorDay, daysInMonth(ym + '-01'))).padStart(2, '0')}`
}
export const monthEnd = (ym: string) => `${ym}-${String(daysInMonth(ym + '-01')).padStart(2, '0')}`

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = WD

export function fmtDay(d: string, o: { long?: boolean; year?: boolean } = {}) {
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  const yr = o.year || y !== +today().slice(0, 4) ? ' ' + y : ''
  return o.long ? `${WDL[dow(d)]}, ${dd} ${MOL[m - 1]}${yr}` : `${WD[dow(d)]} ${dd} ${MO[m - 1]}${yr}`
}
export const fmtShort = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MO[m - 1]}` }
export const monthLabel = (ym: string, short = false) => { const [y, m] = ym.split('-').map(Number); return `${(short ? MO : MOL)[m - 1]}${y !== +today().slice(0, 4) ? ' ' + y : ''}` }
export const monthShort = (ym: string) => MO[+ym.slice(5, 7) - 1]
export function relDay(d: string) {
  const n = diffDays(d, today())
  if (n === 0) return 'Today'
  if (n === -1) return 'Yesterday'
  if (n === 1) return 'Tomorrow'
  if (n > 1 && n < 7) return 'In ' + n + ' days'
  return fmtDay(d)
}
export function greeting() {
  const h = hourNow()
  return h < 4 ? 'Late night' : h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : h < 19 ? 'Good evening' : 'Good night'
}
