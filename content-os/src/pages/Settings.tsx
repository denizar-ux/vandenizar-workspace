import React, { useEffect, useState } from 'react'
import { ArrowLeft, LogOut, Download, Plus, ChevronRight, Trash2, Bell, BellOff } from 'lucide-react'
import { settings, patch, P, flush, pendingCount, clearLocal, serialize, uid } from '../lib/store'
import { slots, newSlot, saveSlot, deleteSlot, pillars, formats, saveTag, deleteTag, tagUsage, pillarName, formatName, igItems, notifyPrefs, setNotify } from '../lib/model'
import { saveFile } from '../lib/download'
import { todayKey, WEEKDAYS, WEEKDAYS_S } from '../lib/time'
import { back } from '../lib/router'
import { sb } from '../lib/supabase'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { PageHead, SaveBadge } from '../ui/Shell'
import { Button, IconBtn, Field, Segmented, Chips, Sheet, ask, toast, copyOrShow, cx } from '../ui/kit'
import { TINTS, type Slot, type Tag } from '../lib/types'
import { pushSupported, pushStatus, enablePush, disablePush, testPush, isIOS, isStandalone } from '../lib/push'

type TagKind = 'pillars' | 'formats'

export default function Settings() {
  const st = settings()
  const [theme, setT] = useState<Theme>(getTheme())
  const [exportText, setExportText] = useState<string | null>(null)
  const [slot, setSlot] = useState<{ s: Slot; isNew: boolean } | null>(null)
  const [tag, setTag] = useState<{ kind: TagKind; t: Tag; isNew: boolean } | null>(null)

  const signOut = async () => {
    await flush()
    const n = pendingCount()
    const a = await ask({ title: 'Sign out of this device?', body: n ? `${n} change${n > 1 ? 's' : ''} haven't synced yet (offline) and will be lost on this device.` : 'Your data stays safe in the database.', confirm: 'Sign out', danger: n > 0 })
    if (a !== 'confirm') return
    clearLocal(); await sb.auth.signOut(); location.reload()
  }
  const doExport = async () => {
    await flush()
    const json = JSON.stringify({ app: 'vandenizar-content-os', exportedAt: new Date().toISOString(), data: serialize() }, null, 1)
    const r = await saveFile(`content-os-${todayKey(st.timezone)}.json`, json)
    if (r === 'saved') toast('Backup downloaded'); else if (r !== 'declined') setExportText(json)
  }

  return (
    <main className="main">
      <div className="topbar"><IconBtn label="Back" onClick={() => back('/today')}><ArrowLeft size={22} /></IconBtn><span className="grow" /><SaveBadge /></div>
      <PageHead title="Settings." />
      <div className="stack-lg">
        <section className="stack">
          <div><h2 className="h2">Weekly slots</h2><p className="muted small mt4">Your posting rhythm. Every week gets these slots on Today.</p></div>
          <div className="list">
            {slots().map((s) => (
              <button key={s.id} className="li" onClick={() => setSlot({ s: { ...s }, isNew: false })}>
                <span className={cx('pick-dot', 'bg-' + s.tint)} />
                <span className="li-main"><span className="li-title">{s.name}</span><span className="li-sub">{[WEEKDAYS[s.day], formatName(s.format), pillarName(s.pillar)].filter(Boolean).join(' · ')}</span></span>
                <ChevronRight size={18} className="muted" />
              </button>
            ))}
          </div>
          <Button size="sm" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => setSlot({ s: newSlot(), isNew: true })}>Add slot</Button>
        </section>

        <TagSection kind="pillars" title="Pillars" sub="What your content is about. Used to filter Instagram." list={pillars()} onEdit={(t, isNew) => setTag({ kind: 'pillars', t, isNew })} />
        <TagSection kind="formats" title="Formats" list={formats()} onEdit={(t, isNew) => setTag({ kind: 'formats', t, isNew })} />

        <Notifications />

        <section className="stack">
          <h2 className="h2">You</h2>
          <div className="card stack">
            <Field label="Name" htmlFor="s-name"><input id="s-name" className="input" value={st.displayName} onChange={(e) => patch('settings', 'settings', { displayName: e.target.value })} /></Field>
            <div className="field"><span className="field-label">Appearance</span>
              <Segmented label="Appearance" value={theme} onChange={(v) => { setT(v); setTheme(v) }} options={[{ value: 'system', label: 'Match phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
          </div>
        </section>

        <section className="stack">
          <h2 className="h2">Account & data</h2>
          <div className="card stack">
            {P.email ? <p className="small">Signed in as <b>{P.email}</b>. Everything syncs between your iPhone and Mac.</p> : <p className="small muted">Not signed in. Data is only on this device.</p>}
            <div className="row gap8 wrap">
              <Button size="sm" icon={<Download size={16} />} onClick={doExport}>Download backup</Button>
              {P.email && <Button size="sm" variant="ghost" icon={<LogOut size={16} />} onClick={signOut}>Sign out</Button>}
            </div>
          </div>
        </section>
      </div>

      {slot && <SlotSheet init={slot.s} isNew={slot.isNew} onClose={() => setSlot(null)} />}
      {tag && <TagSheet kind={tag.kind} init={tag.t} isNew={tag.isNew} onClose={() => setTag(null)} />}
      <Sheet open={!!exportText} onClose={() => setExportText(null)} title="Copy backup">
        <Button onClick={() => copyOrShow(exportText || '', 'Copy backup', 'Backup copied')}>Copy all</Button>
        <textarea className="input mono-ish" rows={8} readOnly value={exportText || ''} />
      </Sheet>
    </main>
  )
}

function TagSection({ kind, title, sub, list, onEdit }: { kind: TagKind; title: string; sub?: string; list: Tag[]; onEdit: (t: Tag, isNew: boolean) => void }) {
  return (
    <section className="stack">
      <div><h2 className="h2">{title}</h2>{sub && <p className="muted small mt4">{sub}</p>}</div>
      <div className="chips">
        {list.map((t) => <button key={t.id} className="chip" onClick={() => onEdit({ ...t }, false)}>{t.name}</button>)}
        <button className="chip chip-add" onClick={() => onEdit({ id: uid(), name: '' }, true)} aria-label={`Add ${kind === 'pillars' ? 'pillar' : 'format'}`}><Plus size={16} />Add</button>
      </div>
    </section>
  )
}

function SlotSheet({ init, isNew, onClose }: { init: Slot; isNew: boolean; onClose: () => void }) {
  const [s, setS] = useState<Slot>(init)
  const set = (p: Partial<Slot>) => setS({ ...s, ...p })
  const save = () => { if (!s.name.trim()) return; saveSlot({ ...s, name: s.name.trim(), hint: (s.hint || '').trim() }); toast(isNew ? 'Slot added' : 'Slot saved'); onClose() }
  const del = async () => {
    const open = igItems().filter((i) => i.slot === s.id && i.stage !== 'done').length
    const a = await ask({ title: `Delete “${init.name}”?`, body: open ? `${open} unposted post${open > 1 ? 's' : ''} in this slot stay in Instagram with their dates, just without a slot.` : 'It disappears from every week. Posted posts are kept.', confirm: 'Delete slot', danger: true })
    if (a !== 'confirm') return
    deleteSlot(s.id); toast('Slot deleted'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={isNew ? 'New slot' : 'Edit slot'} footer={
      <div className="row gap8">
        {!isNew && <IconBtn label="Delete slot" onClick={del}><Trash2 size={19} /></IconBtn>}
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!s.name.trim()} onClick={save}>Save</Button>
      </div>
    }>
      <Field label="Name" htmlFor="sl-name"><input id="sl-name" className="input" data-autofocus={isNew || undefined} value={s.name} placeholder="e.g. Shot vs Setup" onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="field"><span className="field-label">Day</span>
        <div className="daypick">{WEEKDAYS_S.map((d, i) => <button key={d} type="button" aria-pressed={s.day === i} className={cx('chip', s.day === i && 'on')} onClick={() => set({ day: i })}>{d}</button>)}</div>
      </div>
      <div className="field"><span className="field-label">Color</span>
        <div className="row gap8 wrap">{TINTS.map((t) => <button key={t} type="button" aria-label={t} aria-pressed={s.tint === t} className={cx('swatch', 'bg-' + t, s.tint === t && 'on')} onClick={() => set({ tint: t })} />)}</div>
      </div>
      {pillars().length > 0 && <div className="field"><span className="field-label">Default pillar</span><Chips label="Default pillar" value={s.pillar || ''} onChange={(v) => set({ pillar: v || null })} options={[...pillars().map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'None' }]} /></div>}
      {formats().length > 0 && <div className="field"><span className="field-label">Default format</span><Chips label="Default format" value={s.format || ''} onChange={(v) => set({ format: v || null })} options={[...formats().map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'None' }]} /></div>}
      <Field label="Reminder (optional)" htmlFor="sl-hint" hint="Shows on Today when this slot is empty."><input id="sl-hint" className="input" value={s.hint || ''} placeholder="e.g. The final shot next to how it was made." onChange={(e) => set({ hint: e.target.value })} /></Field>
    </Sheet>
  )
}

