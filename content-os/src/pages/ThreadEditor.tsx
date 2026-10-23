import React, { useState } from 'react'
import { ArrowLeft, Plus, Copy, ArrowUp, ArrowDown, Trash2, ExternalLink, CheckCircle2, FileText, Repeat, ChevronRight, CalendarDays, Link2 } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { get, patch, put, uid, remove, settings, tz, all } from '../lib/store'
import { postsOf, deriveTitle, moveInList, duplicateContent } from '../lib/model'
import { fmtDateTime } from '../lib/time'
import { back, go } from '../lib/router'
import { safeUrl } from '../lib/prefs'
import { changeStage, lifecycleAction } from '../lib/contentActions'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Menu, AutoTextarea, Badge, Sheet, ask, toast, copyOrShow, cx, Accordion, Field, Empty } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { NotFound } from '../ui/NotFound'
import type { Content } from '../lib/types'

export default function ThreadEditor({ id }: { id: string }) {
  const c = get('contents', id)
  const [linkOpen, setLinkOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  if (!c || c.lifecycle === 'deleted') return <NotFound what="Thread" backTo="/threads" />
  if (c.channel !== 'threads') { go(`/instagram/${c.id}`, { replace: true }); return null }
  const z = tz(), st = settings()
  let posts = postsOf(c.id)
  if (posts.length === 0) { put('posts', { id: uid(), contentId: c.id, body: '', order: 0, createdAt: '', updatedAt: '' }); posts = postsOf(c.id) }
  const multi = posts.length > 1
  const limit = st.threadsCharLimit
  const src = get('contents', c.sourceContentId)
  const idea = get('ideas', c.sourceIdeaId)
  const variantOf = get('contents', c.variantOfId)

  const setBody = (pid: string, v: string, i: number) => {
    patch('posts', pid, { body: v })
    if (i === 0) patch('contents', c.id, { title: deriveTitle(v) })
    else patch('contents', c.id, {})
  }
  const addPost = () => {
    put('posts', { id: uid(), contentId: c.id, body: '', order: posts.length, createdAt: '', updatedAt: '' })
    setTimeout(() => { const els = document.querySelectorAll<HTMLTextAreaElement>('.post-ed textarea'); els[els.length - 1]?.focus() }, 30)
  }
  const delPost = async (pid: string, body: string, i: number) => {
    if (body.trim()) { const r = await ask({ title: `Hapus post ${i + 1}?`, confirm: 'Hapus', danger: true }); if (r !== 'confirm') return }
    if (posts.length === 1) { patch('posts', pid, { body: '' }); patch('contents', c.id, { title: deriveTitle('') }); return }
    remove('posts', pid)
    postsOf(c.id).forEach((p, k) => { if (p.order !== k) patch('posts', p.id, { order: k }) })
    if (i === 0) patch('contents', c.id, { title: deriveTitle(postsOf(c.id)[0]?.body || '') })
  }
  const move = (pid: string, dir: -1 | 1) => {
    moveInList('posts', posts, pid, dir)
    patch('contents', c.id, { title: deriveTitle(postsOf(c.id)[0]?.body || '') })
  }
  const copyAll = () => {
    const text = posts.map((p) => p.body.trim()).filter(Boolean).join('\n\n---\n\n')
    copyOrShow(text, 'Salin semua post', multi ? `${posts.length} post tersalin. Posting satu per satu sesuai urutan.` : 'Tersalin')
  }
  const version = (label: string) => {
    const d = duplicateContent(c.id, { variantLabel: label, asVariant: true })
    toast(`${label} dibuat. Edit manual sesuai kebutuhan.`)
    go(`/threads/${d.id}`)
  }
  const threadsUrl = safeUrl(st.threadsUrl) || 'https://www.threads.net/'

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Kembali" onClick={() => back('/threads')}><ArrowLeft size={22} /></IconBtn>
        <SaveBadge /><span className="grow" />
        <Badge tone={c.status === 'published' ? 'ink' : c.status === 'ready' ? 'sage' : undefined}>{c.status === 'published' ? 'Terbit' : c.status === 'ready' ? 'Siap' : 'Draft'}</Badge>
        <Menu label="Menu thread" items={[
          { label: 'Tandai siap', onSelect: () => changeStage(c.id, 'ready'), hidden: c.status === 'ready' || c.status === 'published' },
          { label: 'Kembalikan ke draft', onSelect: () => changeStage(c.id, 'in_progress'), hidden: c.status !== 'ready' && c.status !== 'published' },
          { label: c.plannedPublishAt ? 'Ubah rencana posting' : 'Rencana posting', onSelect: () => openSheet({ type: 'schedulePost', contentId: c.id }), hidden: c.status === 'published' },
          { label: 'Hubungkan ke ide atau konten', onSelect: () => setLinkOpen(true) },
          { label: 'Review & turunan', onSelect: () => go(`/content/${c.id}/review`), hidden: c.status !== 'published' },
          { label: 'Parkir', onSelect: () => lifecycleAction(c.id, 'parked'), hidden: c.lifecycle !== 'active' },
          { label: 'Arsip', onSelect: () => lifecycleAction(c.id, 'archived', () => back('/threads')) },
          { label: 'Hapus', danger: true, onSelect: () => lifecycleAction(c.id, 'deleted', () => back('/threads')) },
        ]} />
      </div>
      {c.lifecycle !== 'active' && <div className="banner tint-lavender mt8"><span className="grow">Thread ini {c.lifecycle === 'parked' ? 'diparkir' : 'diarsip'}.</span><Button size="sm" onClick={() => patch('contents', c.id, { lifecycle: 'active' })}>Aktifkan</Button></div>}
      {c.variantLabel && <p className="small muted mt8">{c.variantLabel}{variantOf ? <> dari <button className="linkbtn" onClick={() => go(`/threads/${variantOf.id}`)}>{variantOf.title}</button></> : ''}</p>}

      <div className="stack-lg mt12">
        <div className="stack-lg" style={{ gap: 20 }}>
          {posts.map((p, i) => {
            const n = p.body.length
            const over = limit != null && n > limit
            return (
              <div key={p.id} className={cx('post-ed', multi && 'multi')}>
                {multi && <span className="xs muted tnum">{i + 1}/{posts.length}</span>}
                <AutoTextarea aria-label={multi ? `Post ${i + 1}` : 'Tulisan'} value={p.body} onChange={(v) => setBody(p.id, v, i)} minRows={!multi ? 5 : 2}
                  placeholder={i === 0 ? 'Tulis apa yang lagi lu pikirin.' : 'Lanjutan thread'} data-autofocus={i === 0 && !p.body ? true : undefined} autoFocus={i === 0 && !p.body} />
                <div className="post-tools">
                  <span className={cx('tnum grow', over && 'field-error')}>{limit != null ? `${n}/${limit}` : `${n} karakter`}</span>
                  <IconBtn label={`Salin post ${i + 1}`} onClick={() => copyOrShow(p.body, `Salin post ${i + 1}`)} disabled={!p.body.trim()}><Copy size={16} /></IconBtn>
                  {multi && <IconBtn label="Naikkan" disabled={i === 0} onClick={() => move(p.id, -1)}><ArrowUp size={16} /></IconBtn>}
                  {multi && <IconBtn label="Turunkan" disabled={i === posts.length - 1} onClick={() => move(p.id, 1)}><ArrowDown size={16} /></IconBtn>}
                  <IconBtn label={`Hapus post ${i + 1}`} onClick={() => delPost(p.id, p.body, i)}><Trash2 size={16} /></IconBtn>
                </div>
              </div>
            )
          })}
          <Button icon={<Plus size={18} />} onClick={addPost}>Tambah post</Button>
        </div>

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="small" style={{ fontWeight: 600 }}>Terkait dengan</h2>
          {src || idea ? (
            <div className="list">
              {src && <button className="li" onClick={() => go(`/${src.channel}/${src.id}`)}>{src.channel === 'threads' ? <FileText size={18} /> : <Instagram size={18} />}<span className="li-main li-title">{src.channel === 'threads' ? 'Threads' : 'Instagram'} · {src.lifecycle === 'deleted' ? 'sumber tidak tersedia' : src.title}</span><ChevronRight size={18} /></button>}
              {idea && <button className="li" onClick={() => go(`/ideas?open=${idea.id}`)}><Link2 size={18} /><span className="li-main"><span className="li-title clamp2" style={{ fontWeight: 500 }}>Ide · {idea.lifecycle === 'deleted' ? 'tidak tersedia' : idea.text}</span></span><ChevronRight size={18} /></button>}
            </div>
          ) : <button className="card tap row gap8" onClick={() => setLinkOpen(true)}><Link2 size={18} /><span className="grow small">Hubungkan ke ide atau konten (opsional)</span></button>}
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="small" style={{ fontWeight: 600 }}>Duplikasi versi</h2>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <button className="card tap col gap6 center" style={{ alignItems: 'center', padding: 12, fontSize: 12.5 }} onClick={() => version('Versi pendek')}><FileText size={18} />Versi lebih pendek</button>
            <button className="card tap col gap6 center" style={{ alignItems: 'center', padding: 12, fontSize: 12.5 }} onClick={() => version('Versi detail')}><FileText size={18} />Versi lebih detail</button>
            <button className="card tap col gap6 center" style={{ alignItems: 'center', padding: 12, fontSize: 12.5 }} onClick={() => setCustomOpen(true)}><Repeat size={18} />Nama sendiri</button>
          </div>
          <p className="xs muted">Membuat salinan untuk diedit manual. Tidak ada penulisan ulang otomatis.</p>
        </section>

        <Accordion title="Rencana posting" right={<span className="small muted tnum">{c.plannedPublishAt ? fmtDateTime(c.plannedPublishAt, z, st.hour12) : 'Opsional'}</span>}>
          <Button icon={<CalendarDays size={18} />} onClick={() => openSheet({ type: 'schedulePost', contentId: c.id })} disabled={c.status === 'published'}>{c.plannedPublishAt ? 'Ubah jadwal' : 'Atur jadwal'}</Button>
        </Accordion>

        {c.status === 'published' && (
          <div className="card tint-lavender stack">
            <div className="row gap8"><CheckCircle2 size={20} /><span className="grow h3">Terbit {c.publishedAt && fmtDateTime(c.publishedAt, z, st.hour12)}</span></div>
            {c.postUrl && safeUrl(c.postUrl) && <a className="small break" href={safeUrl(c.postUrl)!} target="_blank" rel="noopener noreferrer">{c.postUrl}</a>}
            <div className="row gap8 wrap">
              <Button size="sm" variant="primary" onClick={() => go(`/content/${c.id}/review`)}>Review & turunan</Button>
              <Button size="sm" variant="ghost" onClick={() => changeStage(c.id, 'ready')}>Tandai belum terbit</Button>
            </div>
          </div>
        )}
        <p className="xs muted center">Posting dilakukan manual. Tampilan di sini bukan pratinjau resmi Threads.</p>
      </div>

      <div className="ed-actions"><div className="ed-actions-inner" style={{ flexWrap: 'wrap' }}>
        <Button icon={<Copy size={18} />} onClick={copyAll}>{multi ? 'Salin semua' : 'Salin'}</Button>
        <a className="btn btn-primary" href={threadsUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /><span>Buka Threads</span></a>
        {c.status !== 'published' && <Button icon={<CheckCircle2 size={18} />} onClick={() => openSheet({ type: 'publish', contentId: c.id })} style={{ flexBasis: '100%' }}>Tandai sudah terbit</Button>}
      </div></div>

      {linkOpen && <LinkSourceSheet c={c} onClose={() => setLinkOpen(false)} />}
      <Sheet open={customOpen} onClose={() => setCustomOpen(false)} title="Nama versi" footer={<Button variant="primary" block onClick={() => { if (!custom.trim()) return; setCustomOpen(false); version(custom.trim()) }}>Buat salinan</Button>}>
        <Field label="Nama versi" htmlFor="v-name"><input id="v-name" className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Misal: Sudut pandang klien" data-autofocus /></Field>
      </Sheet>
    </main>
  )
}

function LinkSourceSheet({ c, onClose }: { c: Content; onClose: () => void }) {
  const [q, setQ] = useState('')
  const s = q.toLowerCase()
  const ideas = all('ideas').filter((i) => i.lifecycle === 'active' && i.text.toLowerCase().includes(s)).slice(0, 15)
  const contents = all('contents').filter((x) => x.id !== c.id && x.lifecycle !== 'deleted' && x.sourceContentId !== c.id && x.title.toLowerCase().includes(s)).slice(0, 15)
  return (
    <Sheet open onClose={onClose} title="Hubungkan" footer={(c.sourceContentId || c.sourceIdeaId) ? <Button variant="ghost" block onClick={() => { patch('contents', c.id, { sourceContentId: null, sourceIdeaId: null }); toast('Hubungan dilepas'); onClose() }}>Lepas semua hubungan</Button> : undefined}>
      <p className="small muted">Hanya menautkan. Tulisan tidak diubah.</p>
      <input className="input" aria-label="Cari" placeholder="Cari ide atau konten" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
      {ideas.length + contents.length === 0 ? <Empty title="Tidak ada yang cocok" /> : (
        <div className="list">
          {contents.map((x) => <button key={x.id} className="li" onClick={() => { patch('contents', c.id, { sourceContentId: x.id }); toast('Terhubung'); onClose() }}>{x.channel === 'threads' ? <FileText size={18} /> : <Instagram size={18} />}<span className="li-main li-title">{x.title}</span></button>)}
          {ideas.map((i) => <button key={i.id} className="li" onClick={() => { patch('contents', c.id, { sourceIdeaId: i.id }); if (!i.convertedContentIds.includes(c.id)) patch('ideas', i.id, { convertedContentIds: [...i.convertedContentIds, c.id] }); toast('Terhubung ke ide'); onClose() }}><Link2 size={18} /><span className="li-main"><span className="li-title clamp2" style={{ fontWeight: 500 }}>{i.text}</span></span></button>)}
        </div>
      )}
    </Sheet>
  )
}
