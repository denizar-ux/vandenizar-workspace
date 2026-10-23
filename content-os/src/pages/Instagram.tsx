import React, { useState } from 'react'
import { List, LayoutGrid, Calendar as CalIcon, ListChecks, Circle, CheckCircle2, Image as ImageIcon, SlidersHorizontal, Search as SearchIcon, Plus, Pin } from 'lucide-react'
import { all, get, settings, tz } from '../lib/store'
import { nextTask, progress, taxLabel, liveTax } from '../lib/model'
import { fmtDateTime } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { assetUrl } from '../lib/image'
import { FORMAT_LABEL, STATUS_LABEL } from '../lib/templates'
import { changeStage, lifecycleAction, duplicate, togglePin } from '../lib/contentActions'
import { createInstagram } from '../lib/model'
import { Button, Menu, Empty, Sheet, Field, Chips, Badge, cx } from '../ui/kit'
import { openSheet } from '../ui/bus'
import type { Content, Status, Format } from '../lib/types'

const STAGES: Status[] = ['idea', 'in_progress', 'ready', 'published']
const TINT: Record<Status, string> = { idea: 'tint-cyan', in_progress: 'tint-butter', ready: 'tint-sage', published: 'tint-lavender' }

interface Filt { format: 'all' | Format; pillar: string; tag: string; series: string; sort: 'updated' | 'post' }
const F0: Filt = { format: 'all', pillar: '', tag: '', series: '', sort: 'updated' }