function TagSheet({ kind, init, isNew, onClose }: { kind: TagKind; init: Tag; isNew: boolean; onClose: () => void }) {
  const [name, setName] = useState(init.name)
  const noun = kind === 'pillars' ? 'pillar' : 'format'
  const save = () => { if (!name.trim()) return; saveTag(kind, { ...init, name: name.trim() }); onClose() }
  const del = async () => {
    const n = tagUsage(kind, init.id)
    const a = await ask({ title: `Delete “${init.name}”?`, body: n ? `${n} post${n > 1 ? 's' : ''} use it. They keep everything else.` : undefined, confirm: 'Delete', danger: true })
    if (a !== 'confirm') return
    deleteTag(kind, init.id); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={isNew ? `New ${noun}` : `Edit ${noun}`} footer={
      <div className="row gap8">
        {!isNew && <IconBtn label={`Delete ${noun}`} onClick={del}><Trash2 size={19} /></IconBtn>}
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={save}>Save</Button>
      </div>
    }>
      <Field label="Name" htmlFor="tg-name"><input id="tg-name" className="input" data-autofocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} /></Field>
    </Sheet>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('switch', on && 'on')} onClick={() => onChange(!on)}><span /></button>
}

function Notifications() {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const n = notifyPrefs()
  useEffect(() => { pushStatus().then(setOn) }, [])
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok) } catch (e: any) { toast(e?.message || 'Something went wrong', undefined, 'error') }
    setBusy(false); setOn(await pushStatus())
  }
  const needsHome = isIOS() && !isStandalone()
  return (
    <section className="stack">
      <div><h2 className="h2">Notifications</h2><p className="muted small mt4">Sent to this phone even when the app is closed. Times are WIB (Jakarta).</p></div>
      <div className="card stack">
        {on ? (
          <div className="row gap8 wrap">
            <span className="grow row gap6 small" style={{ fontWeight: 600 }}><Bell size={17} />On for this device</span>
            <Button size="sm" disabled={busy} onClick={() => run(async () => { const n = await testPush(); if (!n) throw new Error('No device received it. Try turning it off and on again.') }, 'Test sent')}>Send test</Button>
            <Button size="sm" variant="ghost" icon={<BellOff size={15} />} disabled={busy} onClick={() => run(disablePush, 'Turned off for this device')}>Turn off</Button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {needsHome
              ? <p className="small">On iPhone, notifications only work from the Home Screen app. Tap <b>Share</b>, then <b>Add to Home Screen</b>, open Content OS from there and come back here.</p>
              : !pushSupported() ? <p className="small muted">This browser can't show notifications.</p> : null}
            {!needsHome && pushSupported() && <Button variant="primary" icon={<Bell size={16} />} disabled={busy || on === null} style={{ alignSelf: 'flex-start' }} onClick={() => run(enablePush, 'Notifications on')}>Turn on for this device</Button>}
          </div>
        )}
        <div className="nrow">
          <div className="grow"><div className="nrow-title">Morning summary</div><div className="small muted">Only on days with a shoot or a post.</div></div>
          <input type="time" className="input time" aria-label="Morning summary time" value={n.morningTime} disabled={!n.morning} onChange={(e) => e.target.value && setNotify({ morningTime: e.target.value })} />
          <Switch label="Morning summary" on={n.morning} onChange={(v) => setNotify({ morning: v })} />
        </div>
        <div className="nrow">
          <div className="grow"><div className="nrow-title">Time to post</div><div className="small muted">On the post day of each planned post.</div></div>
          <input type="time" className="input time" aria-label="Post reminder time" value={n.postTime} disabled={!n.postReminder} onChange={(e) => e.target.value && setNotify({ postTime: e.target.value })} />
          <Switch label="Post reminder" on={n.postReminder} onChange={(v) => setNotify({ postReminder: v })} />
        </div>
      </div>
    </section>
  )
}
