import React, { useState } from 'react'
import { Instagram as IgIcon } from '../ui/IgIcon'
import { AtSign, Trash2 } from 'lucide-react'
import { put, remove } from '../lib/store'
import { ideas, addIdea, ideaToThread, SLOTS, slotItem, fillSlot, thisWeek, firstLine } from '../lib/model'
import { addDays } from '../lib/time'
import { go } from '../lib/router'
import { PageHead } from '../ui/Shell'
import { Button, IconBtn, Sheet, Empty, toast } from '../ui/kit'
import type { Item } from '../lib/types'

export default function Ideas() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Item | null>(null)
  const list = ideas()
  const save = (e: React.FormEvent) => { e.preventDefault(); if (addIdea(text)) { setText(''); toast('Ide disimpan') } }
  const week = thisWeek(), next = addDays(week, 7)

  const toSlot = (w: string, slot: typeof SLOTS[number]['id']) => {
    if (!target) return
    fillSlot(w, slot, firstLine(target.text), target)
    setTarget(null)
    toast('Masuk ke jadwal', { label: 'Lihat', run: () => go(w === week ? '/week' : `/week?w=${w}`) })
  }

  return (
    <main className="main">
      <PageHead title="Ide." sub="Simpan dulu, bentuknya nanti." />
      <form className="composer" onSubmit={save}>
        <input className="input-plain composer-input" aria-label="Ide baru" placeholder="Tulis ide, Enter buat simpan" value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() && <Button type="submit" variant="primary" size="sm">Simpan</Button>}
      </form>
      <div className="stack mt16">
        {list.length === 0 ? <Empty title="Belum ada ide" body="Ide yang belum dipakai nunggu di sini. Dari sini bisa langsung dimasukin ke slot minggu ini atau jadi draft Threads." /> : list.map((i) => (
          <article key={i.id} className="idea">
            <p className="body-text pre">{i.text}</p>
            <div className="row gap8 wrap">
              <Button size="sm" icon={<IgIcon size={15} />} onClick={() => setTarget(i)}>Jadi post IG</Button>
              <Button size="sm" icon={<AtSign size={15} />} onClick={() => { ideaToThread(i.id); toast('Jadi draft Threads', { label: 'Lihat', run: () => go('/threads') }) }}>Jadi Threads</Button>
              <span className="grow" />
              <IconBtn label="Hapus ide" onClick={() => { const snap = { ...i }; remove('items', i.id); toast('Ide dihapus', { label: 'Batal', run: () => put('items', snap) }) }}><Trash2 size={17} /></IconBtn>
            </div>
          </article>
        ))}
      </div>

      <Sheet open={!!target} onClose={() => setTarget(null)} title="Masukin ke slot mana?">
        {[{ w: week, label: 'Minggu ini' }, { w: next, label: 'Minggu depan' }].map(({ w, label }) => (
          <section key={w} className="stack" style={{ gap: 8 }}>
            <h3 className="eyebrow">{label}</h3>
            <div className="list">
              {SLOTS.map((s) => {
                const taken = slotItem(w, s.id)
                return (
                  <button key={s.id} className="li" disabled={!!taken} onClick={() => toSlot(w, s.id)}>
                    <span className="li-main"><span className="li-title">{s.name}</span><span className="li-sub">{taken ? `Udah diisi: ${taken.title}` : 'Kosong'}</span></span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </Sheet>
    </main>
  )
}
