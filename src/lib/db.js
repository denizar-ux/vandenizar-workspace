// Local-first persistence. IndexedDB is the source of truth on this device.
// Every mutation updates memory, then is written to IndexedDB in a short batched transaction.
// Failures are surfaced (status = 'error') and the pending writes are kept and retried.
import { useEffect, useReducer } from 'preact/hooks';

export const COLLECTIONS = ['tasks', 'goals', 'days', 'dailyReviews', 'weeklyReviews', 'contents', 'resources', 'clients', 'projects', 'invoices', 'payments', 'templates', 'activity', 'meta', 'threads', 'habits', 'mAccounts', 'mTx', 'mCats', 'mBills', 'mDebts'];
const DB_NAME = 'vandenizar-workspace';
const DB_VERSION = 4;

const data = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
let version = 0;
const listeners = new Set();
const arrCache = {};
export const persist = { mode: 'idb', status: 'saved', error: null, lastSaved: 0, pending: 0 };

let idb = null;
let notifyQueued = false;
function notify() {
  version++;
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach((fn) => fn(version)); });
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(force), []);
  return version;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const get = (coll, id) => (id == null ? undefined : data[coll].get(id));
export function all(coll) {
  const c = arrCache[coll];
  if (c && c.v === version) return c.arr;
  const arr = [...data[coll].values()];
  arrCache[coll] = { v: version, arr };
  return arr;
}

// ---------- write queue ----------
const queue = new Map(); // key coll\u0000id -> record | null (delete)
let flushTimer = null;
// ---------- cloud sync bookkeeping ----------
// Keys changed on this device that still need to reach the cloud. Persisted with every flush.
export const LOCAL_ONLY_META = new Set(['recent', 'reminders', 'syncDirty', 'focus', 'syncState']);
export const isSyncable = (coll, id) => !(coll === 'meta' && LOCAL_ONLY_META.has(id));
const dirty = new Set();
let syncHook = null;
export const setSyncHook = (fn) => { syncHook = fn; };
export const dirtyKeys = () => [...dirty];
export const dirtyCount = () => dirty.size;
export function markDirty(key) { dirty.add(key); persistDirty(); }
export function clearDirty(keys) { for (const k of keys) dirty.delete(k); persistDirty(); }
function persistDirty() {
  const rec = { id: 'syncDirty', keys: [...dirty], updatedAt: Date.now() };
  data.meta.set('syncDirty', rec);
  queue.set('meta\u0000syncDirty', rec);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 80);
}
function enqueue(coll, id, rec, remote = false) {
  if (!remote && isSyncable(coll, id)) { dirty.add(coll + '\u0000' + id); queue.set('meta\u0000syncDirty', { id: 'syncDirty', keys: [...dirty], updatedAt: Date.now() }); }
  queue.set(coll + '\u0000' + id, rec ? structuredCloneSafe(rec) : null);
  persist.pending = queue.size;
  if (persist.status !== 'error') persist.status = 'saving';
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 80);
}
function structuredCloneSafe(o) { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); } }

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vandenizar-sync') : null;
const TAB_ID = uid();

