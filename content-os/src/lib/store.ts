// In-memory store + persistence: Supabase sync (content_os_records) with a local cache and a persistent outbox.
import { useSyncExternalStore } from 'react'
import { COLLS, SCHEMA_VERSION, type Coll, type Collections, type Settings } from './types'

export type State = { [K in Coll]: Map<string, Collections[K]> }

export function emptyState(): State {
  const s = {} as State
  for (const c of COLLS) (s as any)[c] = new Map()
  return s
}

export let S: State = emptyState()
let version = 0
const listeners = new Set<() => void>()

export const uid = () =>
  (globalThis.crypto && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9-]/g, '')
export const nowIso = () => new Date().toISOString()

export function defaultSettings(): Settings {
  const t = nowIso()
  return {
    id: 'settings', createdAt: t, updatedAt: t, displayName: 'Denizar', timezone: 'Asia/Jakarta',
    hour12: false, defaultEstimate: 30, threadsCharLimit: null,
    instagramUrl: 'https://www.instagram.com/', threadsUrl: 'https://www.threads.net/',
    pinnedContentId: null, demoLoaded: false, schemaVersion: SCHEMA_VERSION,
  }
}

export function settings(): Settings {
  return S.settings.get('settings') || defaultSettings()
}
export const tz = () => settings().timezone || 'Asia/Jakarta'

// ---------- subscriptions ----------
let notifyQueued = false
export function notify() {
  version++
  if (notifyQueued) return
  notifyQueued = true
  queueMicrotask(() => { notifyQueued = false; listeners.forEach((l) => l()) })
}
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export function useVersion() { return useSyncExternalStore(subscribe, () => version) }

// ---------- reads ----------
export function get<C extends Coll>(c: C, id: string | null | undefined): Collections[C] | undefined {
  if (!id) return undefined
  return S[c].get(id) as Collections[C] | undefined
}
export function all<C extends Coll>(c: C): Collections[C][] {
  return Array.from(S[c].values()) as Collections[C][]
}

// ---------- writes ----------
type Op = 'set' | 'del'
/** Outbox: keys ("coll/id") that still need to reach the server. Persisted so offline edits survive reloads. */
const dirty = new Map<string, Op>()
let inflight = new Set<string>()

export function put<C extends Coll>(c: C, rec: Collections[C], opts: { touch?: boolean } = {}) {
  const r: any = { ...rec }
  if (opts.touch !== false) r.updatedAt = nowIso()
  if (!r.createdAt) r.createdAt = r.updatedAt
  ;(S[c] as Map<string, any>).set(r.id, r)
  markDirty(c, r.id, 'set')
  notify()
  return r as Collections[C]
}

export function patch<C extends Coll>(c: C, id: string, p: Partial<Collections[C]>) {
  const cur = S[c].get(id)
  if (!cur) return undefined
  return put(c, { ...(cur as any), ...p })
}

export function remove(c: Coll, id: string) {
  if (!S[c].has(id)) return
  S[c].delete(id)
  markDirty(c, id, 'del')
  notify()
}

export function tx<T>(fn: () => T): T { return fn() }

// ---------- persistence ----------
export type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'offline'
export interface PersistState {
  status: SaveStatus
  mode: 'synced' | 'local' | 'memory'
  auth: 'unknown' | 'in' | 'out'
  email?: string
  error?: string
  ready: boolean
  lastSync?: string
}
export const P: PersistState = { status: 'loading', mode: 'memory', auth: 'unknown', ready: false }
function setP(p: Partial<PersistState>) { Object.assign(P, p); notify() }

export interface Row { coll: string; id: string; data: any; deleted: boolean; updated_at: string }
export interface Backend {
  push(rows: { coll: string; id: string; data: any; deleted: boolean }[]): Promise<void>
  pullSince(cursor: string | null): Promise<Row[]>
  subscribe(onRows: (rows: Row[]) => void): () => void
}

