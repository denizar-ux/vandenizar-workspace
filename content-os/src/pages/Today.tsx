import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight, Copy, Lightbulb, Check } from 'lucide-react'
import { settings, tz } from '../lib/store'
import { upNext, slots, slotItem, extraItems, weekProgress, thisWeek, today, threadDrafts, ideas, stageOf, setStage, schedule, slotById, firstLine, type UpNext } from '../lib/model'
import { addDays, fmtDay, greeting } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { PhoneTop } from '../ui/Shell'
import { Button, IconBtn, toast, copyOrShow, cx } from '../ui/kit'
import { Stepper, NextButton, SlotTile, DraftCard, PostCard } from '../ui/parts'
import { ScheduleSheet, weekName } from '../ui/SlotPicker'
import { openNew } from '../ui/QuickAdd'

export default function Today() {
  const r = useRoute()
  const z = tz(), t = today(), now = thisWeek()
  const week = r.q.get('w') || now
  const { posted, total } = weekProgress(week)
  const drafts = threadDrafts()
  const idl = ideas()
  const extras = extraItems(week)

  return (
    <main className="main wide">
      <PhoneTop />
      <div className="hello">
        <div className="hello-line">{greeting(z)}, {settings().displayName || 'there'}</div>
        <div className="eyebrow">{fmtDay(t, { long: true })}</div>
        <h1 className="page-title">Start here.</h1>
      </div>

      <div className="today-grid">
        <div className="stack-lg">
          <UpNextCard up={upNext(t)} />

          <section className="stack" aria-label={weekName(week)}>
            <div className="section-head">
              <h2 className="h2 grow">{weekName(week)} <span className="muted h2-sub">{posted} of {total} posted</span></h2>
              {week !== now && <Button size="sm" variant="ghost" onClick={() => setQuery('w', null)}>Today</Button>}
              <IconBtn label="Previous week" onClick={() => setQuery('w', addDays(week, -7))}><ChevronLeft size={20} /></IconBtn>
              <IconBtn label="Next week" onClick={() => setQuery('w', addDays(week, 7))}><ChevronRight size={20} /></IconBtn>
            </div>
            <div className="tiles">
              {slots().map((s) => <SlotTile key={s.id} slot={s} week={week} date={addDays(week, s.day)} it={slotItem(week, s.id)} />)}
            </div>
            {extras.length > 0 && (
              <div className="stack mt8">
                <span className="eyebrow">Also this week</span>
                {extras.map((i) => <PostCard key={i.id} it={i} />)}
              </div>
            )}
          </section>
        </div>

        <div className="stack-lg">
          <section className="stack">
            <div className="section-head">
              <h2 className="h2 grow">Threads <span className="muted h2-sub">{drafts.length ? `${drafts.length} draft${drafts.length > 1 ? 's' : ''}` : ''}</span></h2>
              <button className="linkbtn row gap4" onClick={() => go('/threads')}>All<ArrowRight size={15} /></button>
            </div>
            {drafts.length
              ? drafts.slice(0, 2).map((d) => <DraftCard key={d.id} it={d} compact />)
              : <button className="rowcard" onClick={() => openNew({ kind: 'thread' })}><span className="grow muted">No drafts. Write one when something comes to mind.</span><ArrowRight size={17} className="muted" /></button>}
          </section>
          <section className="stack">
            <div className="section-head"><h2 className="h2 grow">Ideas</h2></div>
            <button className="rowcard" onClick={() => go('/ideas')}>
              <Lightbulb size={19} />
              <span className="grow">{idl.length ? <><b>{idl.length}</b> waiting{idl[0] ? <span className="muted"> · latest: {firstLine(idl[0].text)}</span> : null}</> : <span className="muted">Inbox is empty</span>}</span>
              <ArrowRight size={17} className="muted" />
            </button>
          </section>
        </div>
      </div>
    </main>
  )
}

function UpNextCard({ up }: { up: UpNext }) {
  const [resched, setResched] = useState(false)
  if (up.type === 'clear') {
    return (
      <section className="upnext tint-sage">
        <span className="eyebrow">This week</span>
        <h2 className="upnext-title">{up.posted ? `All ${up.posted} posted. Nice.` : 'Nothing planned this week.'}</h2>
        <div className="row gap8 wrap"><Button variant="primary" onClick={() => setQuery('w', addDays(thisWeek(), 7))}>Plan next week<ArrowRight size={16} /></Button></div>
      </section>
    )
  }
  if (up.type === 'empty') {
    return (
      <section className="upnext upnext-empty">
        <span className="eyebrow">Up next · {fmtDay(up.date)} · {up.slot.name}</span>
        <h2 className="upnext-title">Nothing planned yet.</h2>
        {up.slot.hint && <p className="ink2">{up.slot.hint}</p>}
        <div className="row gap8 wrap"><Button variant="primary" onClick={() => openNew({ kind: 'ig', week: up.week, slot: up.slot.id })}>Plan it<ArrowRight size={16} /></Button></div>
      </section>
    )
  }
  const it = up.item
  const s = slotById(it.slot)
  const st = stageOf(it.stage)
  const label = up.type === 'late' ? `Late · was due ${fmtDay(it.date!)}` : up.type === 'film' ? 'Film today' : up.type === 'post' ? 'Post today' : `Up next · ${fmtDay(it.date!)}`
  return (
    <section className={cx('upnext', up.type === 'late' ? 'tint-danger' : s ? 'tint-' + s.tint : 'card')}>
      <span className="eyebrow">{label}{s ? ' · ' + s.name : ''}</span>
      <button className="upnext-open" onClick={() => go('/post/' + it.id)}>
        <h2 className="upnext-title">{it.title || 'Untitled'}</h2>
      </button>
      <div className="stack" style={{ gap: 8 }}>
        <Stepper stage={it.stage} />
        <span className="small">Now: <b>{st.doing}</b></span>
      </div>
      <div className="row gap8 wrap">
        {up.type === 'film'
          ? <Button variant="primary" onClick={() => { const prev = it.stage!; setStage(it.id, 'edit'); toast('Filmed. Next: edit', { label: 'Undo', run: () => setStage(it.id, prev) }) }}><Check size={16} />Filmed</Button>
          : <NextButton it={it} size="md" />}
        {up.type === 'post' && it.caption?.trim() && <Button icon={<Copy size={16} />} onClick={() => copyOrShow(it.caption!, 'Copy caption')}>Copy caption</Button>}
        {up.type === 'late' && <Button onClick={() => setResched(true)}>Reschedule</Button>}
        {up.type !== 'post' && up.type !== 'late' && <Button variant="ghost" onClick={() => go('/post/' + it.id)}>Open</Button>}
      </div>
      {up.type === 'late' && up.more > 0 && <button className="linkbtn" style={{ alignSelf: 'flex-start', color: 'var(--ink-2)' }} onClick={() => go('/instagram')}>+{up.more} more late · see all</button>}
      <ScheduleSheet open={resched} onClose={() => setResched(false)} title="Move to" week={it.week || null} slot={it.slot || null} startWeek={thisWeek()} exceptId={it.id} onPick={(w, sl) => { schedule(it.id, w, sl); toast(sl ? `Moved to ${slotById(sl)?.name}` : 'Unscheduled') }} />
    </section>
  )
}
