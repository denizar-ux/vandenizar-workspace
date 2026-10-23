import React, { useRef, useState } from 'react'
import { LogOut, ArrowLeft, Download, Upload, Database, Archive as ArchiveIcon, Plus, Sparkles, Trash2, FileText, ChevronRight } from 'lucide-react'
import { settings, patch, all, put, uid, P, replaceAll, flush, pendingCount, clearLocal } from '../lib/store'
import { sb } from '../lib/supabase'
import { setLifecycle } from '../lib/model'
import { exportJson, validateImport, type ImportCheck } from '../lib/backup'
import { saveFile } from '../lib/download'
import { loadDemo, clearDemo } from '../lib/seed'
import { tzLabel, todayKey } from '../lib/time'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Field, Segmented, Sheet, ask, toast, copyOrShow, Accordion, Chips, cx } from '../ui/kit'
import { TemplateEditor } from '../sheets/TemplateEditor'
import { FORMAT_LABEL } from '../lib/templates'
import type { Taxonomy } from '../lib/types'

const ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC']
const COLL_LABEL: Record<string, string> = { ideas: 'ide', contents: 'konten', sections: 'bagian naskah', posts: 'post Threads', tasks: 'tugas', shots: 'shot', readiness: 'checklist', batches: 'sesi', resources: 'bahan', links: 'tautan bahan', templates: 'template', reviews: 'review', taxonomy: 'label', assets: 'gambar', settings: 'pengaturan' }

