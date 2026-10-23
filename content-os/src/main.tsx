import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { applyTheme } from './lib/theme'

applyTheme()
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()) } catch { /* old Safari */ }
import { startSync, startLocal, signedOut, P } from './lib/store'
import { ensureDefaults } from './lib/model'
import { sb, makeBackend } from './lib/supabase'

createRoot(document.getElementById('root')!).render(<App />)

let started = false
async function begin(user: { id: string; email?: string } | null | undefined) {
  if (!user) { if (!started) signedOut(); return }
  if (started) return
  started = true
  await startSync(makeBackend(user.id), user.email)
  ensureDefaults()
}
if (import.meta.env.VITE_LOCAL === '1') { startLocal(); ensureDefaults(); started = true; import('./lib/store').then((m) => { (window as any).__S = m }) }
else sb.auth.getSession().then(({ data }) => begin(data.session?.user)).catch(() => signedOut())
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === 'SIGNED_IN') begin(session?.user)
  if (evt === 'SIGNED_OUT' && P.auth === 'in') location.reload()
})

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Hide the fixed bottom action bar while the phone keyboard is open.
const small = () => window.matchMedia('(max-width: 1023px)').matches
document.addEventListener('focusin', (e) => {
  const t = e.target as HTMLElement
  if (small() && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes((t as HTMLInputElement).type)))) document.body.classList.add('kbd')
})
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement as HTMLElement | null
  if (!a || !['TEXTAREA', 'INPUT'].includes(a.tagName)) document.body.classList.remove('kbd')
}, 50))
