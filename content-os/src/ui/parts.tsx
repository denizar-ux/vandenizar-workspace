import React, { useState } from 'react'
import { ArrowRight, Check, Copy, Trash2, RotateCcw, Plus } from 'lucide-react'
import { STAGES, stageIndex, stageOf, advance, slotById, pillarName, formatName, isLate, markPosted, THREADS_LIMIT, firstLine } from '../lib/model'
import { patch, remove, put, tz } from '../lib/store'
import { fmtDay, fmtShort, dateKey, WEEKDAYS_S } from '../lib/time'
import { go } from '../lib/router'
import type { Item, Slot, Stage } from '../lib/types'
import { Button, IconBtn, AutoTextarea, toast, copyOrShow, cx } from './kit'
import { openNew } from './QuickAdd'

export function Stepper({ stage, label = true }: { stage?: Stage; label?: boolean }) {
  const si = stageIndex(stage)
  return <div className="stepper" role="img" aria-label={label ? `Stage ${si + 1} of 6: ${STAGES[si].label}` : undefined}>{STAGES.map((s, i) => <span key={s.id} className={cx('step', i <= si && 'on')} />)}</div>
}

export function tintOf(it: Item) { return slotById(it.slot)?.tint }

/** Advance one stage, with undo. */
export function doAdvance(it: Item) {
  const prev = it.stage || 'idea'
  const to = advance(it.id)
  if (!to) return
  toast(to === 'done' ? `Posted: ${firstLine(it.title) || 'Untitled'}` : `${firstLine(it.title) || 'Post'} → ${stageOf(to).label}`, { label: 'Undo', run: () => patch('items', it.id, { stage: prev, postedAt: null }) })
}

export function NextButton({ it, size = 'sm', block }: { it: Item; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  const st = stageOf(it.stage)
  if (it.stage === 'done') return null
  return <Button variant="primary" size={size} block={block} onClick={(e) => { e.stopPropagation(); doAdvance(it) }}>{st.next}<ArrowRight size={16} /></Button>
}

export function postWhen(it: Item) {
  const s = slotById(it.slot)
  const parts = [it.date ? fmtDay(it.date) : 'No date', s?.name].filter(Boolean)
  return parts.join(' · ')
}

/** Instagram list card. */
export function PostCard({ it }: { it: Item }) {
  const late = isLate(it)
  const meta = [formatName(it.format), pillarName(it.pillar), it.filmDate && stageIndex(it.stage) <= stageIndex('film') ? 'Film ' + fmtDay(it.filmDate) : null].filter(Boolean).join(' · ')
  const tint = tintOf(it)
  return (
    <article className={cx('pcard', tint ? 'tint-' + tint : 'pcard-plain')}>
      <button className="pcard-open" onClick={() => go('/post/' + it.id)}>
        <div className="pcard-top">
          <span className="eyebrow">{postWhen(it)}</span>
          {late ? <span className="badge badge-danger">Late</span> : <span className="badge badge-wash">{stageOf(it.stage).label}</span>}
        </div>
        <h3 className="pcard-title">{it.title || 'Untitled'}</h3>
        {meta && <p className="small ink2">{meta}</p>}
        <Stepper stage={it.stage} />
      </button>
      {it.stage !== 'done' && <div className="pcard-actions"><NextButton it={it} /></div>}
    </article>
  )
}

/** A weekly slot on Today: filled or empty. */
export function SlotTile({ slot, week, date, it }: { slot: Slot; week: string; date: string; it?: Item }) {
  if (!it) {
    return (
      <button className="tile tile-empty" onClick={() => openNew({ kind: 'ig', week, slot: slot.id })} aria-label={`Plan ${slot.name}, ${fmtDay(date)}`}>
        <span className="eyebrow">{WEEKDAYS_S[slot.day]} · {slot.name}</span>
        <span className="tile-title muted">Nothing yet</span>
        <span className="tile-plan"><Plus size={16} />Plan</span>
      </button>
    )
  }
  const late = isLate(it)
  const done = it.stage === 'done'
  return (
    <button className={cx('tile', 'tint-' + slot.tint)} onClick={() => go('/post/' + it.id)}>
      <span className="eyebrow">{WEEKDAYS_S[slot.day]} · {slot.name}</span>
      <span className="tile-title clamp2">{it.title || 'Untitled'}</span>
      <span className="tile-foot">
        <Stepper stage={it.stage} label={false} />
        <span className={cx('tile-state', late && 'late')}>{done ? <><Check size={14} />Posted</> : late ? 'Late · ' + stageOf(it.stage).label : stageOf(it.stage).label}</span>
      </span>
    </button>
  )
}

/** Threads draft (editable in place) or posted card. */
export function DraftCard({ it, compact }: { it: Item; compact?: boolean }) {
  const z = tz()
  const [focus, setFocus] = useState(false)
  const text = it.text || ''
  if (it.postedAt) {
    return (
      <article className="tcard tcard-posted">
        <p className={cx('tcard-text pre', compact && 'clamp3')}>{text}</p>
        <div className="row gap8">
          <span className="small muted grow row gap6"><Check size={15} />Posted {fmtShort(dateKey(it.postedAt, z), z)}</span>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={() => markPosted(it.id, false)}>Back to drafts</Button>
        </div>
      </article>
    )
  }
  return (
    <article className="tcard">
      {compact
        ? <button className="tcard-text pre clamp3 tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => go('/threads')}>{text}</button>
        : <AutoTextarea aria-label="Draft" className="input-plain tcard-text" value={text} minRows={1} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(v) => patch('items', it.id, { text: v })} />}
      {!compact && (focus || text.length > THREADS_LIMIT) && <span className={cx('count', text.length > THREADS_LIMIT && 'over')}>{text.length}/{THREADS_LIMIT}</span>}
      <div className="row gap8">
        <Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(text, 'Copy draft')}>Copy</Button>
        <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => { markPosted(it.id, true); toast('Marked as posted', { label: 'Undo', run: () => markPosted(it.id, false) }) }}>Posted</Button>
        <span className="grow" />
        {!compact && <IconBtn label="Delete draft" onClick={() => { const snap = { ...it }; remove('items', it.id); toast('Draft deleted', { label: 'Undo', run: () => put('items', snap, { touch: false }) }) }}><Trash2 size={17} /></IconBtn>}
      </div>
    </article>
  )
}
