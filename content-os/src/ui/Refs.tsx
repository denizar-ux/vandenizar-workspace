import React, { useState } from 'react'
import { Link2, ArrowUpRight, Trash2, Plus } from 'lucide-react'
import { addRef, updateRef, removeRef, linkLabel } from '../lib/model'
import { patch } from '../lib/store'
import type { Item, Ref } from '../lib/types'
import { Button, IconBtn, Sheet, toast, cx } from './kit'

const tail = (url: string) => { try { const u = new URL(url); const p = (u.pathname + u.search).replace(/\/$/, ''); return u.hostname.replace(/^www\./, '') + (p.length > 28 ? p.slice(0, 27) + '…' : p) } catch { return url } }

function RefRow({ it, r, editable }: { it: Item; r: Ref; editable: boolean }) {
  return (
    <div className="ref">
      <div className="ref-top">
        <a className="ref-open" href={r.url} target="_blank" rel="noopener noreferrer">
          <span className="ref-ic"><Link2 size={17} /></span>
          <span className="grow ref-text"><span className="ref-label">{linkLabel(r.url)}</span><span className="ref-url">{tail(r.url)}</span></span>
          <ArrowUpRight size={17} className="muted" />
        </a>
        {editable && <IconBtn label="Remove link" onClick={() => { const snap = it.refs || []; removeRef(it.id, r.id); toast('Link removed', { label: 'Undo', run: () => patch('items', it.id, { refs: snap }) }) }}><Trash2 size={16} /></IconBtn>}
      </div>
      {editable
        ? <input className="ref-note" aria-label="Note" placeholder="Add a note" value={r.note || ''} onChange={(e) => updateRef(it.id, r.id, { note: e.target.value })} />
        : r.note ? <p className="ref-note-text">{r.note}</p> : null}
    </div>
  )
}

/** Reference links on a post: list, inline notes, and an add form. */
export function References({ it }: { it: Item }) {
  const refs = it.refs || []
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!addRef(it.id, url, note)) { setErr("That doesn't look like a link."); return }
    setUrl(''); setNote(''); setErr(''); setAdding(false)
  }
  const form = adding && (
    <form className="ref-form" onSubmit={submit}>
      <input className="input" autoFocus inputMode="url" autoCapitalize="off" autoCorrect="off" aria-label="Link" placeholder="Paste a link" value={url} onChange={(e) => { setUrl(e.target.value); setErr('') }} />
      <input className="input" aria-label="Note (optional)" placeholder="Note (optional), e.g. the lighting" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <span className="field-error" role="alert">{err}</span>}
      <div className="row gap8 end"><Button variant="ghost" size="sm" onClick={() => { setAdding(false); setUrl(''); setNote(''); setErr('') }}>Cancel</Button><Button type="submit" variant="primary" size="sm" disabled={!url.trim()}>Add link</Button></div>
    </form>
  )
  if (!refs.length && !adding) {
    return <button className="ref-add-thin" onClick={() => setAdding(true)}><Plus size={16} />Add reference</button>
  }
  return (
    <section className="block">
      <div className="block-head"><h2 className="block-label grow">References</h2>{!adding && <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add</Button>}</div>
      {refs.length > 0 && <div className={cx('refs')}>{refs.map((r) => <RefRow key={r.id} it={it} r={r} editable />)}</div>}
      {form}
    </section>
  )
}

/** Read-only list, for the Materials sheet on Today. */
export function RefListView({ it }: { it: Item }) {
  return <div className="refs">{(it.refs || []).map((r) => <RefRow key={r.id} it={it} r={r} editable={false} />)}</div>
}

/** Everything needed on set: references, hook, script. */
export function MaterialsSheet({ it, open, onClose, onOpenPost }: { it: Item; open: boolean; onClose: () => void; onOpenPost: () => void }) {
  const empty = !(it.refs || []).length && !it.hook?.trim() && !it.script?.trim()
  return (
    <Sheet open={open} onClose={onClose} title={it.title || 'Materials'}>
      {(it.refs || []).length > 0 && <RefListView it={it} />}
      {it.hook?.trim() && <div className="mat"><span className="eyebrow">Hook</span><p className="pre body-text">{it.hook}</p></div>}
      {it.script?.trim() && <div className="mat"><span className="eyebrow">Script</span><p className="pre body-text">{it.script}</p></div>}
      {empty && <p className="muted">No references, hook or script yet.</p>}
      <Button variant="ghost" onClick={() => { onClose(); onOpenPost() }}>Open post</Button>
    </Sheet>
  )
}
