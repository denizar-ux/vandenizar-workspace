import React, { useState } from 'react'
import { Trash2, Plus, ArrowUp, ArrowDown, Layers, X } from 'lucide-react'
import { get, all, tz, patch, settings } from '../lib/store'
import { addTask, subtasksOf, setTaskStatus, deleteTask, removeFromBatch, tasksOf, moveInList, openSubtaskCount } from '../lib/model'
import { zonedToIso, dateKey, timeKey, todayKey, fmtTime, fmtShort } from '../lib/time'
import { ACTIVITY_LABEL } from '../lib/templates'
import { Sheet, Button, Chips, Segmented, Field, Check3, IconBtn, ask, toast, cx } from '../ui/kit'
import { go } from '../lib/router'
import type { Task, Activity, TaskStatus } from '../lib/types'
import { openSheet } from '../ui/bus'

const EST = [null, 15, 30, 45, 60, 90, 120, 180]

export function TaskSheet({ onClose, taskId, defaults = {} }: { onClose: () => void; taskId?: string; defaults?: Partial<Task> }) {
  const z = tz()
  const existing = get('tasks', taskId)
  const base: Partial<Task> = existing || defaults
  const [title, setTitle] = useState(base.title || '')
  const [contentId, setContentId] = useState<string>(base.contentId || '')
  const [activity, setActivity] = useState<Activity>(base.activity || 'other')
  const [status, setStatus] = useState<TaskStatus>(base.status || 'todo')
  const [est, setEst] = useState<number | null>(base.estimateMinutes ?? null)
  const [date, setDate] = useState(base.plannedStart ? dateKey(base.plannedStart, z) : '')
  const [start, setStart] = useState(base.plannedStart ? timeKey(base.plannedStart, z) : '')
  const [end, setEnd] = useState(base.plannedEnd ? timeKey(base.plannedEnd, z) : '')
  const [due, setDue] = useState(base.dueDate || '')
  const [notes, setNotes] = useState(base.notes || '')
  const [sub, setSub] = useState('')
  const [err, setErr] = useState('')
  const batch = get('batches', existing?.batchId)
  const parent = get('tasks', existing?.parentTaskId)
  const isSub = !!parent
  const subs = existing ? subtasksOf(existing.id) : []
  const contents = all('contents').filter((c) => c.lifecycle === 'active' && c.status !== 'published').sort((a, b) => a.title.localeCompare(b.title))

  if (taskId && !existing) return <Sheet open onClose={onClose} title="Tugas"><p className="muted">Tugas ini sudah tidak ada.</p></Sheet>

  const save = async () => {
    if (!title.trim()) { setErr('Judul tugas wajib diisi.'); return }
    let plannedStart: string | null = null, plannedEnd: string | null = null
    if (!batch && !isSub && (date || start || end)) {
      if (!date || !start) { setErr('Isi tanggal dan jam mulai, atau kosongkan jadwal kerja.'); return }
      plannedStart = zonedToIso(date, start, z)
      if (end) {
        plannedEnd = zonedToIso(date, end, z)
        if (Date.parse(plannedEnd) <= Date.parse(plannedStart)) { setErr('Jam selesai harus setelah jam mulai.'); return }
      } else plannedEnd = new Date(Date.parse(plannedStart) + (est || settings().defaultEstimate || 30) * 60000).toISOString()
    }
    const data: Partial<Task> = {
      title: title.trim(), contentId: isSub ? parent!.contentId : contentId || null, activity, estimateMinutes: est,
      dueDate: due || null, notes, ...(batch || isSub ? {} : { plannedStart, plannedEnd }),
    }
    if (existing) {
      if (existing.contentId !== data.contentId && subs.length) for (const s of subs) patch('tasks', s.id, { contentId: data.contentId })
      patch('tasks', existing.id, data)
      if (status !== existing.status) await changeStatus(status)
    } else {
      const t = addTask({ ...defaults, ...data, title: title.trim(), status })
      if (status !== 'todo') setTaskStatus(t.id, status)
    }
    toast(existing ? 'Tugas diperbarui' : 'Tugas ditambahkan')
    onClose()
  }

  const changeStatus = async (s: TaskStatus) => {
    if (!existing) return
    if (s === 'done' && openSubtaskCount(existing.id) > 0) {
      const r = await ask({ title: 'Selesaikan semua subtask?', body: `Masih ada ${openSubtaskCount(existing.id)} subtask yang belum selesai. Menandai tugas ini selesai akan ikut menyelesaikan semuanya.`, confirm: 'Selesaikan semua' })
      if (r !== 'confirm') { setStatus(existing.status); return }
      setTaskStatus(existing.id, 'done', { cascade: true })
    } else setTaskStatus(existing.id, s)
  }

  const del = async () => {
    if (!existing) return
    const r = await ask({ title: 'Hapus tugas?', body: subs.length ? `Subtask (${subs.length}) ikut terhapus.` : 'Tugas ini akan dihapus.', confirm: 'Hapus', danger: true })
    if (r !== 'confirm') return
    deleteTask(existing.id); toast('Tugas dihapus'); onClose()
  }

  const releaseBatch = async () => {
    if (!existing || !batch) return
    const r = await ask({ title: 'Lepas dari sesi?', body: `Tugas ini sekarang ikut jadwal sesi "${batch.title}". Mau pakai jadwal sesi sebagai jadwal sendiri, atau kosongkan?`, confirm: 'Pakai jadwal sesi', extra: 'Kosongkan jadwal' })
    if (!r) return
    removeFromBatch(existing.id, r === 'confirm')
    if (r === 'confirm') { setDate(dateKey(batch.startAt, z)); setStart(timeKey(batch.startAt, z)); setEnd(timeKey(batch.endAt, z)) }
    toast('Dilepas dari sesi')
  }

  const siblings = existing ? (existing.parentTaskId ? subtasksOf(existing.parentTaskId) : existing.contentId ? tasksOf(existing.contentId) : []) : []
  const idx = siblings.findIndex((s) => s.id === existing?.id)

  return (
    <Sheet open onClose={onClose} title={existing ? (isSub ? 'Subtask' : 'Tugas') : 'Tugas baru'} footer={
      <div className="row gap8">
        {existing && <IconBtn label="Hapus tugas" onClick={del}><Trash2 size={20} /></IconBtn>}
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button variant="primary" onClick={save}>Simpan</Button>
      </div>
    }>
      <Field label="Judul" htmlFor="t-title" error={err || undefined}>
        <input id="t-title" className="input" value={title} onChange={(e) => { setTitle(e.target.value); setErr('') }} data-autofocus={!existing || undefined} placeholder="Misal: Rekam talking head" />
      </Field>
      {parent && <p className="small muted">Bagian dari <b>{parent.title}</b>. Subtask ikut jadwal tugas utamanya.</p>}
      {!isSub && (
        <Field label="Konten terkait" htmlFor="t-content" hint="Boleh kosong untuk tugas produksi umum.">
          <select id="t-content" className="input" value={contentId} onChange={(e) => setContentId(e.target.value)}>
            <option value="">Tanpa konten</option>
            {contentId && !contents.some((c) => c.id === contentId) && get('contents', contentId) && <option value={contentId}>{get('contents', contentId)!.title}</option>}
            {contents.map((c) => <option key={c.id} value={c.id}>{c.channel === 'threads' ? 'Threads · ' : 'IG · '}{c.title}</option>)}
          </select>
        </Field>
      )}
      <div className="field"><span className="field-label">Jenis kerja</span>
        <Chips label="Jenis kerja" value={activity} onChange={setActivity} options={(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }))} /></div>
      {existing && (
        <div className="field"><span className="field-label">Status</span>
          <Segmented label="Status" value={status} onChange={(s) => { setStatus(s); }} options={[{ value: 'todo', label: 'Belum' }, { value: 'doing', label: 'Dikerjakan' }, { value: 'done', label: 'Selesai' }]} /></div>
      )}
      <Field label="Estimasi" htmlFor="t-est">
        <select id="t-est" className="input" value={est ?? ''} onChange={(e) => setEst(e.target.value ? +e.target.value : null)}>
          {EST.map((m) => <option key={String(m)} value={m ?? ''}>{m == null ? 'Tanpa estimasi' : m < 60 ? `${m} menit` : `${m / 60} jam`}</option>)}
        </select>
      </Field>
      {!isSub && (batch ? (
        <div className="card tint-lavender row gap12">
          <Layers size={20} />
          <div className="grow"><div className="li-title">{batch.title}</div><div className="small">{fmtShort(dateKey(batch.startAt, z), z)}, {fmtTime(batch.startAt, z)}–{fmtTime(batch.endAt, z)} · jadwal ikut sesi</div></div>
          <div className="col gap4">
            <Button size="sm" onClick={() => { onClose(); go(`/batches/${batch.id}`) }}>Buka</Button>
            <Button size="sm" variant="ghost" onClick={releaseBatch}>Lepas</Button>
          </div>
        </div>
      ) : (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 6 }}>Jadwal kerja <span className="muted" style={{ fontWeight: 400 }}>· kapan dikerjakan</span></legend>
          <div className="row gap8 wrap">
            <input aria-label="Tanggal kerja" className="input" type="date" style={{ flex: '1 1 150px' }} value={date} onChange={(e) => setDate(e.target.value)} />
            <input aria-label="Jam mulai" className="input" type="time" style={{ flex: '1 1 96px' }} value={start} onChange={(e) => setStart(e.target.value)} />
            <input aria-label="Jam selesai" className="input" type="time" style={{ flex: '1 1 96px' }} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="row gap8 mt8 wrap">
            {(date || start) && <button className="linkbtn" onClick={() => { setDate(''); setStart(''); setEnd('') }}>Kosongkan jadwal</button>}
            {existing && <button className="linkbtn" onClick={() => { onClose(); openSheet({ type: 'batchPick', taskId: existing.id }) }}>Masukkan ke sesi rekam</button>}
          </div>
        </fieldset>
      ))}
      <Field label="Tenggat" htmlFor="t-due" hint="Kapan harus selesai. Beda dengan rencana posting.">
        <div className="row gap8">
          <input id="t-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          {!due && <Button size="sm" onClick={() => setDue(todayKey(z))}>Hari ini</Button>}
          {due && <IconBtn label="Hapus tenggat" onClick={() => setDue('')}><X size={18} /></IconBtn>}
        </div>
      </Field>
      {existing && !isSub && (
        <div className="field">
          <span className="field-label">Subtask {subs.length > 0 && <span className="muted tnum">{subs.filter((s) => s.status === 'done').length}/{subs.length}</span>}</span>
          {subs.length > 0 && <div className="list">
            {subs.map((s, i) => (
              <div key={s.id} className="li" style={{ minHeight: 48 }}>
                <Check3 checked={s.status === 'done'} label={`Subtask ${s.title} selesai`} onChange={(v) => setTaskStatus(s.id, v ? 'done' : 'todo')} />
                <input className={cx('input input-plain grow', s.status === 'done' && 'done-text')} aria-label="Judul subtask" value={s.title} onChange={(e) => patch('tasks', s.id, { title: e.target.value })} />
                <IconBtn label="Naikkan" onClick={() => moveInList('tasks', subs, s.id, -1)} disabled={i === 0}><ArrowUp size={16} /></IconBtn>
                <IconBtn label="Hapus subtask" onClick={() => deleteTask(s.id)}><X size={16} /></IconBtn>
              </div>
            ))}
          </div>}
          <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (!sub.trim()) return; addTask({ contentId: existing.contentId, parentTaskId: existing.id, title: sub.trim(), activity: existing.activity }); if (existing.status === 'done') setTaskStatus(existing.id, 'todo'); setSub('') }}>
            <input className="input" aria-label="Subtask baru" placeholder="Tambah subtask" value={sub} onChange={(e) => setSub(e.target.value)} />
            <IconBtn label="Tambah subtask" type="submit" className="boxed"><Plus size={18} /></IconBtn>
          </form>
        </div>
      )}
      <Field label="Catatan" htmlFor="t-notes">
        <textarea id="t-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {existing && siblings.length > 1 && (
        <div className="row gap8">
          <span className="small muted grow">Urutan {idx + 1} dari {siblings.length}</span>
          <Button size="sm" icon={<ArrowUp size={16} />} disabled={idx <= 0} onClick={() => moveInList('tasks', siblings, existing.id, -1)}>Naik</Button>
          <Button size="sm" icon={<ArrowDown size={16} />} disabled={idx >= siblings.length - 1} onClick={() => moveInList('tasks', siblings, existing.id, 1)}>Turun</Button>
        </div>
      )}
      {existing?.contentId && (
        <button className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => { const c = get('contents', existing.contentId)!; onClose(); go(c.channel === 'threads' ? `/threads/${c.id}` : `/instagram/${c.id}?tab=production`) }}>Buka konten</button>
      )}
    </Sheet>
  )
}
