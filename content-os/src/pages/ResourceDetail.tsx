import React from 'react'
import { ArrowLeft, Pencil, ChevronRight, AtSign } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { get, patch } from '../lib/store'
import { contentsUsing, unlinkResource, setLifecycle } from '../lib/model'
import { assetUrl } from '../lib/image'
import { safeUrl } from '../lib/prefs'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, Menu, toast, Badge, Button } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { NotFound } from '../ui/NotFound'
import { RTYPE_LABEL } from '../sheets/ResourceSheets'
import { ResourceBody, resIcon, trashResource } from './Resources'

export default function ResourceDetail({ id }: { id: string }) {
  const r = get('resources', id)
  if (!r || r.lifecycle === 'deleted') return <NotFound what="Bahan" backTo="/resources" />
  const used = contentsUsing(r.id)
  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back('/resources')}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" /><SaveBadge />
        <IconBtn label="Edit" onClick={() => openSheet({ type: 'resource', id: r.id })}><Pencil size={19} /></IconBtn>
        <Menu label="Menu bahan" items={[
          { label: r.pinned ? 'Lepas pin' : 'Pin', onSelect: () => patch('resources', r.id, { pinned: !r.pinned }) },
          { label: 'Arsip', onSelect: () => { setLifecycle('resources', r.id, 'archived'); toast('Bahan diarsip'); back('/resources') } },
          { label: 'Hapus', danger: true, onSelect: async () => { if (await trashResource(r)) back('/resources') } },
        ]} />
      </div>
      <div className="stack-lg mt8">
        <div className="row gap12"><span className="ricon" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>{resIcon(r)}</span>
          <div className="grow"><h1 className="content-title">{r.title}</h1><span className="small muted">{RTYPE_LABEL[r.type]}{r.lifecycle === 'archived' ? ' · diarsip' : ''}</span></div></div>
        {r.lifecycle === 'archived' && <div className="banner tint-lavender"><span className="grow">Bahan ini diarsip.</span><Button size="sm" onClick={() => setLifecycle('resources', r.id, 'active')}>Aktifkan</Button></div>}
        <div className="card stack"><ResourceBody r={r} img={assetUrl(r.assetId)} url={safeUrl(r.url)} /></div>
        <section className="stack">
          <h2 className="h2">Dipakai di <span className="muted tnum" style={{ fontWeight: 500 }}>{used.length}</span></h2>
          {used.length === 0 ? <p className="small muted">Belum ditautkan ke konten mana pun.</p> : (
            <div className="list">
              {used.map((c) => (
                <div key={c.id} className="li">
                  {c.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}
                  <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => go(`/${c.channel}/${c.id}`)}>
                    <span className="li-title">{c.title}</span>{c.lifecycle !== 'active' && <Badge tone="line">{c.lifecycle === 'deleted' ? 'di Sampah' : c.lifecycle === 'parked' ? 'diparkir' : 'diarsip'}</Badge>}
                  </button>
                  <Menu label="Menu tautan" items={[{ label: 'Lepas tautan', onSelect: () => { unlinkResource(c.id, r.id); toast('Tautan dilepas') } }]} />
                  <ChevronRight size={18} className="muted" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
