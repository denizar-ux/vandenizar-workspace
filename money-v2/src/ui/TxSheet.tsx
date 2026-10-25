import React, { useEffect, useMemo, useState } from 'react'
import { Trash2, X, Repeat, Plus } from 'lucide-react'
import * as M from '../lib/money'
import { today, addDays, nowTime, fmtDay } from '../lib/date'
import { pref, setPref } from '../lib/prefs'
import { get } from '../lib/store'
import { Sheet, Button, Segmented, Field, toast, ask, cx } from './kit'
import { DateField, TimeField } from './DateInput'
import { CatIc, AccIc } from './icons'

// ---------- tiny open/close bus ----------
type Opts = { type?: 'expense' | 'income' | 'transfer'; tx?: M.Tx; date?: string; catId?: string; accountId?: string; toAccountId?: string; amount?: number; note?: string; due?: { r: M.Recur; date: string } }
let state: Opts | null = null
const ls = new Set<() => void>()
export function openTx(o: Opts = {}) { state = { ...o }; ls.forEach((l) => l()) }
function useOpen() { const [, f] = useState(0); useEffect(() => { const l = () => f((n) => n + 1); ls.add(l); return () => { ls.delete(l) } }, []); return state }
const close = () => { state = null; ls.forEach((l) => l()) }

export function TxHost() {
  const o = useOpen()
  if (!o) return null
  const key = (o.tx?.id || 'new') + (o.due ? o.due.r.id + o.due.date : '') + (o.type || '')
  return <TxSheet key={key} o={o} />
}

export const AmountInput = ({ value, onChange, id = 'amount', autoFocus }: { value: string; onChange: (v: string) => void; id?: string; autoFocus?: boolean }) => {
  const n = M.parseAmount(value)
  const shorthand = /[a-z]/i.test(value)
  return (
    <div className="amt">
      <span className="amt-rp" aria-hidden>Rp</span>
      <input id={id} className="amt-input tnum" inputMode="decimal" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} data-autofocus={autoFocus || undefined} aria-label="Amount in rupiah" />
      {shorthand && n > 0 && <span className="amt-hint tnum">{M.rp(n, { show: true })}</span>}
    </div>
  )
}

export function AccountPick({ value, onChange, exclude, label = 'Account', allowCredit = true }: { value: string; onChange: (v: string) => void; exclude?: string; label?: string; allowCredit?: boolean }) {
  const bal = M.balances()
  const list = M.accounts().filter((a) => a.id !== exclude && (allowCredit || a.type !== 'credit'))
  return (
    <Field label={label}>
      <div className="chips chips-scroll" role="group" aria-label={label}>
        {list.map((a) => (
          <button key={a.id} type="button" className={cx('acc-chip', value === a.id && 'on')} aria-pressed={value === a.id} onClick={() => onChange(a.id)}>
            <AccIc a={a} size={15} /><span className="col"><b>{a.name}</b><span className="tnum">{M.rpc(bal[a.id] || 0)}</span></span>
          </button>
        ))}
      </div>
    </Field>
  )
}

export function CatPick({ kind, value, onChange }: { kind: 'expense' | 'income'; value: string; onChange: (v: string) => void }) {
  const tops = M.catsOf(kind)
  const top = M.topCatId(value)
  const subs = top ? M.catsOf(kind, top) : []
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="catgrid" role="group" aria-label="Category">
        {tops.map((c) => (
          <button key={c.id} type="button" className={cx('cat-tile', top === c.id && 'on')} aria-pressed={top === c.id} onClick={() => onChange(c.id)}>
            <CatIc id={c.id} /><span>{c.name}</span>
          </button>
        ))}
      </div>
      {subs.length > 0 && (
        <div className="chips chips-scroll" role="group" aria-label="Sub-category">
          <button type="button" className={cx('chip', value === top && 'on')} onClick={() => onChange(top)}>Any</button>
          {subs.map((s) => <button key={s.id} type="button" className={cx('chip', value === s.id && 'on')} onClick={() => onChange(s.id)}>{s.name}</button>)}
        </div>
      )}
    </div>
  )
}

