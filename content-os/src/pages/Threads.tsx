import React, { useState } from 'react'
import { Copy, Check, Trash2, RotateCcw } from 'lucide-react'
import { patch, remove, put, tz } from '../lib/store'
import { threadDrafts, threadPosted, addThread, markPosted } from '../lib/model'
import { fmtShort, dateKey } from '../lib/time'
import { PageHead } from '../ui/Shell'
import { Button, IconBtn, AutoTextarea, Segmented, Empty, toast, copyOrShow } from '../ui/kit'
import type { Item } from '../lib/types'

export default function Threads() {
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'draft' | 'posted'>('draft')
  const drafts = threadDrafts(), posted = threadPosted()
  const list = tab === 'draft' ? drafts : posted
  const save = () => { if (addThread(text)) { setText(''); setTab('draft'); toast('Draft disimpan') } }

  return (
    <main className="main">
      <PageHead title="Threads." sub="Tulis draft, salin, terus tandai kalau udah diposting." />
      <section className="composer">
        <AutoTextarea aria-label="Draft Threads baru" value={text} minRows={3} placeholder="Lagi kepikiran apa?" onChange={setText}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }} />
        <div className="row between">
          <span className="xs muted tnum">{text.length ? `${text.length} karakter` : ''}</span>
          <Button variant="primary" size="sm" disabled={!text.trim()} onClick={save}>Simpan draft</Button>
        </div>
      </section>
      <Segmented className="mt16" label="Status" value={tab} onChange={setTab} options={[{ value: 'draft', label: 'Draft', count: drafts.length }, { value: 'posted', label: 'Udah diposting', count: posted.length }]} />
      <div className="stack mt16">
        {list.length === 0
          ? <Empty title={tab === 'draft' ? 'Belum ada draft' : 'Belum ada yang diposting'} body={tab === 'draft' ? 'Tulis di kolom atas. Satu draft = satu post.' : undefined} />
          : list.map((t) => <ThreadCard key={t.id} t={t} />)}
      </div>
    </main>
  )
}

function ThreadCard({ t }: { t: Item }) {
  const z = tz()
  const posted = !!t.postedAt
  return (
    <article className={posted ? 'tcard tcard-posted' : 'tcard'}>
      {posted
        ? <p className="body-text pre">{t.text}</p>
        : <AutoTextarea aria-label="Isi draft" className="input-plain tcard-text" value={t.text || ''} minRows={2} onChange={(v) => patch('items', t.id, { text: v })} />}
      <div className="row gap8 wrap">
        {posted ? (
          <>
            <span className="small muted grow"><Check size={14} style={{ verticalAlign: -2 }} /> Diposting {fmtShort(dateKey(t.postedAt!, z), z)}</span>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={() => markPosted(t.id, false)}>Balikin ke draft</Button>
          </>
        ) : (
          <>
            <Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(t.text || '', 'Salin draft')}>Salin</Button>
            <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => { markPosted(t.id, true); toast('Ditandai udah diposting', { label: 'Batal', run: () => markPosted(t.id, false) }) }}>Udah posting</Button>
            <span className="grow" />
            <IconBtn label="Hapus draft" onClick={() => { const snap = { ...t }; remove('items', t.id); toast('Draft dihapus', { label: 'Batal', run: () => put('items', snap) }) }}><Trash2 size={17} /></IconBtn>
          </>
        )}
      </div>
    </article>
  )
}
