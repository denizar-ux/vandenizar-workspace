// Sends web push reminders for scheduled work, deadlines, project follow-ups and invoices.
// Called every minute by pg_cron (x-cron-secret header), or by a signed-in user to send a test.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const WINDOW = 30; // minutes: late reminders are still sent within this window (cron hiccups, lead changes)

// Asia/Jakarta has no DST: UTC+7
function wib(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (t: string) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// minutes from "now" (WIB) to date+time; negative when in the past
function minutesUntil(date: string, time: string, now: { date: string; min: number }) {
  const tm = toMin(time); if (tm == null) return null;
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(now.date + 'T00:00:00Z')) / 864e5);
  return days * 1440 + tm - now.min;
}
const fmtTime = (t: string) => t.slice(0, 5);

let vapidReady = false;
async function config() {
  const { data, error } = await sb.from('push_config').select('*').eq('id', 1).single();
  if (error) throw error;
  if (!vapidReady) { webpush.setVapidDetails('mailto:halodenizar@gmail.com', data.vapid_public, data.vapid_private); vapidReady = true; }
  return data;
}

async function sendTo(userId: string, payload: Record<string, unknown>) {
  const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId);
  let ok = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', code, (e as Error).message);
    }
  }
  return ok;
}

// Records "key" as sent; returns false if it was already sent.
async function claim(userId: string, key: string) {
  const { error } = await sb.from('push_sent').insert({ user_id: userId, key });
  return !error;
}

