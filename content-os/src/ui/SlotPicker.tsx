import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { slots, slotItem, thisWeek, today, firstLine, stageOf } from '../lib/model'
import { addDays, fmtDay, weekRange } from '../lib/time'
import { IconBtn, Sheet, cx } from './kit'

export function weekName(week: string) {
  const now = thisWeek()
  if (week === now) return 'This week'
  if (week === addDays(now, 7)) return 'Next week'
  if (week === addDays(now, -7)) return 'Last week'
  return weekRange(week)
}

/** First free slot from today on (this week, then next week). */
export function firstFreeSlot(): { week: string; slot: string } | null {
  const t = today(), w = thisWeek()
  for (const wk of [w, addDays(w, 7)]) {
    for (const s of slots()) {
      const d = addDays(wk, s.day)
      if (d >= t && !slotItem(wk, s.id)) return { week: wk, slot: s.id }
    }
  }
  return null
}

/** Pick a week + slot. Taken slots show what is in them and can't be picked. */
export function SlotPicker({ week, slot, onPick, exceptId, allowNone = true, startWeek, fresh }: { week: string | null; slot: string | null; onPick: (week: string | null, slot: string | null) => void; exceptId?: string; allowNone?: boolean; startWeek?: string; fresh?: boolean }) {
  const noneOn = !slot && !fresh
  const [view, setView] = useState(startWeek || week || thisWeek())
  const t = today()
  return (
    <div className="picker">
      <div className="picker-head">
        <span className="grow"><b>{weekName(view)}</b>{view === thisWeek() || view === addDays(thisWeek(), 7) ? <span className="muted"> · {weekRange(view)}</span> : null}</span>
        <IconBtn label="Previous week" onClick={() => setView(addDays(view, -7))}><ChevronLeft size={19} /></IconBtn>
        <IconBtn label="Next week" onClick={() => setView(addDays(view, 7))}><ChevronRight size={19} /></IconBtn>
      </div>
      <div className="picker-list" role="radiogroup" aria-label="Slot">
        {slots().map((s) => {
          const d = addDays(view, s.day)
          const taken = slotItem(view, s.id)
          const busy = !!taken && taken.id !== exceptId
          const on = !!slot && week === view && slot === s.id
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} disabled={busy} className={cx('pick', on && 'on')} onClick={() => onPick(view, s.id)}>
              <span className={cx('pick-dot', 'bg-' + s.tint)} />
              <span className="grow">
                <span className="pick-name">{s.name}</span>
                <span className="pick-sub">{fmtDay(d)}{d < t ? ' · past' : ''}{busy ? ` · ${stageOf(taken!.stage).label}: ${firstLine(taken!.title) || 'Untitled'}` : ''}</span>
              </span>
              {on ? <Check size={18} /> : busy ? null : <span className="pick-free">{taken ? 'Current' : 'Free'}</span>}
            </button>
          )
        })}
        {allowNone && (
          <button type="button" role="radio" aria-checked={noneOn} className={cx('pick', noneOn && 'on')} onClick={() => onPick(null, null)}>
            <span className="pick-dot pick-dot-none" />
            <span className="grow"><span className="pick-name">Not scheduled</span><span className="pick-sub">Keep it in Instagram, pick a slot later</span></span>
            {noneOn && <Check size={18} />}
          </button>
        )}
      </div>
    </div>
  )
}

export function ScheduleSheet({ open, onClose, title = 'Schedule', week, slot, exceptId, onPick, allowNone, startWeek, fresh }: { open: boolean; onClose: () => void; title?: string; week: string | null; slot: string | null; exceptId?: string; onPick: (week: string | null, slot: string | null) => void; allowNone?: boolean; startWeek?: string; fresh?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <SlotPicker week={week} slot={slot} exceptId={exceptId} allowNone={allowNone} startWeek={startWeek} fresh={fresh} onPick={(w, s) => { onPick(w, s); onClose() }} />}
    </Sheet>
  )
}