export function TagEdit({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState('')
  const known = M.allTags().filter((t) => !tags.some((x) => x.toLowerCase() === t.key)).slice(0, 6)
  const add = (s: string) => { const n = M.normTag(s); if (n && !tags.some((t) => t.toLowerCase() === n.toLowerCase())) onChange([...tags, n]); setV('') }
  return (
    <Field label="Tags" hint="For trips or events, like Bali trip or Lebaran" htmlFor="tag-in">
      <div className="chips">
        {tags.map((t) => <button key={t} type="button" className="chip on chip-x" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>#{t} <X size={14} /></button>)}
        <input id="tag-in" className="input tag-in" placeholder="Add tag" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(v) } }} onBlur={() => v && add(v)} />
      </div>
      {known.length > 0 && <div className="chips mt4">{known.map((t) => <button key={t.key} type="button" className="chip chip-sm" onClick={() => add(t.name)}>#{t.name}</button>)}</div>}
    </Field>
  )
}

function TxSheet({ o }: { o: Opts }) {
  const e = o.tx
  const editKind = e && (e.type === 'adjust' || e.type === 'debt') ? e.type : null
  const lastAcc = pref<string>('lastAcc', '')
  const firstAcc = M.accounts().find((a) => a.id === lastAcc)?.id || M.accounts()[0]?.id || ''
  const r = o.due?.r
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>((e && e.type !== 'adjust' && e.type !== 'debt' ? e.type : r?.type) || o.type || 'expense')
  const [amt, setAmt] = useState(e ? String(Math.abs(e.amount)) : r ? String(r.amount) : o.amount ? String(o.amount) : '')
  const [catId, setCat] = useState(e?.catId || r?.catId || o.catId || '')
  const [acc, setAcc] = useState(e?.accountId || r?.accountId || o.accountId || firstAcc)
  const [to, setTo] = useState(e?.toAccountId || r?.toAccountId || o.toAccountId || '')
  const [fee, setFee] = useState<number>(e?.fee ?? r?.fee ?? pref<number>('lastFee', 0))
  const [feeOther, setFeeOther] = useState('')
  const [date, setDate] = useState(e?.date || o.due?.date || o.date || today())
  const [time, setTime] = useState(e ? e.time || '' : nowTime())
  const [note, setNote] = useState(e?.note || (r ? r.name : o.note || ''))
  const [tags, setTags] = useState<string[]>(e ? M.txTags(e) : M.settings().activeTag ? [M.settings().activeTag] : [])
  const [repeat, setRepeat] = useState<'' | M.Freq>('')
  const [more, setMore] = useState(!!(e?.note || (e && M.txTags(e).length)))
  const [sign, setSign] = useState(e && e.type === 'adjust' && e.amount < 0 ? -1 : 1)

  useEffect(() => { if (!e && !r) setCat((c) => (c && M.cat(c)?.kind === type ? c : '')) }, [type])
  const n = M.parseAmount(amt)
  const feeV = feeOther ? M.parseAmount(feeOther) : fee
  const noAcc = !M.accounts().length
  const err = !n ? 'Enter an amount' : !acc ? 'Pick an account' : type === 'transfer' && !editKind && !to ? 'Pick where the money goes' : !editKind && type !== 'transfer' && !catId ? 'Pick a category' : ''

  const save = () => {
    if (err) { toast(err, undefined, 'error'); return }
    if (editKind) {
      M.saveTx({ ...e!, amount: editKind === 'adjust' ? sign * n : n, accountId: acc, date, time, note })
      toast('Saved'); close(); return
    }
    const base: Partial<M.Tx> = { ...(e || {}), type, amount: n, accountId: acc, date, time, note: note.trim(), tags }
    if (type === 'transfer') { base.toAccountId = to; base.fee = feeV; delete base.catId } else { base.catId = catId; delete base.toAccountId; delete base.fee }
    if (r && o.due) {
      M.logRecur(r, o.due.date, n)
      const x = get<M.Tx>('mTx', M.recurTxId(r, o.due.date))!
      M.saveTx({ ...x, ...base, id: x.id, recurId: r.id })
      toast(`${r.name || 'Payment'} logged`); close(); return
    }
    const x = M.saveTx(base)
    setPref('lastAcc', acc); if (type === 'transfer') setPref('lastFee', feeV)
    if (repeat && !e) {
      M.saveRecur({ name: note.trim() || (type === 'transfer' ? 'Transfer' : M.catShort(catId)), type, amount: n, fee: type === 'transfer' ? feeV : undefined, catId: type === 'transfer' ? undefined : catId, accountId: acc, toAccountId: type === 'transfer' ? to : undefined, freq: repeat, every: 1, start: date, done: date, auto: true, sub: M.topCatId(catId) === 'subscriptions' })
    }
    toast(e ? 'Saved' : type === 'expense' ? `Spent ${M.rp(n, { show: true })}` : type === 'income' ? `Added ${M.rp(n, { show: true })}` : 'Transfer saved', e ? undefined : { label: 'Undo', run: () => M.deleteTx(x.id) })
    close()
  }
  const del = async () => {
    if (!e) return
    if (await ask({ title: 'Delete this transaction?', body: `${M.rp(e.amount, { show: true })} on ${fmtDay(e.date)}. Balances update right away.`, confirm: 'Delete', danger: true }) !== 'confirm') return
    M.deleteTx(e.id)
    toast('Deleted', { label: 'Undo', run: () => M.saveTx(e) })
    close()
  }
  const title = editKind === 'adjust' ? 'Balance adjustment' : editKind === 'debt' ? 'Debt entry' : r ? `Pay ${r.name}` : e ? 'Edit transaction' : 'New transaction'

  return (
    <Sheet open onClose={close} title={title} footer={
      <div className="row gap8">
        {e && <Button variant="ghost" icon={<Trash2 size={18} />} onClick={del} aria-label="Delete" />}
        <Button variant="primary" size="lg" block onClick={save} disabled={noAcc}>{e ? 'Save' : r ? 'Log payment' : 'Save'}</Button>
      </div>
    }>
      {noAcc ? <p className="muted">Add an account first in Accounts.</p> : <>
        {!editKind && !r && <Segmented label="Type" value={type} onChange={setType} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} />}
        {editKind === 'adjust' && <Segmented label="Direction" value={sign} onChange={setSign} options={[{ value: 1, label: 'Added' }, { value: -1, label: 'Removed' }]} />}
        <AmountInput value={amt} onChange={setAmt} autoFocus={!e} />
        {!editKind && type !== 'transfer' && <CatPick kind={type} value={catId} onChange={setCat} />}
        <AccountPick value={acc} onChange={setAcc} label={type === 'transfer' && !editKind ? 'From' : type === 'income' ? 'Into' : 'Paid from'} exclude={type === 'transfer' ? to : undefined} />
        {type === 'transfer' && !editKind && <>
          <AccountPick value={to} onChange={setTo} label="To" exclude={acc} />
          <Field label="Admin fee" hint="Counts as spending under Admin fees">
            <div className="chips">
              {M.FEE_PRESETS.map((f) => <button key={f.v} type="button" className={cx('chip', !feeOther && fee === f.v && 'on')} onClick={() => { setFee(f.v); setFeeOther('') }}>{f.label}</button>)}
              <input className="input tag-in tnum" inputMode="decimal" placeholder="Other" value={feeOther} onChange={(ev) => setFeeOther(ev.target.value)} aria-label="Other fee" />
            </div>
          </Field>
        </>}
        <div className="chips">
          {[today(), addDays(today(), -1)].map((d, i) => <button key={d} type="button" className={cx('chip', date === d && 'on')} onClick={() => setDate(d)}>{i ? 'Yesterday' : 'Today'}</button>)}
        </div>
        <div className="grid2">
          <DateField label="Date" value={date} onChange={(v) => setDate(v || today())} />
          <TimeField label="Time" value={time} onChange={setTime} />
        </div>
        {more || editKind ? <>
          <Field label="Note" htmlFor="tx-note"><input id="tx-note" className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Padang near office" /></Field>
          {!editKind && <TagEdit tags={tags} onChange={setTags} />}
        </> : <button type="button" className="ref-add-thin" onClick={() => setMore(true)}><Plus size={16} />Note and tags{tags.length ? ` · #${tags[0]}` : ''}</button>}
        {!e && !r && (
          <Field label="Repeat" hint={repeat ? 'Logged automatically on each date. Edit it later in Budget → Recurring.' : undefined}>
            <div className="chips">
              {([['', 'Once'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']] as const).map(([v, l]) => <button key={v} type="button" className={cx('chip', repeat === v && 'on')} onClick={() => setRepeat(v as any)}>{v && <Repeat size={13} style={{ marginRight: 5, verticalAlign: -2 }} />}{l}</button>)}
            </div>
          </Field>
        )}
      </>}
    </Sheet>
  )
}
