// Saves monthly review PDFs to Google Drive by forwarding them to the user's own Apps Script web app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function script(cfg: { script_url: string; token: string }, body: Record<string, unknown>) {
  const res = await fetch(cfg.script_url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token: cfg.token }) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: 'Google Drive script did not answer (' + res.status + ')' }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ ok: false, error: 'Sign in first.' }, 401);
    const body = await req.json().catch(() => ({}));
    const { data: cfg } = await sb.from('drive_config').select('script_url, token, email').eq('user_id', u.user.id).maybeSingle();
    if (body.action === 'status') {
      if (!cfg) return json({ ok: true, connected: false, error: 'Google Drive is not connected yet.' });
      const r = await script(cfg, { action: 'ping' });
      return json({ ok: true, connected: !!r.ok, email: r.email || cfg.email || '', error: r.ok ? '' : r.error });
    }
    if (body.action === 'upload') {
      if (!cfg) return json({ ok: false, error: 'Google Drive is not connected yet.' }, 400);
      if (!body.data || !body.name) return json({ ok: false, error: 'Nothing to upload.' }, 400);
      const r = await script(cfg, { action: 'upload', year: body.year, month: body.month, name: body.name, data: body.data });
      if (!r.ok) return json({ ok: false, error: r.error || 'Upload failed.' }, 502);
      return json({ ok: true, url: r.url, id: r.id });
    }
    return json({ ok: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