export async function flush() {
  clearTimeout(flushTimer);
  if (!queue.size) return true;
  const batch = [...queue.entries()];
  queue.clear();
  try {
    if (persist.mode === 'idb') await writeIdb(batch);
    else if (persist.mode === 'local') writeLocal();
    else throw new Error('Storage is not available in this browser.');
    persist.status = queue.size ? 'saving' : 'saved';
    persist.error = null;
    persist.lastSaved = Date.now();
    persist.pending = queue.size;
    if (bc) try { bc.postMessage({ from: TAB_ID, keys: batch.map(([k]) => k) }); } catch {}
    notify();
    if (syncHook && dirty.size) try { syncHook(); } catch {}
    return true;
  } catch (e) {
    // put the batch back without overwriting newer edits made in the meantime
    for (const [k, v] of batch) if (!queue.has(k)) queue.set(k, v);
    persist.status = 'error';
    persist.error = (e && e.message) || 'Could not save';
    persist.pending = queue.size;
    notify();
    return false;
  }
}
function writeIdb(batch) {
  return new Promise((resolve, reject) => {
    const stores = [...new Set(batch.map(([k]) => k.split('\u0000')[0]))];
    const tx = idb.transaction(stores, 'readwrite');
    for (const [k, v] of batch) {
      const [coll, id] = k.split('\u0000');
      const s = tx.objectStore(coll);
      if (v) s.put(v); else s.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Write failed'));
    tx.onabort = () => reject(tx.error || new Error('Write aborted (storage may be full)'));
  });
}
const LS_KEY = 'vandenizar-workspace-v1';
function writeLocal() {
  const snap = Object.fromEntries(COLLECTIONS.map((c) => [c, [...data[c].values()]]));
  localStorage.setItem(LS_KEY, JSON.stringify(snap));
}

// ---------- mutations ----------
export function put(coll, rec, { silent = false } = {}) {
  if (!rec.id) rec.id = uid();
  const now = Date.now();
  const prev = data[coll].get(rec.id);
  const next = { ...rec, createdAt: rec.createdAt || prev?.createdAt || now, updatedAt: silent ? rec.updatedAt || now : now };
  data[coll].set(next.id, next);
  enqueue(coll, next.id, next);
  notify();
  return next;
}
export function patch(coll, id, changes, opts) {
  const prev = data[coll].get(id);
  if (!prev) return null;
  const ch = typeof changes === 'function' ? changes(prev) : changes;
  return put(coll, { ...prev, ...ch }, opts);
}
export function remove(coll, id) {
  if (!data[coll].has(id)) return;
  data[coll].delete(id);
  enqueue(coll, id, null);
  notify();
}
export function putMany(coll, recs) { recs.forEach((r) => put(coll, r)); }
// Apply a change that came from the cloud: saved on this device, not sent back.
export function applyRemote(coll, id, rec) {
  if (!data[coll]) return;
  if (rec) data[coll].set(id, rec); else data[coll].delete(id);
  enqueue(coll, id, rec, true);
}
export const notifyAll = () => notify();
export const COLLS = COLLECTIONS;

// ---------- init ----------
function openIdb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    let req, blocked = false, note = null;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      if (note) note.remove();
      const db = req.result;
      // another tab opened a newer version: step aside so it can upgrade
      db.onversionchange = () => { try { db.close(); } catch {} location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open database'));
    // An older tab still holds the database. Wait for it instead of falling back to empty storage.
    req.onblocked = () => {
      blocked = true;
      note = document.createElement('div');
      note.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font:600 15px/1.5 -apple-system,system-ui,sans-serif;color:#3a475a;background:#f4f5f8;z-index:99999';
      note.textContent = 'Updating Vandenizar… Close other Vandenizar tabs or windows to finish.';
      document.body.appendChild(note);
    };
    setTimeout(() => { if (!blocked) reject(new Error('Database open timed out')); }, 6000);
  });
}
async function readAllIdb() {
  const tx = idb.transaction(COLLECTIONS, 'readonly');
  await Promise.all(COLLECTIONS.map((c) => new Promise((res, rej) => {
    const r = tx.objectStore(c).getAll();
    r.onsuccess = () => { data[c] = new Map(r.result.map((x) => [x.id, x])); res(); };
    r.onerror = () => rej(r.error);
  })));
}

export async function initDb() {
  try {
    idb = await openIdb();
    await readAllIdb();
    persist.mode = 'idb';
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  } catch (e) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const snap = JSON.parse(raw); for (const c of COLLECTIONS) data[c] = new Map((snap[c] || []).map((x) => [x.id, x])); }
      localStorage.setItem(LS_KEY + '-probe', '1');
      persist.mode = 'local';
    } catch {
      persist.mode = 'memory';
      persist.status = 'error';
      persist.error = 'This browser is blocking storage, so changes will be lost when you close the page.';
    }
  }
  for (const k of (data.meta.get('syncDirty')?.keys || [])) dirty.add(k);
  if (bc) bc.onmessage = async (ev) => {
    if (!ev.data || ev.data.from === TAB_ID || persist.mode !== 'idb') return;
    try { await readAllIdb(); for (const [k, v] of queue) { const [c, id] = k.split('\u0000'); if (v) data[c].set(id, v); else data[c].delete(id); } notify(); } catch {}
  };
  const flushNow = () => { if (queue.size) flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  window.addEventListener('pagehide', flushNow);
  notify();
}

// ---------- backup ----------
export function exportAll() {
  return { app: 'vandenizar-workspace', schema: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(COLLECTIONS.map((c) => [c, [...data[c].values()]])) };
}
export async function importAll(json, { replace = true } = {}) {
  if (!json || json.app !== 'vandenizar-workspace' || !json.data) throw new Error('This file is not a Vandenizar backup.');
  for (const c of COLLECTIONS) {
    const rows = Array.isArray(json.data[c]) ? json.data[c] : [];
    if (replace) for (const id of [...data[c].keys()]) if (!rows.find((r) => r.id === id)) remove(c, id);
    for (const r of rows) if (r && r.id) { data[c].set(r.id, r); enqueue(c, r.id, r); }
  }
  notify();
  return flush();
}
export async function wipeAll() {
  for (const c of COLLECTIONS) for (const id of [...data[c].keys()]) remove(c, id);
  return flush();
}
export const counts = () => Object.fromEntries(COLLECTIONS.map((c) => [c, data[c].size]));
