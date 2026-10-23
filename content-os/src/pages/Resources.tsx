import React, { useState } from 'react'
import { Folder, Link2, Image as ImageIcon, MessageSquareQuote, Mic2, ChevronDown, ChevronUp, SlidersHorizontal, Search as SearchIcon, Copy, ExternalLink, Pin, FileText, Plus } from 'lucide-react'
import { all, patch, put, uid } from '../lib/store'
import { contentsUsing, setLifecycle } from '../lib/model'
import { assetUrl } from '../lib/image'
import { safeUrl, pref, setPref } from '../lib/prefs'
import { FORMAT_LABEL, ACTIVITY_LABEL } from '../lib/templates'
import { go } from '../lib/router'
import { Button, Chips, Menu, Empty, Sheet, IconBtn, ask, toast, copyOrShow, Badge, cx } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { RTYPE_LABEL, SKIND_LABEL } from '../sheets/ResourceSheets'
import { TemplateEditor } from '../sheets/TemplateEditor'
import type { Resource, Template } from '../lib/types'

type Filter = 'all' | Resource['type'] | 'template'
const TINT: Record<Resource['type'], string> = { footage: 'tint-sage', reference: 'tint-cyan', hook: 'tint-butter', voice: 'tint-lavender' }

export function resIcon(r: Resource, size = 20) {
  if (r.type === 'voice') return <Mic2 size={size} />
  if (r.type === 'hook') return <MessageSquareQuote size={size} />
  if (r.sourceKind === 'web_link') return <Link2 size={size} />
  if (r.sourceKind === 'image') return <ImageIcon size={size} />
  return <Folder size={size} />
}

export async function trashResource(r: Resource) {
  const n = contentsUsing(r.id).length
  if (n) {
    const a = await ask({ title: `Hapus ${r.title}?`, body: `Bahan ini dipakai di ${n} konten. Tautannya ikut hilang dari konten tersebut. Bisa dikembalikan dari Sampah.`, confirm: 'Pindah ke Sampah', danger: true })
    if (a !== 'confirm') return false
  }
  setLifecycle('resources', r.id, 'deleted')
  toast('Dipindah ke Sampah', { label: 'Batal', run: () => setLifecycle('resources', r.id, 'active') })
  return true
}

