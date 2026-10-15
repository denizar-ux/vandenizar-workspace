// Google Drive: monthly review PDFs go to Drive through the "drive" edge function,
// which forwards them to a small Apps Script running in Denizar's own Google account.
import { supabase, sync } from './sync.js';

const FN_URL = 'https://ngdsdkqimosiiqzdacci.supabase.co/functions/v1/drive';
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

async function call(body) {
  if (!sync.user) throw new Error('Sign in first to use Google Drive.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first to use Google Drive.');
  let res;
  try { res = await fetch(FN_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('No connection. Try again when you are online.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.ok === false) throw new Error(out.error || 'Google Drive did not respond.');
  return out;
}

export async function driveStatus() {
  const r = await call({ action: 'status' });
  return { connected: !!r.connected, email: r.email || '', checkedAt: Date.now(), error: r.connected ? '' : (r.error || '') };
}

// ym = "2026-09"; base64 = PDF bytes. Returns { url, name, path }
export async function uploadMonthlyReview(ym, base64) {
  const [y, m] = ym.split('-').map(Number);
  const name = `Daily Review - ${MONTHS[m - 1]} ${y}.pdf`;
  const r = await call({ action: 'upload', year: String(y), month: MONTHS[m - 1], name, data: base64 });
  return { url: r.url, name, path: `Daily Review / ${y} / ${MONTHS[m - 1]}` };
}
