import React, { useState } from 'react'
import { AtSign, ListChecks, FileText, Paperclip } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { captureIdea, createInstagram, createThread, deriveTitle } from '../lib/model'
import { safeUrl } from '../lib/prefs'
import { patch } from '../lib/store'
import { go } from '../lib/router'
import { Sheet, Button, AutoTextarea, Chips, toast, Segmented } from '../ui/kit'
import { openSheet } from '../ui/bus'
import type { Channel, Format } from '../lib/types'

export function CaptureSheet({ onClose, text: initial = '' }: { onClose: () => void; text?: string }) {
  const [text, setText] = useState(initial)
  const [url, setUrl] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [ch, setCh] = useState<'none' | Channel>('none')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = () => {
    if (busy) return
    if (!text.trim()) { setErr('Tulis idenya dulu.'); return }
    if (url.trim() && !safeUrl(url)) { setErr('Link harus diawali http:// atau https://'); return }
    setBusy(true)
    try {
      const idea = captureIdea(text, url, ch === 'none' ? null : ch)
      toast('Ide tersimpan', { label: 'Buka ide', run: () => go(`/ideas?open=${idea.id}`) })
      setText(''); setUrl(''); setErr('')
      onClose()
    } catch (e: any) { setErr(e.message || 'Gagal menyimpan') } finally { setBusy(false) }
  }

  const switchTo = (kind: 'instagram' | 'threads' | 'task' | 'resource') => {
    onClose()
    if (kind === 'instagram' || kind === 'threads') openSheet({ type: 'newContent', channel: kind, text })
    else if (kind === 'task') openSheet({ type: 'task', defaults: { title: text.trim().split('\n')[0].slice(0, 120), notes: text.includes('\n') ? text : '' } })
    else openSheet({ type: 'resource', defaults: { title: deriveTitle(text) === 'Thread tanpa judul' ? '' : deriveTitle(text), body: text, url: url || undefined, sourceKind: url ? 'web_link' : 'text', type: url ? 'reference' : 'hook' } })
  }

  return (
    <Sheet open onClose={onClose} title="Tangkap ide" footer={
      <Button variant="primary" size="lg" block onClick={save} disabled={busy}>Simpan ide</Button>
    }>
      <div className="field">
        <label className="sr" htmlFor="cap-text">Ide</label>
        <AutoTextarea id="cap-text" value={text} onChange={(v) => { setText(v); setErr('') }} minRows={5} placeholder="Lagi kepikiran apa? Simpan dulu, bentuknya bisa menyusul." data-autofocus
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }} aria-invalid={!!err} aria-describedby="cap-err" />
        <div className="row between xs muted"><span id="cap-err" className="field-error" role="alert">{err}</span><span className="tnum">{text.length} karakter</span></div>
      </div>
      {showUrl ? (
        <div className="field">
          <label className="field-label" htmlFor="cap-url">Link referensi</label>
          <input id="cap-url" className="input" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      ) : (
        <div><Button size="sm" icon={<Paperclip size={16} />} onClick={() => setShowUrl(true)}>Tambah referensi</Button></div>
      )}
      <div className="field">
        <span className="field-label">Untuk channel (opsional)</span>
        <Chips label="Channel" value={ch} onChange={setCh} options={[{ value: 'none', label: 'Belum tahu' }, { value: 'instagram', label: 'Instagram' }, { value: 'threads', label: 'Threads' }]} />
      </div>
      <div className="field">
        <span className="field-label muted">Atau langsung jadikan</span>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {([['instagram', 'Instagram', Instagram], ['threads', 'Threads', AtSign], ['task', 'Tugas produksi', ListChecks], ['resource', 'Resource', FileText]] as const).map(([k, l, I]) => (
            <button key={k} className="card tap col gap6" style={{ alignItems: 'center', padding: '12px 4px', fontSize: 12, fontWeight: 550, textAlign: 'center' }} onClick={() => switchTo(k)}>
              <I size={22} strokeWidth={1.7} />{l}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

export function NewContentSheet({ onClose, channel = 'instagram', text = '' }: { onClose: () => void; channel?: Channel; text?: string }) {
  const [ch, setCh] = useState<Channel>(channel)
  const [fmt, setFmt] = useState<Format>('reel')
  const [title, setTitle] = useState(deriveTitle(text) === 'Thread tanpa judul' ? '' : deriveTitle(text))
  const create = () => {
    if (ch === 'threads') { const c = createThread({ text }); onClose(); go(`/threads/${c.id}`) }
    else {
      const c = createInstagram({ title, format: fmt })
      if (text.trim() && text.trim() !== title.trim()) {
        patch('contents', c.id, { notes: text })
      }
      onClose(); go(`/instagram/${c.id}?tab=write`)
    }
  }
  return (
    <Sheet open onClose={onClose} title="Draft baru" footer={<Button variant="primary" size="lg" block onClick={create}>Buat draft</Button>}>
      <Segmented label="Channel" value={ch} onChange={setCh} options={[{ value: 'instagram', label: 'Instagram' }, { value: 'threads', label: 'Threads' }]} />
      {ch === 'instagram' ? (
        <>
          <div className="field"><label className="field-label" htmlFor="nc-title">Judul</label><input id="nc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul kerja" data-autofocus /></div>
          <div className="field"><span className="field-label">Format</span>
            <Chips label="Format" value={fmt} onChange={setFmt} options={[{ value: 'reel', label: 'Reel' }, { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' }]} /></div>
          {text.trim() && <p className="small muted">Teks ide disimpan di Catatan draft.</p>}
        </>
      ) : (
        <div className="card"><p className="pre body-text">{text || 'Thread kosong, langsung mulai nulis di editor.'}</p></div>
      )}
    </Sheet>
  )
}
