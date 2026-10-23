import React, { useState } from 'react'
import { Lightbulb, Plus, Trash2, AtSign } from 'lucide-react'
import { patch, put, remove } from '../lib/store'
import { ideas, createPost, ideaToThread, firstLine, slotById } from '../lib/model'
import { fmtDay } from '../lib/time'
import { go } from '../lib/router'
import { PageHead, PhoneTop } from '../ui/Shell'
import { Button, IconBtn, AutoTextarea, Empty, toast } from '../ui/kit'
import { ScheduleSheet, firstFreeSlot } from '../ui/SlotPicker'
import { openNew } from '../ui/QuickAdd'
import { Instagram } from '../ui/IgIcon'
import type { Item } from '../lib/types'

export default function Ideas() {
  const list = ideas()
  const [toIg, setToIg] = useState<Item | null>(null)
  const def = firstFreeSlot()
  return (
    <main className="main">
      <PhoneTop />
      <PageHead eyebrow="One inbox" title="Ideas." />
      <div className="stack">
        {list.map((i) => <IdeaCard key={i.id} it={i} onIg={() => setToIg(i)} />)}
        {!list.length && <Empty icon={<Lightbulb size={24} />} title="Inbox is empty" body="Catch ideas here first. Turn them into an Instagram post or a Threads draft when you're ready." action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openNew({ kind: 'idea' })}>New idea</Button>} />}
      </div>
      <ScheduleSheet open={!!toIg} onClose={() => setToIg(null)} title="Make it a post" week={null} slot={null} startWeek={def?.week} fresh
        onPick={(w, s) => {
          if (!toIg) return
          const p = createPost({ title: firstLine(toIg.text), week: w, slot: s, fromIdea: toIg })
          const sl = slotById(p.slot)
          toast(sl && p.date ? `Added to ${sl.name}, ${fmtDay(p.date)}` : 'Added to Instagram', { label: 'Open', run: () => go('/post/' + p.id) })
        }} />
    </main>
  )
}

function IdeaCard({ it, onIg }: { it: Item; onIg: () => void }) {
  return (
    <article className="idea">
      <AutoTextarea aria-label="Idea" className="input-plain idea-text" value={it.text || ''} minRows={1} onChange={(v) => patch('items', it.id, { text: v })} />
      <div className="row gap8">
        <Button size="sm" icon={<Instagram size={15} />} onClick={onIg}>Instagram</Button>
        <Button size="sm" icon={<AtSign size={15} />} onClick={() => { const snap = { ...it }; const t = ideaToThread(it.id); toast('Moved to Threads drafts', { label: 'Undo', run: () => { if (t) remove('items', t.id); put('items', snap, { touch: false }) } }) }}>Threads</Button>
        <span className="grow" />
        <IconBtn label="Delete idea" onClick={() => { const snap = { ...it }; remove('items', it.id); toast('Idea deleted', { label: 'Undo', run: () => put('items', snap, { touch: false }) }) }}><Trash2 size={17} /></IconBtn>
      </div>
    </article>
  )
}
