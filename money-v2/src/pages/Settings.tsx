import React, { useRef, useState } from 'react'
import { ArrowLeft, Plus, Download, Upload, Copy, EyeOff, Trash2 } from 'lucide-react'
import * as M from '../lib/money'
import { go } from '../lib/router'
import { store, saveFile } from '../lib/store'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { today } from '../lib/date'
import { PageHead, SaveBadge } from '../ui/Shell'
import { Accordion, Segmented, Chips, Sheet, Button, Field, toast, ask, copyOrShow, IconBtn, cx } from '../ui/kit'
import { CatIc, CAT_ICONS } from '../ui/icons'
import { AccountPick } from '../ui/TxSheet'

const URL_BASE = 'https://claude.ai/artifact/Hx9qR3uSi4rppmbHCroATj'

export default function Settings() {
  const st = M.settings()
  const [name, setName] = useState(st.name)
  const [theme, setT] = useState<Theme>(getTheme())
  const c = M.counts()
  return (
    <main className="main">
      <div className="phonetop"><IconBtn label="Back" onClick={() => go('home')}><ArrowLeft size={22} /></IconBtn><div className="grow" /><SaveBadge /></div>
      <PageHead eyebrow="Money" title="Settings" />
      <div className="stack">
        <Accordion title="You and the look" defaultOpen>
          <Field label="Your name" htmlFor="s-name"><input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== st.name && M.setSettings({ name: name.trim() })} /></Field>
          <Field label="Appearance"><Segmented label="Appearance" value={theme} onChange={(v) => { setT(v); setTheme(v) }} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Field>
          <AccountPick label="Daily allowance from" value={st.allowanceAcc} onChange={(v) => M.setSettings({ allowanceAcc: v })} allowCredit={false} />
          <p className="small muted">Home splits this account's balance over the days left in the month.</p>
        </Accordion>

        <Accordion title="Categories"><Categories /></Accordion>

        <Accordion title="Quick links">
          <p className="small muted">Save these as iPhone Shortcuts or Home Screen bookmarks. Each opens straight into a form.</p>
          {[['expense', 'New expense'], ['income', 'New income'], ['transfer', 'New transfer'], ['history', 'History'], ['budget', 'Budget'], ['stats', 'Stats']].map(([k, l]) => (
            <div key={k} className="nrow"><div className="grow"><div className="nrow-title">{l}</div><div className="xs muted break">{URL_BASE}#{k}</div></div><Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(`${URL_BASE}#${k}`, 'Copy link', 'Link copied')}>Copy</Button></div>
          ))}
        </Accordion>

        <Accordion title="Import and export"><DataTools /></Accordion>

        <Accordion title="Reset">
          <p className="small muted tnum">{c.accounts} accounts · {c.tx} transactions · {c.budgets} budgets · {c.recur} recurring · {c.debts} debts. {store.mode === 'cloud' ? 'Synced across your devices.' : 'Saved in this browser only (open it inside Claude to sync).'}</p>
          <Button variant="danger" icon={<Trash2 size={16} />} onClick={async () => {
            if (await ask({ title: 'Delete all money data?', body: 'Accounts, transactions, budgets, recurring items and debts. This can\'t be undone. Export a CSV first if you want a copy.', confirm: 'Delete everything', danger: true, typeToConfirm: 'DELETE' }) !== 'confirm') return
            M.resetAll(); toast('Everything deleted'); go('home')
          }}>Delete everything</Button>
        </Accordion>
      </div>
    </main>
  )
}

function DataTools() {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ReturnType<typeof M.readImport> | null>(null)
  const [acc, setAcc] = useState(M.accounts()[0]?.id || '')
  const [raw, setRaw] = useState('')
  const exp = async () => {
    const res = await saveFile(`Vandenizar Money ${today()}.csv`, M.toCsv())
    toast(res === 'saved' ? 'CSV saved' : res === 'declined' ? 'Download cancelled' : 'Couldn\'t save the file here. Open the page inside Claude.', undefined, res === 'failed' ? 'error' : undefined)
  }
  const pick = async (f?: File | null) => {
    if (!f) return
    const text = await f.text()
    setRaw(text); setPreview(M.readImport(text, acc))
  }
  return (
    <>
      <div className="row gap8 wrap">
        <Button icon={<Download size={16} />} onClick={exp} disabled={!M.txs().length}>Export CSV</Button>
        <Button icon={<Upload size={16} />} onClick={() => ref.current?.click()}>Import CSV</Button>
        <input ref={ref} id="csv-in" type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className="small muted">Import reads this app's export, or any sheet with Date and Amount columns. Category, Account, Type and Note are used when present; positive amounts with a Type of Income count as income.</p>
      {preview && (
        <Sheet open onClose={() => setPreview(null)} title="Import" footer={<Button variant="primary" size="lg" block disabled={!preview.items.length} onClick={() => { M.importTxs(preview.items); toast(`Imported ${preview.items.length} transactions`); setPreview(null) }}>Import {preview.items.length}</Button>}>
          {preview.error ? <p className="field-error">{preview.error}</p> : <p className="tnum">{preview.items.length} transactions ready{preview.skipped ? `, ${preview.skipped} rows skipped (no date, no amount, or a debt row)` : ''}.</p>}
          <AccountPick label="Account for rows without one" value={acc} onChange={(v) => { setAcc(v); setPreview(M.readImport(raw, v)) }} />
          {preview.items.slice(0, 5).map((x) => <div key={x.id} className="row between small tnum"><span>{x.date} · {x.type} · {x.catId ? M.catShort(x.catId) : M.accName(x.toAccountId)}</span><b>{M.rp(x.amount, { show: true })}</b></div>)}
        </Sheet>
      )}
    </>
  )
}

