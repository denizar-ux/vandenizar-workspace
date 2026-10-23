import React, { useEffect } from 'react'
import { useRoute, restoreScroll } from './lib/router'
import { useVersion, P, flush } from './lib/store'
import { Dock, Sidebar } from './ui/Shell'
import { Hosts, Skeleton } from './ui/kit'
import { QuickAddHost } from './ui/QuickAdd'
import { NotFound } from './ui/NotFound'
import Login from './pages/Login'
import Today from './pages/Today'
import Instagram from './pages/Instagram'
import Post from './pages/Post'
import Threads from './pages/Threads'
import Resources from './pages/Resources'
import Calendar from './pages/Calendar'
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
    case undefined: case 'today': case 'week': case 'overview': page = <Today />; break
    case 'instagram': page = <Instagram />; break
    case 'post': case 'item': editor = true; page = <Post id={b} />; break
    case 'threads': page = <Threads />; break
    case 'resources': page = <Resources />; break
    case 'ideas': page = <Instagram />; break
    case 'calendar': page = <Calendar />; break
    case 'settings': editor = true; page = <Settings />; break
    default: page = <NotFound />
  }

  return (
    <div className={editor ? 'app app-editor' : 'app'}>
      <Sidebar />
      {page}
      <Dock hidden={editor} />
      <QuickAddHost />
      <Hosts />
    </div>
  )
}
