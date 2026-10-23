import React, { useState } from 'react'
import { ArrowLeft, Lightbulb, BarChart3, FileText, Image as ImageIcon, Film, Layers, AtSign, ChevronRight } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { get, patch, settings, tz } from '../lib/store'
import { ensureReview, reviewOf, followupIdea, sourcePieces, createDerivative, derivativesOf } from '../lib/model'
import { fmtDateTime, todayKey } from '../lib/time'
import { back, go, useRoute, setQuery } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, AutoTextarea, Accordion, Check3, ask, toast, Badge, Empty, cx, Field } from '../ui/kit'
import { NotFound } from '../ui/NotFound'
import type { Content, Metrics, Format, Channel } from '../lib/types'

export default function Review({ id }: { id: string }) {
  const r = useRoute()
  const c = get('contents', id)
  const tab = r.q.get('tab') === 'derive' ? 'derive' : 'review'
  if (!c || c.lifecycle === 'deleted') return <NotFound what="Konten" />
  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back(`/${c.channel}/${c.id}`)}><ArrowLeft size={22} /></IconBtn>
        <button className="tap grow li-title" style={{ border: 0, background: 'none', padding: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => go(`/${c.channel}/${c.id}`)}>{c.title}</button>
        {c.status === 'published' && <Badge tone="ink">Terbit</Badge>}
      </div>
      <div className="seg mt8" role="tablist" aria-label="Bagian">
        <button role="tab" aria-selected={tab === 'review'} className={cx('seg-item', tab === 'review' && 'on')} onClick={() => setQuery('tab', null)}>Review</button>
        <button role="tab" aria-selected={tab === 'derive'} className={cx('seg-item', tab === 'derive' && 'on')} onClick={() => setQuery('tab', 'derive')}>Turunan</button>
      </div>
      <div className="mt16">{tab === 'review' ? <ReviewTab c={c} /> : <DeriveTab c={c} />}</div>
    </main>
  )
}

function ReviewTab({ c }: { c: Content }) {
  const z = tz(), st = settings()
  if (c.status !== 'published') return (
    <Empty title="Review tersedia setelah terbit" body="Tandai konten sudah terbit dulu, lalu catat hasilnya di sini." action={<Button onClick={() => go(c.channel === 'threads' ? `/threads/${c.id}` : `/instagram/${c.id}?tab=publish`)}>Ke halaman tayang</Button>} />
  )
  const rv = reviewOf(c.id) || ensureReview(c.id)
  const followup = get('ideas', rv.followupIdeaId)
  const m: Metrics = rv.metrics || {}
  const setM = (k: keyof Metrics, v: string) => {
    const n = v === '' ? null : Math.max(0, Math.floor(Number(v)))
    if (v !== '' && isNaN(n as number)) return
    patch('reviews', rv.id, { metrics: { ...m, [k]: n }, recordedAt: rv.recordedAt || todayKey(z) })
  }
  const makeIdea = async () => {
    try {
      if (followup && followup.lifecycle !== 'deleted') {
        const a = await ask({ title: 'Ide lanjutan sudah dibuat', body: `"${followup.text}" sudah ada di Inbox. Buka ide itu, atau buat ide baru lagi?`, confirm: 'Buka ide', extra: 'Buat ide baru' })
        if (a === 'confirm') { go(`/ideas?open=${followup.id}`); return }
        if (a !== 'extra') return
        const r = followupIdea(c.id, { forceNew: true }); toast('Ide lanjutan masuk Inbox', { label: 'Buka', run: () => go(`/ideas?open=${r.idea.id}`) }); return
      }
      const r = followupIdea(c.id)
      toast('Ide lanjutan masuk Inbox', { label: 'Buka', run: () => go(`/ideas?open=${r.idea.id}`) })
    } catch (e: any) { toast(e.message, undefined, 'error') }
  }
  return (
    <div className="stack-lg">
      <div className="row between"><h2 className="h2">Review singkat</h2><SaveBadge /></div>
      {c.publishedAt && <p className="small muted" style={{ marginTop: -12 }}>Terbit {fmtDateTime(c.publishedAt, z, st.hour12)}</p>}
      <Field label="Respons yang muncul" htmlFor="rv-res"><AutoTextarea id="rv-res" value={rv.responses} onChange={(v) => patch('reviews', rv.id, { responses: v })} placeholder="Komentar, DM, pertanyaan yang sering muncul" /></Field>
      <Field label="Yang layak diulang" htmlFor="rv-lesson"><AutoTextarea id="rv-lesson" value={rv.lesson} onChange={(v) => patch('reviews', rv.id, { lesson: v })} placeholder="Hook, format, atau shot yang berhasil" /></Field>
      <Field label="Ide berikutnya" htmlFor="rv-next"><AutoTextarea id="rv-next" value={rv.nextIdea} onChange={(v) => patch('reviews', rv.id, { nextIdea: v })} placeholder="Satu ide yang muncul dari post ini" /></Field>
      <Button variant="primary" size="lg" icon={<Lightbulb size={18} />} disabled={!rv.nextIdea.trim()} onClick={makeIdea}>Jadikan ide lanjutan</Button>
      {followup && followup.lifecycle !== 'deleted' && <p className="small">Sudah jadi ide: <button className="linkbtn" onClick={() => go(`/ideas?open=${followup.id}`)}>{followup.text}</button></p>}
      <Accordion title={<span className="row gap8"><BarChart3 size={18} />Angka performa (manual)</span>}>
        <p className="xs muted">Dicatat manual dari aplikasi. Kosong berarti belum dicatat, beda dengan 0.</p>
        <div className="grid2">
          {([['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves']] as [keyof Metrics, string][]).map(([k, l]) => (
            <Field key={k} label={l} htmlFor={'m-' + k}><input id={'m-' + k} className="input tnum" type="number" min={0} inputMode="numeric" value={m[k] ?? ''} onChange={(e) => setM(k, e.target.value)} /></Field>
          ))}
          <Field label="Tanggal dicatat" htmlFor="m-date"><input id="m-date" className="input" type="date" value={rv.recordedAt || ''} onChange={(e) => patch('reviews', rv.id, { recordedAt: e.target.value || null })} /></Field>
        </div>
      </Accordion>
    </div>
  )
}

