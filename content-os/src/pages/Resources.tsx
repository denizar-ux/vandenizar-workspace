import React, { useState } from 'react'
import { Link2, Plus, Pencil, ArrowUpRight, Trash2 } from 'lucide-react'
import { put, remove } from '../lib/store'
import { links, updateLink, linkLabel, normalizeUrl } from '../lib/model'
import { PageHead, PhoneTop } from '../ui/Shell'
import { Button, IconBtn, Empty, Sheet, Field, toast } from '../ui/kit'
import { openNew } from '../ui/QuickAdd'
import type { Item } from '../lib/types'

const host = (u?: string) => { try { return new URL(u || '').hostname.replace(/^www\./, '') } catch { return u || '' } }

export default function Resources() {
  const list = links()
  const [edit, setEdit] = useState<Item | null>(null)
  return (
    <main className="main">
      <PhoneTop />
      <PageHead eyebrow="Links you open often" title="Resources." />
      {list.length ? (
        <div className="list">
          {list.map((l) => (
            <div key={l.id} className="li res">
              <a className="res-open" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="ref-ic">{(l.title || linkLabel(l.url || ''))[0]?.toUpperCase() || <Link2 size={17} />}</span>
                <span className="li-main"><span className="li-title">{l.title || linkLabel(l.url || '')}</span><span className="li-sub">{host(l.url)}</span></span>
                <ArrowUpRight size={17} className="muted" />
              </a>
              <IconBtn label={`Edit ${l.title}`} onClick={() => setEdit(l)}><Pencil size={16} /></IconBtn>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Link2 size={24} />} title="No resources yet" body="Drive folders, Raindrop, your other web apps. Anything you open often, one tap away." action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openNew({ kind: 'link' })}>Add resource</Button>} />
      )}
      {edit && <EditLink it={edit} onClose={() => setEdit(null)} />}
    </main>
  )
}

function EditLink({ it, onClose }: { it: Item; onClose: () => void }) {
  const [name, setName] = useState(it.title || '')
  const [url, setUrl] = useState(it.url || '')
  const ok = !!normalizeUrl(url)
  return (
    <Sheet open onClose={onClose} title="Edit resource" footer={
      <div className="row gap8">
        <IconBtn label="Delete resource" onClick={() => { const snap = { ...it }; remove('items', it.id); onClose(); toast('Resource deleted', { label: 'Undo', run: () => put('items', snap, { touch: false }) }) }}><Trash2 size={19} /></IconBtn>
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!ok} onClick={() => { if (updateLink(it.id, name, url)) onClose() }}>Save</Button>
      </div>
    }>
      <Field label="Name" htmlFor="rs-name"><input id="rs-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Link" htmlFor="rs-url" error={url.trim() && !ok ? "That doesn't look like a link." : undefined}><input id="rs-url" className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
    </Sheet>
  )
}
