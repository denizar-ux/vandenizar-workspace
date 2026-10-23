import React from 'react'
import { ChevronLeft, ChevronRight, Video, Plus, AtSign, ArrowRight } from 'lucide-react'
import { tz } from '../lib/store'
import { igItems, slots, slotItem, slotById, today, stageOf, stageIndex, isLate, threadPosted, firstLine } from '../lib/model'
import { addDays, addMonths, monthKey, weekStart, daysInMonth, dateKey, MONTHS, WEEKDAYS_S, relDay } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { PageHead, PhoneTop } from '../ui/Shell'
import { IconBtn, Button, cx } from '../ui/kit'
import { openNew } from '../ui/QuickAdd'
import type { Item, Slot } from '../lib/types'

interface Day { posts: Item[]; films: Item[]; empty: { slot: Slot; week: string }[]; threads: number }

export default function Calendar() {
  const r = useRoute()
  const z = tz(), t = today()
  const month = r.q.get('m') || monthKey(t)
  const sel = r.q.get('d') || (monthKey(t) === month ? t : month + '-01')
  const first = month + '-01', last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const start = weekStart(first), end = addDays(weekStart(last), 6)

  const days = new Map<string, Day>()
  const day = (d: string) => { let x = days.get(d); if (!x) { x = { posts: [], films: [], empty: [], threads: 0 }; days.set(d, x) } return x }
  for (const i of igItems()) {
    if (i.date && i.date >= start && i.date <= end) day(i.date).posts.push(i)
    if (i.filmDate && stageIndex(i.stage) <= stageIndex('film') && i.filmDate >= start && i.filmDate <= end) day(i.filmDate).films.push(i)
  }
  for (let w = start; w <= end; w = addDays(w, 7)) {
    for (const s of slots()) { const d = addDays(w, s.day); if (d >= t && !slotItem(w, s.id)) day(d).empty.push({ slot: s, week: w }) }
  }
  for (const th of threadPosted()) { const d = dateKey(th.postedAt!, z); if (d >= start && d <= end) day(d).threads++ }

  const cells: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d)
  const [y, m] = month.split('-').map(Number)
  const selDay = days.get(sel)

  const pickDay = (d: string) => { const mk = monthKey(d); if (mk !== month) setQuery('m', mk); setQuery('d', d) }

  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="Posts and shoots" title="Calendar." />
      <div className="cal-wrap">
        <section className="stack">
          <div className="section-head">
            <h2 className="h2 grow">{MONTHS[m - 1]} {y}</h2>
            {month !== monthKey(t) && <Button size="sm" variant="ghost" onClick={() => { setQuery('m', null); setQuery('d', null) }}>Today</Button>}
            <IconBtn label="Previous month" onClick={() => { setQuery('d', null); setQuery('m', addMonths(month, -1)) }}><ChevronLeft size={20} /></IconBtn>
            <IconBtn label="Next month" onClick={() => { setQuery('d', null); setQuery('m', addMonths(month, 1)) }}><ChevronRight size={20} /></IconBtn>
          </div>
          <div className="month">
            {WEEKDAYS_S.map((d) => <div key={d} className="mhead">{d}</div>)}
            {cells.map((d) => {
              const x = days.get(d)
              const out = monthKey(d) !== month
              return (
                <button key={d} className={cx('mcell', out && 'out', d === t && 'today', d === sel && 'sel')} onClick={() => pickDay(d)} aria-label={relDay(d, z)} aria-pressed={d === sel}>
                  <span className="mnum">{+d.slice(8)}</span>
                  <span className="dots">
                    {x?.posts.map((p) => <span key={p.id} className={cx('dot', p.stage === 'done' && 'dot-done', isLate(p, t) && 'dot-late')} />)}
                    {x?.films.filter((p) => !x.posts.includes(p)).map((p) => <span key={'f' + p.id} className="dot dot-film" />)}
                    {x?.empty.map((e) => <span key={'e' + e.slot.id} className="dot dot-empty" />)}
                  </span>
                  {x?.posts.map((p) => <span key={p.id} className={cx('mchip', 'bg-' + (slotById(p.slot)?.tint || 'none'), p.stage === 'done' && 'mchip-done', isLate(p, t) && 'mchip-late')}>{firstLine(p.title) || 'Untitled'}</span>)}
                  {x?.films.filter((p) => !x.posts.includes(p)).map((p) => <span key={'f' + p.id} className="mchip mchip-film">Film: {firstLine(p.title) || 'Untitled'}</span>)}
                  {x?.empty.map((e) => <span key={'e' + e.slot.id} className="mchip mchip-empty">{e.slot.name}</span>)}
                </button>
              )
            })}
          </div>
          <div className="legend small muted">
            <span><span className="dot" /> Post</span><span><span className="dot dot-film" /> Film</span><span><span className="dot dot-empty" /> Empty slot</span>
          </div>
        </section>

        <section className="stack day-panel" aria-label="Selected day">
          <h2 className="h2">{relDay(sel, z)}</h2>
          {selDay && (selDay.posts.length + selDay.films.length + selDay.empty.length + selDay.threads) > 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              {selDay.posts.map((p) => {
                const s = slotById(p.slot)
                return (
                  <button key={p.id} className={cx('evt', s ? 'tint-' + s.tint : 'card')} onClick={() => go('/post/' + p.id)}>
                    <span className="grow"><span className="evt-title">{p.title || 'Untitled'}</span><span className="evt-sub">{[s?.name, isLate(p, t) ? 'Late' : stageOf(p.stage).label, selDay.films.includes(p) ? 'Film this day too' : null].filter(Boolean).join(' · ')}</span></span>
                    <ArrowRight size={17} />
                  </button>
                )
              })}
              {selDay.films.filter((p) => !selDay.posts.includes(p)).map((p) => (
                <button key={'f' + p.id} className="evt card" onClick={() => go('/post/' + p.id)}>
                  <Video size={19} />
                  <span className="grow"><span className="evt-title">Film: {p.title || 'Untitled'}</span><span className="evt-sub">{slotById(p.slot)?.name || 'Instagram'}</span></span>
                  <ArrowRight size={17} />
                </button>
              ))}
              {selDay.empty.map((e) => (
                <button key={'e' + e.slot.id} className="evt evt-empty" onClick={() => openNew({ kind: 'ig', week: e.week, slot: e.slot.id })}>
                  <span className="grow"><span className="evt-title">{e.slot.name}</span><span className="evt-sub">Nothing planned</span></span>
                  <span className="row gap4 small" style={{ fontWeight: 600 }}><Plus size={16} />Plan</span>
                </button>
              ))}
              {selDay.threads > 0 && (
                <button className="evt card" onClick={() => go('/threads?tab=posted')}>
                  <AtSign size={19} /><span className="grow evt-title">{selDay.threads} Threads post{selDay.threads > 1 ? 's' : ''}</span><ArrowRight size={17} />
                </button>
              )}
            </div>
          ) : <p className="muted">Nothing on this day.</p>}
        </section>
      </div>
    </main>
  )
}
