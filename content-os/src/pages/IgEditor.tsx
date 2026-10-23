import React, { useState } from 'react'
import {
  ArrowLeft, ChevronRight, Plus, ArrowUp, ArrowDown, Trash2, Camera, Layers, Folder, Link2, FileText, Image as ImageIcon,
  CalendarDays, Copy, ExternalLink, CheckCircle2, PenLine, Repeat, AlertTriangle, X, Pin,
} from 'lucide-react'
import { get, patch, put, uid, remove, settings, tz, all } from '../lib/store'
import {
  sectionsOf, tasksOf, subtasksOf, shotsOf, readinessOf, resourcesOf, nextTask, progress, effectiveSchedule, setTaskStatus,
  openSubtaskCount, addTask, moveInList, templatesFor, unlinkResource, liveTax, postAtRisk, isTaskOverdue,
} from '../lib/model'
import { fmtDateTime, fmtShort, dateKey, fmtDuration, fmtTime } from '../lib/time'
import { FORMAT_LABEL, STATUS_LABEL } from '../lib/templates'
import { go, back, useRoute, setQuery } from '../lib/router'
import { safeUrl } from '../lib/prefs'
import { storeImage, assetUrl } from '../lib/image'
import { changeStage, lifecycleAction, duplicate, togglePin } from '../lib/contentActions'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Menu, AutoTextarea, Accordion, Check3, Segmented, Sheet, Badge, ask, toast, copyOrShow, cx, Field } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { NotFound } from '../ui/NotFound'
import type { Content, Format, Status, Task, Template } from '../lib/types'

type Tab = 'write' | 'production' | 'publish'

export default function IgEditor({ id }: { id: string }) {
  const r = useRoute()
  const c = get('contents', id)
  const tab = (r.q.get('tab') as Tab) || 'write'
  if (!c || c.lifecycle === 'deleted') return <NotFound what="Konten" backTo="/instagram" />
  if (c.channel !== 'instagram') { go(`/threads/${c.id}`, { replace: true }); return null }
  const st = settings()
  const parkedNote = c.lifecycle !== 'active' && (
    <div className="banner tint-lavender mt8"><span className="grow">Konten ini {c.lifecycle === 'parked' ? 'diparkir' : 'diarsip'}, tidak muncul di rekomendasi.</span><Button size="sm" onClick={() => patch('contents', c.id, { lifecycle: 'active' })}>Aktifkan</Button></div>
  )
  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back('/instagram')}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
        <Menu label="Menu konten" items={[
          { label: st.pinnedContentId === c.id ? 'Lepas pin' : 'Pin ke Overview', icon: <Pin size={18} />, onSelect: () => togglePin(c.id), hidden: c.status === 'published' },
          { label: 'Duplikasi', onSelect: () => { const d = duplicate(c.id); void d } },
          { label: 'Review & turunan', onSelect: () => go(`/content/${c.id}/review`), hidden: c.status !== 'published' },
          { label: 'Parkir', onSelect: () => lifecycleAction(c.id, 'parked'), hidden: c.lifecycle !== 'active' },
          { label: 'Arsip', onSelect: () => lifecycleAction(c.id, 'archived', () => back('/instagram')), hidden: c.lifecycle === 'archived' },
          { label: 'Hapus', danger: true, onSelect: () => lifecycleAction(c.id, 'deleted', () => back('/instagram')) },
        ]} />
      </div>
      <label className="sr" htmlFor="ig-title">Judul</label>
      <textarea id="ig-title" className="input input-plain content-title" rows={1} value={c.title} style={{ resize: 'none', width: '100%', overflow: 'hidden', fieldSizing: 'content' } as any}
        onChange={(e) => patch('contents', c.id, { title: e.target.value.replace(/\n/g, ' ') })} onBlur={(e) => { if (!e.target.value.trim()) patch('contents', c.id, { title: 'Konten tanpa judul' }) }} />
      <div className="row gap6 wrap mt8">
        <StagePicker c={c} />
        {c.plannedPublishAt && c.status !== 'published' && <Badge tone="line"><CalendarDays size={13} />{fmtDateTime(c.plannedPublishAt, tz(), st.hour12)}</Badge>}
        {c.demo && <Badge tone="line">Contoh</Badge>}
      </div>
      {parkedNote}
      <div className="tabs mt12" role="tablist" aria-label="Bagian editor">
        {([['write', 'Tulis'], ['production', 'Produksi'], ['publish', 'Tayang']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={cx('tab', tab === k && 'on')} onClick={() => setQuery('tab', k)}>{l}</button>
        ))}
      </div>
      <div className="mt16">
        {tab === 'write' && <WriteTab c={c} />}
        {tab === 'production' && <ProductionTab c={c} />}
        {tab === 'publish' && <PublishTab c={c} />}
      </div>
    </main>
  )
}