let backend: Backend | null = null
let flushTimer: any = null
let cacheTimer: any = null
const CACHE_KEY = 'vzc:data'
const OUTBOX_KEY = 'vzc:outbox'
const CURSOR_KEY = 'vzc:cursor'
const ls = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); return true } catch { return false } },
  del(k: string) { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

function markDirty(c: Coll, id: string, op: Op) {
  if (!P.ready) return
  dirty.set(c + '/' + id, op)
  saveOutbox()
  if (P.status !== 'error') P.status = navigator.onLine === false ? 'offline' : 'saving'
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 650)
  scheduleCache()
}

function saveOutbox() { ls.set(OUTBOX_KEY, JSON.stringify(Array.from(dirty.entries()))) }

function scheduleCache() {
  clearTimeout(cacheTimer)
  cacheTimer = setTimeout(writeCache, 400)
}

export function serialize(state: State = S) {
  const out: Record<string, any[]> = {}
  for (const c of COLLS) out[c] = Array.from((state[c] as Map<string, any>).values())
  return out
}

function writeCache(): boolean {
  if (ls.set(CACHE_KEY, JSON.stringify(serialize()))) return true
  // over quota: keep text, drop images from the cache (they stay on the server)
  const data = serialize(); data.assets = []
  return ls.set(CACHE_KEY, JSON.stringify(data))
}

export function loadInto(data: Record<string, any[]>, state: State = S) {
  for (const c of COLLS) {
    state[c].clear()
    for (const r of data[c] || []) if (r && typeof r.id === 'string') (state[c] as Map<string, any>).set(r.id, r)
  }
}

let flushing = false
export async function flush(): Promise<void> {
  clearTimeout(flushTimer)
  if (P.mode === 'local' || !backend) {
    const ok = writeCache()
    if (P.mode === 'local') { dirty.clear(); saveOutbox() }
    setP(ok ? { status: dirty.size ? 'offline' : 'saved', error: undefined } : { status: 'error', error: 'Penyimpanan browser penuh. Ekspor backup dulu.' })
    return
  }
  if (flushing) { flushTimer = setTimeout(flush, 400); return }
  if (dirty.size === 0) { if (P.status === 'saving') setP({ status: 'saved' }); return }
  if (navigator.onLine === false) { setP({ status: 'offline' }); return }
  flushing = true
  const batch = Array.from(dirty.entries())
  dirty.clear()
  inflight = new Set(batch.map(([k]) => k))
  const rows = batch.map(([k, op]) => {
    const i = k.indexOf('/'); const coll = k.slice(0, i), id = k.slice(i + 1)
    const rec = (S as any)[coll]?.get(id)
    return op === 'set' && rec ? { coll, id, data: rec, deleted: false } : { coll, id, data: {}, deleted: true }
  })
  try {
    for (let i = 0; i < rows.length; i += 200) await backend.push(rows.slice(i, i + 200))
    inflight = new Set(); flushing = false
    saveOutbox()
    if (dirty.size) { setP({ status: 'saving' }); flushTimer = setTimeout(flush, 650) }
    else setP({ status: 'saved', error: undefined, lastSync: nowIso() })
  } catch (e: any) {
    inflight = new Set(); flushing = false
    for (const [k, op] of batch) if (!dirty.has(k)) dirty.set(k, op)
    saveOutbox()
    const offline = (navigator as any).onLine === false || /fetch|network/i.test(String(e?.message))
    setP(offline ? { status: 'offline' } : { status: 'error', error: e?.message || 'Gagal menyimpan' })
    flushTimer = setTimeout(flush, offline ? 15000 : 30000)
  }
}

export function retrySave() { setP({ status: 'saving', error: undefined }); flush() }
export function hasPending() { return dirty.size > 0 || inflight.size > 0 }
export function pendingCount() { return dirty.size + inflight.size }

