// Cloud sync with Supabase. The device database stays the source of truth for the UI;
// this module pulls changes from the cloud and pushes local changes up in the background.
import { createClient } from '@supabase/supabase-js';
import { get, all, COLLS, isSyncable, dirtyKeys, clearDirty, markDirty, applyRemote, setSyncHook, notifyAll, flush, put } from './db.js';

const SUPABASE_URL = 'https://ngdsdkqimosiiqzdacci.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iYX1cp7gNmUjpHT-iRzm4A_qo0TTB51';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'vz-auth' },
});

export const sync = { user: null, status: 'signed_out', error: null, lastSyncAt: 0, ready: false };
const subs = new Set();
const emit = () => { subs.forEach((f) => f()); notifyAll(); };
export const onSync = (fn) => { subs.add(fn); return () => subs.delete(fn); };

const stateKey = () => 'vz-sync-' + (sync.user?.id || 'anon');
function loadState() { try { return JSON.parse(localStorage.getItem(stateKey()) || '{}'); } catch { return {}; } }
function saveState(s) { try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch {} }

let running = null;
let again = false;
let pushTimer = null;

export async function syncNow() {
  if (!sync.user) return;
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      try { await runOnce(); }
      catch (e) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        sync.status = offline ? 'offline' : 'error';
        sync.error = offline ? null : (e && e.message) || 'Sync failed';
        emit();
        break;
      }
    } while (again);
  })();
  try { await running; } finally { running = null; }
}

async function runOnce() {
  sync.status = 'syncing'; sync.error = null; emit();
  const st = loadState();
  const firstSync = !st.cursor;
  const remoteVersions = new Map();
  // ---- pull ----
  let cursor = st.cursor || '1970-01-01T00:00:00Z';
  for (;;) {
    const { data: rows, error } = await supabase.from('records').select('coll,id,data,deleted,updated_at').gt('updated_at', cursor).order('updated_at', { ascending: true }).limit(500);
    if (error) throw error;
    if (!rows.length) break;
    for (const r of rows) {
      if (!COLLS.includes(r.coll) || !isSyncable(r.coll, r.id)) continue;
      const key = r.coll + '\u0000' + r.id;
      const local = get(r.coll, r.id);
      const remoteTs = r.deleted ? Date.parse(r.updated_at) : (r.data?.updatedAt || 0);
      remoteVersions.set(key, remoteTs);
      const localDirty = dirtyKeys().includes(key);
      // last write wins; a pending local edit that is newer stays and is pushed below
      if (localDirty && local && (local.updatedAt || 0) > remoteTs) continue;
      if (r.deleted) { if (local) applyRemote(r.coll, r.id, null); }
      else applyRemote(r.coll, r.id, r.data);
      if (localDirty) clearDirty([key]);
    }
    cursor = rows[rows.length - 1].updated_at;
    if (rows.length < 500) break;
  }
  st.cursor = cursor;
  // First sync on this device: offer everything we have locally that the cloud does not have newer.
  if (firstSync) {
    for (const c of COLLS) for (const rec of all(c)) {
      if (!isSyncable(c, rec.id)) continue;
      const key = c + '\u0000' + rec.id;
      const rv = remoteVersions.get(key);
      if (rv == null || (rec.updatedAt || 0) > rv) markDirty(key);
    }
  }
  // ---- push ----
  const keys = dirtyKeys();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const rows = chunk.map((k) => {
      const [coll, id] = k.split('\u0000');
      const rec = get(coll, id);
      return rec ? { coll, id, data: rec, deleted: false } : { coll, id, data: null, deleted: true };
    });
    const versions = chunk.map((k) => { const [c, id] = k.split('\u0000'); return get(c, id)?.updatedAt ?? 'deleted'; });
    const { error } = await supabase.from('records').upsert(rows, { onConflict: 'user_id,coll,id' });
    if (error) throw error;
    // only clear keys that did not change again while uploading
    clearDirty(chunk.filter((k, j) => { const [c, id] = k.split('\u0000'); return (get(c, id)?.updatedAt ?? 'deleted') === versions[j]; }));
  }
  await flush();
  st.lastSyncAt = Date.now();
  saveState(st);
  sync.lastSyncAt = st.lastSyncAt;
  sync.status = 'synced';
  emit();
}

function schedulePush() {
  if (!sync.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 1500);
}

let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 45000);
}

export async function initSync() {
  setSyncHook(schedulePush);
  const { data } = await supabase.auth.getSession();
  sync.user = data.session?.user || null;
  sync.status = sync.user ? 'syncing' : 'signed_out';
  sync.lastSyncAt = loadState().lastSyncAt || 0;
  sync.ready = true;
  emit();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { sync.recovery = true; setTimeout(() => { location.hash = '#/settings/account'; }, 0); }
    const prev = sync.user?.id;
    sync.user = session?.user || null;
    if (!sync.user) { sync.status = 'signed_out'; clearInterval(pollTimer); emit(); return; }
    if (prev !== sync.user.id) { sync.lastSyncAt = loadState().lastSyncAt || 0; startPolling(); setTimeout(syncNow, 50); }
    emit();
  });
  if (sync.user) { startPolling(); syncNow(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  // Clean the auth tokens out of the address bar after an email confirmation link
  if (/access_token|type=signup|error_description/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + '#/'); } catch {} }
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  return { needsConfirm: !data.session };
}
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
export async function signOut() {
  await syncNow().catch(() => {});
  await supabase.auth.signOut();
}
export function useSyncState(useEffect, useReducer) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => onSync(force), []);
  return sync;
}
