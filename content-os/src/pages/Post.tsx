import React, { useState } from 'react'
import { ArrowLeft, Copy, Trash2, CalendarClock, Lightbulb, CopyPlus, X, Check, ArrowUpRight, AlertTriangle, Wand2 } from 'lucide-react'
import { get, patch, put, remove, tz } from '../lib/store'
import { STAGES, stageIndex, setStage, isLate, slotById, pillars, formats, pillarName, formatName, schedule, duplicatePost, firstLine, normalizeUrl, TASKS, isTaskDone, dateBounds, setStageDate, dateConflicts, planBackwards, type DateField as DF } from '../lib/model'
import { fmtDay, fmtShort, dateKey } from '../lib/time'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, Menu, AutoTextarea, Button, Accordion, Chips, toast, copyOrShow, cx } from '../ui/kit'
import { NextButton, postWhen } from '../ui/parts'
import { ScheduleSheet } from '../ui/SlotPicker'
import { NotFound } from '../ui/NotFound'
import { References } from '../ui/Refs'
import { DateField } from '../ui/DateInput'
import type { Item } from '../lib/types'
import { gcalAllDay, appLink } from '../lib/gcal'

export default function Post({ id }: { id: string }) {
  const it = get('items', id)
  const [sched, setSched] = useState(false)
  if (!it || it.kind !== 'ig') return <NotFound what="Post" backTo="/instagram" />
  const z = tz()
  const set = (p: Partial<Item>) => patch('items', id, p)
  const s = slotById(it.slot)
  const si = stageIndex(it.stage)
  const late = isLate(it)
  const done = it.stage === 'done'

  const del = () => {
    const snap = { ...it }
    remove('items', id); back('/instagram')
    toast('Post deleted', { label: 'Undo', run: () => { put('items', snap, { touch: false }); go('/post/' + id) } })
  }
  const conflicts = dateConflicts(it)
  const canPlan = !!it.date && !done && TASKS.slice(0, 3).some((t) => !isTaskDone(it, t) && !it[t.field])
  const setDate = (f: DF, v: string) => { const r = setStageDate(id, f, v || null); if (!r.ok) toast(r.error, undefined, 'error') }
  const summary = [it.finalUrl?.trim() ? 'Video added' : null, formatName(it.format), pillarName(it.pillar)].filter(Boolean).join(' · ')

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Back" onClick={() => back('/instagram')}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
        <Menu items={[
          { label: it.week ? 'Change slot' : 'Schedule', icon: <CalendarClock size={18} />, onSelect: () => setSched(true) },
          { label: 'Duplicate', icon: <CopyPlus size={18} />, onSelect: () => { const d = duplicatePost(id); if (d) { go('/post/' + d.id); toast('Duplicated, not scheduled yet') } } },
          { label: 'Delete', icon: <Trash2 size={18} />, danger: true, onSelect: del },
        ]} />
      </div>

      <div className="stack-lg">
        <div className="stack" style={{ gap: 12 }}>
          <div className="row gap8 wrap">
            {s && <span className={cx('pick-dot', 'bg-' + s.tint)} />}
            <button className="eyebrow linkish" onClick={() => setSched(true)}>{postWhen(it)}</button>
            {late && <span className="badge badge-danger">Late</span>}
          </div>
          <AutoTextarea aria-label="Title" className="input-plain content-title" placeholder="Untitled post" value={it.title || ''} minRows={1} onChange={(v) => set({ title: v.replace(/\n/g, ' ') })} />
          <div className="track" role="radiogroup" aria-label="Stage">
            {STAGES.map((st, i) => (
              <button key={st.id} role="radio" aria-checked={i === si} className={cx('track-step', i < si && 'past', i === si && 'on')} onClick={() => setStage(id, st.id)}>
                {i < si && <Check size={13} strokeWidth={2.6} />}{st.label}
              </button>
            ))}
          </div>
        </div>

        <section className="block">
          <div className="block-head">
            <h2 className="block-label grow">Schedule</h2>
            {(canPlan || conflicts.length > 0) && <Button size="sm" variant="ghost" icon={<Wand2 size={15} />} onClick={() => { planBackwards(id); toast('Planned back from the post date') }}>{conflicts.length ? 'Fix dates' : 'Fill from post date'}</Button>}
          </div>
          {conflicts.length > 0 && <div className="warnbox" role="alert"><AlertTriangle size={17} /><span>{conflicts.join('. ')}.</span></div>}
          <div className="sched">
            {TASKS.map((t) => {
              const b = dateBounds(it, t.field)
              return <DateField key={t.key} label={t.label} done={isTaskDone(it, t)} value={(it[t.field] as string) || ''} min={b.min} max={b.max} onChange={(v) => setDate(t.field, v)} />
            })}
          </div>
          {TASKS.some((t) => it[t.field] && !isTaskDone(it, t)) && (
            <div className="row gap8 wrap gcal-row">
              <span className="small muted">Google Calendar</span>
              {TASKS.filter((t) => it[t.field] && !isTaskDone(it, t)).map((t) => (
                <a key={t.key} className="btn btn-sm" target="_blank" rel="noopener noreferrer"
                  href={gcalAllDay(`${t.label}: ${firstLine(it.title) || 'Untitled post'}`, it[t.field] as string, appLink('/post/' + id))}>
                  <CalendarClock size={15} /><span>{t.label}</span>
                </a>
              ))}
            </div>
          )}
          <button className="rowcard slotrow" onClick={() => setSched(true)}>
            {s ? <span className={cx('pick-dot', 'bg-' + s.tint)} /> : <span className="pick-dot pick-dot-none" />}
            <span className="grow">{s && it.week ? `${s.name} slot · week of ${fmtShort(it.week, z)}` : it.date ? 'No slot on this day' : 'Not in a slot'}</span>
            <span className="small muted">Change</span>
          </button>
        </section>

        <References it={it} />

        <Block label="Hook">
          <AutoTextarea aria-label="Hook" value={it.hook || ''} onChange={(v) => set({ hook: v })} minRows={2} placeholder="The first 2 seconds. Why would someone stop?" />
        </Block>
        <Block label="Script">
          <AutoTextarea aria-label="Script" value={it.script || ''} onChange={(v) => set({ script: v })} minRows={5} placeholder="What happens, shot by shot or line by line." />
        </Block>
        <Block label="Caption" right={it.caption?.trim() ? <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => copyOrShow(it.caption!, 'Copy caption', 'Caption copied')}>Copy</Button> : null}>
          <AutoTextarea aria-label="Caption" value={it.caption || ''} onChange={(v) => set({ caption: v })} minRows={3} placeholder="What goes under the post." />
        </Block>
        <Block label="Notes">
          <AutoTextarea aria-label="Notes" value={it.notes || ''} onChange={(v) => set({ notes: v })} minRows={2} placeholder="Shot ideas, gear, links, anything." />
        </Block>

        <Accordion title="Details" right={<span className="small muted acc-sum">{summary}</span>}>
          <FinalVideo value={it.finalUrl || ''} onChange={(v) => set({ finalUrl: v })} />
          {pillars().length > 0 && <div className="field"><span className="field-label">Pillar</span><Chips label="Pillar" value={it.pillar || ''} onChange={(v) => set({ pillar: v || null })} options={[...pillars().map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'None' }]} /></div>}
          {formats().length > 0 && <div className="field"><span className="field-label">Format</span><Chips label="Format" value={it.format || ''} onChange={(v) => set({ format: v || null })} options={[...formats().map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'None' }]} /></div>}
        </Accordion>
      </div>

      <div className="ed-actions">
        <div className="ed-actions-inner">
          {done
            ? <div className="row gap8" style={{ width: '100%' }}><span className="grow row gap6 posted-note"><Check size={17} />Posted{it.postedAt ? ' ' + fmtShort(dateKey(it.postedAt, z), z) : ''}</span><Button variant="ghost" onClick={() => setStage(id, 'ready')}>Not posted yet</Button></div>
            : <NextButton it={it} size="lg" block />}
        </div>
      </div>

      <ScheduleSheet open={sched} onClose={() => setSched(false)} title={`Schedule “${firstLine(it.title) || 'Untitled'}”`} week={it.week || null} slot={it.slot || null} exceptId={id} onPick={(w, sl) => { schedule(id, w, sl); toast(sl ? `Moved to ${slotById(sl)?.name}` : 'Unscheduled') }} />
    </main>
  )
}

function Block({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="block">
      <div className="block-head"><h2 className="block-label grow">{label}</h2>{right}</div>
      {children}
    </section>
  )
}


function FinalVideo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const url = normalizeUrl(value)
  const bad = !!value.trim() && !url
  return (
    <div className="field">
      <label className="field-label" htmlFor="final-url">Final video link</label>
      <input id="final-url" className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="Drive, Frame.io, Dropbox…" value={value} onChange={(e) => onChange(e.target.value)} />
      {bad && <span className="field-error">That doesn't look like a link.</span>}
      {url && (
        <div className="row gap8">
          <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={15} /><span>Open</span></a>
          <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => copyOrShow(url, 'Copy link', 'Link copied')}>Copy link</Button>
        </div>
      )}
    </div>
  )
}
