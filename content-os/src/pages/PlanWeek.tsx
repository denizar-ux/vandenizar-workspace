import React, { useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ArrowUpRight, Check } from 'lucide-react'
import { patch } from '../lib/store'
import { slots, slotItem, createPost, thisWeek, today, firstLine, extraItems } from '../lib/model'
import { addDays, fmtDay, weekdayIndex } from '../lib/time'
import { back, go, useRoute, setQuery } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, Button, toast, cx } from '../ui/kit'
import { weekName } from '../ui/SlotPicker'
import type { Slot } from '../lib/types'

/** Which week "Plan" opens on: next week from Friday on, otherwise this week. */
export function defaultPlanWeek(t = today()) { return weekdayIndex(t) >= 4 ? addDays(thisWeek(), 7) : thisWeek() }

export default function PlanWeek() {
  const r = useRoute()
  const q = r.q.get('week')
  const week = q === 'next' ? addDays(thisWeek(), 7) : q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : defaultPlanWeek()
  const t = today()
  const filled = slots().filter((s) => slotItem(week, s.id)).length
  const extras = extraItems(week)

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Back" onClick={() => back('/instagram')}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
      </div>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">Plan the week · one line per slot</div>
          <h1 className="page-title">{weekName(week)}.</h1>
        </div>
        <div className="row gap8">
          <IconBtn label="Previous week" onClick={() => setQuery('week', addDays(week, -7))}><ChevronLeft size={20} /></IconBtn>
          <span className="grow small muted">{filled} of {slots().length} slots planned. Script, film and edit days fill in by themselves.</span>
          <IconBtn label="Next week" onClick={() => setQuery('week', addDays(week, 7))}><ChevronRight size={20} /></IconBtn>
        </div>
        <div className="stack">
          {slots().map((s) => <PlanRow key={week + s.id} s={s} week={week} past={addDays(week, s.day) < t} />)}
        </div>
        {extras.length > 0 && <p className="small muted">Also this week: {extras.map((i) => firstLine(i.title) || 'Untitled').join(', ')}</p>}
      </div>
      <div className="ed-actions">
        <div className="ed-actions-inner">
          <Button variant="primary" size="lg" icon={<Check size={18} />} onClick={() => go('/instagram?w=' + week)}>Done</Button>
        </div>
      </div>
    </main>
  )
}

function PlanRow({ s, week, past }: { s: Slot; week: string; past: boolean }) {
  const it = slotItem(week, s.id)
  const [draft, setDraft] = useState('')
  const date = addDays(week, s.day)
  const commit = () => {
    const v = draft.trim(); if (!v || slotItem(week, s.id)) return
    createPost({ title: v, week, slot: s.id }); setDraft('')
    toast(`${s.name}: planned for ${fmtDay(date)}`)
  }
  return (
    <div className={cx('planrow', 'tint-' + s.tint, past && !it && 'past')}>
      <div className="planrow-head">
        <span className="eyebrow grow">{s.name} · {fmtDay(date)}</span>
        {it && <button className="linkbtn small row gap4" onClick={() => go('/post/' + it.id)}>Open<ArrowUpRight size={14} /></button>}
      </div>
      {it
        ? <input className="input planrow-input" aria-label={`${s.name} title`} value={it.title || ''} onChange={(e) => patch('items', it.id, { title: e.target.value })} />
        : <input className="input planrow-input" aria-label={`${s.name} title`} disabled={past} placeholder={past ? 'Day has passed' : s.hint || 'What goes here?'} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }} />}
    </div>
  )
}
