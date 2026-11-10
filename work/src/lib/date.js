// All calendar dates are stored as plain 'YYYY-MM-DD' strings in Asia/Jakarta local time.
// They are never parsed with new Date('YYYY-MM-DD') (that parses as UTC and can shift a day).
// Calendar math is done on UTC-midnight timestamps, which has no DST or timezone drift.
import { t, locale } from './i18n.js';
export const TZ = 'Asia/Jakarta';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function nowParts(d = new Date()) {
  const o = {};
  for (const p of partsFmt.formatToParts(d)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}`, hour: +o.hour, minute: +o.minute };
}
export const today = () => nowParts().date;
export const nowTime = () => nowParts().time;
export const isoOf = (ts) => nowParts(new Date(ts)).date; // timestamp -> Jakarta calendar date

const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);

export const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const addDays = (iso, n) => fromUTC(toUTC(iso) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000); // a - b
export const weekday = (iso) => new Date(toUTC(iso)).getUTCDay(); // 0 Sun..6 Sat
export function startOfWeek(iso, weekStart = 1) {
  const wd = weekday(iso);
  return addDays(iso, -((wd - weekStart + 7) % 7));
}
export const startOfMonth = (iso) => iso.slice(0, 8) + '01';
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return fromUTC(t.getTime());
}
export const daysInMonth = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthKey = (iso) => iso.slice(0, 7);

const fmtCache = {};
function fmt(iso, opts) {
  const loc = locale();
  const k = loc + JSON.stringify(opts);
  fmtCache[k] = fmtCache[k] || new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...opts });
  return fmtCache[k].format(new Date(toUTC(iso)));
}
export const fmtDay = (iso) => (iso ? fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const fmtShort = (iso) => (iso ? fmt(iso, { day: 'numeric', month: 'short' }) : '');
export const fmtLong = (iso) => (iso ? fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const fmtFull = (iso) => (iso ? fmt(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const fmtMonth = (iso) => (iso ? fmt(iso, { month: 'long', year: 'numeric' }) : '');
export const fmtMonthShort = (iso) => (iso ? fmt(iso, { month: 'short' }) : '');
export const fmtWeekdayShort = (iso) => fmt(iso, { weekday: 'short' });
export const dayNum = (iso) => +iso.slice(8, 10);

// Human relative label: Today, Tomorrow, Yesterday, in 3 days, Fri 17 Oct
export function relDay(iso, base = today()) {
  if (!iso) return '';
  const d = diffDays(iso, base);
  if (d === 0) return t('Today');
  if (d === 1) return t('Tomorrow');
  if (d === -1) return t('Yesterday');
  if (d > 1 && d < 7) return fmt(iso, { weekday: 'long' });
  return fmtDay(iso);
}
export const relDayLower = (iso) => { const r = relDay(iso); return [t('Today'), t('Tomorrow'), t('Yesterday')].includes(r) ? r.toLowerCase() : r; };
export function fmtTimestamp(ts) {
  if (!ts) return '';
  const p = nowParts(new Date(ts));
  return `${relDay(p.date)}, ${p.time}`;
}
export function greeting() {
  const h = nowParts().hour;
  if (h < 4) return t('Up late');
  if (h < 11) return t('Good morning');
  if (h < 17) return t('Good afternoon');
  return t('Good evening');
}
export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
export function fmtMinutes(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  const H = t('{n}h', { n: h }), M = t('{n}m', { n: m });
  return h ? (m ? `${H} ${M}` : H) : M;
}
// Next occurrence for a recurring task after `from` date.
export function nextOccurrence(rule, from) {
  if (!rule || !rule.freq) return null;
  const n = Math.max(1, +rule.interval || 1);
  if (rule.freq === 'daily') return addDays(from, n);
  if (rule.freq === 'weekdays') { let d = addDays(from, 1); while ([0, 6].includes(weekday(d))) d = addDays(d, 1); return d; }
  if (rule.freq === 'weekly') return addDays(from, 7 * n);
  if (rule.freq === 'monthly') return addMonths(from, n);
  return null;
}
export const recurrenceLabel = (r) => {
  if (!r || !r.freq) return '';
  const n = +r.interval || 1;
  return { daily: n > 1 ? t('Every {n} days', { n }) : t('Daily'), weekdays: t('Weekdays'), weekly: n > 1 ? t('Every {n} weeks', { n }) : t('Weekly'), monthly: n > 1 ? t('Every {n} months', { n }) : t('Monthly') }[r.freq] || '';
};
