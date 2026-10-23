import React, { useState } from 'react'
import { PenLine, Plus, Search as SearchIcon, FileText, AtSign, Link2 } from 'lucide-react'
import { all, get, settings, tz } from '../lib/store'
import { postsOf, createThread } from '../lib/model'
import { ago, fmtDateTime } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { changeStage, lifecycleAction, duplicate } from '../lib/contentActions'
import { Button, Menu, Empty, Badge, IconBtn, cx } from '../ui/kit'
import type { Content } from '../lib/types'

type T = 'draft' | 'ready' | 'published'
const TINTS = ['tint-butter', 'tint-cyan', 'tint-lavender', 'tint-sage']

export default function Threads() {
  const r = useRoute()
  const tab = (r.q.get('t') as T) || pref<T>('th:tab', 'draft')
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('')
  const setTab = (t: T) => { setPref('th:tab', t); setQuery('t', t) }
  const live = all('contents').filter((c) => c.channel === 'threads' && c.lifecycle === 'active')
  const inTab = (t: T) => live.filter((c) => (t === 'draft' ? c.status === 'idea' || c.status === 'in_progress' : c.status === t))
  const list = inTab(tab).filter((c) => !q || postsOf(c.id).some((p) => p.body.toLowerCase().includes(q.toLowerCase())) || c.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => tab === 'published' ? ((b.publishedAt || '') > (a.publishedAt || '') ? 1 : -1) : (b.updatedAt > a.updatedAt ? 1 : -1))

  const startQuick = (e?: React.FormEvent) => {
    e?.preventDefault()
    const c = createThread({ text: quick })
    setQuick('')
    go(`/threads/${c.id}`)
  }

  return (
    <main className="main">
      <div className="pagehead" style={{ marginTop: 10 }}><h1 className="page-title">Threads.</h1></div>
      <div className="stack">
        <form className="card row gap8" style={{ padding: '6px 6px 6px 16px', borderRadius: 999 }} onSubmit={startQuick}>
          <PenLine size={18} className="muted" />
          <input className="input input-plain grow" aria-label="Mulai thread baru" placeholder="Lagi kepikiran apa?" value={quick} onChange={(e) => setQuick(e.target.value)} />
          <IconBtn label="Mulai nulis" type="submit" style={{ background: 'var(--ink)', color: '#fff' }}><Plus size={20} /></IconBtn>
        </form>
        <div className="seg" role="tablist" aria-label="Status">
          {([['draft', 'Draft'], ['ready', 'Siap'], ['published', 'Terbit']] as [T, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={cx('seg-item', tab === k && 'on')} onClick={() => setTab(k)}>{l}<span className="seg-count">{inTab(k).length}</span></button>
          ))}
        </div>
        <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari tulisan" placeholder="Cari tulisan" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {live.length === 0 ? (
          <Empty icon={<AtSign size={22} />} title="Belum ada thread" body="Mulai dari satu kalimat. Judul tidak perlu." action={<Button variant="primary" onClick={() => startQuick()}>Mulai nulis</Button>} />
        ) : list.length === 0 ? (
          <Empty title={q ? 'Tidak ada tulisan yang cocok' : tab === 'draft' ? 'Tidak ada draft' : tab === 'ready' ? 'Belum ada yang siap' : 'Belum ada yang terbit'} action={q ? <Button onClick={() => setQ('')}>Reset pencarian</Button> : undefined} />
        ) : list.map((c, i) => <ThreadCard key={c.id} c={c} tint={TINTS[i % TINTS.length]} />)}
      </div>
    </main>
  )
}

function ThreadCard({ c, tint }: { c: Content; tint: string }) {
  const z = tz(), st = settings()
  const posts = postsOf(c.id)
  const n = posts.length
  const first = posts.find((p) => p.body.trim())?.body || ''
  const src = get('contents', c.sourceContentId) || get('ideas', c.sourceIdeaId)
  const open = () => go(`/threads/${c.id}`)
  return (
    <article className={cx('tcard on-tint', tint)}>
      <div className="row gap8">
        <FileText size={20} />
        <Badge>{c.status === 'published' ? 'Terbit' : c.status === 'ready' ? 'Siap' : 'Draft'}</Badge>
        {n > 1 && <Badge>Thread {n} post</Badge>}
        {c.variantLabel && <Badge>{c.variantLabel}</Badge>}
        {c.demo && <Badge tone="line">Contoh</Badge>}
        <span className="grow" />
        <Menu label={`Menu ${c.title}`} items={[
          { label: 'Buka', onSelect: open },
          { label: 'Tandai siap', onSelect: () => changeStage(c.id, 'ready'), hidden: c.status === 'ready' || c.status === 'published' },
          { label: 'Kembalikan ke draft', onSelect: () => changeStage(c.id, 'in_progress'), hidden: c.status === 'idea' || c.status === 'in_progress' },
          { label: 'Duplikasi', onSelect: () => duplicate(c.id) },
          { label: 'Parkir', onSelect: () => lifecycleAction(c.id, 'parked') },
          { label: 'Arsip', onSelect: () => lifecycleAction(c.id, 'archived') },
          { label: 'Hapus', danger: true, onSelect: () => lifecycleAction(c.id, 'deleted') },
        ]} />
      </div>
      <button className="tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={open}>
        <h3 className="h3 clamp2">{c.title}</h3>
        {first && first.trim() !== c.title.replace(/…$/, '').trim() && <p className="small clamp3 mt8" style={{ color: 'rgba(17,17,15,.78)' }}>{first}</p>}
        {!first && <p className="small mt8 muted">Masih kosong</p>}
        <p className="xs mt8" style={{ color: 'rgba(17,17,15,.65)' }}>
          {c.status === 'published' && c.publishedAt ? `Terbit ${fmtDateTime(c.publishedAt, z, st.hour12)}` : c.plannedPublishAt ? `Rencana ${fmtDateTime(c.plannedPublishAt, z, st.hour12)} · diedit ${ago(c.updatedAt)}` : `Diedit ${ago(c.updatedAt)}`}
          {src && <> · <Link2 size={11} /> dari {'title' in src ? src.title : 'ide'}</>}
        </p>
      </button>
    </article>
  )
}
