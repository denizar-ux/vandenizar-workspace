import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { addThread, createPost, addLink, slotById, normalizeUrl, THREADS_LIMIT } from '../lib/model'
import { fmtDay } from '../lib/time'
import { go } from '../lib/router'
import { Sheet, Segmented, Button, AutoTextarea, toast, cx } from './kit'
import { SlotPicker, firstFreeSlot } from './SlotPicker'
import { DateField, TimeField } from './DateInput'

export type NewKind = 'ig' | 'thread' | 'link'
interface Req { kind: NewKind; week?: string | null; slot?: string | null }

let req: Req | null = null
const subs = new Set<() => void>()
/** The one way to create anything. */
export function openNew(r: Req) { req = r; subs.forEach((f) => f()) }
function close() { req = null; subs.forEach((f) => f()) }
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (req) close() })

export function QuickAddHost() {
  const r = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => req)
  return r ? <QuickAdd key={JSON.stringify(r)} req={r} /> : null
}

function QuickAdd({ req }: { req: Req }) {
  const [kind, setKind] = useState<NewKind>(req.kind)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [url, setUrl] = useState('')
  const def = req.slot ? { week: req.week || null, slot: req.slot } : firstFreeSlot()
  const [pick, setPick] = useState<{ week: string | null; slot: string | null }>({ week: def?.week || null, slot: def?.slot || null })

  useEffect(() => { setTimeout(() => document.querySelector<HTMLElement>('.qa [data-main]')?.focus(), 60) }, [kind])

  const save = () => {
    if (kind === 'thread') {
      const t = addThread(text, date || null, time || null); if (!t) return
      toast(date ? `Threads scheduled ${fmtDay(date)}${time ? ' ' + time.replace(':', '.') : ''}` : 'Draft saved', { label: 'View', run: () => go('/threads') })
    } else if (kind === 'link') {
      if (!addLink(title, url)) return
      toast('Added to Resources', { label: 'View', run: () => go('/resources') })
    } else {
      if (!title.trim()) return
      const p = createPost({ title, week: pick.week, slot: pick.slot })
      const s = slotById(p.slot)
      toast(s && p.date ? `Added to ${s.name}, ${fmtDay(p.date)}` : 'Added to Instagram', { label: 'Open', run: () => go('/post/' + p.id) })
    }
    close()
  }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } }
  const ok = kind === 'ig' ? !!title.trim() : kind === 'thread' ? !!text.trim() : !!normalizeUrl(url)

  return (
    <Sheet open onClose={close} title="New" footer={
      <Button variant="primary" size="lg" block disabled={!ok} onClick={save}>{kind === 'thread' ? (date ? 'Schedule' : 'Save draft') : kind === 'link' ? 'Add resource' : 'Add post'}</Button>
    }>
      <div className="qa stack" onKeyDown={onKey}>
        <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'ig', label: 'Instagram' }, { value: 'thread', label: 'Threads' }, { value: 'link', label: 'Resource' }]} />
        {kind === 'ig' && (
          <>
            <input data-main className="input qa-title" aria-label="Post title" placeholder="What's the post? An idea is fine." value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
            <div className="field">
              <span className="field-label">When</span>
              <SlotPicker week={pick.week} slot={pick.slot} onPick={(w, s) => setPick({ week: w, slot: s })} />
            </div>
          </>
        )}
        {kind === 'thread' && (
          <>
            <AutoTextarea data-main aria-label="Threads draft" className="qa-text" placeholder="Write it the way you'd post it." value={text} onChange={setText} minRows={4} />
            <span className={cx('count', text.length > THREADS_LIMIT && 'over')}>{text.length}/{THREADS_LIMIT}</span>
            <div className="grid2">
              <DateField label="Post on" value={date} placeholder="Not scheduled" onChange={setDate} />
              <TimeField label="Time" value={time} disabled={!date} onChange={setTime} />
            </div>
          </>
        )}
        {kind === 'link' && (
          <>
            <input data-main className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" aria-label="Link" placeholder="Paste a link" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className="input" aria-label="Name" placeholder="Name (optional), e.g. Ainayya Drive" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
          </>
        )}
      </div>
    </Sheet>
  )
}
