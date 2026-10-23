import React, { useState } from 'react'
import { ArrowLeft, Plus, X, Layers, Trash2, Search as SearchIcon } from 'lucide-react'
import { get, patch, tz, all } from '../lib/store'
import { batchMembers, addToBatch, removeFromBatch, deleteBatch, candidateTasks, taskLive } from '../lib/model'
import { dateKey, timeKey, zonedToIso, fmtDay, fmtTime, tzLabel } from '../lib/time'
import { ACTIVITY_LABEL } from '../lib/templates'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Field, Check3, Sheet, ask, toast, Empty, cx } from '../ui/kit'
import { NotFound } from '../ui/NotFound'
import { toggleTask } from './IgEditor'
import { openSheet } from '../ui/bus'

export default function Batch({ id }: { id: string }) {
  const z = tz()
  const b = get('batches', id)
  const [date, setDate] = useState(b ? dateKey(b.startAt, z) : '')
  const [start, setStart] = useState(b ? timeKey(b.startAt, z) : '')
  const [end, setEnd] = useState(b ? timeKey(b.endAt, z) : '')
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(false)
  const [q, setQ] = useState('')
  if (!b) return <NotFound what="Sesi" backTo="/calendar?mode=production" />
  const mem = batchMembers(b.id)
  const contentCount = new Set(mem.map((t) => t.contentId).filter(Boolean)).size

  const saveTime = () => {
    if (!date || !start || !end) { setErr('Isi tanggal, jam mulai dan selesai.'); return }
    const s = zonedToIso(date, start, z), e = zonedToIso(date, end, z)
    if (Date.parse(e) <= Date.parse(s)) { setErr('Jam selesai harus setelah jam mulai.'); return }
    setErr(''); patch('batches', b.id, { startAt: s, endAt: e })
    toast(`Jadwal ${mem.length} tugas ikut berubah`)
  }
  const changed = date !== dateKey(b.startAt, z) || start !== timeKey(b.startAt, z) || end !== timeKey(b.endAt, z)

  const release = async (tid: string) => {
    const r = await ask({ title: 'Lepas dari sesi?', body: 'Pakai jadwal sesi ini sebagai jadwal tugasnya sendiri, atau kosongkan jadwalnya?', confirm: 'Pakai jadwal sesi', extra: 'Kosongkan' })
    if (!r) return
    removeFromBatch(tid, r === 'confirm'); toast('Dilepas dari sesi')
  }
  const del = async () => {
    const r = await ask({ title: 'Hapus sesi?', body: mem.length ? `${mem.length} tugas di dalamnya tetap ada. Pakai jadwal sesi sebagai jadwal masing-masing, atau kosongkan?` : 'Sesi kosong ini akan dihapus.', confirm: mem.length ? 'Hapus, pakai jadwal sesi' : 'Hapus', extra: mem.length ? 'Hapus, kosongkan jadwal' : undefined, danger: true })
    if (!r) return
    deleteBatch(b.id, r === 'confirm'); toast('Sesi dihapus'); back('/calendar?mode=production')
  }
  const options = candidateTasks().filter((t) => t.batchId !== b.id && (!q || (t.title + ' ' + (get('contents', t.contentId)?.title || '')).toLowerCase().includes(q.toLowerCase())))

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back('/calendar?mode=production')}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" /><SaveBadge />
        <IconBtn label="Hapus sesi" onClick={del}><Trash2 size={20} /></IconBtn>
      </div>
      <div className="stack-lg">
        <div className="card tint-lavender stack">
          <span className="row gap8 eyebrow" style={{ color: 'rgba(17,17,15,.7)' }}><Layers size={16} />Satu setup, {contentCount} konten</span>
          <label className="sr" htmlFor="b-name">Nama sesi</label>
          <input id="b-name" className="input input-plain content-title" value={b.title} onChange={(e) => patch('batches', b.id, { title: e.target.value })} />
          <p className="small">{fmtDay(dateKey(b.startAt, z))} · {fmtTime(b.startAt, z)}–{fmtTime(b.endAt, z)} {tzLabel(z)}</p>
        </div>

        <section className="stack">
          <h2 className="h2">Waktu sesi</h2>
          <div className="row gap8 wrap">
            <input aria-label="Tanggal" className="input" type="date" style={{ flex: '1 1 150px' }} value={date} onChange={(e) => setDate(e.target.value)} />
            <input aria-label="Mulai" className="input" type="time" style={{ flex: '1 1 96px' }} value={start} onChange={(e) => setStart(e.target.value)} />
            <input aria-label="Selesai" className="input" type="time" style={{ flex: '1 1 96px' }} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          {err && <p className="field-error" role="alert">{err}</p>}
          {changed && <Button variant="primary" onClick={saveTime}>Simpan waktu sesi</Button>}
          <p className="xs muted">Semua tugas di sesi ini memakai waktu sesi.</p>
        </section>

        <Field label="Lokasi" htmlFor="b-loc"><input id="b-loc" className="input" value={b.location || ''} onChange={(e) => patch('batches', b.id, { location: e.target.value })} placeholder="Meja studio" /></Field>
        <Field label="Catatan setup" htmlFor="b-notes"><textarea id="b-notes" className="input" rows={3} value={b.notes} onChange={(e) => patch('batches', b.id, { notes: e.target.value })} placeholder="Lampu, lensa, wardrobe" /></Field>

        <section className="stack">
          <div className="section-head"><h2 className="h2">Tugas di sesi <span className="muted tnum" style={{ fontWeight: 500 }}>{mem.filter((t) => t.status === 'done').length}/{mem.length}</span></h2>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => setPick(true)}>Tambah</Button></div>
          {mem.length === 0 ? <Empty title="Sesi masih kosong" body="Tambahkan tugas dari beberapa konten yang setup-nya sama." /> : (
            <div className="list">
              {mem.map((t) => {
                const c = get('contents', t.contentId)
                return (
                  <div key={t.id} className="li">
                    <Check3 checked={t.status === 'done'} label={`${t.title} selesai`} onChange={(v) => toggleTask(t, v)} />
                    <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => openSheet({ type: 'task', taskId: t.id })}>
                      <span className={cx('li-title', t.status === 'done' && 'done-text')} style={{ display: 'block' }}>{t.title}</span>
                      <span className="li-sub">{ACTIVITY_LABEL[t.activity]} · {c ? c.title : 'Tanpa konten'}{t.lifecycle !== 'active' || !taskLive(t) ? ' · tidak aktif' : ''}</span>
                    </button>
                    <IconBtn label={`Lepas ${t.title}`} onClick={() => release(t.id)}><X size={17} /></IconBtn>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Sheet open={pick} onClose={() => setPick(false)} title="Tambah tugas ke sesi">
        <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari tugas" placeholder="Cari tugas atau konten" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus /></div>
        {options.length === 0 ? <Empty title="Tidak ada tugas yang bisa ditambah" /> : (
          <div className="list">
            {options.slice(0, 50).map((t) => (
              <button key={t.id} className="li" onClick={() => { addToBatch(t.id, b.id); toast('Ditambahkan ke sesi') }}>
                <span className="li-main"><span className="li-title">{t.title}</span><span className="li-sub">{ACTIVITY_LABEL[t.activity]} · {get('contents', t.contentId)?.title || 'Tanpa konten'}{t.batchId ? ` · pindah dari ${get('batches', t.batchId)?.title}` : ''}</span></span>
                <Plus size={18} />
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </main>
  )
}