function DeriveTab({ c }: { c: Content }) {
  const pieces = sourcePieces(c.id)
  const [target, setTarget] = useState<{ channel: Channel; format?: Format }>(c.channel === 'threads' ? { channel: 'instagram', format: 'carousel' } : { channel: 'threads' })
  const [sel, setSel] = useState<string[]>(pieces.map((p) => p.id))
  const derived = derivativesOf(c.id)
  const opts: { key: string; label: string; icon: React.ReactNode; t: { channel: Channel; format?: Format } }[] = [
    { key: 'threads', label: 'Threads', icon: <FileText size={18} />, t: { channel: 'threads' } },
    { key: 'reel', label: 'Reel', icon: <Film size={18} />, t: { channel: 'instagram', format: 'reel' } },
    { key: 'carousel', label: 'Carousel', icon: <ImageIcon size={18} />, t: { channel: 'instagram', format: 'carousel' } },
    { key: 'story', label: 'Story', icon: <Layers size={18} />, t: { channel: 'instagram', format: 'story' } },
  ]
  const curKey = target.channel === 'threads' ? 'threads' : target.format
  const make = () => {
    const d = createDerivative(c.id, target, sel)
    toast('Draft turunan dibuat. Tetap terhubung ke sumber.')
    go(d.channel === 'threads' ? `/threads/${d.id}` : `/instagram/${d.id}?tab=write`)
  }
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2 className="h2">Buat turunan</h2>
        <div className="row gap8 small"><span className="muted">Sumber:</span>{c.channel === 'threads' ? <AtSign size={16} /> : <Instagram size={16} />}<span>{c.channel === 'threads' ? 'Threads' : 'Instagram'} · {c.title}</span></div>
        <div className="grid2">
          {opts.map((o) => (
            <button key={o.key} className={cx('card tap row gap8', curKey === o.key && 'tint-butter')} aria-pressed={curKey === o.key} style={{ justifyContent: 'center', fontWeight: 550 }} onClick={() => setTarget(o.t)}>{o.icon}{o.label}</button>
          ))}
        </div>
      </section>
      <section className="stack">
        <h3 className="h3">Teks yang disalin ke draft</h3>
        {pieces.length === 0 ? <p className="small muted">Sumber belum punya teks. Draft dibuat kosong.</p> : (
          <div className="list">
            {pieces.map((p) => (
              <div key={p.id} className="li" style={{ alignItems: 'flex-start' }}>
                <span style={{ paddingTop: 2 }}><Check3 checked={sel.includes(p.id)} label={`Salin ${p.label}`} onChange={(v) => setSel(v ? [...sel, p.id] : sel.filter((x) => x !== p.id))} /></span>
                <div className="li-main"><span className="li-title">{p.label}</span><p className="li-sub clamp3">{p.text}</p></div>
              </div>
            ))}
          </div>
        )}
        <p className="xs muted">Teks disalin apa adanya untuk diedit manual. Tugas, checklist, jadwal dan angka tidak ikut. Edit di turunan tidak mengubah sumber.</p>
      </section>
      <Button variant="primary" size="lg" onClick={make}>Buat draft turunan</Button>
      {derived.length > 0 && (
        <section className="stack">
          <h3 className="h3">Turunan yang sudah ada</h3>
          <div className="list">
            {derived.map((d) => (
              <button key={d.id} className="li" onClick={() => go(`/${d.channel}/${d.id}`)}>
                {d.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}
                <span className="li-main"><span className="li-title">{d.title}</span><span className="li-sub">{d.variantLabel || (d.channel === 'threads' ? 'Threads' : d.format)} · {d.status === 'published' ? 'Terbit' : 'Draft'}</span></span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
