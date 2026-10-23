import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Lightbulb } from 'lucide-react'
import { addIdea, addThread, createPost, ideas, firstLine, slotById, THREADS_LIMIT } from '../lib/model'
import { fmtDay } from '../lib/time'
import { go } from '../lib/router'
import type { Item } from '../lib/types'
import { Sheet, Segmented, Button, AutoTextarea, toast, cx } from './kit'
import { SlotPicker, firstFreeSlot } from './SlotPicker'

export type NewKind = 'idea' | 'ig' | 'thread'
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
  const [fromIdea, setFromIdea] = useState<Item | null>(null)
  const [showIdeas, setShowIdeas] = useState(false)
  const def = req.slot ? { week: req.week || null, slot: req.slot } : firstFreeSlot()
  const [pick, setPick] = useState<{ week: string | null; slot: string | null }>({ week: def?.week || null, slot: def?.slot || null })
  const ideaList = ideas()

  // focus the main field whenever the type changes
  useEffect(() => { setTimeout(() => document.querySelector<HTMLElement>('.qa [data-main]')?.focus(), 60) }, [kind])

  const save = () => {
    if (kind === 'idea') {
      if (!addIdea(text)) return
      toast('Idea saved', { label: 'View', run: () => go('/ideas') })
    } else if (kind === 'thread') {
      if (!addThread(text)) return
      toast('Draft saved', { label: 'View', run: () => go('/threads') })
    } else {
      if (!title.trim()) return
      const p = createPost({ title, week: pick.week, slot: pick.slot, fromIdea: fromIdea || undefined })
      const s = slotById(p.slot)
      toast(s && p.date ? `Added to ${s.name}, ${fmtDay(p.date)}` : 'Added to Instagram', { label: 'Open', run: () => go('/post/' + p.id) })
    }
    close()
  }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } }
  const ok = kind === 'ig' ? !!title.trim() : !!text.trim()

  return (
    <Sheet open onClose={close} title="New" footer={
      <Button variant="primary" size="lg" block disabled={!ok} onClick={save}>{kind === 'idea' ? 'Save idea' : kind === 'thread' ? 'Save draft' : 'Add post'}</Button>
    }>
      <div className="qa stack" onKeyDown={onKey}>
        <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'idea', label: 'Idea' }, { value: 'ig', label: 'Instagram' }, { value: 'thread', label: 'Threads' }]} />
        {kind === 'idea' && (
          <AutoTextarea data-main aria-label="Idea" className="qa-text" placeholder="What's the idea? Half-baked is fine." value={text} onChange={setText} minRows={3} />
        )}
        {kind === 'thread' && (
          <>
            <AutoTextarea data-main aria-label="Threads draft" className="qa-text" placeholder="Write it the way you'd post it." value={text} onChange={setText} minRows={4} />
            <span className={cx('count', text.length > THREADS_LIMIT && 'over')}>{text.length}/{THREADS_LIMIT}</span>
          </>
        )}
        {kind === 'ig' && (
          <>
            <input data-main className="input qa-title" aria-label="Post title" placeholder="What's the post?" value={title} onChange={(e) => { setTitle(e.target.value); if (fromIdea && e.target.value !== firstLine(fromIdea.text)) setFromIdea(null) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
            {ideaList.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <button type="button" className="linkbtn row gap6" style={{ alignSelf: 'flex-start' }} aria-expanded={showIdeas} onClick={() => setShowIdeas(!showIdeas)}>
                  <Lightbulb size={16} />{fromIdea ? 'From idea: ' + firstLine(fromIdea.text) : `Start from an idea (${ideaList.length})`}
                </button>
                {showIdeas && (
                  <div className="idea-pick">
                    {ideaList.slice(0, 20).map((i) => (
                      <button key={i.id} type="button" className={cx('idea-chip', fromIdea?.id === i.id && 'on')} onClick={() => { setFromIdea(i); setTitle(firstLine(i.text)); setShowIdeas(false) }}>{firstLine(i.text)}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="field">
              <span className="field-label">When</span>
              <SlotPicker week={pick.week} slot={pick.slot} onPick={(w, s) => setPick({ week: w, slot: s })} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
