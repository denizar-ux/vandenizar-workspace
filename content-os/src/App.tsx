import React, { useEffect, lazy, Suspense } from 'react'
import { useRoute, restoreScroll, go } from './lib/router'
import { useVersion, P, get, flush } from './lib/store'
import { Dock, Sidebar } from './ui/Shell'
import { Hosts, Skeleton, Empty, Button } from './ui/kit'
import { SheetHost } from './sheets/SheetHost'
import Overview from './pages/Overview'
import { NotFound } from './ui/NotFound'
import Login from './pages/Login'

const Ideas = lazy(() => import('./pages/Ideas'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Instagram = lazy(() => import('./pages/Instagram'))
const IgEditor = lazy(() => import('./pages/IgEditor'))
const Threads = lazy(() => import('./pages/Threads'))
const ThreadEditor = lazy(() => import('./pages/ThreadEditor'))
const Resources = lazy(() => import('./pages/Resources'))
const ResourceDetail = lazy(() => import('./pages/ResourceDetail'))
const Review = lazy(() => import('./pages/Review'))
const Batch = lazy(() => import('./pages/Batch'))
const Settings = lazy(() => import('./pages/Settings'))
const Archive = lazy(() => import('./pages/Archive'))

export default function App() {
  useVersion()
  const r = useRoute()
  const [a, b, c] = r.parts
  useEffect(() => { flush(); restoreScroll() }, [r.path])

  if (P.auth === 'out') return <div className="app app-login"><Login /><Hosts /></div>
  let page: React.ReactNode
  let editor = false
  if (!P.ready) page = <main className="main"><Skeleton /></main>
  else switch (a) {
    case undefined: case 'overview': page = <Overview />; break
    case 'ideas': page = <Ideas />; break
    case 'calendar': page = <Calendar />; break
    case 'instagram': if (b) { editor = true; page = <IgEditor id={b} /> } else page = <Instagram />; break
    case 'threads': if (b) { editor = true; page = <ThreadEditor id={b} /> } else page = <Threads />; break
    case 'resources': if (b) { editor = true; page = <ResourceDetail id={b} /> } else page = <Resources />; break
    case 'content': {
      editor = true
      const ct = get('contents', b)
      if (!ct) page = <NotFound what="Konten" />
      else if (c === 'review') page = <Review id={b} />
      else { go(`/${ct.channel}/${ct.id}`, { replace: true }); page = null }
      break
    }
    case 'batches': editor = true; page = <Batch id={b} />; break
    case 'settings': page = <Settings />; break
    case 'archive': page = <Archive />; break
    default: page = <NotFound />
  }

  return (
    <div className="app">
      <Sidebar />
      <Suspense fallback={<main className="main"><Skeleton /></main>}>{page}</Suspense>
      <Dock hidden={editor} />
      <SheetHost />
      <Hosts />
    </div>
  )
}
