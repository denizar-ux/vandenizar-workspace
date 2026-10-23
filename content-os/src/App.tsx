import React, { useEffect } from 'react'
import { useRoute, restoreScroll } from './lib/router'
import { useVersion, P, flush } from './lib/store'
import { Dock, Sidebar } from './ui/Shell'
import { Hosts, Skeleton } from './ui/kit'
import { NotFound } from './ui/NotFound'
import Login from './pages/Login'
import Week from './pages/Week'
import ItemPage from './pages/Item'
import Threads from './pages/Threads'
import Ideas from './pages/Ideas'
import Settings from './pages/Settings'

export default function App() {
  useVersion()
  const r = useRoute()
  const [a, b] = r.parts
  useEffect(() => { flush(); restoreScroll() }, [r.path])

  if (P.auth === 'out') return <div className="app app-login"><Login /><Hosts /></div>
  let page: React.ReactNode
  let editor = false
  if (!P.ready) page = <main className="main"><Skeleton /></main>
  else switch (a) {
    case undefined: case 'week': case 'overview': page = <Week />; break
    case 'item': editor = true; page = <ItemPage id={b} />; break
    case 'threads': page = <Threads />; break
    case 'ideas': page = <Ideas />; break
    case 'settings': page = <Settings />; break
    default: page = <NotFound backTo="/week" />
  }

  return (
    <div className={editor ? 'app app-editor' : 'app'}>
      <Sidebar />
      {page}
      <Dock hidden={editor} />
      <Hosts />
    </div>
  )
}
