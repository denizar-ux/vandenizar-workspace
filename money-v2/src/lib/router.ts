// In-page navigation. The artifact's address bar never follows the page, so the view lives in state;
// a bare #token in the link (#history, #budget, #stats, #accounts, #expense, #income, #transfer) picks the start view.
import { useSyncExternalStore } from 'react'

export type View = 'home' | 'history' | 'budget' | 'stats' | 'accounts' | 'settings'
export interface Route { view: View; q: Record<string, string> }
const VIEWS: View[] = ['home', 'history', 'budget', 'stats', 'accounts', 'settings']
let hashTok = ''
try { hashTok = location.hash.replace(/^#\/?/, '').toLowerCase() } catch { /* */ }
export const startAction = ['expense', 'income', 'transfer'].includes(hashTok) ? (hashTok as 'expense' | 'income' | 'transfer') : null
let cur: Route = { view: (VIEWS as string[]).includes(hashTok) ? (hashTok as View) : 'home', q: {} }
const ls = new Set<() => void>()
export function go(view: View, q: Record<string, string> = {}) {
  cur = { view, q }
  ls.forEach((l) => l())
  try { window.scrollTo({ top: 0 }) } catch { /* */ }
}
export const setQ = (q: Record<string, string>) => { cur = { view: cur.view, q: { ...cur.q, ...q } }; ls.forEach((l) => l()) }
export const useRoute = () => useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l) } }, () => cur)
