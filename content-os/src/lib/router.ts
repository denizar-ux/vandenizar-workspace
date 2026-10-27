import { useSyncExternalStore } from 'react'

export interface Route { path: string; parts: string[]; q: URLSearchParams }

function parse(): Route {
  let h = location.hash.replace(/^#/, '')
  if (!h.startsWith('/')) h = '/' + (h || 'today')
  const [p, qs] = h.split('?')
  const path = p === '/' ? '/today' : p
  return { path, parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') }
}

let current = parse()
let key = location.hash
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse(); key = location.hash
  subs.forEach((f) => f())
})

export function useRoute(): Route {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => key)
  return current
}

const scrollMem = new Map<string, number>()
// The app restores scroll itself: forward navigation opens at the top, Back returns to where you were.
try { history.scrollRestoration = 'manual' } catch { /* old browser */ }
let forward = false
export function rememberScroll() { scrollMem.set(location.hash, window.scrollY) }
export function restoreScroll() {
  const y = forward ? 0 : scrollMem.get(location.hash) || 0
  forward = false
  window.scrollTo(0, y)
  requestAnimationFrame(() => window.scrollTo(0, y))
}

export function go(to: string, opts: { replace?: boolean } = {}) {
  rememberScroll()
  const h = '#' + to
  if (opts.replace) history.replaceState(null, '', h)
  else if (location.hash !== h) { forward = true; location.hash = h }
  if (opts.replace) { current = parse(); key = location.hash; subs.forEach((f) => f()) }
}

export function back(fallback = '/today') {
  if (history.length > 1 && (window as any).__navCount > 0) history.back()
  else go(fallback)
}

;(window as any).__navCount = 0
window.addEventListener('hashchange', () => { (window as any).__navCount++ })

export function setQuery(k: string, v: string | null) {
  const r = parse()
  const q = new URLSearchParams(r.q)
  if (v == null || v === '') q.delete(k); else q.set(k, v)
  const s = q.toString()
  go(r.path + (s ? '?' + s : ''), { replace: true })
}