async function runForUser(userId: string) {
  const now = wib();
  const tomorrow = addDays(now.date, 1);
  const { data: rows } = await sb.from('records').select('coll,id,data').eq('user_id', userId).eq('deleted', false).in('coll', ['pmTasks', 'pmProjects', 'meta', 'invoices', 'payments', 'clients']);
  const recs = rows || [];
  const settings = recs.find((r) => r.coll === 'meta' && r.id === 'pmSettings')?.data || {};
  const lead = Number(settings.pushLead ?? 0) || 0;
  const daily = toMin(settings.reminderTime || '09:00') ?? 540;
  const atDaily = now.min >= daily && now.min < daily + WINDOW;
  const tasks = recs.filter((r) => r.coll === 'pmTasks').map((r) => r.data).filter((t) => t && !t.deletedAt && !t.archived && ['inbox', 'open', 'in_progress'].includes(t.status));
  const projects = recs.filter((r) => r.coll === 'pmProjects').map((r) => r.data).filter((p) => p && !p.deletedAt && !p.archived && !['delivered', 'completed'].includes(p.stage));
  const out: { key: string; title: string; body: string; url: string }[] = [];

  // Work schedule: when a task is planned to be worked on
  for (const t of tasks) {
    if (!t.workDate || !t.workTime || (t.workDate !== now.date && t.workDate !== tomorrow)) continue;
    const m = minutesUntil(t.workDate, t.workTime, now); if (m == null) continue;
    if (m <= lead && m > lead - WINDOW) {
      const when = m <= 0 ? 'Now' : `In ${m} min`;
      out.push({ key: `work:${t.id}:${t.workDate}:${t.workTime}`, title: t.title || 'Task', body: `${when} · ${fmtTime(t.workTime)}${t.estimateMinutes ? ' · ' + t.estimateMinutes + ' min' : ''}`, url: `#/tasks/${t.id}` });
    }
  }
  // Task deadlines: an hour before a timed deadline, and at the daily reminder time on the day
  for (const t of tasks) {
    if (!t.deadlineDate) continue;
    if (t.deadlineTime) {
      const m = minutesUntil(t.deadlineDate, t.deadlineTime, now);
      if (m != null && m <= 60 && m > 60 - WINDOW) out.push({ key: `dl1h:${t.id}:${t.deadlineDate}:${t.deadlineTime}`, title: `Deadline in 1 hour`, body: `${t.title || 'Task'} · ${fmtTime(t.deadlineTime)}`, url: `#/tasks/${t.id}` });
    }
    if (atDaily && t.deadlineDate === now.date) out.push({ key: `dlday:${t.id}:${now.date}`, title: 'Deadline today', body: `${t.title || 'Task'}${t.deadlineTime ? ' · ' + fmtTime(t.deadlineTime) : ''}`, url: `#/tasks/${t.id}` });
  }
  // Projects: follow-up due, deadline today or tomorrow (daily reminder time)
  if (atDaily) {
    for (const p of projects) {
      if (p.followUpDate && p.followUpDate <= now.date && p.stage === 'client_review') out.push({ key: `follow:${p.id}:${now.date}`, title: `Follow up: ${p.name || 'Project'}`, body: 'Still waiting for feedback.', url: `#/projects/${p.id}` });
      if (p.deadlineDate === now.date || p.deadlineDate === tomorrow) out.push({ key: `pdl:${p.id}:${p.deadlineDate}:${now.date}`, title: `${p.name || 'Project'} is due ${p.deadlineDate === now.date ? 'today' : 'tomorrow'}`, body: p.deadlineTime ? `Deadline ${fmtTime(p.deadlineTime)}` : 'Check what is left to deliver.', url: `#/projects/${p.id}` });
    }
  }

  // Invoices: due today, then 1 day overdue and every 7 days after, at the daily reminder time
  if (atDaily) {
    const pays = recs.filter((r) => r.coll === 'payments').map((r) => r.data).filter((p) => p && !p.voided);
    const clients = new Map(recs.filter((r) => r.coll === 'clients').map((r) => [r.id, r.data]));
    for (const inv of recs.filter((r) => r.coll === 'invoices').map((r) => r.data)) {
      if (!inv || inv.deletedAt || inv.archived || !inv.sentAt || !inv.dueDate) continue;
      const items = (inv.items || []).reduce((sum: number, it: any) => sum + Math.round((+it.qty || 0) * (+it.rate || 0)), 0);
      let disc = 0;
      if (inv.discountType === 'percent') disc = Math.round(items * Math.min(100, Math.max(0, +inv.discountValue || 0)) / 100);
      else if (inv.discountType === 'amount') disc = Math.min(items, Math.max(0, Math.round(+inv.discountValue || 0)));
      const paid = pays.filter((p) => p.invoiceId === inv.id).reduce((sum: number, p: any) => sum + (Math.round(+p.amount) || 0), 0);
      const balance = items - disc - paid;
      if (balance <= 0) continue;
      const late = Math.round((Date.parse(now.date + 'T00:00:00Z') - Date.parse(inv.dueDate + 'T00:00:00Z')) / 864e5);
      const who = inv.clientSnapshot?.name || clients.get(inv.clientId)?.name || '';
      const cur = inv.currency || 'IDR';
      const dec = cur === 'IDR' ? 0 : 2;
      const amount = (cur === 'IDR' ? 'Rp ' : cur + ' ') + (balance / 10 ** dec).toLocaleString(cur === 'IDR' ? 'id-ID' : 'en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const num = inv.number || 'Invoice';
      if (late === 0) out.push({ key: `invdue:${inv.id}:${now.date}`, title: `${num} is due today`, body: [who, amount + ' unpaid'].filter(Boolean).join(' · '), url: `#/invoices/${inv.id}` });
      else if (late === 1 || (late > 1 && late % 7 === 0)) out.push({ key: `invlate:${inv.id}:${now.date}`, title: `${num} is ${late} day${late > 1 ? 's' : ''} overdue`, body: [who, amount + ' unpaid'].filter(Boolean).join(' · '), url: `#/invoices/${inv.id}` });
    }
  }

  let sent = 0;
  for (const n of out) {
    if (!(await claim(userId, n.key))) continue;
    sent += await sendTo(userId, { title: n.title, body: n.body, tag: n.key, url: n.url });
  }
  return { candidates: out.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cfg = await config();
    // Cron run: every user with a device subscribed
    if (req.headers.get('x-cron-secret')) {
      if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
      const { data: subs } = await sb.from('push_subscriptions').select('user_id');
      const users = [...new Set((subs || []).map((s) => s.user_id))];
      const results: Record<string, unknown> = {};
      for (const u of users) results[u] = await runForUser(u);
      // keep the sent log small
      await sb.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 3 * 864e5).toISOString());
      return json({ ok: true, results });
    }
    // Signed-in user: send a test notification to their devices
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'not signed in' }, 401);
    const sent = await sendTo(u.user.id, { title: 'Notifications are on', body: 'Scheduled work, deadlines and follow-ups will show up here.', tag: 'vz-test', url: '#/settings/notifications' });
    return json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
