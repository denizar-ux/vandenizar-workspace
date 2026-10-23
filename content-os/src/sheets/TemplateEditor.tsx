import React, { useState } from 'react'
import { Plus, X, ArrowUp } from 'lucide-react'
import { get, put, uid } from '../lib/store'
import { ACTIVITY_LABEL } from '../lib/templates'
import { Sheet, Button, Field, IconBtn, toast, cx } from '../ui/kit'
import type { Template, Format, Activity, TemplateSection, TemplateTask } from '../lib/types'

export function TemplateEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const ex = get('templates', id)
  const [name, setName] = useState(ex?.name || '')
  const [formats, setFormats] = useState<Format[]>(ex?.compatibleFormats || ['reel'])
  const [sections, setSections] = useState<TemplateSection[]>(ex?.sections || [{ key: 'hook', label: 'Hook' }, { key: 'body', label: 'Isi' }])
  const [tasks, setTasks] = useState<TemplateTask[]>(ex?.defaultTasks || [{ title: 'Script', activity: 'write', estimateMinutes: 30 }])
  const [ready, setReady] = useState<string[]>(ex?.defaultReadiness || ['Video final', 'Caption'])
  const [err, setErr] = useState('')
  const save = () => {
    if (!name.trim()) { setErr('Nama template wajib.'); return }
    if (!formats.length) { setErr('Pilih minimal satu format.'); return }
    const clean = sections.filter((s) => s.label.trim()).map((s, i) => ({ key: s.key || 's' + i, label: s.label.trim() }))
    const rec: Template = {
      ...(ex || { id: uid(), channel: 'instagram', lifecycle: 'active', createdAt: '', updatedAt: '' }), name: name.trim(), compatibleFormats: formats,
      sections: clean.length ? clean : [{ key: 'body', label: 'Naskah' }], defaultTasks: tasks.filter((t) => t.title.trim()), defaultReadiness: ready.map((r) => r.trim()).filter(Boolean),
    } as Template
    put('templates', rec)
    toast(ex ? 'Template disimpan. Draft lama tidak berubah.' : 'Template dibuat')
    onClose()
  }
  const toggleF = (f: Format) => setFormats(formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f])
  return (
    <Sheet open onClose={onClose} title={ex ? 'Edit template' : 'Template baru'} wide footer={<Button variant="primary" size="lg" block onClick={save}>Simpan template</Button>}>
      <Field label="Nama" htmlFor="tp-name" error={err || undefined}><input id="tp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus={!ex || undefined} /></Field>
      <div className="field"><span className="field-label">Cocok untuk format</span>
        <div className="chips">{(['reel', 'carousel', 'story'] as Format[]).map((f) => <button key={f} className={cx('chip', formats.includes(f) && 'on')} aria-pressed={formats.includes(f)} onClick={() => toggleF(f)}>{f === 'reel' ? 'Reel' : f === 'carousel' ? 'Carousel' : 'Story'}</button>)}</div></div>
      <div className="field"><span className="field-label">Struktur naskah (Reel)</span>
        {sections.map((s, i) => (
          <div key={i} className="row gap4">
            <input className="input" aria-label={`Bagian ${i + 1}`} value={s.label} onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <IconBtn label="Naikkan" disabled={i === 0} onClick={() => { const a = sections.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSections(a) }}><ArrowUp size={16} /></IconBtn>
            <IconBtn label="Hapus bagian" onClick={() => setSections(sections.filter((_, k) => k !== i))}><X size={16} /></IconBtn>
          </div>
        ))}
        <Button size="sm" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => setSections([...sections, { key: 'c' + Date.now().toString(36), label: '' }])}>Bagian</Button>
      </div>
      <div className="field"><span className="field-label">Tugas default</span>
        {tasks.map((t, i) => (
          <div key={i} className="row gap4 wrap">
            <input className="input" style={{ flex: '2 1 160px' }} aria-label={`Tugas ${i + 1}`} value={t.title} onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
            <select className="input" style={{ flex: '1 1 100px' }} aria-label="Jenis" value={t.activity} onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, activity: e.target.value as Activity } : x)))}>
              {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
            </select>
            <select className="input" style={{ flex: '1 1 90px' }} aria-label="Estimasi" value={t.estimateMinutes ?? ''} onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, estimateMinutes: e.target.value ? +e.target.value : null } : x)))}>
              <option value="">—</option>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} mnt</option>)}
            </select>
            <IconBtn label="Hapus tugas" onClick={() => setTasks(tasks.filter((_, k) => k !== i))}><X size={16} /></IconBtn>
          </div>
        ))}
        <Button size="sm" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => setTasks([...tasks, { title: '', activity: 'other', estimateMinutes: null }])}>Tugas</Button>
      </div>
      <Field label="Checklist siap tayang" htmlFor="tp-ready" hint="Pisahkan dengan koma">
        <input id="tp-ready" className="input" value={ready.join(', ')} onChange={(e) => setReady(e.target.value.split(','))} />
      </Field>
      <p className="xs muted">Perubahan hanya berlaku untuk draft baru.</p>
    </Sheet>
  )
}