/** Apply server rows. Local unsent edits always win; otherwise the newer client timestamp wins. */
export function applyRows(rows: Row[]) {
  let changed = false
  let cursor = ls.get(CURSOR_KEY)
  for (const r of rows) {
    if (!cursor || r.updated_at > cursor) cursor = r.updated_at
    if (!(COLLS as string[]).includes(r.coll)) continue
    const key = r.coll + '/' + r.id
    if (dirty.has(key) || inflight.has(key)) continue
    const map = (S as any)[r.coll] as Map<string, any>
    const local = map.get(r.id)
    if (r.deleted) { if (local) { map.delete(r.id); changed = true } continue }
    const data = r.data
    if (!data || typeof data !== 'object') continue
    if (!local || (data.updatedAt || '') >= (local.updatedAt || '')) {
      if (!local || local.updatedAt !== data.updatedAt || JSON.stringify(local) !== JSON.stringify(data)) { map.set(r.id, { ...data, id: r.id }); changed = true }
    } else {
      dirty.set(key, 'set') // our copy is newer: send it back up
    }
  }
  if (cursor) ls.set(CURSOR_KEY, cursor)
  if (dirty.size) { saveOutbox(); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 650) }
  if (changed) { notify(); scheduleCache() }
}

let pulling = false
export async function pull(full = false) {
  if (!backend || pulling || navigator.onLine === false) return
  pulling = true
  try {
    const cur = full ? null : ls.get(CURSOR_KEY)
    // small overlap so rows committed in the same instant are never skipped
    const since = cur ? new Date(Date.parse(cur) - 10000).toISOString() : null
    const rows = await backend.pullSince(since)
    applyRows(rows)
    if (P.status === 'error' && /fetch|network/i.test(P.error || '')) setP({ status: 'saved', error: undefined })
    P.lastSync = nowIso()
  } catch { /* offline: try again later */ } finally { pulling = false }
}

/** Boot with a signed-in backend: show cache immediately, then pull and stay live. */
export async function startSync(b: Backend, email?: string) {
  backend = b
  const cached = ls.get(CACHE_KEY)
  if (cached && !P.ready) { try { loadInto(JSON.parse(cached)) } catch { /* corrupt cache */ } }
  try { for (const [k, op] of JSON.parse(ls.get(OUTBOX_KEY) || '[]')) dirty.set(k, op) } catch { /* ignore */ }
  setP({ mode: 'synced', auth: 'in', email, ready: !!cached, status: dirty.size ? 'saving' : 'idle' })
  await pull(!cached)
  setP({ ready: true })
  writeCache()
  if (dirty.size) flush()
  b.subscribe((rows) => applyRows(rows))
  setInterval(() => pull(), 60000)
}

/** No account / tests: memory + browser cache only. */
export function startLocal() {
  const cached = ls.get(CACHE_KEY)
  if (cached) { try { loadInto(JSON.parse(cached)) } catch { /* ignore */ } }
  setP({ mode: 'local', ready: true, status: 'idle' })
}

export function signedOut() { setP({ auth: 'out', ready: false, status: 'idle' }) }

/** Wipe this device's copy (on sign out). */
export function clearLocal() {
  ls.del(CACHE_KEY); ls.del(OUTBOX_KEY); ls.del(CURSOR_KEY)
  dirty.clear(); S = emptyState(); notify()
}

/** Replace the whole workspace (import). Validated data only. */
export async function replaceAll(data: Record<string, any[]>) {
  const old = serialize()
  for (const c of COLLS) {
    for (const r of old[c]) if (!(data[c] || []).some((x) => x.id === r.id)) dirty.set(c + '/' + r.id, 'del')
    for (const r of data[c] || []) dirty.set(c + '/' + r.id, 'set')
  }
  loadInto(data)
  saveOutbox()
  notify()
  scheduleCache()
  await flush()
}

/** Test helper */
export function resetForTests() {
  S = emptyState()
  dirty.clear()
  Object.assign(P, { status: 'idle', mode: 'memory', ready: false })
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flush(); writeCache() } else pull()
  })
  window.addEventListener('pagehide', () => { flush(); writeCache() })
  window.addEventListener('online', () => { flush(); pull() })
  window.addEventListener('offline', () => { if (dirty.size) setP({ status: 'offline' }) })
  window.addEventListener('focus', () => pull())
}