function StagePicker({ c }: { c: Content }) {
  const tone = { idea: 'cyan', in_progress: 'butter', ready: 'sage', published: 'lavender' } as const
  return (
    <span className="row gap4">
      <Badge tone={tone[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      <Menu label="Ubah tahap" icon={<ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />} className="" items={(['idea', 'in_progress', 'ready', 'published'] as Status[]).filter((s) => s !== c.status).map((s) => ({ label: s === 'published' ? 'Tandai sudah terbit' : `Pindah ke ${STATUS_LABEL[s]}`, onSelect: () => changeStage(c.id, s) }))} />
    </span>
  )
}

// ---------------- Tulis ----------------
function WriteTab({ c }: { c: Content }) {
  const secs = sectionsOf(c.id)
  const tpl = get('templates', c.templateId)
  const [tplOpen, setTplOpen] = useState(false)
  const refs = resourcesOf(c.id)

  const changeFormat = async (f: Format) => {
    if (f === c.format) return
    const filled = secs.filter((s) => s.body.trim())
    if (filled.length) {
      const r = await ask({ title: `Ubah ke ${FORMAT_LABEL[f]}?`, body: 'Struktur naskah berubah. Tulisan sekarang disimpan utuh di Catatan, jadi tidak ada yang hilang.', confirm: 'Ubah format' })
      if (r !== 'confirm') return
      const backup = `[Naskah ${c.format ? FORMAT_LABEL[c.format] : ''} sebelumnya]\n` + filled.map((s) => `${s.label}: ${s.body}`).join('\n')
      patch('contents', c.id, { notes: (c.notes ? c.notes + '\n\n' : '') + backup })
    }
    secs.forEach((s) => remove('sections', s.id))
    const add = (key: string, label: string, i: number, note?: string) => put('sections', { id: uid(), contentId: c.id, key, label, body: '', note, order: i, createdAt: '', updatedAt: '' })
    if (f === 'carousel') { add('slide', 'Slide 1', 0); add('slide', 'Slide 2', 1) }
    else if (f === 'story') add('frame', 'Frame 1', 0, '')
    else (tpl && tpl.compatibleFormats.includes('reel') ? tpl.sections : get('templates', 'tpl-talking-head')!.sections).forEach((s, i) => add(s.key, s.label, i))
    const tplOk = tpl && tpl.compatibleFormats.includes(f)
    patch('contents', c.id, { format: f, templateId: tplOk ? tpl!.id : f === 'reel' ? 'tpl-talking-head' : 'tpl-blank' })
    toast(`Format ${FORMAT_LABEL[f]}`)
  }

  const addSlide = () => {
    const isC = c.format === 'carousel'
    put('sections', { id: uid(), contentId: c.id, key: isC ? 'slide' : c.format === 'story' ? 'frame' : 'custom', label: isC ? `Slide ${secs.length + 1}` : c.format === 'story' ? `Frame ${secs.length + 1}` : 'Bagian baru', body: '', note: '', order: secs.length, createdAt: '', updatedAt: '' })
  }
  const delSec = async (id: string, label: string, body: string) => {
    if (body.trim()) { const r = await ask({ title: `Hapus ${label}?`, body: 'Teks di bagian ini ikut terhapus.', confirm: 'Hapus', danger: true }); if (r !== 'confirm') return }
    remove('sections', id)
  }

  return (
    <div className="stack-lg">
      <div className="stack">
        <Segmented label="Format" value={(c.format || 'reel') as Format} onChange={changeFormat} options={[{ value: 'reel', label: 'Reel' }, { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' }]} />
        <div className="row gap8">
          <Badge tone="lavender">{FORMAT_LABEL[(c.format || 'reel') as Format]} · {tpl?.name || 'Tanpa template'}</Badge>
          <span className="grow" />
          <button className="linkbtn" onClick={() => setTplOpen(true)}>Ganti template</button>
        </div>
      </div>

      {c.format === 'carousel' || c.format === 'story' ? (
        <div className="stack">
          {secs.map((s, i) => (
            <div key={s.id} className="slide">
              <div className="row gap4">
                <input className="input input-plain grow h3" aria-label={`Judul ${s.label}`} value={s.label} onChange={(e) => patch('sections', s.id, { label: e.target.value })} />
                <IconBtn label="Naikkan" disabled={i === 0} onClick={() => moveInList('sections', secs, s.id, -1)}><ArrowUp size={17} /></IconBtn>
                <IconBtn label="Turunkan" disabled={i === secs.length - 1} onClick={() => moveInList('sections', secs, s.id, 1)}><ArrowDown size={17} /></IconBtn>
                <IconBtn label={`Hapus ${s.label}`} onClick={() => delSec(s.id, s.label, s.body)}><Trash2 size={17} /></IconBtn>
              </div>
              <AutoTextarea aria-label={`Isi ${s.label}`} value={s.body} onChange={(v) => patch('sections', s.id, { body: v })} placeholder={c.format === 'carousel' ? 'Teks slide' : 'Teks di frame'} />
              {c.format === 'story' && <input className="input" aria-label={`Catatan visual ${s.label}`} placeholder="Catatan visual (opsional)" value={s.note || ''} onChange={(e) => patch('sections', s.id, { note: e.target.value })} />}
            </div>
          ))}
          <Button icon={<Plus size={18} />} onClick={addSlide}>{c.format === 'carousel' ? 'Tambah slide' : 'Tambah frame'}</Button>
        </div>
      ) : (
        <div className="stack-lg" style={{ gap: 18 }}>
          {secs.map((s) => (
            <div key={s.id} className="script-block">
              {s.key === 'custom'
                ? <div className="row gap4"><input className="input input-plain script-label grow" aria-label="Nama bagian" value={s.label} onChange={(e) => patch('sections', s.id, { label: e.target.value })} /><IconBtn label={`Hapus ${s.label}`} onClick={() => delSec(s.id, s.label, s.body)}><X size={17} /></IconBtn></div>
                : <label className="script-label" htmlFor={'sec-' + s.id}>{s.label}</label>}
              <AutoTextarea id={'sec-' + s.id} value={s.body} onChange={(v) => patch('sections', s.id, { body: v })} />
            </div>
          ))}
          {secs.length === 0 && <p className="muted small">Belum ada bagian naskah.</p>}
          <Button size="sm" variant="ghost" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={addSlide}>Tambah bagian</Button>
        </div>
      )}

      <div className="stack">
        <Accordion title="Caption" right={c.caption ? <span className="small muted tnum">{c.caption.length}</span> : undefined} defaultOpen={!!c.caption}>
          <AutoTextarea aria-label="Caption" value={c.caption} onChange={(v) => patch('contents', c.id, { caption: v })} minRows={3} placeholder="Caption untuk post" />
        </Accordion>
        <Accordion title="Detail" right={<span className="small muted">pilar, seri, tag, catatan</span>}>
          <DetailFields c={c} />
        </Accordion>
        <Accordion title={`Referensi${refs.length ? ` · ${refs.length}` : ''}`} defaultOpen={refs.length > 0}>
          <RefList c={c} />
        </Accordion>
      </div>

      <div className="ed-actions"><div className="ed-actions-inner">
        <Button icon={<Plus size={18} />} onClick={() => openSheet({ type: 'linkResource', contentId: c.id })}>Ambil referensi</Button>
        <Button variant="primary" onClick={() => setQuery('tab', 'production')}>Buka produksi<ChevronRight size={18} /></Button>
      </div></div>
      {tplOpen && <TemplateSheet c={c} onClose={() => setTplOpen(false)} />}
    </div>
  )
}

function TemplateSheet({ c, onClose }: { c: Content; onClose: () => void }) {
  const list = templatesFor('instagram', c.format)
  const [sel, setSel] = useState<string>(c.templateId || list[0]?.id)
  const [mode, setMode] = useState<'keep' | 'replace'>('keep')
  const t = get('templates', sel)
  const structured = c.format === 'reel' || !c.format
  const apply = async () => {
    if (!t) return
    if (structured && mode === 'replace') {
      const r = await ask({ title: 'Ganti struktur naskah?', body: 'Bagian dengan nama sama tetap membawa isinya. Teks dari bagian lain dipindah ke Catatan.', confirm: 'Ganti struktur' })
      if (r !== 'confirm') return
      const old = sectionsOf(c.id)
      const keep = new Map(old.map((s) => [s.key, s.body]))
      const leftover = old.filter((s) => s.body.trim() && !t.sections.some((x) => x.key === s.key))
      if (leftover.length) patch('contents', c.id, { notes: (c.notes ? c.notes + '\n\n' : '') + '[Dari template sebelumnya]\n' + leftover.map((s) => `${s.label}: ${s.body}`).join('\n') })
      old.forEach((s) => remove('sections', s.id))
      t.sections.forEach((s, i) => put('sections', { id: uid(), contentId: c.id, key: s.key, label: s.label, body: keep.get(s.key) || '', order: i, createdAt: '', updatedAt: '' }))
    }
    patch('contents', c.id, { templateId: t.id })
    if (tasksOf(c.id).length === 0 && t.defaultTasks.length) {
      const r = await ask({ title: 'Tambah tugas dari template?', body: t.defaultTasks.map((x) => x.title).join(' → '), confirm: 'Tambah tugas', cancel: 'Tidak usah' })
      if (r === 'confirm') t.defaultTasks.forEach((x, i) => addTask({ contentId: c.id, title: x.title, activity: x.activity, estimateMinutes: x.estimateMinutes ?? null, order: i }))
    }
    toast(`Template ${t.name}`); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Ganti template" footer={<Button variant="primary" size="lg" block onClick={apply}>Pakai template</Button>}>
      <div className="list" role="radiogroup" aria-label="Template">
        {list.map((x) => (
          <button key={x.id} role="radio" aria-checked={sel === x.id} className="li" style={sel === x.id ? { background: 'var(--lavender)' } : undefined} onClick={() => setSel(x.id)}>
            <FileText size={18} /><span className="li-main"><span className="li-title">{x.name}</span><span className="li-sub">{x.sections.map((s) => s.label).join(' · ')}</span></span>
          </button>
        ))}
      </div>
      {t && <div className="card"><p className="eyebrow">Pratinjau</p><p className="small mt8"><b>Naskah:</b> {structured ? t.sections.map((s) => s.label).join(', ') : `${FORMAT_LABEL[c.format!]} tetap memakai daftar ${c.format === 'carousel' ? 'slide' : 'frame'}`}</p><p className="small"><b>Tugas default:</b> {t.defaultTasks.map((x) => x.title).join(' → ') || 'tidak ada'}</p></div>}
      {structured && (
        <div className="field"><span className="field-label">Tulisan yang sudah ada</span>
          <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'keep', label: 'Pertahankan tulisan' }, { value: 'replace', label: 'Ganti struktur' }]} /></div>
      )}
    </Sheet>
  )
}

function DetailFields({ c }: { c: Content }) {
  const [newTag, setNewTag] = useState('')
  const tags = liveTax('tag')
  const archivedSel = (type: 'pillar' | 'series', id?: string | null) => { const x = get('taxonomy', id); return x && x.lifecycle !== 'active' ? <option value={x.id}>{x.label} (diarsip)</option> : null }
  return (
    <>
      <div className="grid2">
        <Field label="Pilar" htmlFor="d-pillar">
          <select id="d-pillar" className="input" value={c.pillarId || ''} onChange={(e) => patch('contents', c.id, { pillarId: e.target.value || null })}>
            <option value="">—</option>{archivedSel('pillar', c.pillarId)}{liveTax('pillar').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Seri" htmlFor="d-series">
          <select id="d-series" className="input" value={c.seriesId || ''} onChange={(e) => patch('contents', c.id, { seriesId: e.target.value || null })}>
            <option value="">—</option>{archivedSel('series', c.seriesId)}{liveTax('series').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
      </div>
      {c.seriesId && <Field label="Label seri (opsional)" htmlFor="d-day"><input id="d-day" className="input" placeholder="Day 4" value={c.seriesDay || ''} onChange={(e) => patch('contents', c.id, { seriesDay: e.target.value })} /></Field>}
      <div className="field">
        <span className="field-label">Tag</span>
        <div className="chips">
          {tags.map((t) => { const on = c.tagIds.includes(t.id); return <button key={t.id} className={cx('chip', on && 'on')} aria-pressed={on} onClick={() => patch('contents', c.id, { tagIds: on ? c.tagIds.filter((x) => x !== t.id) : [...c.tagIds, t.id] })}>{t.label}</button> })}
          {c.tagIds.filter((id) => !tags.some((t) => t.id === id)).map((id) => get('taxonomy', id) && <span key={id} className="chip on" style={{ opacity: .6 }}>{get('taxonomy', id)!.label}</span>)}
        </div>
        <form className="row gap8" onSubmit={(e) => { e.preventDefault(); const l = newTag.trim(); if (!l) return; const ex = all('taxonomy').find((t) => t.type === 'tag' && t.label.toLowerCase() === l.toLowerCase()); const t = ex || put('taxonomy', { id: uid(), type: 'tag', label: l, lifecycle: 'active', createdAt: '', updatedAt: '' }); if (!c.tagIds.includes(t.id)) patch('contents', c.id, { tagIds: [...c.tagIds, t.id] }); setNewTag('') }}>
          <input className="input" aria-label="Tag baru" placeholder="Tag baru" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <IconBtn label="Tambah tag" type="submit" className="boxed"><Plus size={18} /></IconBtn>
        </form>
      </div>
      <Field label="Catatan" htmlFor="d-notes"><AutoTextarea id="d-notes" value={c.notes} onChange={(v) => patch('contents', c.id, { notes: v })} /></Field>
      {(c.sourceIdeaId || c.sourceContentId) && <SourceLine c={c} />}
    </>
  )
}

export function SourceLine({ c }: { c: Content }) {
  const idea = get('ideas', c.sourceIdeaId)
  const src = get('contents', c.sourceContentId)
  return (
    <p className="small">
      {c.sourceIdeaId && (idea && idea.lifecycle !== 'deleted' ? <>Dari ide: <button className="linkbtn" onClick={() => go(`/ideas?open=${idea.id}`)}>{idea.text.slice(0, 60)}</button></> : <span className="muted">Ide sumber tidak tersedia</span>)}
      {c.sourceContentId && (src && src.lifecycle !== 'deleted' ? <> Turunan dari <button className="linkbtn" onClick={() => go(`/${src.channel}/${src.id}`)}>{src.title}</button></> : <span className="muted"> Konten sumber tidak tersedia</span>)}
    </p>
  )
}

export function RefList({ c }: { c: Content }) {
  const refs = resourcesOf(c.id)
  return (
    <>
      {refs.length > 0 && <div className="list">
        {refs.map((r) => (
          <div key={r.id} className="li">
            {r.sourceKind === 'web_link' ? <Link2 size={18} /> : r.sourceKind === 'image' ? <ImageIcon size={18} /> : <Folder size={18} />}
            <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => go(`/resources/${r.id}`)}>
              <span className="li-title" style={{ display: 'block' }}>{r.title}</span>
              <span className="li-sub break" style={{ display: 'block' }}>{r.localPath || r.url || r.body.slice(0, 80)}</span>
            </button>
            {r.localPath && <IconBtn label="Salin lokasi" onClick={() => copyOrShow(r.localPath!, 'Salin lokasi', 'Lokasi tersalin')}><Copy size={17} /></IconBtn>}
            {r.url && safeUrl(r.url) && <a className="iconbtn" href={safeUrl(r.url)!} target="_blank" rel="noopener noreferrer" aria-label={`Buka link ${r.title}`}><ExternalLink size={17} /></a>}
            <IconBtn label={`Lepas ${r.title}`} onClick={() => { unlinkResource(c.id, r.id); toast('Referensi dilepas') }}><X size={17} /></IconBtn>
          </div>
        ))}
      </div>}
      <Button size="sm" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => openSheet({ type: 'linkResource', contentId: c.id })}>Ambil referensi</Button>
    </>
  )
}

// ---------------- Produksi ----------------
export async function toggleTask(t: Task, done: boolean) {
  if (done && !t.parentTaskId && openSubtaskCount(t.id) > 0) {
    const r = await ask({ title: 'Selesaikan semua subtask?', body: `Masih ada ${openSubtaskCount(t.id)} subtask terbuka. Semuanya ikut ditandai selesai.`, confirm: 'Selesaikan semua' })
    if (r !== 'confirm') return
    setTaskStatus(t.id, 'done', { cascade: true }); return
  }
  setTaskStatus(t.id, done ? 'done' : 'todo')
}

export function taskWhen(t: Task): string | null {
  const z = tz(), st = settings()
  const sch = effectiveSchedule(t)
  if (sch) return `${fmtShort(dateKey(sch.start, z), z)} ${fmtTime(sch.start, z, st.hour12)}`
  if (t.dueDate) return `Tenggat ${fmtShort(t.dueDate, z)}`
  return null
}

function ProductionTab({ c }: { c: Content }) {
  const tasks = tasksOf(c.id)
  const nt = nextTask(c.id)
  const pr = progress(c.id)
  const shots = shotsOf(c.id)
  const [newTask, setNewTask] = useState('')
  const [newShot, setNewShot] = useState('')
  const risk = postAtRisk(c)
  const start = () => {
    if (!nt) return
    if (nt.status !== 'doing') setTaskStatus(nt.id, 'doing')
    openSheet({ type: 'task', taskId: nt.id })
  }
  return (
    <div className="stack-lg">
      {nt ? (
        <section className="nexthero" aria-label="Langkah berikutnya">
          <Camera size={22} />
          <div className="grow"><div className="xs muted" style={{ color: 'rgba(17,17,15,.7)' }}>Langkah berikutnya</div><div className="h2">{nt.title}</div>{nt.estimateMinutes ? <div className="small">Estimasi {fmtDuration(nt.estimateMinutes)}</div> : null}</div>
          <Button variant="primary" onClick={start}>{nt.status === 'doing' ? 'Lanjut' : 'Mulai'}</Button>
        </section>
      ) : tasks.length > 0 ? (
        <section className="nexthero"><CheckCircle2 size={22} /><div className="grow h3">Semua tugas produksi selesai</div>{c.status !== 'ready' && c.status !== 'published' && <Button onClick={() => changeStage(c.id, 'ready')}>Siap tayang</Button>}</section>
      ) : null}

      {risk.length > 0 && (
        <div className="banner tint-danger"><AlertTriangle size={18} /><span className="grow">{risk.length} tugas dijadwalkan setelah rencana posting.</span><Button size="sm" onClick={() => openSheet({ type: 'task', taskId: risk[0].id })}>Atur ulang</Button></div>
      )}

      <section className="stack">
        <div className="section-head"><h2 className="h2">Daftar produksi <span className="muted tnum" style={{ fontWeight: 500 }}>{pr.done}/{pr.total}</span></h2></div>
        {tasks.length > 0 && (
          <div className="list">
            {tasks.map((t) => {
              const subs = subtasksOf(t.id)
              const when = taskWhen(t)
              const late = isTaskOverdue(t)
              return (
                <div key={t.id} className="li">
                  <Check3 checked={t.status === 'done'} label={`${t.title} selesai`} onChange={(v) => toggleTask(t, v)} />
                  <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => openSheet({ type: 'task', taskId: t.id })}>
                    <span className={cx('li-title', t.status === 'done' && 'done-text')} style={{ display: 'block' }}>{t.title}</span>
                    <span className="li-sub row gap6 wrap">
                      {t.status === 'doing' && <Badge tone="butter">Dikerjakan</Badge>}
                      {subs.length > 0 && <span className="tnum">{subs.filter((s) => s.status === 'done').length}/{subs.length} subtask</span>}
                      {t.batchId && <span className="row gap4"><Layers size={12} />{get('batches', t.batchId)?.title}</span>}
                      {late && <Badge tone="danger">Terlambat</Badge>}
                    </span>
                  </button>
                  {when && <span className="li-meta tnum">{when}</span>}
                  <ChevronRight size={18} className="muted" />
                </div>
              )
            })}
          </div>
        )}
        <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (!newTask.trim()) return; addTask({ contentId: c.id, title: newTask.trim(), activity: /rekam|shoot/i.test(newTask) ? 'record' : /edit/i.test(newTask) ? 'edit' : /tulis|script|hook/i.test(newTask) ? 'write' : 'other' }); setNewTask('') }}>
          <input className="input" aria-label="Tugas baru" placeholder="Tambah tugas produksi" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
          <IconBtn label="Tambah tugas" type="submit" className="boxed"><Plus size={18} /></IconBtn>
        </form>
        <Button icon={<CalendarDays size={18} />} onClick={() => openSheet({ type: 'batchPick', contentId: c.id })}>Masukkan ke batch rekam</Button>
      </section>

      <section className="stack">
        <h2 className="h2">Shot list <span className="muted tnum" style={{ fontWeight: 500 }}>{shots.filter((s) => s.done).length}/{shots.length}</span></h2>
        {shots.length > 0 && <div className="list">
          {shots.map((s, i) => (
            <div key={s.id} className="li" style={{ alignItems: 'flex-start' }}>
              <span style={{ paddingTop: 4 }}><Check3 checked={s.done} label={`Shot ${s.description} sudah direkam`} onChange={(v) => patch('shots', s.id, { done: v })} /></span>
              <div className="li-main col gap4">
                <input className={cx('input input-plain li-title', s.done && 'done-text')} aria-label="Deskripsi shot" value={s.description} onChange={(e) => patch('shots', s.id, { description: e.target.value })} />
                <input className="input input-plain li-sub" aria-label="Catatan visual" placeholder="Catatan visual" value={s.notes} onChange={(e) => patch('shots', s.id, { notes: e.target.value })} />
              </div>
              <Menu label={`Menu shot ${s.description}`} items={[
                { label: 'Naikkan', onSelect: () => moveInList('shots', shots, s.id, -1), hidden: i === 0 },
                { label: 'Turunkan', onSelect: () => moveInList('shots', shots, s.id, 1), hidden: i === shots.length - 1 },
                { label: 'Hapus', danger: true, onSelect: () => remove('shots', s.id) },
              ]} />
            </div>
          ))}
        </div>}
        <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (!newShot.trim()) return; put('shots', { id: uid(), contentId: c.id, description: newShot.trim(), notes: '', done: false, order: shots.length, createdAt: '', updatedAt: '' }); setNewShot('') }}>
          <input className="input" aria-label="Shot baru" placeholder="Tambah shot, misal: Close-up kain" value={newShot} onChange={(e) => setNewShot(e.target.value)} />
          <IconBtn label="Tambah shot" type="submit" className="boxed"><Plus size={18} /></IconBtn>
        </form>
        <p className="xs muted">Centang shot tidak otomatis menyelesaikan tugas rekam.</p>
      </section>

      <section className="stack">
        <h2 className="h2">Referensi & aset</h2>
        <RefList c={c} />
      </section>

      <div className="ed-actions"><div className="ed-actions-inner">
        <Button onClick={() => setQuery('tab', 'write')}><PenLine size={18} />Tulis</Button>
        <Button variant="primary" onClick={() => setQuery('tab', 'publish')}>Ke Tayang<ChevronRight size={18} /></Button>
      </div></div>
    </div>
  )
}