export default function Resources() {
  const [f, setF] = useState<Filter>(() => pref('res:f', 'all'))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'new' | 'name'>(() => pref('res:sort', 'new'))
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [showF, setShowF] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [tpl, setTpl] = useState<string | null | undefined>(undefined)
  const setFilter = (v: Filter) => { setF(v); setPref('res:f', v) }

  const live = all('resources').filter((r) => r.lifecycle === 'active')
  const s = q.toLowerCase()
  const list = live.filter((r) => (f === 'all' || r.type === f) && (!pinnedOnly || r.pinned) && (!s || [r.title, r.body, r.localPath, r.url, ...r.tags, r.voice ? Object.values(r.voice).join(' ') : ''].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title) : b.updatedAt > a.updatedAt ? 1 : -1))
  const pinned = list.filter((r) => r.pinned), rest = list.filter((r) => !r.pinned)
  const templates = all('templates').filter((t) => t.lifecycle === 'active' && (!s || t.name.toLowerCase().includes(s))).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <main className="main">
      <div className="pagehead" style={{ marginTop: 10, alignItems: 'center' }}>
        <h1 className="page-title">Resources.</h1>
        <IconBtn label="Urutan dan filter" onClick={() => setShowF(true)}><SlidersHorizontal size={21} /></IconBtn>
      </div>
      <div className="stack">
        <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari bahan" placeholder="Cari bahan yang bisa dipakai" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Chips scroll label="Jenis" value={f} onChange={setFilter} options={[{ value: 'all', label: 'Semua' }, { value: 'footage', label: 'Footage' }, { value: 'reference', label: 'Referensi' }, { value: 'hook', label: 'Hook' }, { value: 'template', label: 'Template' }, { value: 'voice', label: 'Brand voice' }]} />

        {f === 'template' ? (
          <>
            {templates.map((t) => <TemplateCard key={t.id} t={t} onEdit={() => setTpl(t.id)} />)}
            <Button icon={<Plus size={18} />} onClick={() => setTpl(null)}>Template baru</Button>
          </>
        ) : live.length === 0 ? (
          <Empty icon={<Folder size={22} />} title="Belum ada bahan" body="Simpan lokasi footage, link referensi, hook, dan brand voice di sini." action={<Button variant="primary" onClick={() => openSheet({ type: 'resource' })}>Tambah bahan</Button>} />
        ) : list.length === 0 ? (
          <Empty title="Tidak ada yang cocok" action={<Button onClick={() => { setQ(''); setFilter('all'); setPinnedOnly(false) }}>Reset filter</Button>} />
        ) : (
          <>
            {pinned.length > 0 && <><h2 className="h3">Pinned</h2>{pinned.map((r) => <ResourceCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)}</>}
            {pinned.length > 0 && rest.length > 0 && <h2 className="h3 mt8">Lainnya</h2>}
            {rest.map((r) => <ResourceCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)}
          </>
        )}
      </div>
      <Sheet open={showF} onClose={() => setShowF(false)} title="Tampilan" footer={<Button variant="primary" block onClick={() => setShowF(false)}>Selesai</Button>}>
        <div className="field"><span className="field-label">Urutkan</span><Chips label="Urutan" value={sort} onChange={(v) => { setSort(v); setPref('res:sort', v) }} options={[{ value: 'new', label: 'Terbaru' }, { value: 'name', label: 'Nama' }]} /></div>
        <div className="field"><span className="field-label">Tampilkan</span><Chips label="Pin" value={pinnedOnly ? 'pin' : 'all'} onChange={(v) => setPinnedOnly(v === 'pin')} options={[{ value: 'all', label: 'Semua' }, { value: 'pin', label: 'Hanya pinned' }]} /></div>
      </Sheet>
      {tpl !== undefined && <TemplateEditor id={tpl || undefined} onClose={() => setTpl(undefined)} />}
    </main>
  )
}

