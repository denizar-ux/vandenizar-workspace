// Two backends, picked at start:
//  - inside a claude.ai artifact: the artifact's own database (claude.use('db')), live across devices
//  - on the web (Vercel): Supabase table money_records behind email + password login
// A copy is kept in this browser so the app paints at once and still opens offline.
import { useEffect, useReducer } from 'react'
import { sb, makeBackend, type Backend, type Row } from './supabase'

export const COLLS = ['mAccounts', 'mTx', 'mCats', 'mBudgets', 'mRecur', 'mDebts', 'meta'] as const
export type Coll = (typeof COLLS)[number]
const LS = 'vzm2:data'
type Rec = { id: string; [k: string]: any }
let data: Record<string, Map<string, Rec>> = Object.fromEntries(COLLS.map((c) => [c, new Map()]))
const arrCache: Record<string, { v: number; arr: Rec[] }> = {}
let version = 0
const listeners = new Set<(v: number) => void>()
let queued = false

export const store = { mode: 'loading' as 'loading' | 'cloud' | 'web' | 'local', error: '', ready: false, saving: 0, auth: 'unknown' as 'unknown' | 'in' | 'out', email: '' }

function notify() {
  version++
  if (queued) return
  queued = true
  queueMicrotask(() => { queued = false; listeners.forEach((fn) => fn(version)) })
}
export const notifyAll = () => notify()
export const ver = () => version
export function subscribe(fn: (v: number) => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function useStore() {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const seen = version
  useEffect(() => { const un = subscribe(force); if (version !== seen) force(); return un }, [])
  return version
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const coll = (c: string) => data[c] || (data[c] = new Map())
export const get = <T = any>(c: Coll, id?: string | null): T | undefined => (id == null ? undefined : (coll(c).get(id) as any))
export function all<T = any>(c: Coll): T[] {
  const k = arrCache[c]
  if (k && k.v === version) return k.arr as any
  const arr = [...coll(c).values()]
  arrCache[c] = { v: version, arr }
  return arr as any
}

// ---------- browser copy ----------
let saveTimer: any = null
function saveLocal() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS, JSON.stringify(Object.fromEntries(COLLS.map((c) => [c, [...coll(c).values()]])))) } catch { /* full or blocked */ }
  }, 300)
}
;(function loadLocal() {
  try {
    let raw = JSON.parse(localStorage.getItem(LS) || 'null')
    if (!raw) raw = JSON.parse(localStorage.getItem('vzm:data') || 'null') // v1 cache
    if (raw) for (const c of COLLS) for (const r of raw[c] || []) if (r && r.id) coll(c).set(r.id, r)
  } catch { /* ignore */ }
})()

// ---------- writes ----------
let db: any = null
const pending = new Map<string, Rec | null>()
const chains = new Map<string, Promise<any>>()
function send(path: string, rec: Rec | null) {
  if (store.mode === 'web') { dirty.set(path, rec ? 'set' : 'del'); saveOutbox(); store.saving = 1; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 650); return }
  if (!db) { pending.set(path, rec); return }
  const prev = chains.get(path) || Promise.resolve()
  store.saving++; notify()
  const p = prev.then(() => (rec ? db.doc(path).set(rec) : db.doc(path).delete())).then(() => { store.error = '' }).catch((e: any) => {
    store.error = (e && e.code) || 'failed'
  }).finally(() => { store.saving = Math.max(0, store.saving - 1); notify() })
  chains.set(path, p)
  p.finally(() => { if (chains.get(path) === p) chains.delete(path) })
}

export function put<T extends Partial<Rec>>(c: Coll, rec: T): T & Rec {
  const id = (rec as any).id || uid()
  const now = Date.now()
  const prev = coll(c).get(id)
  const next = JSON.parse(JSON.stringify({ ...rec, id, createdAt: (rec as any).createdAt || prev?.createdAt || now, updatedAt: now }))
  coll(c).set(id, next)
  send(c + '/' + id, next)
  saveLocal(); notify()
  return next
}
export function patch(c: Coll, id: string, ch: Record<string, any>) {
  const prev = coll(c).get(id)
  if (!prev) return null
  return put(c, { ...prev, ...ch })
}
export function remove(c: Coll, id: string) {
  if (!coll(c).has(id)) return
  coll(c).delete(id)
  send(c + '/' + id, null)
  saveLocal(); notify()
}
export const retry = () => { store.error = ''; if (store.mode === 'web') { flush(); return } for (const c of COLLS) for (const r of coll(c).values()) send(c + '/' + r.id, r) }

// ---------- connect ----------
export async function initStore(onReady?: () => void) {
  let ns: any = null
  const w = window as any
  const inArtifact = !!(w.claude && typeof w.claude.use === 'function')
  try { ns = inArtifact ? await w.claude.use('db') : null } catch { ns = null }
  const ready = () => { if (!store.ready) { store.ready = true; notify(); onReady?.() } }
  if (!inArtifact) { await initWeb(ready); return }
  if (!ns) { store.mode = 'local'; ready(); return }
  db = ns
  store.mode = 'cloud'
  for (const [path, rec] of pending) send(path, rec)
  pending.clear()
  const fresh = new Set<string>()
  setTimeout(ready, 8000)
  for (const c of COLLS) {
    db.collection(c).onSnapshot((snap: any) => {
      const m = new Map<string, Rec>()
      for (const d of snap.docs) { const v = d.data(); if (v) m.set(d.id, { ...v, id: v.id || d.id }) }
      // keep local writes that haven't reached the server yet
      for (const [path, rec] of pending) if (path.startsWith(c + '/') && rec) m.set(rec.id, rec)
      data[c] = m
      if (!snap.metadata?.fromCache) fresh.add(c)
      if (fresh.size === COLLS.length) ready()
      saveLocal(); notify()
    }, (e: any) => { store.error = (e && e.code) || 'failed'; fresh.add(c); if (fresh.size === COLLS.length) ready(); notify() })
  }
}

