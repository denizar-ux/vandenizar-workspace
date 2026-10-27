import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './money.css'
import { initStore, useStore, store } from './lib/store'
import { applyTheme } from './lib/theme'
import { useRoute, startAction } from './lib/router'
import * as M from './lib/money'
import { Hosts, Skeleton } from './ui/kit'
import { Dock, Sidebar } from './ui/Shell'
import { TxHost, openTx } from './ui/TxSheet'
import { BalancesHost } from './ui/Balances'
import Home from './pages/Home'
import History from './pages/History'
import Budget from './pages/Budget'
import Stats from './pages/Stats'
import Accounts from './pages/Accounts'
import Settings from './pages/Settings'
import Login from './pages/Login'

applyTheme()
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()) } catch { /* */ }

function App() {
  useStore()
  const r = useRoute()
  if (store.auth === 'out') return <div className="app app-login"><Login /><Hosts /></div>
  const empty = !store.ready && !M.allAccounts().length
  const page = empty ? <main className="main"><Skeleton /></main>
    : r.view === 'history' ? <History /> : r.view === 'budget' ? <Budget /> : r.view === 'stats' ? <Stats /> : r.view === 'accounts' ? <Accounts /> : r.view === 'settings' ? <Settings /> : <Home />
  return (
    <div className="app">
      <Sidebar />
      {page}
      <Dock />
      <TxHost />
      <BalancesHost />
      <Hosts />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

let booted = false
const tick = () => { if (!store.ready) return; const n = M.runAutoRecurs(); if (n) { /* logged quietly */ } }
initStore(() => {
  if (booted) return
  booted = true
  M.migrateV1()
  tick()
  if (startAction) setTimeout(() => openTx({ type: startAction }), 50)
})
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick() })
setInterval(tick, 10 * 60 * 1000)
