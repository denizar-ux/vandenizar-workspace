import React from 'react'
import { ArrowLeft, Lightbulb, AtSign, FolderOpen, ListChecks, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { all, get } from '../lib/store'
import { setLifecycle, purge, contentsUsing } from '../lib/model'
import { ago } from '../lib/time'
import { back, go, useRoute, setQuery } from '../lib/router'
import { Segmented, Empty, Menu, ask, toast, Button, IconBtn } from '../ui/kit'
import type { Lifecycle, Coll } from '../lib/types'

type L = Exclude<Lifecycle, 'active'>

interface Row { coll: Coll; id: string; title: string; kind: string; icon: React.ReactNode; updatedAt: string; open?: () => void }

export default function Archive() {
  const r = useRoute()
  const lc = (r.q.get('l') as L) || 'parked'
  const rows: Row[] = []
  for (const c of all('contents')) if (c.lifecycle === lc) rows.push({ coll: 'contents', id: c.id, title: c.title, kind: c.channel === 'threads' ? 'Threads' : 'Instagram', icon: c.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />, updatedAt: c.updatedAt, open: lc !== 'deleted' ? () => go(`/${c.channel}/${c.id}`) : undefined })
  for (const i of all('ideas')) if (i.lifecycle === lc) rows.push({ coll: 'ideas', id: i.id, title: i.text.split('\n')[0].slice(0, 90), kind: 'Ide', icon: <Lightbulb size={18} />, updatedAt: i.updatedAt })
  for (const x of all('resources')) if (x.lifecycle === lc) rows.push({ coll: 'resources', id: x.id, title: x.title, kind: 'Bahan', icon: <FolderOpen size={18} />, updatedAt: x.updatedAt, open: lc !== 'deleted' ? () => go(`/resources/${x.id}`) : undefined })
  for (const t of all('tasks')) if (t.lifecycle === lc && !t.contentId) rows.push({ coll: 'tasks', id: t.id, title: t.title, kind: 'Tugas', icon: <ListChecks size={18} />, updatedAt: t.updatedAt })
  for (const t of all('templates')) if (t.lifecycle === lc) rows.push({ coll: 'templates', id: t.id, title: t.name, kind: 'Template', icon: <FileText size={18} />, updatedAt: t.updatedAt })
  rows.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
  const counts = (l: L) => [...all('contents'), ...all('ideas'), ...all('resources'), ...all('templates')].filter((x: any) => x.lifecycle === l).length + all('tasks').filter((t) => !t.contentId && t.lifecycle === l).length

  const restore = (row: Row) => { setLifecycle(row.coll, row.id, 'active'); toast(`${row.kind} dipulihkan`) }
  const destroy = async (row: Row) => {
    const extra = row.coll === 'resources' && contentsUsing(row.id).length ? ` Tautan di ${contentsUsing(row.id).length} konten ikut dihapus.` : row.coll === 'contents' ? ' Naskah, tugas, shot, checklist dan review ikut terhapus.' : ''
    const a = await ask({ title: 'Hapus permanen?', body: `Tidak bisa dikembalikan.${extra}`, confirm: 'Hapus permanen', danger: true, typeToConfirm: row.title.slice(0, 40) })
    if (a !== 'confirm') return
    purge(row.coll, row.id); toast('Dihapus permanen')
  }
  const emptyTrash = async () => {
    const a = await ask({ title: 'Kosongkan Sampah?', body: `${rows.length} item dihapus permanen.`, confirm: 'Kosongkan', danger: true, typeToConfirm: 'hapus' })
    if (a !== 'confirm') return
    rows.forEach((x) => { if (get(x.coll as any, x.id)) purge(x.coll, x.id) }); toast('Sampah dikosongkan')
  }

  return (
    <main className="main">
      <div className="topbar"><IconBtn label="Kembali" onClick={() => back('/settings')}><ArrowLeft size={22} /></IconBtn></div>
      <h1 className="page-title mt8">Arsip.</h1>
      <div className="stack mt16">
        <Segmented label="Jenis" value={lc} onChange={(v) => setQuery('l', v)} options={[{ value: 'parked', label: 'Parkir', count: counts('parked') }, { value: 'archived', label: 'Arsip', count: counts('archived') }, { value: 'deleted', label: 'Sampah', count: counts('deleted') }]} />
        <p className="small muted">{lc === 'parked' ? 'Disimpan untuk nanti. Tidak muncul di rekomendasi dan agenda.' : lc === 'archived' ? 'Selesai atau tidak dipakai lagi, tetap bisa dipulihkan.' : 'Item yang dihapus. Pulihkan atau hapus permanen.'}</p>
        {rows.length === 0 ? <Empty title="Kosong" /> : (
          <div className="list">
            {rows.map((row) => (
              <div key={row.coll + row.id} className="li">
                {row.icon}
                <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={row.open} disabled={!row.open}>
                  <span className="li-title clamp2" style={{ display: 'block' }}>{row.title || '(tanpa judul)'}</span>
                  <span className="li-sub">{row.kind} · {ago(row.updatedAt)}</span>
                </button>
                <IconBtn label={`Pulihkan ${row.title}`} onClick={() => restore(row)}><RotateCcw size={18} /></IconBtn>
                <Menu label={`Menu ${row.title}`} items={[
                  { label: 'Pulihkan', onSelect: () => restore(row) },
                  { label: 'Pindah ke Arsip', onSelect: () => setLifecycle(row.coll, row.id, 'archived'), hidden: lc === 'archived' },
                  { label: 'Pindah ke Sampah', onSelect: () => setLifecycle(row.coll, row.id, 'deleted'), hidden: lc === 'deleted' },
                  { label: 'Hapus permanen', danger: true, onSelect: () => destroy(row) },
                ]} />
              </div>
            ))}
          </div>
        )}
        {lc === 'deleted' && rows.length > 0 && <Button variant="ghost" icon={<Trash2 size={18} />} onClick={emptyTrash}>Kosongkan Sampah</Button>}
      </div>
    </main>
  )
}
