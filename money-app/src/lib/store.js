// Data store for the Money artifact. Same API as the Workspace's db.js (get/all/put/patch/remove/useStore),
// but backed by the artifact's own database (claude.use('db')), live across devices.
// A copy is kept in this browser so the app paints instantly and still opens offline.
import { useEffect, useReducer } from 'preact/hooks';

export const COLLS = ['mAccounts', 'mTx', 'mCats', 'mBills', 'mDebts', 'meta'];
const LS = 'vzm:data';
const data = Object.fromEntries(COLLS.map((c) => [c, new Map()]));
const arrCache = {};
let version = 0;
const listeners = new Set();
let queued = false;

// mode: 'loading' until the database answers, then 'cloud', or 'local' when this view has no database
export const store = { mode: 'loading', error: '', ready: false };

function notify() {
  version++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach((fn) => fn(version)); });
}
export const notifyAll = () => notify();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  const seen = version;
  // catch changes that landed between this render and the subscription (e.g. the database answering on boot)
  useEffect(() => { const un = subscribe(force); if (version !== seen) force(); return un; }, []);
  return version;
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const coll = (c) => data[c] || (data[c] = new Map());
export const get = (c, id) => (id == null ? undefined : coll(c).get(id));
export function all(c) {
  const k = arrCache[c];
  if (k && k.v === version) return k.arr;
  const arr = [...coll(c).values()];
  arrCache[c] = { v: version, arr };
  return arr;
}

// ---------- browser copy ----------
let saveTimer = null;
function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS, JSON.stringify(Object.fromEntries(COLLS.map((c) => [c, [...coll(c).values()]])))); } catch {}
  }, 300);
}
(function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || 'null');
    if (raw) for (const c of COLLS) for (const r of raw[c] || []) if (r && r.id) coll(c).set(r.id, r);
  } catch {}
})();

// ---------- writes ----------
let db = null;
const pending = new Map(); // writes made before the database answered: path -> record | null
const chains = new Map(); // one write at a time per document
function send(path, rec) {
  if (!db) { pending.set(path, rec); return; }
  const prev = chains.get(path) || Promise.resolve();
  const p = prev.then(() => (rec ? db.doc(path).set(rec) : db.doc(path).delete())).catch((e) => {
    store.error = (e && e.code) || 'failed'; notify();
  });
  chains.set(path, p);
  p.finally(() => { if (chains.get(path) === p) chains.delete(path); });
}
const docPath = (c, id) => c + '/' + id;

export function put(c, rec, { silent = false } = {}) {
  if (!rec.id) rec.id = uid();
  const now = Date.now();
  const prev = coll(c).get(rec.id);
  const next = JSON.parse(JSON.stringify({ ...rec, createdAt: rec.createdAt || prev?.createdAt || now, updatedAt: silent ? rec.updatedAt || now : now }));
  coll(c).set(next.id, next);
  send(docPath(c, next.id), next);
  saveLocal();
  notify();
  return next;
}
export function patch(c, id, changes, opts) {
  const prev = coll(c).get(id);
  if (!prev) return null;
  const ch = typeof changes === 'function' ? changes(prev) : changes;
  return put(c, { ...prev, ...ch }, opts);
}
export function remove(c, id) {
  if (!coll(c).has(id)) return;
  coll(c).delete(id);
  send(docPath(c, id), null);
  saveLocal();
  notify();
}

// ---------- connect ----------
export async function initStore() {
  let ns = null;
  try { ns = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch { ns = null; }
  if (!ns) { store.mode = 'local'; store.ready = true; notify(); return; }
  db = ns;
  store.mode = 'cloud';
  // writes made while connecting go out first
  for (const [path, rec] of pending) send(path, rec);
  pending.clear();
  const fresh = new Set();
  const markReady = () => { if (!store.ready) { store.ready = true; notify(); } };
  setTimeout(markReady, 8000);
  for (const c of COLLS) {
    db.collection(c).onSnapshot((snap) => {
      const m = new Map();
      for (const d of snap.docs) { const v = d.data(); if (v) m.set(d.id, { ...v, id: v.id || d.id }); }
      data[c] = m;
      if (!snap.metadata.fromCache) fresh.add(c);
      if (fresh.size === COLLS.length) markReady();
      saveLocal();
      notify();
    }, (e) => { store.error = (e && e.code) || 'failed'; notify(); });
  }
}

// Workspace modules import these from db.js; harmless here.
export const persist = { mode: 'artifact', status: 'saved', error: null };
export const flush = async () => true;