export default function Settings() {
  const st = settings()
  const [tpl, setTpl] = useState<string | null | undefined>(undefined)
  const [imp, setImp] = useState<{ check: ImportCheck; name: string } | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (p: Partial<typeof st>) => patch('settings', 'settings', p)
  const signOut = async () => {
    await flush()
    const n = pendingCount()
    const a = await ask({ title: 'Keluar dari perangkat ini?', body: n ? `${n} perubahan belum terkirim karena offline dan akan hilang dari perangkat ini.` : 'Data tetap aman di database. Salinan di perangkat ini dihapus.', confirm: 'Keluar', danger: n > 0 })
    if (a !== 'confirm') return
    clearLocal()
    await sb.auth.signOut()
    location.reload()
  }

  const doExport = async () => {
    await flush()
    const json = exportJson()
    const r = await saveFile(`content-os-backup-${todayKey(st.timezone)}.json`, json)
    if (r === 'saved') toast('Backup disimpan')
    else if (r === 'declined') toast('Download dibatalkan')
    else setExportText(json)
  }
  const onImportFile = async (f?: File) => {
    if (!f) return
    const text = await f.text()
    setImp({ check: validateImport(text), name: f.name })
    if (fileRef.current) fileRef.current.value = ''
  }
  const confirmImport = async () => {
    if (!imp?.check.data) return
    const a = await ask({ title: 'Ganti seluruh workspace?', body: 'Semua data sekarang diganti isi backup. Simpan backup data sekarang dulu kalau ragu.', confirm: 'Ganti workspace', extra: 'Download backup sekarang dulu', danger: true })
    if (a === 'extra') { await doExport(); return }
    if (a !== 'confirm') return
    try {
      await replaceAll(imp.check.data)
      setImp(null); toast('Workspace dipulihkan dari backup')
    } catch (e: any) { toast('Import gagal: ' + (e?.message || 'tidak diketahui'), undefined, 'error') }
  }

  return (
    <main className="main">
      <div className="topbar"><IconBtn label="Kembali" onClick={() => back('/overview')}><ArrowLeft size={22} /></IconBtn><span className="grow" /><SaveBadge /></div>
      <h1 className="page-title mt8">Settings.</h1>
      <div className="stack-lg mt16">
        <section className="card stack">
          <h2 className="h2">Profil & waktu</h2>
          {P.email && <div className="row gap8"><span className="grow small">Masuk sebagai <b>{P.email}</b></span><Button size="sm" variant="soft" icon={<LogOut size={16} />} onClick={signOut}>Keluar</Button></div>}
          <Field label="Nama di sapaan" htmlFor="s-name"><input id="s-name" className="input" value={st.displayName} onChange={(e) => set({ displayName: e.target.value })} /></Field>
          <Field label="Zona waktu" htmlFor="s-tz" hint={`Semua jadwal tampil dalam ${tzLabel(st.timezone)}. Waktu tersimpan dalam UTC.`}>
            <select id="s-tz" className="input" value={st.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {ZONES.map((z) => <option key={z} value={z}>{z} ({tzLabel(z)})</option>)}
            </select>
          </Field>
          <div className="field"><span className="field-label">Format jam</span>
            <Segmented label="Format jam" value={st.hour12 ? '12' : '24'} onChange={(v) => set({ hour12: v === '12' })} options={[{ value: '24', label: '24 jam (19.00)' }, { value: '12', label: '12 jam (7.00 PM)' }]} /></div>
          <Field label="Estimasi default tugas" htmlFor="s-est">
            <select id="s-est" className="input" value={st.defaultEstimate} onChange={(e) => set({ defaultEstimate: +e.target.value })}>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} menit</option>)}
            </select>
          </Field>
        </section>

        <section className="card stack">
          <h2 className="h2">Pilar, seri & tag</h2>
          <TaxEditor type="pillar" title="Pilar konten" placeholder="Process" />
          <TaxEditor type="series" title="Seri" placeholder="Project Reset" />
          <TaxEditor type="tag" title="Tag" placeholder="grading" />
        </section>

        <section className="card stack">
          <div className="section-head"><h2 className="h2">Template</h2><Button size="sm" icon={<Plus size={16} />} onClick={() => setTpl(null)}>Baru</Button></div>
          <div className="list">
            {all('templates').filter((t) => t.lifecycle !== 'deleted').sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
              <button key={t.id} className="li" onClick={() => setTpl(t.id)}>
                <FileText size={18} /><span className="li-main"><span className="li-title">{t.name}</span><span className="li-sub">{t.compatibleFormats.map((f) => FORMAT_LABEL[f]).join(', ')}{t.lifecycle === 'archived' ? ' · diarsip' : ''}</span></span>
                {t.lifecycle === 'archived' ? <span className="small" onClick={(e) => { e.stopPropagation(); setLifecycle('templates', t.id, 'active') }}>Pulihkan</span> : <ChevronRight size={18} />}
              </button>
            ))}
          </div>
          <p className="xs muted">Edit template hanya berlaku untuk draft baru.</p>
        </section>

        <section className="card stack">
          <h2 className="h2">Posting</h2>
          <Field label="Batas karakter per post Threads" htmlFor="s-limit" hint="Kosongkan untuk hanya menampilkan jumlah karakter. Isi sesuai batas resmi Threads yang berlaku.">
            <input id="s-limit" className="input" type="number" min={1} inputMode="numeric" value={st.threadsCharLimit ?? ''} onChange={(e) => set({ threadsCharLimit: e.target.value ? Math.max(1, +e.target.value) : null })} />
          </Field>
          <Field label="Link tombol Buka Instagram" htmlFor="s-ig"><input id="s-ig" className="input" type="url" value={st.instagramUrl} onChange={(e) => set({ instagramUrl: e.target.value })} /></Field>
          <Field label="Link tombol Buka Threads" htmlFor="s-th"><input id="s-th" className="input" type="url" value={st.threadsUrl} onChange={(e) => set({ threadsUrl: e.target.value })} /></Field>
        </section>

        <section className="card stack">
          <h2 className="h2">Data & backup</h2>
          <div className="banner" style={{ background: 'rgba(17,17,15,.04)' }}><Database size={18} />
            <span className="grow small">{P.mode === 'synced'
              ? `Tersinkron ke database lewat akun ${P.email || ''}. Edit saat offline disimpan di perangkat ini dan dikirim begitu online. Ekspor backup berkala untuk salinan sendiri.`
              : 'Data tersimpan di browser perangkat ini. Ekspor backup untuk menjaga salinan.'}</span></div>
          <div className="row gap8 wrap">
            <Button icon={<Download size={18} />} onClick={doExport}>Ekspor backup</Button>
            <label className="btn btn-secondary"><Upload size={18} /><span>Pulihkan dari backup</span><input ref={fileRef} type="file" accept="application/json,.json" className="sr" onChange={(e) => onImportFile(e.target.files?.[0])} /></label>
          </div>
          <p className="xs muted">Backup berisi semua teks, jadwal, relasi, dan thumbnail. File video dan isi folder SSD tidak ikut, hanya lokasi/link-nya.</p>
          <div className="row gap8 wrap">
            {!st.demoLoaded ? <Button size="sm" variant="soft" icon={<Sparkles size={16} />} onClick={() => { loadDemo(); toast('Contoh dimuat, ditandai "Contoh"') }}>Muat contoh</Button>
              : <Button size="sm" variant="soft" icon={<Trash2 size={16} />} onClick={async () => { const a = await ask({ title: 'Hapus semua contoh?', body: 'Item bertanda Contoh dihapus permanen. Data milik lu tidak tersentuh.', confirm: 'Hapus contoh', danger: true }); if (a === 'confirm') { clearDemo(); toast('Contoh dihapus') } }}>Hapus contoh</Button>}
            <Button size="sm" variant="soft" icon={<ArchiveIcon size={16} />} onClick={() => go('/archive')}>Parkir, arsip & sampah</Button>
          </div>
        </section>
      </div>

      {tpl !== undefined && <TemplateEditor id={tpl || undefined} onClose={() => setTpl(undefined)} />}

      <Sheet open={!!imp} onClose={() => setImp(null)} title="Pulihkan dari backup" footer={imp?.check.ok ? <Button variant="danger" size="lg" block onClick={confirmImport}>Ganti seluruh workspace</Button> : undefined}>
        {imp && (imp.check.ok ? (
          <>
            <p className="small">{imp.name} valid. Isinya:</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {Object.entries(imp.check.counts).filter(([, n]) => n).map(([k, n]) => <li key={k}>{n} {COLL_LABEL[k] || k}</li>)}
            </ul>
            <p className="small muted">Workspace sekarang akan diganti seluruhnya.</p>
          </>
        ) : (
          <>
            <p className="small field-error">Backup tidak bisa dipakai. Workspace sekarang tidak diubah.</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{imp.check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </>
        ))}
      </Sheet>
      <Sheet open={!!exportText} onClose={() => setExportText(null)} title="Salin backup">
        <p className="small muted">Download tidak tersedia di tampilan ini. Salin teks ini lalu simpan sebagai file .json.</p>
        <Button onClick={() => copyOrShow(exportText || '', 'Salin backup', 'Backup tersalin')}>Salin semua</Button>
        <textarea className="input mono-ish" rows={8} readOnly value={exportText || ''} onFocus={(e) => e.currentTarget.select()} />
      </Sheet>
    </main>
  )
}

