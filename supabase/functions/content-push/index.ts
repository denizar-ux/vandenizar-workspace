// Content OS push: morning summary and post-time reminders.
// Called every minute by pg_cron (x-cron-secret header), or by a signed-in user to send a test.
// Uses its own subscriptions table so Workspace reminders never land in the Content OS app (and the reverse).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const WINDOW = 30; // minutes: a missed cron tick still sends within this window
const STAGES = ['idea', 'script', 'film', 'edit', 'ready', 'done'];
const LABEL: Record<string, string> = { idea: 'Idea', script: 'Script', film: 'Film', edit: 'Edit', ready: 'Ready', done: 'Posted' };

// Asia/Jakarta has no DST: UTC+7
function wib(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (t: unknown, fallback: number) => { if (typeof t !== 'string' || !/^\d{1,2}:\d{2}/.test(t)) return fallback; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const inWindow = (now: number, at: number) => now >= at && now < at + WINDOW;
const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

let vapidReady = false;
async function config() {
  const { data, error } = await sb.from('push_config').select('*').eq('id', 1).single();
  if (error) throw error;
  if (!vapidReady) { webpush.setVapidDetails('mailto:halodenizar@gmail.com', data.vapid_public, data.vapid_private); vapidReady = true; }
  return data;
}

async function sendTo(userId: string, payload: Record<string, unknown>) {
  const { data: subs } = await sb.from('content_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId);
  let ok = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('content_push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', code, (e as Error).message);
    }
  }
  return ok;
}

async function claim(userId: string, key: string) {
  const { error } = await sb.from('push_sent').insert({ user_id: userId, key });
  return !error;
}

async function runForUser(userId: string) {
  const now = wib();
  const { data: rows } = await sb.from('content_os_records').select('coll,id,data').eq('user_id', userId).eq('deleted', false).in('coll', ['settings', 'items']);
  const recs = rows || [];
  const settings = recs.find((r) => r.coll === 'settings' && r.id === 'settings')?.data || {};
  const n = settings.notify || {};
  const slotName = (id: string) => (settings.slots || []).find((s: any) => s.id === id)?.name;
  const posts = recs.filter((r) => r.coll === 'items').map((r) => r.data).filter((i) => i && i.kind === 'ig' && i.stage !== 'done');
  const out: { key: string; title: string; body: string; url: string }[] = [];

  // Morning summary: every script, film, edit and post task dated today that isn't done yet
  if (n.morning !== false && inWindow(now.min, toMin(n.morningTime, 480))) {
    const TASKS = [['scriptDate', 'Script', 1], ['filmDate', 'Film', 2], ['editDate', 'Edit', 3], ['date', 'Post', 4]] as const
    const lines: string[] = []
    for (const [field, label, idx] of TASKS) {
      for (const i of posts) if (i[field] === now.date && STAGES.indexOf(i.stage || 'idea') <= idx) lines.push(`${label}: ${short(i.title || 'Untitled', 40)}`)
    }
    if (lines.length) out.push({ key: `cos:am:${now.date}`, title: lines.length === 1 ? 'Today, one thing' : `Today, ${lines.length} things`, body: lines.join('\n'), url: '#/today' })
  }

  // Post-time reminder for each post due today
  if (n.postReminder !== false && inWindow(now.min, toMin(n.postTime, 19 * 60))) {
    for (const i of posts.filter((p) => p.date === now.date)) {
      const ready = i.stage === 'ready';
      const extra = ready ? (i.finalUrl ? 'Video and caption are ready.' : 'Caption is ready to copy.') : `Still at ${LABEL[i.stage || 'idea']}. Post it or move it.`;
      out.push({ key: `cos:post:${i.id}:${now.date}`, title: 'Time to post: ' + short(i.title || 'Untitled'), body: [slotName(i.slot), extra].filter(Boolean).join(' · '), url: '#/post/' + i.id });
    }
  }

  let sent = 0;
  for (const m of out) {
    if (!(await claim(userId, m.key))) continue;
    sent += await sendTo(userId, { title: m.title, body: m.body, tag: m.key, url: m.url });
  }
  return { candidates: out.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cfg = await config();
    if (req.headers.get('x-cron-secret')) {
      if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
      const { data: subs } = await sb.from('content_push_subscriptions').select('user_id');
      const users = [...new Set((subs || []).map((s) => s.user_id))];
      const results: Record<string, unknown> = {};
      for (const u of users) results[u] = await runForUser(u);
      return json({ ok: true, results });
    }
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'not signed in' }, 401);
    const sent = await sendTo(u.user.id, { title: 'Notifications are on', body: 'Morning summary and post-time reminders will show up here.', tag: 'cos-test', url: '#/settings' });
    return json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