function ResourceCard({ r, open, onToggle }: { r: Resource; open: boolean; onToggle: () => void }) {
  const img = assetUrl(r.assetId)
  const used = contentsUsing(r.id).length
  const url = safeUrl(r.url)
  return (
    <article className={cx('rcard on-tint', TINT[r.type])}>
      <div className="rcard-head">
        <span className="ricon">{resIcon(r)}</span>
        <button className="tap grow" style={{ border: 0, background: 'none', padding: 0, minWidth: 0 }} onClick={onToggle} aria-expanded={open}>
          <span className="li-title" style={{ display: 'block' }}>{r.pinned && <Pin size={13} style={{ marginRight: 4 }} />}{r.title}</span>
          <span className="xs" style={{ color: 'var(--ink-2)' }}>{RTYPE_LABEL[r.type]}{r.type !== 'voice' && r.type !== 'hook' ? ' · ' + SKIND_LABEL[r.sourceKind] : ''}{used ? ` · dipakai ${used}` : ''}{r.demo ? ' · Contoh' : ''}</span>
        </button>
        <Menu label={`Menu ${r.title}`} items={[
          { label: 'Edit', onSelect: () => openSheet({ type: 'resource', id: r.id }) },
          { label: 'Detail', onSelect: () => go(`/resources/${r.id}`) },
          { label: r.pinned ? 'Lepas pin' : 'Pin', onSelect: () => patch('resources', r.id, { pinned: !r.pinned }) },
          { label: 'Arsip', onSelect: () => { setLifecycle('resources', r.id, 'archived'); toast('Bahan diarsip', { label: 'Batal', run: () => setLifecycle('resources', r.id, 'active') }) } },
          { label: 'Hapus', danger: true, onSelect: () => trashResource(r) },
        ]} />
        <IconBtn label={open ? 'Tutup' : 'Buka'} onClick={onToggle}>{open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</IconBtn>
      </div>
      {open && <div className="rcard-body"><ResourceBody r={r} img={img} url={url} /></div>}
    </article>
  )
}

export function ResourceBody({ r, img, url }: { r: Resource; img?: string; url: string | null }) {
  return (
    <>
      {img && <img src={img} alt={r.title} className="rimg" loading="lazy" />}
      {r.type === 'voice' && r.voice && (
        <div className="col gap6 small">
          {([['tone', 'Tone'], ['audience', 'Audiens'], ['prefer', 'Pakai'], ['avoid', 'Hindari'], ['examples', 'Contoh']] as const).map(([k, l]) => r.voice![k] ? <p key={k}><b>{l}:</b> {r.voice![k]}</p> : null)}
        </div>
      )}
      {r.body && <p className="body-text pre">{r.body}</p>}
      {r.localPath && <div className="row gap8" style={{ background: 'var(--wash)', borderRadius: 12, padding: '8px 8px 8px 12px' }}><Folder size={16} /><span className="grow small break">{r.localPath}</span><Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(r.localPath!, 'Salin lokasi', 'Lokasi tersalin')}>Salin lokasi</Button></div>}
      {r.url && (url ? <div className="row gap8" style={{ background: 'var(--wash)', borderRadius: 12, padding: '8px 8px 8px 12px' }}><Link2 size={16} /><a className="grow small break" href={url} target="_blank" rel="noopener noreferrer">{r.url}</a><IconBtn label="Salin link" onClick={() => copyOrShow(r.url!, 'Salin link')}><Copy size={15} /></IconBtn></div> : <p className="small muted break">{r.url} (link tidak valid)</p>)}
      {r.tags.length > 0 && <div className="row gap6 wrap">{r.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
      <div className="row gap8">
        {r.type === 'hook' && <Button icon={<Copy size={16} />} onClick={() => copyOrShow(r.body, 'Salin hook')}>Salin</Button>}
        <Button variant="primary" className="grow" onClick={() => openSheet({ type: 'useResource', resourceId: r.id })}>Pakai di konten</Button>
      </div>
    </>
  )
}

function TemplateCard({ t, onEdit }: { t: Template; onEdit: () => void }) {
  const dup = () => { put('templates', { ...t, id: uid(), name: t.name + ' (salinan)', builtin: false, createdAt: '', updatedAt: '' }); toast('Template diduplikasi') }
  return (
    <article className="rcard tint-butter on-tint">
      <div className="rcard-head">
        <span className="ricon"><FileText size={20} /></span>
        <button className="tap grow" style={{ border: 0, background: 'none', padding: 0 }} onClick={onEdit}>
          <span className="li-title" style={{ display: 'block' }}>{t.name}</span>
          <span className="xs" style={{ color: 'var(--ink-2)' }}>Template · {t.compatibleFormats.map((f) => FORMAT_LABEL[f]).join(', ')}{t.builtin ? ' · bawaan' : ''}</span>
        </button>
        <Menu label={`Menu ${t.name}`} items={[
          { label: 'Edit', onSelect: onEdit },
          { label: 'Duplikasi', onSelect: dup },
          { label: 'Arsip', onSelect: () => { setLifecycle('templates', t.id, 'archived'); toast('Template diarsip', { label: 'Batal', run: () => setLifecycle('templates', t.id, 'active') }) } },
        ]} />
      </div>
      <div className="rcard-body small">
        <p><b>Naskah:</b> {t.sections.map((s) => s.label).join(' · ')}</p>
        {t.defaultTasks.length > 0 && <p><b>Tugas:</b> {t.defaultTasks.map((x) => `${x.title} (${ACTIVITY_LABEL[x.activity]})`).join(' → ')}</p>}
        {t.defaultReadiness.length > 0 && <p><b>Checklist:</b> {t.defaultReadiness.join(', ')}</p>}
      </div>
    </article>
  )
}
