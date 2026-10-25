// Data lives in the artifact's own database (claude.use('db')), live across devices.
// A copy is kept in this browser so the app paints at once and still opens offline.
import { useEffect, useReducer } from 'react'

export const COLLS = ['mAccounts', 'mTx', 'mCats', 'mBudgets', 'mRecur', 'mDebts', 'meta'] as const
export type Coll = (typeof COLLS)[number]
const LS = 'vzm2:data'
type Rec = { id: string; [k: string]: any }
let data: Record<string, Map<string, Rec>> = Object.fromEntries(COLLS.map((c) => [c, new Map()]))
const arrCache: Record<string, { v: number; arr: Rec[] }> = {}
let version = 0
const listeners = new Set<(v: number) => void>()
let queued = false

export const store = { mode: 'loading' as 'loading' | 'cloud' | 'local', error: '', ready: false, saving: 0 }

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
export const retry = () => { store.error = ''; for (const c of COLLS) for (const r of coll(c).values()) send(c + '/' + r.id, r) }

// ---------- connect ----------
export async function initStore(onReady?: () => void) {
  let ns: any = null
  try { const w = window as any; ns = w.claude && typeof w.claude.use === 'function' ? await w.claude.use('db') : null } catch { ns = null }
  const ready = () => { if (!store.ready) { store.ready = true; notify(); onReady?.() } }
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
