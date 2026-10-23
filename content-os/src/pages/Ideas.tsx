import React, { useEffect, useState } from 'react'
import { ArrowLeft, Search as SearchIcon, AtSign, Plus, Link2, ChevronRight } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { all, get, patch, tz } from '../lib/store'
import { convertIdea, setLifecycle } from '../lib/model'
import { ago } from '../lib/time'
import { go, back, useRoute, setQuery } from '../lib/router'
import { safeUrl } from '../lib/prefs'
import { Button, Chips, Empty, Menu, AutoTextarea, IconBtn, ask, toast, Badge, cx } from '../ui/kit'
import { openSheet } from '../ui/bus'
import type { Idea, Format } from '../lib/types'

type F = 'open' | 'converted' | 'all'

export default function Ideas() {
  const r = useRoute()
  const openId = r.q.get('open')
  const [q, setQ] = useState('')
  const [f, setF] = useState<F>('open')
  const [expanded, setExpanded] = useState<string | null>(openId)
  useEffect(() => { if (openId) { setExpanded(openId); const i = get('ideas', openId); if (i && i.convertedContentIds.length) setF('all'); setTimeout(() => document.getElementById('idea-' + openId)?.scrollIntoView({ block: 'center' }), 60) } }, [openId])

  const live = all('ideas').filter((i) => i.lifecycle === 'active')
  const list = live.filter((i) => (f === 'open' ? !i.convertedContentIds.length : f === 'converted' ? i.convertedContentIds.length > 0 : true))
    .filter((i) => !q || i.text.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  const counts = { open: live.filter((i) => !i.convertedContentIds.length).length, converted: live.filter((i) => i.convertedContentIds.length).length, all: live.length }

  return (
    <main className="main">
      <div className="topbar"><IconBtn label="Kembali" onClick={() => back('/overview')}><ArrowLeft size={22} /></IconBtn></div>
      <div className="pagehead"><h1 className="page-title">Inbox ide.</h1><Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => openSheet({ type: 'capture' })}>Tangkap</Button></div>
      <div className="stack">
        <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari ide" placeholder="Cari ide" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Chips label="Filter ide" value={f} onChange={setF} options={[{ value: 'open', label: `Belum dikembangkan · ${counts.open}` }, { value: 'converted', label: `Sudah jadi konten · ${counts.converted}` }, { value: 'all', label: `Semua · ${counts.all}` }]} />
        {list.length === 0 ? (
          live.length === 0
            ? <Empty title="Inbox kosong" body="Ide yang ditangkap muncul di sini, tanpa harus diberi kategori atau tanggal." action={<Button variant="primary" onClick={() => openSheet({ type: 'capture' })}>Tangkap ide</Button>} />
            : <Empty title="Tidak ada yang cocok" action={<Button onClick={() => { setQ(''); setF('all') }}>Reset filter</Button>} />
        ) : list.map((i) => <IdeaCard key={i.id} idea={i} open={expanded === i.id} onToggle={() => { setExpanded(expanded === i.id ? null : i.id); if (openId) setQuery('open', null) }} />)}
        <p className="small muted center">Ide yang diparkir atau diarsip ada di <button className="linkbtn" onClick={() => go('/archive')}>Arsip</button>.</p>
      </div>
    </main>
  )
}

function IdeaCard({ idea, open, onToggle }: { idea: Idea; open: boolean; onToggle: () => void }) {
  const [fmt, setFmt] = useState<Format>('reel')
  const converted = idea.convertedContentIds.map((id) => get('contents', id)).filter(Boolean)
  const source = get('contents', idea.sourceContentId)

  const develop = async (channel: 'instagram' | 'threads') => {
    if (converted.length) {
      const ans = await ask({ title: 'Ide ini sudah jadi konten', body: `Sudah dikembangkan jadi "${converted[0]!.title}". Buka konten itu, atau buat konten baru dari ide yang sama?`, confirm: 'Buka konten lama', extra: 'Buat konten baru' })
      if (ans === 'confirm') { go(`/${converted[0]!.channel}/${converted[0]!.id}`); return }
      if (ans !== 'extra') return
    }
    const c = convertIdea(idea.id, { channel, format: fmt })
    toast('Ide dikembangkan jadi draft')
    go(channel === 'threads' ? `/threads/${c.id}` : `/instagram/${c.id}?tab=write`)
  }

  return (
    <article id={'idea-' + idea.id} className={cx('card', open && 'tint-butter')} style={{ padding: 0 }}>
      <div className="row gap8" style={{ padding: '12px 6px 12px 16px' }}>
        <button className="tap grow" style={{ border: 0, background: 'none', padding: 0 }} onClick={onToggle} aria-expanded={open}>
          <span className={cx('body-text', !open && 'clamp3')} style={{ display: 'block', whiteSpace: open ? 'pre-wrap' : undefined }}>{open ? '' : idea.text}</span>
          {!open && <span className="row gap6 mt8 xs muted wrap">
            <span>{ago(idea.createdAt)}</span>
            {idea.preferredChannel && <Badge>{idea.preferredChannel === 'threads' ? 'Threads' : 'Instagram'}</Badge>}
            {converted.length > 0 && <Badge tone="sage">Jadi konten</Badge>}
            {idea.url && <Link2 size={13} />}
          </span>}
        </button>
        <Menu items={[
          { label: 'Parkir', onSelect: () => { setLifecycle('ideas', idea.id, 'parked'); toast('Ide diparkir', { label: 'Batal', run: () => setLifecycle('ideas', idea.id, 'active') }) } },
          { label: 'Arsip', onSelect: () => { setLifecycle('ideas', idea.id, 'archived'); toast('Ide diarsip', { label: 'Batal', run: () => setLifecycle('ideas', idea.id, 'active') }) } },
          { label: 'Hapus', danger: true, onSelect: () => { setLifecycle('ideas', idea.id, 'deleted'); toast('Dipindah ke Sampah', { label: 'Batal', run: () => setLifecycle('ideas', idea.id, 'active') }) } },
        ]} />
      </div>
      {open && (
        <div className="stack" style={{ padding: '0 16px 16px' }}>
          <AutoTextarea aria-label="Teks ide" value={idea.text} onChange={(v) => patch('ideas', idea.id, { text: v })} minRows={3} />
          <input className="input" aria-label="Link referensi" type="url" placeholder="Link referensi (opsional)" value={idea.url || ''} onChange={(e) => patch('ideas', idea.id, { url: e.target.value })} />
          {idea.url && safeUrl(idea.url) && <a className="small break" href={safeUrl(idea.url)!} target="_blank" rel="noopener noreferrer">{idea.url}</a>}
          {source && <p className="small">Lanjutan dari <button className="linkbtn" onClick={() => go(`/${source.channel}/${source.id}`)}>{source.title}</button></p>}
          {converted.length > 0 && (
            <div className="list">{converted.map((c) => (
              <button key={c!.id} className="li" onClick={() => go(`/${c!.channel}/${c!.id}`)}>
                {c!.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}<span className="li-main li-title">{c!.title}</span><ChevronRight size={18} />
              </button>
            ))}</div>
          )}
          <div className="field">
            <span className="field-label">Kembangkan jadi</span>
            <Chips label="Format Instagram" value={fmt} onChange={setFmt} options={[{ value: 'reel', label: 'Reel' }, { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' }]} />
            <div className="row gap8 mt8">
              <Button variant="primary" icon={<Instagram size={18} />} className="grow" onClick={() => develop('instagram')}>Instagram</Button>
              <Button icon={<AtSign size={18} />} className="grow" onClick={() => develop('threads')}>Threads</Button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