export default function Instagram() {
  const r = useRoute()
  const stage = (r.q.get('stage') as Status) || pref<Status>('ig:stage', 'in_progress')
  const [view, setView] = useState<'list' | 'board'>(() => pref('ig:view', 'list'))
  const [f, setF] = useState<Filt>(() => ({ ...F0, ...pref('ig:filt', {}) }))
  const [q, setQ] = useState('')
  const [showF, setShowF] = useState(false)
  const upd = (p: Partial<Filt>) => { const n = { ...f, ...p }; setF(n); setPref('ig:filt', n) }
  const setStage = (s: Status) => { setPref('ig:stage', s); setQuery('stage', s) }

  const live = all('contents').filter((c) => c.channel === 'instagram' && c.lifecycle === 'active')
  const filtered = live.filter((c) => {
    if (f.format !== 'all' && c.format !== f.format) return false
    if (f.pillar && c.pillarId !== f.pillar) return false
    if (f.series && c.seriesId !== f.series) return false
    if (f.tag && !c.tagIds.includes(f.tag)) return false
    if (q) {
      const s = q.toLowerCase()
      const hay = [c.title, c.caption, c.notes, ...all('sections').filter((x) => x.contentId === c.id).map((x) => x.body)].join(' ').toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  })
  const sorter = (a: Content, b: Content) => f.sort === 'post'
    ? (a.plannedPublishAt || '9999') < (b.plannedPublishAt || '9999') ? -1 : (a.plannedPublishAt || '9999') > (b.plannedPublishAt || '9999') ? 1 : 0
    : b.updatedAt > a.updatedAt ? 1 : -1
  const byStage = (s: Status) => filtered.filter((c) => c.status === s).sort(sorter)
  const active = f.format !== 'all' || f.pillar || f.tag || f.series || q
  const nFilters = [f.format !== 'all', f.pillar, f.tag, f.series].filter(Boolean).length

  const newDraft = () => { const c = createInstagram(); go(`/instagram/${c.id}?tab=write`) }

  return (
    <main className={cx('main', view === 'board' && 'wide')}>
      <div className="pagehead" style={{ marginTop: 10 }}>
        <h1 className="page-title">Instagram.</h1>
        <div className="seg" style={{ flex: 'none' }} role="tablist" aria-label="Tampilan">
          <button role="tab" aria-selected={view === 'list'} aria-label="Daftar" className={cx('seg-item', view === 'list' && 'on')} onClick={() => { setView('list'); setPref('ig:view', 'list') }}><List size={18} /></button>
          <button role="tab" aria-selected={view === 'board'} aria-label="Board" className={cx('seg-item', view === 'board' && 'on')} onClick={() => { setView('board'); setPref('ig:view', 'board') }}><LayoutGrid size={18} /></button>
        </div>
      </div>
      <div className="stack">
        {view === 'list' && (
          <div className="stagegrid" role="tablist" aria-label="Tahap">
            {STAGES.map((s) => (
              <button key={s} role="tab" aria-selected={stage === s} className={cx('stage', stage === s && 'on')} onClick={() => setStage(s)}>
                <span>{STATUS_LABEL[s]}</span><b>{byStage(s).length}{active ? <span style={{ opacity: .55, fontWeight: 500 }}>/{live.filter((c) => c.status === s).length}</span> : null}</b>
              </button>
            ))}
          </div>
        )}
        <div className="row gap8">
          <div className="search grow"><SearchIcon size={18} /><input className="input" aria-label="Cari judul dan isi" placeholder="Cari judul dan isi" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button icon={<SlidersHorizontal size={18} />} onClick={() => setShowF(true)} aria-label="Filter dan urutan">{nFilters ? String(nFilters) : null}</Button>
        </div>

        {live.length === 0 ? (
          <Empty icon={<ImageIcon size={22} />} title="Belum ada konten Instagram" body="Buat draft, atau kembangkan dari Inbox ide." action={<><Button variant="primary" icon={<Plus size={18} />} onClick={newDraft}>Draft baru</Button><Button onClick={() => go('/ideas')}>Inbox ide</Button></>} />
        ) : view === 'list' ? (
          byStage(stage).length === 0
            ? <Empty title={active ? 'Tidak ada yang cocok dengan filter' : `Belum ada konten di ${STATUS_LABEL[stage]}`} action={active ? <Button onClick={() => { setQ(''); upd({ ...F0, sort: f.sort }) }}>Reset filter</Button> : stage === 'idea' ? <Button onClick={newDraft}>Draft baru</Button> : undefined} />
            : <div className="stack">{byStage(stage).map((c) => <ContentCard key={c.id} c={c} />)}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div className="board" style={{ minWidth: 880 }}>
              {STAGES.map((s) => (
                <div key={s} className="board-col">
                  <div className="board-col-head"><span>{STATUS_LABEL[s]}</span><span className="muted tnum">{byStage(s).length}</span></div>
                  {byStage(s).map((c) => <ContentCard key={c.id} c={c} compact />)}
                  {byStage(s).length === 0 && <p className="small muted" style={{ padding: '8px 4px' }}>Kosong</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Sheet open={showF} onClose={() => setShowF(false)} title="Filter" footer={<div className="row gap8"><Button variant="ghost" onClick={() => upd({ ...F0 })}>Reset</Button><span className="grow" /><Button variant="primary" onClick={() => setShowF(false)}>Selesai</Button></div>}>
        <div className="field"><span className="field-label">Format</span>
          <Chips label="Format" value={f.format} onChange={(v) => upd({ format: v })} options={[{ value: 'all', label: 'Semua' }, { value: 'reel', label: 'Reel' }, { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' }]} /></div>
        {(['pillar', 'series', 'tag'] as const).map((t) => (
          <Field key={t} label={t === 'pillar' ? 'Pilar' : t === 'series' ? 'Seri' : 'Tag'} htmlFor={'f-' + t}>
            <select id={'f-' + t} className="input" value={f[t]} onChange={(e) => upd({ [t]: e.target.value } as any)}>
              <option value="">Semua</option>
              {liveTax(t).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
        ))}
        <div className="field"><span className="field-label">Urutkan</span>
          <Chips label="Urutan" value={f.sort} onChange={(v) => upd({ sort: v })} options={[{ value: 'updated', label: 'Terakhir diedit' }, { value: 'post', label: 'Rencana post terdekat' }]} /></div>
      </Sheet>
    </main>
  )
}

export function ContentCard({ c, compact }: { c: Content; compact?: boolean }) {
  const z = tz()
  const st = settings()
  const nt = nextTask(c.id)
  const pr = progress(c.id)
  const tpl = get('templates', c.templateId)
  const img = assetUrl(c.coverAssetId)
  const open = () => go(`/instagram/${c.id}`)
  return (
    <article className={cx('ccard on-tint', TINT[c.status])}>
      <div className="ccard-top">
        {!compact && (img ? <img src={img} alt="" className="thumb" loading="lazy" width={64} height={76} /> : <div className="thumb" aria-hidden><ImageIcon size={20} /></div>)}
        <button className="tap grow" style={{ border: 0, background: 'none', padding: 0 }} onClick={open}>
          <h3 className="ccard-title clamp2">{st.pinnedContentId === c.id && <Pin size={14} style={{ marginRight: 4 }} />}{c.title}</h3>
          <div className="row gap6 wrap mt8">
            {c.format && <Badge>{FORMAT_LABEL[c.format]}</Badge>}
            {tpl && c.format === 'reel' && <Badge>{tpl.name}</Badge>}
            {c.seriesDay && <Badge>{c.seriesDay}</Badge>}
            {c.demo && <Badge tone="line">Contoh</Badge>}
          </div>
        </button>
        <Menu label={`Menu ${c.title}`} items={[
          { label: 'Buka', onSelect: open },
          ...(['idea', 'in_progress', 'ready', 'published'] as Status[]).filter((s) => s !== c.status).map((s) => ({ label: `Pindah ke ${STATUS_LABEL[s]}`, onSelect: () => changeStage(c.id, s) })),
          { label: c.plannedPublishAt ? 'Ubah jadwal posting' : 'Jadwalkan posting', onSelect: () => openSheet({ type: 'schedulePost', contentId: c.id }), hidden: c.status === 'published' },
          { label: st.pinnedContentId === c.id ? 'Lepas pin' : 'Pin ke Overview', onSelect: () => togglePin(c.id), hidden: c.status === 'published' },
          { label: 'Duplikasi', onSelect: () => duplicate(c.id) },
          { label: 'Parkir', onSelect: () => lifecycleAction(c.id, 'parked') },
          { label: 'Arsip', onSelect: () => lifecycleAction(c.id, 'archived') },
          { label: 'Hapus', danger: true, onSelect: () => lifecycleAction(c.id, 'deleted') },
        ]} />
      </div>
      <button className="tap ccard-meta" style={{ border: 0, background: 'none', padding: 0 }} onClick={open}>
        {c.status !== 'published' && <span className="row">{nt ? <Circle size={16} /> : <CheckCircle2 size={16} />}<span className="clamp2">{nt ? nt.title : pr.total ? 'Semua tugas selesai' : 'Lanjut nulis script'}</span></span>}
        <span className="row"><CalIcon size={16} /><span className="tnum">{c.status === 'published' && c.publishedAt ? 'Terbit ' + fmtDateTime(c.publishedAt, z, st.hour12) : c.plannedPublishAt ? fmtDateTime(c.plannedPublishAt, z, st.hour12) : 'Tanpa jadwal'}</span></span>
        {pr.total > 0 && <span className="row"><ListChecks size={16} /><span className="tnum">{pr.done}/{pr.total} langkah</span></span>}
      </button>
    </article>
  )
}
