import React, { useState } from 'react'
import { ArrowLeft, LogOut, Download } from 'lucide-react'
import { settings, patch, P, flush, pendingCount, clearLocal, serialize } from '../lib/store'
import { saveFile } from '../lib/download'
import { todayKey } from '../lib/time'
import { back } from '../lib/router'
import { sb } from '../lib/supabase'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { PageHead, SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Field, Segmented, ask, toast, copyOrShow, Sheet } from '../ui/kit'

export default function Settings() {
  const st = settings()
  const [theme, setT] = useState<Theme>(getTheme())
  const [exportText, setExportText] = useState<string | null>(null)

  const signOut = async () => {
    await flush()
    const n = pendingCount()
    const a = await ask({ title: 'Keluar dari perangkat ini?', body: n ? `${n} perubahan belum terkirim karena offline dan akan hilang dari perangkat ini.` : 'Data tetap aman di database.', confirm: 'Keluar', danger: n > 0 })
    if (a !== 'confirm') return
    clearLocal(); await sb.auth.signOut(); location.reload()
  }
  const doExport = async () => {
    await flush()
    const json = JSON.stringify({ app: 'vandenizar-content-os', exportedAt: new Date().toISOString(), data: serialize() }, null, 1)
    const r = await saveFile(`content-os-${todayKey(st.timezone)}.json`, json)
    if (r === 'saved') toast('Backup disimpan'); else if (r !== 'declined') setExportText(json)
  }

  return (
    <main className="main">
      <div className="topbar"><IconBtn label="Kembali" onClick={() => back('/week')}><ArrowLeft size={22} /></IconBtn><span className="grow" /><SaveBadge /></div>
      <PageHead title="Settings." />
      <div className="stack-lg">
        <section className="card stack">
          <Field label="Nama" htmlFor="s-name"><input id="s-name" className="input" value={st.displayName} onChange={(e) => patch('settings', 'settings', { displayName: e.target.value })} /></Field>
          <div className="field"><span className="field-label">Tampilan</span>
            <Segmented label="Tampilan" value={theme} onChange={(v) => { setT(v); setTheme(v) }} options={[{ value: 'system', label: 'Ikuti HP' }, { value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} /></div>
        </section>
        <section className="card stack">
          {P.email && <p className="small">Masuk sebagai <b>{P.email}</b>. Data tersinkron ke iPhone dan Mac.</p>}
          <div className="row gap8 wrap">
            <Button size="sm" icon={<Download size={16} />} onClick={doExport}>Download backup</Button>
            {P.email && <Button size="sm" variant="ghost" icon={<LogOut size={16} />} onClick={signOut}>Keluar</Button>}
          </div>
        </section>
      </div>
      <Sheet open={!!exportText} onClose={() => setExportText(null)} title="Salin backup">
        <Button onClick={() => copyOrShow(exportText || '', 'Salin backup', 'Backup tersalin')}>Salin semua</Button>
        <textarea className="input mono-ish" rows={8} readOnly value={exportText || ''} />
      </Sheet>
    </main>
  )
}