// ---------- web (Supabase) ----------
type Op = 'set' | 'del'
const dirty = new Map<string, Op>()
const OUTBOX = 'vzm2:outbox', CURSOR = 'vzm2:cursor'
let backend: Backend | null = null
let flushTimer: any = null
let flushing = false
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* full */ } }
function saveOutbox() { lsSet(OUTBOX, JSON.stringify([...dirty.entries()])) }

async function flush(): Promise<void> {
  clearTimeout(flushTimer)
  if (!backend) return
  if (flushing) { flushTimer = setTimeout(flush, 400); return }
  if (!dirty.size) { store.saving = 0; notify(); return }
  if (navigator.onLine === false) { store.saving = 0; store.error = ''; notify(); return }
  flushing = true
  const batch = [...dirty.entries()]
  dirty.clear()
  const rows = batch.map(([k, op]) => {
    const i = k.indexOf('/'); const c = k.slice(0, i), id = k.slice(i + 1)
    const rec = coll(c).get(id)
    return op === 'set' && rec ? { coll: c, id, data: rec, deleted: false } : { coll: c, id, data: {}, deleted: true }
  })
  try {
    for (let i = 0; i < rows.length; i += 200) await backend.push(rows.slice(i, i + 200))
    flushing = false; saveOutbox(); store.error = ''
    if (dirty.size) flushTimer = setTimeout(flush, 650); else store.saving = 0
    notify()
  } catch (e: any) {
    flushing = false
    for (const [k, op] of batch) if (!dirty.has(k)) dirty.set(k, op)
    saveOutbox(); store.saving = 0
    const offline = navigator.onLine === false || /fetch|network/i.test(String(e?.message))
    store.error = offline ? '' : (e?.message || 'failed'); notify()
    flushTimer = setTimeout(flush, offline ? 15000 : 30000)
  }
}

function applyRows(rows: Row[]) {
  let changed = false
  let cursor = lsGet(CURSOR)
  for (const r of rows) {
    if (!cursor || r.updated_at > cursor) cursor = r.updated_at
    if (!(COLLS as readonly string[]).includes(r.coll)) continue
    if (dirty.has(r.coll + '/' + r.id)) continue
    const m = coll(r.coll)
    if (r.deleted) { if (m.has(r.id)) { m.delete(r.id); changed = true } continue }
    const d = r.data
    if (!d || typeof d !== 'object') continue
    const local = m.get(r.id)
    if (!local || (d.updatedAt || 0) >= (local.updatedAt || 0)) {
      if (!local || JSON.stringify(local) !== JSON.stringify(d)) { m.set(r.id, { ...d, id: r.id }); changed = true }
    } else { dirty.set(r.coll + '/' + r.id, 'set') }
  }
  if (cursor) lsSet(CURSOR, cursor)
  if (dirty.size) { saveOutbox(); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 650) }
  if (changed) { saveLocal(); notify() }
}

let pulling = false
async function pull(full = false) {
  if (!backend || pulling || navigator.onLine === false) return
  pulling = true
  try {
    const cur = full ? null : lsGet(CURSOR)
    const since = cur ? new Date(Date.parse(cur) - 10000).toISOString() : null
    applyRows(await backend.pullSince(since))
  } catch { /* offline: next time */ } finally { pulling = false }
}

async function initWeb(ready: () => void) {
  const begin = async (user: { id: string; email?: string } | null | undefined) => {
    if (!user) { if (store.auth !== 'in') { store.auth = 'out'; store.mode = 'web'; notify(); } return }
    if (backend) return
    backend = makeBackend(user.id)
    store.mode = 'web'; store.auth = 'in'; store.email = user.email || ''
    const hadCache = Object.values(data).some((m) => m.size)
    try { for (const [k, op] of JSON.parse(lsGet(OUTBOX) || '[]')) dirty.set(k, op) } catch { /* ignore */ }
    if (hadCache) ready()
    notify()
    await pull(!lsGet(CURSOR))
    saveLocal()
    ready()
    if (dirty.size) flush()
    backend.subscribe((rows) => applyRows(rows))
    setInterval(() => pull(), 60000)
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else pull() })
  window.addEventListener('pagehide', () => { flush() })
  window.addEventListener('online', () => { flush(); pull() })
  window.addEventListener('focus', () => pull())
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'SIGNED_IN') begin(session?.user)
    if (evt === 'SIGNED_OUT' && store.auth === 'in') location.reload()
  })
  try { const { data: d } = await sb.auth.getSession(); await begin(d.session?.user) } catch { store.auth = 'out'; store.mode = 'web'; notify() }
}

export async function signOut() {
  await flush()
  await sb.auth.signOut()
  try { localStorage.removeItem(LS); localStorage.removeItem(OUTBOX); localStorage.removeItem(CURSOR) } catch { /* ignore */ }
  location.reload()
}

export async function saveFile(filename: string, text: string, mime = 'text/csv'): Promise<'saved' | 'declined' | 'failed'> {
  const blob = new Blob([text], { type: mime })
  const w = window as any
  if (w.claude && typeof w.claude.use === 'function') {
    let dl: any = null
    try { dl = await w.claude.use('downloads') } catch { /* none */ }
    if (dl) { try { await dl.save({ filename, data: blob }); return 'saved' } catch (e: any) { return e?.code === 'declined' ? 'declined' : 'failed' } }
    return 'failed'
  }
  try { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); return 'saved' } catch { return 'failed' }
}