// ---------------- Tayang ----------------
function PublishTab({ c }: { c: Content }) {
  const z = tz(), st = settings()
  const items = readinessOf(c.id)
  const [newItem, setNewItem] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const img = assetUrl(c.coverAssetId)
  const risk = postAtRisk(c)
  const igUrl = safeUrl(st.instagramUrl) || 'https://www.instagram.com/'

  const onCover = async (f?: File) => {
    if (!f) return
    setBusy(true); setErr('')
    try {
      const a = await storeImage(f)
      if (c.coverAssetId) remove('assets', c.coverAssetId)
      patch('contents', c.id, { coverAssetId: a.id })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="stack-lg">
      <button className="card tap row gap12" onClick={() => openSheet({ type: 'schedulePost', contentId: c.id })} disabled={c.status === 'published'}>
        <CalendarDays size={24} />
        <span className="grow">
          <span className="small muted" style={{ display: 'block' }}>Rencana posting</span>
          <span className="h3 tnum">{c.plannedPublishAt ? `${fmtDateTime(c.plannedPublishAt, z, st.hour12)} ${tzLabelShort()}` : 'Belum dijadwalkan'}</span>
        </span>
        {c.status !== 'published' && <span className="small" style={{ fontWeight: 600 }}>{c.plannedPublishAt ? 'Ubah' : 'Atur'}</span>}
      </button>
      {risk.length > 0 && <div className="banner tint-danger"><AlertTriangle size={18} /><span className="grow">Rencana post terdampak: {risk.map((t) => t.title).join(', ')} masih dijadwalkan setelahnya.</span></div>}

      <section className="card row gap16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="col gap8">
          {img ? <img src={img} alt="Cover" className="cover" /> : <div className="cover" aria-hidden><ImageIcon size={24} /></div>}
          <label className="btn btn-sm btn-secondary"><span>{busy ? 'Memproses…' : img ? 'Ganti cover' : 'Pilih cover'}</span><input type="file" accept="image/*" className="sr" onChange={(e) => onCover(e.target.files?.[0])} /></label>
          {img && <button className="linkbtn small" onClick={() => { remove('assets', c.coverAssetId!); patch('contents', c.id, { coverAssetId: null }) }}>Hapus cover</button>}
        </div>
        <div className="grow col gap8" style={{ minWidth: 180 }}>
          <span className="eyebrow">Checklist siap</span>
          {items.map((r) => (
            <div key={r.id} className="row gap8" style={{ minHeight: 40 }}>
              <Check3 checked={r.checked} label={`${r.label} siap`} onChange={(v) => patch('readiness', r.id, { checked: v })} />
              <span className="grow"><span style={{ display: 'block', fontWeight: 550 }}>{r.label}</span><span className="xs muted">{r.checked ? 'Siap' : 'Belum'}</span></span>
              <IconBtn label={`Hapus ${r.label}`} onClick={() => remove('readiness', r.id)}><X size={16} /></IconBtn>
            </div>
          ))}
          <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (!newItem.trim()) return; put('readiness', { id: uid(), contentId: c.id, label: newItem.trim(), required: true, checked: false, order: items.length, createdAt: '', updatedAt: '' }); setNewItem('') }}>
            <input className="input" aria-label="Item checklist baru" placeholder="Item lain" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <IconBtn label="Tambah item" type="submit" className="boxed"><Plus size={18} /></IconBtn>
          </form>
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
      </section>

      <Field label="File final" htmlFor="p-final" hint="Lokasi atau link file final. Hanya catatan, tidak diunggah.">
        <input id="p-final" className="input" placeholder="SSD / Export / grading-brand-v3.mp4" value={c.finalFile || ''} onChange={(e) => patch('contents', c.id, { finalFile: e.target.value })} />
      </Field>

      <section className="stack">
        <h2 className="h3">Caption</h2>
        {c.caption.trim() ? <div className="card pre body-text">{c.caption}</div> : <p className="small muted">Caption belum ditulis. <button className="linkbtn" onClick={() => setQuery('tab', 'write')}>Tulis caption</button></p>}
        <div className="row gap8">
          <Button className="grow" icon={<Copy size={18} />} disabled={!c.caption.trim()} onClick={() => copyOrShow(c.caption, 'Salin caption', 'Caption tersalin')}>Salin caption</Button>
          <a className="btn btn-primary grow" href={igUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /><span>Buka Instagram</span></a>
        </div>
        {c.status === 'published' ? (
          <div className="card tint-lavender stack">
            <div className="row gap8"><CheckCircle2 size={20} /><span className="grow h3">Terbit {c.publishedAt && fmtDateTime(c.publishedAt, z, st.hour12)}</span></div>
            {c.plannedPublishAt && <span className="small">Rencana awal: {fmtDateTime(c.plannedPublishAt, z, st.hour12)}</span>}
            {c.postUrl && safeUrl(c.postUrl) && <a className="small break" href={safeUrl(c.postUrl)!} target="_blank" rel="noopener noreferrer">{c.postUrl}</a>}
            <div className="row gap8 wrap"><Button size="sm" onClick={() => openSheet({ type: 'publish', contentId: c.id })}>Ubah waktu terbit</Button><Button size="sm" variant="ghost" onClick={() => changeStage(c.id, 'ready')}>Tandai belum terbit</Button></div>
          </div>
        ) : (
          <Button block size="lg" icon={<CheckCircle2 size={18} />} onClick={() => openSheet({ type: 'publish', contentId: c.id })}>Tandai sudah terbit</Button>
        )}
        <p className="xs muted center">Membuka Instagram atau menyalin caption tidak mengubah status. Posting dilakukan manual.</p>
      </section>

      <Accordion title="Setelah terbit" defaultOpen={c.status === 'published'}>
        <div className="list">
          <button className="li" onClick={() => go(`/content/${c.id}/review`)} disabled={c.status !== 'published'}><PenLine size={20} /><span className="li-main"><span className="li-title">Review singkat</span><span className="li-sub">{c.status === 'published' ? 'Catat apa yang berjalan dengan baik.' : 'Tersedia setelah ditandai terbit.'}</span></span><ChevronRight size={18} /></button>
          <button className="li" onClick={() => go(`/content/${c.id}/review?tab=derive`)}><Repeat size={20} /><span className="li-main"><span className="li-title">Buat turunan</span><span className="li-sub">Ubah ke angle atau format lain.</span></span><ChevronRight size={18} /></button>
        </div>
      </Accordion>
    </div>
  )
}

function tzLabelShort() {
  const z = tz()
  return z === 'Asia/Jakarta' ? 'WIB' : z === 'Asia/Makassar' ? 'WITA' : z === 'Asia/Jayapura' ? 'WIT' : ''
}
