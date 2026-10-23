import React, { useState } from 'react'
import { Plus, Search as SearchIcon, AtSign, Image as ImageIcon, X, FolderOpen } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { all, get, put, patch, uid, remove } from '../lib/store'
import { linkResource, sectionsOf, postsOf, createInstagram, createThread, resourcesOf } from '../lib/model'
import { storeImage, assetUrl } from '../lib/image'
import { safeUrl } from '../lib/prefs'
import { go } from '../lib/router'
import { Sheet, Button, Field, Chips, toast, ask, Empty, IconBtn, Segmented } from '../ui/kit'
import { openSheet } from '../ui/bus'
import type { Resource, ResourceType, SourceKind, VoiceProfile } from '../lib/types'

export const RTYPE_LABEL: Record<ResourceType, string> = { footage: 'Footage', reference: 'Referensi', hook: 'Hook', voice: 'Brand voice' }
export const SKIND_LABEL: Record<SourceKind, string> = { text: 'Catatan', web_link: 'Link', local_path: 'Lokasi folder', image: 'Gambar' }

export function ResourceForm({ onClose, id, defaults = {}, linkTo }: { onClose: () => void; id?: string; defaults?: Partial<Resource>; linkTo?: string }) {
  const ex = get('resources', id)
  const b: Partial<Resource> = ex || defaults
  const [type, setType] = useState<ResourceType>(b.type || 'reference')
  const [kind, setKind] = useState<SourceKind>(b.sourceKind || (b.type === 'footage' ? 'local_path' : 'text'))
  const [title, setTitle] = useState(b.title || '')
  const [body, setBody] = useState(b.body || '')
  const [url, setUrl] = useState(b.url || '')
  const [path, setPath] = useState(b.localPath || '')
  const [tags, setTags] = useState((b.tags || []).join(', '))
  const [assetId, setAssetId] = useState<string | null>(b.assetId || null)
  const [voice, setVoice] = useState<VoiceProfile>(b.voice || { tone: '', audience: '', prefer: '', avoid: '', examples: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (f?: File) => {
    if (!f) return
    setBusy(true); setErr('')
    try { const a = await storeImage(f); setAssetId(a.id) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const save = () => {
    if (!title.trim()) { setErr('Judul wajib diisi.'); return }
    if (type !== 'voice') {
      if (kind === 'web_link' && !safeUrl(url)) { setErr('Link harus valid dan diawali http:// atau https://'); return }
      if (kind === 'local_path' && !path.trim()) { setErr('Isi lokasi folder atau file.'); return }
      if (kind === 'image' && !assetId) { setErr('Pilih gambar dulu.'); return }
    }
    const rec: Resource = {
      ...(ex || { id: uid(), pinned: false, lifecycle: 'active', createdAt: '', updatedAt: '' }), type,
      sourceKind: type === 'voice' || type === 'hook' ? 'text' : kind, title: title.trim(), body,
      url: kind === 'web_link' ? safeUrl(url) || '' : url && safeUrl(url) ? safeUrl(url)! : undefined,
      localPath: kind === 'local_path' ? path.trim() : undefined, assetId,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean), voice: type === 'voice' ? voice : undefined,
    } as Resource
    if (ex?.assetId && ex.assetId !== assetId) remove('assets', ex.assetId)
    put('resources', rec)
    if (linkTo) linkResource(linkTo, rec.id)
    toast(ex ? 'Bahan diperbarui' : linkTo ? 'Bahan ditambahkan dan ditautkan' : 'Bahan ditambahkan')
    onClose()
  }

  const img = assetUrl(assetId)
  return (
    <Sheet open onClose={onClose} title={ex ? 'Edit bahan' : 'Bahan baru'} footer={<Button variant="primary" size="lg" block onClick={save} disabled={busy}>Simpan</Button>}>
      <div className="field"><span className="field-label">Jenis</span>
        <Chips label="Jenis bahan" value={type} onChange={(t) => { setType(t); if (t === 'footage' && kind === 'text') setKind('local_path') }} options={(Object.keys(RTYPE_LABEL) as ResourceType[]).map((t) => ({ value: t, label: RTYPE_LABEL[t] }))} /></div>
      <Field label="Judul" htmlFor="r-title"><input id="r-title" className="input" value={title} onChange={(e) => { setTitle(e.target.value); setErr('') }} data-autofocus={!ex || undefined} /></Field>
      {type === 'voice' ? (
        <>
          {([['tone', 'Tone'], ['audience', 'Audiens'], ['prefer', 'Kata yang disukai'], ['avoid', 'Kata yang dihindari'], ['examples', 'Contoh kalimat']] as [keyof VoiceProfile, string][]).map(([k, l]) => (
            <Field key={k} label={l} htmlFor={'v-' + k}><textarea id={'v-' + k} className="input" rows={2} value={voice[k]} onChange={(e) => setVoice({ ...voice, [k]: e.target.value })} /></Field>
          ))}
        </>
      ) : type === 'hook' ? (
        <Field label="Teks hook" htmlFor="r-body"><textarea id="r-body" className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      ) : (
        <>
          <div className="field"><span className="field-label">Sumber</span>
            <Segmented label="Sumber" value={kind} onChange={setKind} options={(['local_path', 'web_link', 'image', 'text'] as SourceKind[]).map((k) => ({ value: k, label: SKIND_LABEL[k] }))} /></div>
          {kind === 'web_link' && <Field label="Link" htmlFor="r-url" hint="Drive, Pinterest, atau link apa pun. Tidak diambil otomatis."><input id="r-url" className="input" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
          {kind === 'local_path' && <Field label="Lokasi di SSD/komputer" htmlFor="r-path" hint="Disimpan sebagai teks. Browser tidak bisa membuka file lokal langsung."><input id="r-path" className="input" placeholder="SSD / Ainayya / BTS" value={path} onChange={(e) => setPath(e.target.value)} /></Field>}
          {(kind === 'image' || type === 'reference') && (
            <div className="field">
              <span className="field-label">{kind === 'image' ? 'Gambar' : 'Thumbnail (opsional)'}</span>
              {img ? (
                <div className="row gap8"><img src={img} alt="" className="rimg" style={{ maxWidth: 220 }} /><IconBtn label="Hapus gambar" onClick={() => setAssetId(null)}><X size={18} /></IconBtn></div>
              ) : (
                <label className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}><ImageIcon size={18} /><span>{busy ? 'Memproses…' : 'Pilih gambar'}</span>
                  <input type="file" accept="image/*" className="sr" onChange={(e) => onFile(e.target.files?.[0])} /></label>
              )}
              <span className="field-hint">Maks 5 MB. Diperkecil otomatis.</span>
            </div>
          )}
          <Field label="Catatan" htmlFor="r-body" hint={type === 'reference' ? 'Kenapa ini relevan?' : undefined}><textarea id="r-body" className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        </>
      )}
      <Field label="Tags" htmlFor="r-tags" hint="Pisahkan dengan koma"><input id="r-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="close-up, texture" /></Field>
      {err && <p className="field-error" role="alert">{err}</p>}
    </Sheet>
  )
}

/** From a resource: choose content to link (or make a new draft); hooks can insert text. */
export function UseResourceSheet({ onClose, resourceId }: { onClose: () => void; resourceId: string }) {
  const r = get('resources', resourceId)
  const [q, setQ] = useState('')
  if (!r) return null
  const list = all('contents').filter((c) => c.lifecycle === 'active' && c.status !== 'published' && c.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
  const used = new Set(all('links').filter((l) => l.resourceId === r.id).map((l) => l.contentId))

  const apply = async (contentId: string) => {
    const c = get('contents', contentId)!
    const added = linkResource(contentId, r.id)
    if (r.type === 'hook' && r.body.trim()) {
      const target = c.channel === 'threads' ? postsOf(c.id)[0] : sectionsOf(c.id).find((s) => s.key === 'hook') || sectionsOf(c.id)[0]
      if (target) {
        const cur = target.body.trim()
        const coll = c.channel === 'threads' ? 'posts' : 'sections'
        if (!cur) patch(coll as any, target.id, { body: r.body })
        else {
          const ans = await ask({ title: 'Masukkan hook?', body: <><p>Isi sekarang:</p><p className="pre" style={{ margin: '6px 0', color: 'var(--ink)' }}>{cur}</p><p>Hook baru:</p><p className="pre" style={{ marginTop: 6, color: 'var(--ink)' }}>{r.body}</p></>, confirm: 'Tambahkan di bawah', extra: 'Ganti isi', cancel: 'Tautkan saja' })
          if (ans === 'confirm') patch(coll as any, target.id, { body: cur + '\n' + r.body })
          if (ans === 'extra') {
            const sure = await ask({ title: 'Ganti isi hook?', body: 'Teks lama akan diganti dengan hook ini.', confirm: 'Ganti', danger: true })
            if (sure === 'confirm') patch(coll as any, target.id, { body: r.body })
          }
        }
      }
    }
    toast(added ? `Ditautkan ke ${c.title}` : 'Sudah tertaut ke konten ini', { label: 'Buka', run: () => go(`/${c.channel}/${c.id}`) })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Pakai di konten" footer={
      <div className="row gap8">
        <Button icon={<Instagram size={18} />} className="grow" onClick={() => { const c = createInstagram({ title: r.title }); apply(c.id) }}>Draft Instagram</Button>
        <Button icon={<AtSign size={18} />} className="grow" onClick={() => { const c = createThread({ text: '' }); apply(c.id) }}>Draft Threads</Button>
      </div>
    }>
      <p className="small muted">{r.title} · {RTYPE_LABEL[r.type]}</p>
      <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari konten" placeholder="Cari konten" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus /></div>
      {list.length === 0 ? <Empty title="Tidak ada konten aktif" body="Buat draft baru di bawah." /> : (
        <div className="list">
          {list.slice(0, 40).map((c) => (
            <button key={c.id} className="li" onClick={() => apply(c.id)} disabled={false}>
              {c.channel === 'threads' ? <AtSign size={18} /> : <Instagram size={18} />}
              <span className="li-main"><span className="li-title clamp2">{c.title}</span>{used.has(c.id) && <span className="li-sub">Sudah tertaut</span>}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/** From a content: choose a resource to link, or add a new one. */
export function LinkResourceSheet({ onClose, contentId }: { onClose: () => void; contentId: string }) {
  const [q, setQ] = useState('')
  const linked = new Set(resourcesOf(contentId).map((r) => r.id))
  const list = all('resources').filter((r) => r.lifecycle === 'active' && (r.title + ' ' + r.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt > a.updatedAt ? 1 : -1))
  return (
    <Sheet open onClose={onClose} title="Ambil referensi" footer={<Button icon={<Plus size={18} />} block onClick={() => { onClose(); openSheet({ type: 'resource', linkTo: contentId }) }}>Bahan baru</Button>}>
      <div className="search"><SearchIcon size={18} /><input className="input" aria-label="Cari bahan" placeholder="Cari bahan" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus /></div>
      {list.length === 0 ? <Empty icon={<FolderOpen size={22} />} title="Belum ada bahan" /> : (
        <div className="list">
          {list.map((r) => (
            <button key={r.id} className="li" disabled={linked.has(r.id)} onClick={() => { linkResource(contentId, r.id); toast('Referensi ditautkan'); onClose() }}>
              <FolderOpen size={18} />
              <span className="li-main"><span className="li-title">{r.title}</span><span className="li-sub">{RTYPE_LABEL[r.type]}{r.tags.length ? ' · ' + r.tags.join(', ') : ''}</span></span>
              {linked.has(r.id) && <span className="small muted">Tertaut</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
