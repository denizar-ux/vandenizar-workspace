// Saves last month's daily reviews to Google Drive on the first open of a new month.
import { put } from './db.js';
import { sync, onSync } from './sync.js';
import { today } from './date.js';
import * as M from './model.js';
import { monthData, buildMonthlyPdf } from './reviewpdf.js';
import { uploadMonthlyReview, monthLabel } from './drive.js';
import { toast } from '../ui/overlay.jsx';

export const prevMonth = (iso = today()) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); };
export const journalSaved = (ym) => !!(M.meta('driveExports', {}).months || {})[ym];

// The month whose journal still needs saving (first 10 days of a month only), or null
export function pendingJournal() {
  if (Number(today().slice(8, 10)) > 10) return null;
  const ym = prevMonth();
  if (journalSaved(ym)) return null;
  return monthData(ym).days.length ? ym : null;
}

export async function saveJournal(ym) {
  const pdf = await buildMonthlyPdf(ym);
  const r = await uploadMonthlyReview(ym, pdf.base64);
  const ex = M.meta('driveExports', { id: 'driveExports', months: {} });
  put('meta', { ...ex, id: 'driveExports', months: { ...(ex.months || {}), [ym]: { at: Date.now(), url: r.url, path: r.path } } });
  return r;
}

let running = false;
const waitForSync = () => new Promise((res) => {
  if (sync.status === 'synced') return res();
  const off = onSync(() => { if (sync.status === 'synced' || sync.status === 'error' || sync.status === 'offline') { off(); res(); } });
  setTimeout(() => { off(); res(); }, 20000);
});

export async function autoSaveJournal() {
  if (running || !sync.user || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const ym0 = prevMonth();
  const flag = 'vz:journal-try-' + ym0;
  try { if (localStorage.getItem(flag) === today()) return; } catch {}
  running = true;
  try {
    await waitForSync(); // pull reviews written on other devices first
    const ym = pendingJournal();
    if (!ym) return;
    try { localStorage.setItem(flag, today()); } catch {}
    const r = await saveJournal(ym);
    toast(`${monthLabel(ym)} journal saved to Google Drive`, { action: r.url ? { label: 'Open', run: () => window.open(r.url, '_blank', 'noopener') } : undefined, duration: 7000 });
  } catch { /* the Today card offers a manual save */ }
  finally { running = false; }
}

export function startJournalAutoSave() {
  setTimeout(autoSaveJournal, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(autoSaveJournal, 3000); });
}
