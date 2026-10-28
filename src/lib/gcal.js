// "Add to Google Calendar" links. No login or API: the link opens Google Calendar's
// new-event page pre-filled, and the person taps Save there. Times are WIB (ctz param).
import { addDays } from './date.js';

const d8 = (iso) => iso.replace(/-/g, '');
const t6 = (hm) => hm.replace(':', '') + '00';
const addMin = (iso, hm, mins) => {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const day = addDays(iso, Math.floor(total / 1440));
  const r = ((total % 1440) + 1440) % 1440;
  return { date: day, time: String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0') };
};

/** { title, date, time?, endTime?, minutes?, details?, location? } -> Google Calendar URL */
export function gcalUrl({ title, date, time, endTime, minutes = 60, details = '', location = '' }) {
  if (!date) return null;
  let dates;
  if (!time) dates = d8(date) + '/' + d8(addDays(date, 1));
  else {
    const end = endTime && endTime > time ? { date, time: endTime } : addMin(date, time, minutes || 60);
    dates = d8(date) + 'T' + t6(time) + '/' + d8(end.date) + 'T' + t6(end.time);
  }
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title || 'Untitled', dates, ctz: 'Asia/Jakarta' });
  if (details) q.set('details', details);
  if (location) q.set('location', location);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

/** Link back into this app, for the event description. */
export const appLink = (hashPath) => location.origin + location.pathname + '#' + hashPath;
