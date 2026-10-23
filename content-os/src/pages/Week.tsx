import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight, Check, RotateCcw, Lightbulb, Settings as Gear } from 'lucide-react'
import { tz } from '../lib/store'
import { SLOTS, STAGES, stageIndex, slotItem, leftover, fillSlot, advance, moveToWeek, thisWeek, ideas, firstLine, type SlotMeta } from '../lib/model'
import { addDays, fmtDay, fmtShort, MONTHS_S, dateKey } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { Button, IconBtn, Sheet, toast, cx } from '../ui/kit'
import type { Item } from '../lib/types'

const TINT: Record<string, string> = { work: 'tint-butter', shot: 'tint-cyan', story: 'tint-lavender', desk: 'tint-sage' }

function rangeLabel(week: string) {
  const end = addDays(week, 6)
  const [, m1, d1] = week.split('-').map(Number), [, m2, d2] = end.split('-').map(Number)
  return m1 === m2 ? `${d1}–${d2} ${MONTHS_S[m1 - 1]}` : `${d1} ${MONTHS_S[m1 - 1]} – ${d2} ${MONTHS_S[m2 - 1]}`
}

export default function Week() {
  const r = useRoute()
  const now = thisWeek()
  const week = r.q.get('w') || now
  const items = SLOTS.map((s) => slotItem(week, s.id))
  const done = items.filter((i) => i?.stage === 'done').length
  const title = week === now ? 'Minggu ini.' : week === addDays(now, 7) ? 'Minggu depan.' : week === addDays(now, -7) ? 'Minggu lalu.' : rangeLabel(week) + '.'

  return (
    <main className="main">
      <header className="pagehead" style={{ alignItems: 'flex-start' }}>
        <h1 className="page-title grow">{title}</h1>
        <IconBtn label="Settings" onClick={() => go('/settings')} className="only-phone"><Gear size={21} /></IconBtn>
      </header>
      <div className="row gap4" style={{ marginTop: -8, marginBottom: 16 }}>
        <p className="muted grow">{rangeLabel(week)} · {done === 4 ? 'semua udah upload' : `${done} dari 4 udah upload`}</p>
        {week !== now && <Button size="sm" variant="ghost" onClick={() => setQuery('w', null)}>Minggu ini</Button>}
        <IconBtn label="Minggu sebelumnya" onClick={() => setQuery('w', addDays(week, -7))}><ChevronLeft size={20} /></IconBtn>
        <IconBtn label="Minggu berikutnya" onClick={() => setQuery('w', addDays(week, 7))}><ChevronRight size={20} /></IconBtn>
      </div>
      <div className="slots">
        {SLOTS.map((s, i) => <SlotCard key={s.id} meta={s} week={week} item={items[i]} />)}
      </div>
    </main>
  )
}

function SlotCard({ meta, week, item }: { meta: SlotMeta; week: string; item?: Item }) {
  const z = tz()
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState(false)
  const day = addDays(week, meta.day)

  if (!item) {
    const left = leftover(week, meta.id)
    const ideaList = ideas()
    const save = (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!draft.trim()) return
      fillSlot(week, meta.id, draft); setDraft('')
    }
    return (
      <section className={cx('slot slot-empty')} aria-label={meta.name}>
        <div className="slot-top"><span className="eyebrow">{meta.name}</span><span className="xs muted">{fmtDay(day)}</span></div>
        <p className="small muted">{meta.hint}</p>
        <form className="slot-input" onSubmit={save}>
          <input aria-label={`Ide untuk ${meta.name}`} placeholder="Mau bikin apa?" value={draft} onChange={(e) => setDraft(e.target.value)} />
          {draft.trim() && <Button type="submit" size="sm" variant="primary">Simpan</Button>}
        </form>
        {(left || ideaList.length > 0) && (
          <div className="row gap8 wrap">
            {left && <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => { moveToWeek(left.id, week); toast('Dilanjutin di minggu ini') }}>Lanjutin "{firstLine(left.title)}"</Button>}
            {ideaList.length > 0 && <Button size="sm" variant="ghost" icon={<Lightbulb size={15} />} onClick={() => setPick(true)}>Ambil dari ide ({ideaList.length})</Button>}
          </div>
        )}
        <Sheet open={pick} onClose={() => setPick(false)} title={`Ide untuk ${meta.name}`}>
          <div className="list">
            {ideaList.map((i) => (
              <button key={i.id} className="li" onClick={() => { fillSlot(week, meta.id, firstLine(i.text), i); setPick(false); toast(`Masuk ke ${meta.name}`) }}>
                <span className="li-main"><span className="li-title clamp2">{i.text}</span></span>
                <ArrowRight size={18} className="muted" />
              </button>
            ))}
          </div>
        </Sheet>
      </section>
    )
  }

  const si = stageIndex(item.stage)
  const isDone = item.stage === 'done'
  return (
    <section className={cx('slot', TINT[meta.id])} aria-label={meta.name}>
      <button className="slot-open" onClick={() => go(`/item/${item.id}`)} aria-label={`Buka ${item.title || meta.name}`}>
        <div className="slot-top"><span className="eyebrow">{meta.name}</span><span className="xs">{item.date ? fmtDay(item.date) : ''}</span></div>
        <h2 className="slot-title">{item.title || 'Tanpa judul'}</h2>
        <div className="stepper" aria-label={`Tahap: ${STAGES[si].label}`}>
          {STAGES.map((s, i) => <span key={s.id} className={cx('step', i <= si && 'on')} />)}
        </div>
        {isDone
          ? <span className="row gap6 small" style={{ fontWeight: 600 }}><Check size={16} />Udah upload{item.postedAt ? ' · ' + fmtShort(dateKey(item.postedAt, z), z) : ''}</span>
          : <span className="small">Sekarang: <b>{STAGES[si].label}</b></span>}
      </button>
      {!isDone && <Button variant="primary" block onClick={() => { advance(item.id); toast(`${meta.name}: ${STAGES[si + 1].label}`) }}>{STAGES[si].next}<ArrowRight size={17} /></Button>}
    </section>
  )
}
