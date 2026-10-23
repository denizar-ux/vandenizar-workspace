import React from 'react'
import { ArrowLeft, ArrowRight, Copy, Check } from 'lucide-react'
import { get, patch, remove } from '../lib/store'
import { STAGES, stageIndex, slotMeta, setStage, advance, moveToWeek, clearSlot, thisWeek } from '../lib/model'
import { addDays, fmtDay } from '../lib/time'
import { back } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Menu, AutoTextarea, Field, ask, toast, copyOrShow, cx } from '../ui/kit'
import { NotFound } from '../ui/NotFound'

export default function ItemPage({ id }: { id: string }) {
  const it = get('items', id)
  if (!it || it.kind !== 'ig') return <NotFound what="Post" backTo="/week" />
  const meta = slotMeta(it.slot)
  const si = stageIndex(it.stage)
  const set = (p: Parameters<typeof patch<'items'>>[2]) => patch('items', id, p)
  const backTo = `/week${it.week && it.week !== thisWeek() ? '?w=' + it.week : ''}`

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back(backTo)}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
        <Menu label="Menu post" items={[
          { label: 'Pindah ke minggu depan', onSelect: () => { moveToWeek(id, addDays(it.week!, 7)); toast('Dipindah ke minggu depan'); back(backTo) }, hidden: it.stage === 'done' },
          { label: 'Kosongkan slot (balik ke ide)', onSelect: () => { clearSlot(id); toast('Slot dikosongkan, isinya masuk ke Ide'); back(backTo) } },
          { label: 'Hapus', danger: true, onSelect: async () => { if ((await ask({ title: 'Hapus post ini?', body: 'Script dan caption ikut terhapus.', confirm: 'Hapus', danger: true })) === 'confirm') { remove('items', id); back(backTo) } } },
        ]} />
      </div>

      <p className="eyebrow mt8">{meta?.name}{it.date ? ` · ${fmtDay(it.date)}` : ''}</p>
      <label className="sr" htmlFor="it-title">Judul</label>
      <AutoTextarea id="it-title" className="input-plain content-title mt8" minRows={1} value={it.title || ''} placeholder="Judul post" onChange={(v) => set({ title: v.replace(/\n/g, ' ') })} />

      <section className="stage-pick mt16" aria-label="Tahap">
        {STAGES.map((s, i) => (
          <button key={s.id} className={cx('stage-chip', i === si && 'on', i < si && 'past')} aria-pressed={i === si} onClick={() => setStage(id, s.id)}>
            {i < si && <Check size={13} />}{s.label}
          </button>
        ))}
      </section>
      {it.stage !== 'done' && (
        <Button variant="primary" size="lg" block className="mt12" onClick={() => advance(id)}>{STAGES[si].next}<ArrowRight size={18} /></Button>
      )}

      <div className="stack-lg mt24">
        <Field label="Script" htmlFor="it-script">
          <AutoTextarea id="it-script" value={it.script || ''} minRows={6} placeholder="Hook, alur, penutup. Tulis bebas." onChange={(v) => set({ script: v })} />
        </Field>
        <Field label="Caption" htmlFor="it-caption">
          <AutoTextarea id="it-caption" value={it.caption || ''} minRows={3} placeholder="Caption untuk Instagram" onChange={(v) => set({ caption: v })} />
          {it.caption?.trim() && <div><Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(it.caption!, 'Salin caption', 'Caption tersalin')}>Salin caption</Button></div>}
        </Field>
        <div className="grid2">
          <Field label="Rencana upload" htmlFor="it-date">
            <input id="it-date" className="input" type="date" value={it.date || ''} onChange={(e) => set({ date: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Catatan" htmlFor="it-notes" hint="Shot yang perlu diambil, referensi, lokasi file.">
          <AutoTextarea id="it-notes" value={it.notes || ''} minRows={3} onChange={(v) => set({ notes: v })} />
        </Field>
      </div>
    </main>
  )
}
