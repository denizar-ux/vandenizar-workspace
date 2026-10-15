// Sends web push reminders for scheduled tasks, content stages and the daily briefs.
// Called every minute by pg_cron (x-cron-secret header), or by a signed-in user to send a test.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STAGES = [
  { id: 'script', verb: 'Write script' }, { id: 'shoot', verb: 'Shoot' }, { id: 'edit', verb: 'Edit' },
  { id: 'ready', verb: 'Review' }, { id: 'upload', verb: 'Upload' },
];
const STATUS_IMPLIES: Record<string, number> = { idea: -1, scripting: -1, filming: 0, editing: 1, ready: 2, published: 4 };
const WINDOW = 30; // minutes: late reminders are still sent within this window (cron hiccups, lead changes)

// Asia/Jakarta has no DST: UTC+7
function wib(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (t: string) => { const [h, m] = (t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
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
  const { data: rows } = await sb.from('records').select('coll,id,data').eq('user_id', userId).eq('deleted', false).in('coll', ['tasks', 'contents', 'meta']);
  const recs = rows || [];
  const settings = recs.find((r) => r.coll === 'meta' && r.id === 'settings')?.data || {};
  const lead = Number(settings.pushLead ?? 0) || 0;
  const tasks = recs.filter((r) => r.coll === 'tasks').map((r) => r.data).filter((t) => t && !t.deletedAt && !t.archived && (t.status === 'todo' || t.status === 'in_progress'));
  const contents = recs.filter((r) => r.coll === 'contents').map((r) => r.data).filter((c) => c && !c.deletedAt && c.status !== 'published');
  const out: { key: string; title: string; body: string; url: string }[] = [];

  // Tasks with a time
  for (const t of tasks) {
    if (!t.dueDate || !t.dueTime || (t.dueDate !== now.date && t.dueDate !== tomorrow)) continue;
    const m = minutesUntil(t.dueDate, t.dueTime, now); if (m == null) continue;
    if (m <= lead && m > lead - WINDOW) {
      const when = m <= 0 ? 'Now' : `In ${m} min`;
      out.push({ key: `task:${t.id}:${t.dueDate}:${t.dueTime}`, title: t.title || 'Task', body: `${when} · ${fmtTime(t.dueTime)}`, url: '#/tasks' });
    }
  }
  // Content stages with a time
  for (const c of contents) {
    STAGES.forEach((st, idx) => {
      const s = c.schedule?.[st.id];
      if (!s?.date || !s?.time || (s.date !== now.date && s.date !== tomorrow)) return;
      if ((c.stageDone && c.stageDone[st.id]) || idx <= (STATUS_IMPLIES[c.status] ?? -1)) return;
      const m = minutesUntil(s.date, s.time, now); if (m == null) return;
      if (m <= lead && m > lead - WINDOW) {
        const when = m <= 0 ? 'now' : `in ${m} min`;
        out.push({ key: `content:${c.id}:${st.id}:${s.date}:${s.time}`, title: `${st.verb}: ${c.title || 'Untitled content'}`, body: `Scheduled ${when} · ${fmtTime(s.time)}`, url: `#/content/item/${c.id}` });
      }
    });
  }
  // Morning brief and evening review
  const rem = settings.reminders || {};
  const dueToday = tasks.filter((t) => t.dueDate && t.dueDate <= now.date);
  const contentToday = contents.filter((c) => STAGES.some((st, idx) => c.schedule?.[st.id]?.date === now.date && !(c.stageDone && c.stageDone[st.id]) && idx > (STATUS_IMPLIES[c.status] ?? -1)));
  for (const kind of ['morning', 'evening'] as const) {
    const r = rem[kind]; if (!r?.enabled) continue;
    const tm = toMin(r.time); if (tm == null) continue;
    if (now.min >= tm && now.min < tm + WINDOW) {
      if (kind === 'morning') {
        const parts = [];
        parts.push(dueToday.length ? `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} for today` : 'No tasks due today');
        if (contentToday.length) parts.push(`${contentToday.length} content step${contentToday.length > 1 ? 's' : ''} scheduled`);
        out.push({ key: `morning:${now.date}`, title: 'Morning brief', body: parts.join(' · '), url: '#/' });
      } else {
        out.push({ key: `evening:${now.date}`, title: 'Time to close the day', body: 'Quick review and plan tomorrow.', url: '#/review' });
      }
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
    const sent = await sendTo(u.user.id, { title: 'Notifications are on', body: 'Scheduled tasks will show up here.', tag: 'vz-test', url: '#/settings' });
    return json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