function TaxEditor({ type, title, placeholder }: { type: Taxonomy['type']; title: string; placeholder: string }) {
  const [v, setV] = useState('')
  const [showArch, setShowArch] = useState(false)
  const items = all('taxonomy').filter((t) => t.type === type && t.lifecycle !== 'deleted').sort((a, b) => a.label.localeCompare(b.label))
  const live = items.filter((t) => t.lifecycle === 'active'), arch = items.filter((t) => t.lifecycle !== 'active')
  const add = (e: React.FormEvent) => {
    e.preventDefault(); const l = v.trim(); if (!l) return
    if (items.some((t) => t.label.toLowerCase() === l.toLowerCase())) { toast('Sudah ada'); return }
    put('taxonomy', { id: uid(), type, label: l, lifecycle: 'active', createdAt: '', updatedAt: '' }); setV('')
  }
  return (
    <Accordion title={`${title} · ${live.length}`}>
      {live.map((t) => (
        <div key={t.id} className="row gap4">
          <input className="input" aria-label={`Ubah nama ${t.label}`} value={t.label} onChange={(e) => patch('taxonomy', t.id, { label: e.target.value })} />
          <IconBtn label={`Arsip ${t.label}`} onClick={() => { setLifecycle('taxonomy', t.id, 'archived'); toast('Diarsip. Konten lama tetap menampilkan label ini.') }}><ArchiveIcon size={17} /></IconBtn>
        </div>
      ))}
      <form className="row gap8" onSubmit={add}><input className="input" aria-label={`${title} baru`} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} /><IconBtn label="Tambah" type="submit" className="boxed"><Plus size={18} /></IconBtn></form>
      {arch.length > 0 && <button className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowArch(!showArch)}>{showArch ? 'Sembunyikan' : 'Lihat'} yang diarsip ({arch.length})</button>}
      {showArch && arch.map((t) => <div key={t.id} className="row gap8"><span className="grow small">{t.label}</span><Button size="sm" onClick={() => setLifecycle('taxonomy', t.id, 'active')}>Pulihkan</Button></div>)}
    </Accordion>
  )
}
