// "Add to Google Calendar" links. No login or API: the link opens Google Calendar's
// new-event page pre-filled, and the person taps Save there. Dates are WIB, all-day.

const d8 = (iso: string) => iso.replace(/-/g, '')
function nextDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function gcalAllDay(title: string, date: string, details = '') {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: d8(date) + '/' + d8(nextDay(date)), ctz: 'Asia/Jakarta' })
  if (details) q.set('details', details)
  return 'https://calendar.google.com/calendar/render?' + q.toString()
}

export const appLink = (hashPath: string) => location.origin + location.pathname + '#' + hashPath
