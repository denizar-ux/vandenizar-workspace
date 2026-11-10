// Calendar helpers for Content, on top of ../lib/date.js (plain YYYY-MM-DD, Asia/Jakarta).
// Weeks start on Monday.
import { addDays, weekday } from '../lib/date.js'

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Sunday-first, like weekday() */
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Monday-first, for slot days (0 = Monday) */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAYS_S = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday of the week containing dk */
export function weekStart(dk) {
  const dow = weekday(dk)
  return addDays(dk, dow === 0 ? -6 : 1 - dow)
}

/** Index of the weekday, 0 = Monday */
export const weekdayIndex = (dk) => (weekday(dk) + 6) % 7

/** "Fri 23 Oct" (long: "Friday, 23 October 2026") */
export function fmtDay(dk, opts = {}) {
  const [y, m, d] = dk.split('-').map(Number)
  const dow = weekday(dk)
  if (opts.long) return `${DAYS[dow]}, ${d} ${MONTHS[m - 1]}${opts.year !== false ? ' ' + y : ''}`
  return `${DAYS_S[dow]} ${d} ${MONTHS_S[m - 1]}${opts.year ? ' ' + y : ''}`
}

/** "19–25 Oct" */
export function weekRange(week) {
  const end = addDays(week, 6)
  const [, m1, d1] = week.split('-').map(Number), [, m2, d2] = end.split('-').map(Number)
  return m1 === m2 ? `${d1}–${d2} ${MONTHS_S[m1 - 1]}` : `${d1} ${MONTHS_S[m1 - 1]} – ${d2} ${MONTHS_S[m2 - 1]}`
}
