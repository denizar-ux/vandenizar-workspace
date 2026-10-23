import React, { useMemo, useState } from 'react'
import { Search as SearchIcon, AtSign, Lightbulb, ListChecks, FolderOpen, Layers, Plus } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { all, get, tz, patch, settings } from '../lib/store'
import { markPublished, createBatch, addToBatch, tasksOf, addTask, sectionsOf, postsOf } from '../lib/model'
import { zonedToIso, dateKey, timeKey, todayKey, fmtShort, fmtTime, tzLabel, addDays } from '../lib/time'
import { safeUrl } from '../lib/prefs'
import { go } from '../lib/router'
import { Sheet, Button, Field, toast, Empty, cx } from '../ui/kit'
import { openSheet } from '../ui/bus'

export function PublishSheet({ onClose, contentId }: { onClose: () => void; contentId: string }) {
  const z = tz()
  const c = get('contents', contentId)
  const now = new Date().toISOString()
  const [date, setDate] = useState(dateKey(now, z))
  const [time, setTime] = useState(timeKey(now, z))
  const [url, setUrl] = useState(c?.postUrl || '')
  const [err, setErr] = useState('')
  if (!c) return null
  const save = () => {
    if (!date || !time) { setErr('Isi tanggal dan jam terbit.'); return }
    if (url.trim() && !safeUrl(url)) { setErr('Link post harus diawali https://'); return }
    const iso = zonedToIso(date, time, z)
    if (Date.parse(iso) > Date.now() + 5 * 60000) { setErr('Waktu terbit tidak boleh di masa depan. Untuk rencana, pakai Rencana posting.'); return }
    markPublished(c.id, iso, url)
    toast('Ditandai sudah terbit')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Tandai sudah terbit" footer={<Button variant="primary" size="lg" block onClick={save}>Simpan sebagai terbit</Button>}>
      <p className="small muted">Isi waktu post benar-benar tayang. Rencana posting awal tetap disimpan.</p>
      <div className="row gap8 wrap">
        <Field label="Tanggal terbit" htmlFor="p-date"><input id="p-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`Jam (${tzLabel(z)})`} htmlFor="p-time"><input id="p-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Link post (opsional)" htmlFor="p-url" error={err || undefined}>
        <input id="p-url" className="input" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => { setUrl(e.target.value); setErr('') }} />
      </Field>
    </Sheet>
  )
}