function Categories() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [edit, setEdit] = useState<Partial<M.Cat> | null>(null)
  const tops = M.catsOf(kind)
  return (
    <>
      <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
      <div className="list">
        {tops.map((c) => {
          const subs = M.catsOf(kind, c.id)
          return (
            <button key={c.id} className="li" onClick={() => setEdit(c)}>
              <CatIc id={c.id} /><span className="li-main"><span className="li-title">{c.name}</span>{subs.length > 0 && <span className="li-sub">{subs.map((s) => s.name).join(', ')}</span>}</span>
            </button>
          )
        })}
      </div>
      <Button icon={<Plus size={16} />} onClick={() => setEdit({ kind, parentId: '', tone: 'cyan', icon: 'tag', name: '' })}>New category</Button>
      {edit && <CatSheet c={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function CatSheet({ c, onClose }: { c: Partial<M.Cat>; onClose: () => void }) {
  const [name, setName] = useState(c.name || '')
  const [icon, setIcon] = useState(c.icon || 'tag')
  const [tn, setTn] = useState(M.tone(c.tone))
  const [newSub, setNewSub] = useState('')
  const subs = c.id ? M.catsOf(c.kind!, c.id) : []
  const save = () => {
    if (!name.trim()) return toast('Give it a name', undefined, 'error')
    const rec = M.saveCat({ ...(c as any), name: name.trim(), icon, tone: tn })
    for (const s of subs) if (s.icon !== icon || s.tone !== tn) M.saveCat({ ...s, icon, tone: tn })
    toast('Saved'); onClose(); return rec
  }
  const addSub = () => {
    const n = newSub.trim(); if (!n || !c.id) return
    M.saveCat({ kind: c.kind!, parentId: c.id, name: n, icon, tone: tn, order: (c.order || 0) + subs.length + 1 })
    setNewSub('')
  }
  return (
    <Sheet open onClose={onClose} title={c.id ? 'Edit category' : 'New category'} footer={<Button variant="primary" size="lg" block onClick={save}>Save</Button>}>
      <Field label="Name" htmlFor="c-name"><input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus={!c.id || undefined} /></Field>
      <Field label="Icon">
        <div className="iconpick">{Object.entries(CAT_ICONS).map(([k, I]) => <button key={k} type="button" className={cx('ipick', icon === k && 'on')} aria-label={k} aria-pressed={icon === k} onClick={() => setIcon(k)}><I size={18} /></button>)}</div>
      </Field>
      <Field label="Color"><div className="row gap8 wrap">{M.TONES.map((t) => <button key={t} type="button" className={cx('swatch', 'bg-' + t, tn === t && 'on')} aria-label={t} onClick={() => setTn(t)} />)}</div></Field>
      {c.id && <>
        <Field label="Sub-categories">
          <div className="chips">
            {subs.map((s) => <button key={s.id} type="button" className="chip chip-x" onClick={async () => { if (await ask({ title: `Hide ${s.name}?`, body: 'Old transactions keep the name. It just stops showing in the picker.', confirm: 'Hide' }) === 'confirm') M.hideCat(s.id) }}>{s.name} <EyeOff size={13} /></button>)}
          </div>
          <div className="row gap8 mt4"><input className="input" placeholder="Add a sub-category" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} aria-label="New sub-category" /><Button onClick={addSub}>Add</Button></div>
        </Field>
        <Button variant="ghost" icon={<EyeOff size={16} />} onClick={async () => { if (await ask({ title: `Hide ${c.name}?`, body: 'Old transactions keep it. It stops showing when you log new ones.', confirm: 'Hide' }) === 'confirm') { M.hideCat(c.id!); onClose() } }}>Hide category</Button>
      </>}
    </Sheet>
  )
}