export function SchedulePostSheet({ onClose, contentId, date: initDate }: { onClose: () => void; contentId?: string; date?: string }) {
  const z = tz()
  const [cid, setCid] = useState(contentId || '')
  const c = get('contents', cid)
  const [date, setDate] = useState(c?.plannedPublishAt ? dateKey(c.plannedPublishAt, z) : initDate || todayKey(z))
  const [time, setTime] = useState(c?.plannedPublishAt ? timeKey(c.plannedPublishAt, z) : '19:00')
  const [err, setErr] = useState('')
  const unscheduled = all('contents').filter((x) => x.lifecycle === 'active' && x.status !== 'published' && !x.plannedPublishAt).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))

  if (!c) {
    return (
      <Sheet open onClose={onClose} title={`Belum dijadwalkan · ${unscheduled.length}`}>
        <p className="small muted">Pilih konten untuk diberi rencana posting.</p>
        {unscheduled.length === 0 ? <Empty title="Semua konten aktif sudah punya jadwal" action={<Button onClick={() => { onClose(); openSheet({ type: 'newContent' }) }}>Buat draft baru</Button>} /> : (
          <div className="list">
            {unscheduled.map((x) => (
              <button key={x.id} className="li" onClick={() => { setCid(x.id); setDate(initDate || todayKey(z)) }}>
                {x.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}
                <span className="li-main"><span className="li-title clamp2">{x.title}</span><span className="li-sub">{x.status === 'ready' ? 'Siap' : x.status === 'idea' ? 'Ide' : 'Dikerjakan'}</span></span>
                <span className="small" style={{ fontWeight: 600 }}>Jadwalkan</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    )
  }
  const save = () => {
    if (!date || !time) { setErr('Isi tanggal dan jam.'); return }
    patch('contents', c.id, { plannedPublishAt: zonedToIso(date, time, z) })
    toast('Rencana posting disimpan'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Rencana posting" footer={
      <div className="row gap8">
        {c.plannedPublishAt && <Button variant="ghost" onClick={() => { patch('contents', c.id, { plannedPublishAt: null }); toast('Jadwal dihapus'); onClose() }}>Hapus jadwal</Button>}
        <span className="grow" />
        <Button variant="primary" onClick={save}>Simpan</Button>
      </div>
    }>
      <p className="li-title">{c.title}</p>
      <div className="row gap8 wrap">
        <Field label="Tanggal" htmlFor="s-date" error={err || undefined}><input id="s-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`Jam (${tzLabel(z)})`} htmlFor="s-time"><input id="s-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <p className="small muted">Rencana posting, bukan auto-post. Status konten tidak berubah.</p>
    </Sheet>
  )
}

export function BatchPickSheet({ onClose, taskId, contentId }: { onClose: () => void; taskId?: string; contentId?: string }) {
  const z = tz()
  const content = get('contents', contentId || get('tasks', taskId)?.contentId)
  const options = content ? tasksOf(content.id).filter((t) => t.status !== 'done') : []
  const [tid, setTid] = useState(taskId || options.find((t) => t.activity === 'record')?.id || options[0]?.id || 'new')
  const [newTitle, setNewTitle] = useState('Rekam')
  const today = todayKey(z)
  const batches = all('batches').filter((b) => dateKey(b.endAt, z) >= today).sort((a, b) => (a.startAt < b.startAt ? -1 : 1))
  const [mode, setMode] = useState<'pick' | 'new'>(batches.length ? 'pick' : 'new')
  const [bid, setBid] = useState(batches[0]?.id || '')
  const [title, setTitle] = useState('Sesi rekam')
  const [date, setDate] = useState(addDays(today, 1))
  const [start, setStart] = useState('13:00')
  const [end, setEnd] = useState('14:00')
  const [loc, setLoc] = useState('')
  const [err, setErr] = useState('')

  const save = () => {
    try {
      let task = get('tasks', tid)
      if (!task) {
        if (!content) { setErr('Pilih tugas'); return }
        task = addTask({ contentId: content.id, title: newTitle.trim() || 'Rekam', activity: 'record' })
      }
      let batchId = bid
      if (mode === 'new') {
        if (!date || !start || !end) { setErr('Isi tanggal dan jam sesi.'); return }
        batchId = createBatch({ title, startAt: zonedToIso(date, start, z), endAt: zonedToIso(date, end, z), location: loc }).id
      }
      if (!batchId) { setErr('Pilih sesi'); return }
      addToBatch(task.id, batchId)
      toast('Masuk ke sesi rekam', { label: 'Buka sesi', run: () => go(`/batches/${batchId}`) })
      onClose()
    } catch (e: any) { setErr(e.message) }
  }

  return (
    <Sheet open onClose={onClose} title="Masukkan ke sesi rekam" footer={<Button variant="primary" size="lg" block onClick={save}>Simpan</Button>}>
      {!taskId && content && (
        <Field label="Tugas" htmlFor="b-task">
          <select id="b-task" className="input" value={tid} onChange={(e) => setTid(e.target.value)}>
            {options.map((t) => <option key={t.id} value={t.id}>{t.title}{t.batchId ? ' (sudah di sesi lain)' : ''}</option>)}
            <option value="new">+ Tugas rekam baru</option>
          </select>
        </Field>
      )}
      {tid === 'new' && <Field label="Judul tugas baru" htmlFor="b-nt"><input id="b-nt" className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></Field>}
      {taskId && <p className="li-title">{get('tasks', taskId)?.title}</p>}
      <div className="seg" role="tablist" aria-label="Sesi">
        <button role="tab" aria-selected={mode === 'pick'} className={cx('seg-item', mode === 'pick' && 'on')} onClick={() => setMode('pick')} disabled={!batches.length}>Sesi yang ada</button>
        <button role="tab" aria-selected={mode === 'new'} className={cx('seg-item', mode === 'new' && 'on')} onClick={() => setMode('new')}>Sesi baru</button>
      </div>
      {mode === 'pick' ? (
        <div className="list" role="radiogroup" aria-label="Pilih sesi">
          {batches.map((b) => (
            <button key={b.id} role="radio" aria-checked={bid === b.id} className="li" onClick={() => setBid(b.id)} style={bid === b.id ? { background: 'var(--lavender)' } : undefined}>
              <Layers size={18} />
              <span className="li-main"><span className="li-title">{b.title}</span><span className="li-sub">{fmtShort(dateKey(b.startAt, z), z)}, {fmtTime(b.startAt, z)}–{fmtTime(b.endAt, z)} · {all('tasks').filter((t) => t.batchId === b.id).length} tugas</span></span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <Field label="Nama sesi" htmlFor="b-title"><input id="b-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="row gap8 wrap">
            <input aria-label="Tanggal sesi" className="input" type="date" style={{ flex: '1 1 150px' }} value={date} onChange={(e) => setDate(e.target.value)} />
            <input aria-label="Mulai" className="input" type="time" style={{ flex: '1 1 96px' }} value={start} onChange={(e) => setStart(e.target.value)} />
            <input aria-label="Selesai" className="input" type="time" style={{ flex: '1 1 96px' }} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Field label="Lokasi / catatan (opsional)" htmlFor="b-loc"><input id="b-loc" className="input" value={loc} onChange={(e) => setLoc(e.target.value)} /></Field>
        </>
      )}
      {err && <p className="field-error" role="alert">{err}</p>}
    </Sheet>
  )
}

export function SearchSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const res = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return null
    const hit = (t?: string) => !!t && t.toLowerCase().includes(s)
    const snip = (t: string) => {
      const i = t.toLowerCase().indexOf(s)
      if (i < 0) return t.slice(0, 90)
      return (i > 30 ? '…' : '') + t.slice(Math.max(0, i - 30), i + 70)
    }
    const ideas = all('ideas').filter((i) => i.lifecycle !== 'deleted' && hit(i.text)).slice(0, 8)
    const contents = all('contents').filter((c) => c.lifecycle !== 'deleted').map((c) => {
      const texts = [c.title, c.caption, c.notes, ...sectionsOf(c.id).map((x) => x.body), ...postsOf(c.id).map((x) => x.body)]
      const t = texts.find(hit)
      return t ? { c, snip: snip(t) } : null
    }).filter(Boolean).slice(0, 12) as { c: any; snip: string }[]
    const tasks = all('tasks').filter((t) => t.lifecycle !== 'deleted' && (hit(t.title) || hit(t.notes))).slice(0, 8)
    const resources = all('resources').filter((r) => r.lifecycle !== 'deleted' && (hit(r.title) || hit(r.body) || r.tags.some(hit) || hit(r.localPath) || hit(r.url))).slice(0, 8)
    return { ideas, contents, tasks, resources }
  }, [q])
  const nav = (to: string) => { onClose(); go(to) }
  const total = res ? res.ideas.length + res.contents.length + res.tasks.length + res.resources.length : 0
  return (
    <Sheet open onClose={onClose} title="Cari" wide>
      <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari ide, konten, tugas, bahan" placeholder="Cari ide, konten, tugas, bahan" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus /></div>
      {!res ? <p className="small muted">Ketik minimal 2 huruf. Pencarian hanya di data app ini.</p> : total === 0 ? <Empty title="Tidak ada hasil" body={`Belum ada yang cocok dengan "${q}".`} /> : (
        <div className="stack">
          {res.contents.length > 0 && <Group title="Konten">{res.contents.map(({ c, snip }) => (
            <button key={c.id} className="li" onClick={() => nav(`/${c.channel}/${c.id}`)}>{c.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}<span className="li-main"><span className="li-title">{c.title}</span><span className="li-sub clamp2">{snip}</span></span></button>
          ))}</Group>}
          {res.ideas.length > 0 && <Group title="Ide">{res.ideas.map((i) => (
            <button key={i.id} className="li" onClick={() => nav(`/ideas?open=${i.id}`)}><Lightbulb size={18} /><span className="li-main"><span className="li-title clamp2" style={{ fontWeight: 500 }}>{i.text}</span></span></button>
          ))}</Group>}
          {res.tasks.length > 0 && <Group title="Tugas">{res.tasks.map((t) => (
            <button key={t.id} className="li" onClick={() => { onClose(); openSheet({ type: 'task', taskId: t.id }) }}><ListChecks size={18} /><span className="li-main"><span className="li-title">{t.title}</span><span className="li-sub">{get('contents', t.contentId)?.title || 'Tanpa konten'}</span></span></button>
          ))}</Group>}
          {res.resources.length > 0 && <Group title="Bahan">{res.resources.map((r) => (
            <button key={r.id} className="li" onClick={() => nav(`/resources/${r.id}`)}><FolderOpen size={18} /><span className="li-main"><span className="li-title">{r.title}</span><span className="li-sub clamp2">{r.body || r.localPath || r.url}</span></span></button>
          ))}</Group>}
        </div>
      )}
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="eyebrow" style={{ margin: '4px 2px 8px' }}>{title}</h3><div className="list">{children}</div></section>
}
