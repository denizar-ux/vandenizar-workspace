import React, { useState } from 'react'
import { Plus, ArrowLeftRight, Minus, Scale, List, Pencil, Trash2, Archive, HandCoins, ChevronDown } from 'lucide-react'
import * as M from '../lib/money'
import { today, fmtDay, relDay, fmtShort } from '../lib/date'
import { go, useRoute, setQ } from '../lib/router'
import { get, put, remove, uid } from '../lib/store'
import { PhoneTop, PageHead, Bar } from '../ui/Shell'
import { Segmented, Chips, Sheet, Button, Field, Empty, toast, ask, cx } from '../ui/kit'
import { DateField } from '../ui/DateInput'
import { AmountInput, AccountPick, openTx } from '../ui/TxSheet'
import { AccRow, TxRow } from '../ui/parts'
import { AccIc } from '../ui/icons'
import { SwitchRow } from './Budget'

export default function Accounts() {
  const r = useRoute()
  const tab = (r.q.tab as 'accounts' | 'debts') || 'accounts'
  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="What you have" title={tab === 'accounts' ? 'Accounts' : 'Debts'} />
      <div className="stack" style={{ gap: 16 }}>
        <Segmented label="Section" className="seg-fit" value={tab} onChange={(v) => setQ({ tab: v })} options={[{ value: 'accounts', label: 'Accounts', count: M.accounts().length || undefined }, { value: 'debts', label: 'Debts', count: M.debts().filter((d) => !M.debtState(d).closed).length || undefined }]} />
        {tab === 'accounts' ? <AccountList /> : <Debts />}
      </div>
    </main>
  )
}

// =========================== accounts ===========================
function AccountList() {
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<Partial<M.Account> | null>(null)
  const [showArch, setShowArch] = useState(false)
  const t = M.totals()
  const bal = M.balances()
  const groups = M.ACC_TYPES.map((ty) => ({ ty, list: M.accounts().filter((a) => a.type === ty.id) })).filter((g) => g.list.length)
  const arch = M.allAccounts().filter((a) => a.archived)
  return (
    <>
      <div className="upnext tint-sage">
        <span className="eyebrow">Net worth</span>
        <span className="upnext-title tnum">{M.rp(t.net)}</span>
        <div className="networth">
          <span><span className="xs ink2">Cash & banks</span><b className="tnum">{M.rp(t.cash)}</b></span>
          {t.invest !== 0 && <span><span className="xs ink2">Investments</span><b className="tnum">{M.rp(t.invest)}</b></span>}
          {t.cardDebt > 0 && <span><span className="xs ink2">Card debt</span><b className="tnum neg">−{M.rp(t.cardDebt)}</b></span>}
          {t.owedToMe > 0 && <span><span className="xs ink2">Owed to you</span><b className="tnum">{M.rp(t.owedToMe)}</b></span>}
          {t.iOwe > 0 && <span><span className="xs ink2">You owe</span><b className="tnum neg">−{M.rp(t.iOwe)}</b></span>}
        </div>
      </div>
      <div className="row end"><Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit({ type: 'bank', tone: 'cyan' })}>New account</Button></div>
      {groups.length ? (
        <div className="groups">
          {groups.map(({ ty, list }) => (
            <section key={ty.id} className="stack" style={{ gap: 8 }}>
              <div className="dayhead"><span className="group-title">{ty.plural}</span><span className="small muted tnum">{M.rp(list.reduce((s, a) => s + (bal[a.id] || 0), 0))}</span></div>
              <div className="list">{list.map((a) => <AccRow key={a.id} a={a} onClick={() => setOpen(a.id)} />)}</div>
            </section>
          ))}
        </div>
      ) : <Empty title="No accounts yet" body="Add your bank pockets, e-wallets, cash and cards. Balances follow every transaction." />}
      {arch.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <button className="linkbtn row gap4" onClick={() => setShowArch(!showArch)}>Archived ({arch.length}) <ChevronDown size={16} className={cx('acc-chev', showArch && 'up')} /></button>
          {showArch && <div className="list">{arch.map((a) => <AccRow key={a.id} a={a} onClick={() => setOpen(a.id)} />)}</div>}
        </section>
      )}
      {open && <AccountSheet id={open} onClose={() => setOpen(null)} onEdit={(a) => { setOpen(null); setEdit(a) }} />}
      {edit && <AccountEdit a={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function AccountSheet({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (a: M.Account) => void }) {
  const a = M.account(id)
  const [setting, setSetting] = useState(false)
  const [val, setVal] = useState('')
  if (!a) return null
  const b = M.balances()[a.id] || 0
  const ci = a.type === 'credit' ? M.cardInfo(a) : null
  const list = M.txSorted().filter((x) => x.accountId === a.id || x.toAccountId === a.id).slice(0, 8)
  const doSet = () => {
    const n = M.parseAmount(val.replace(/^[−-]/, '-'))
    const target = a.type === 'credit' ? -Math.abs(n) : n
    const x = M.setBalance(a.id, target, a.type === 'invest' ? 'Value update' : 'Balance adjustment')
    toast(x ? 'Balance updated' : 'No change'); setSetting(false); setVal('')
  }
  return (
    <Sheet open onClose={onClose} title={a.name} wide>
      <div className="row gap12"><AccIc a={a} /><div className="grow"><div className="eyebrow">{[a.bank, M.ACC_TYPES.find((t) => t.id === a.type)?.label].filter(Boolean).join(' · ')}</div><div className="content-title tnum">{a.type === 'credit' ? M.rp(Math.max(0, -b)) : M.rp(b)}</div>{a.type === 'credit' && <div className="small muted">owed on the card{ci?.available != null ? ` · ${M.rp(ci.available)} available` : ''}</div>}</div></div>
      {ci && (
        <div className={cx('card stack', ci.billLeft > 0 && ci.daysToDue <= 3 ? 'tint-rose' : 'tint-lavender')} style={{ gap: 8 }}>
          <div className="row between small"><span>This cycle · {fmtShort(ci.start)} – {fmtShort(ci.end)}</span><b className="tnum">{M.rp(Math.max(0, ci.cur))}</b></div>
          <div className="row between small"><span>Bill to pay · due {fmtDay(ci.due)}</span><b className="tnum">{M.rp(ci.billLeft)}</b></div>
          {a.creditLimit ? <Bar pct={ci.owed / a.creditLimit} status={ci.owed / a.creditLimit > 0.8 ? 'warn' : 'ok'} /> : null}
          {ci.billLeft > 0 && <Button variant="primary" onClick={() => { onClose(); openTx({ type: 'transfer', toAccountId: a.id, amount: ci.billLeft, accountId: M.accounts().find((x) => x.type === 'bank')?.id, note: `${a.name} bill` }) }}>Pay the bill</Button>}
        </div>
      )}
      <div className="actgrid">
        <button className="act" onClick={() => { onClose(); openTx({ type: 'expense', accountId: a.id }) }}><Minus size={18} />Expense</button>
        <button className="act" onClick={() => { onClose(); openTx({ type: 'income', accountId: a.id }) }}><Plus size={18} />Income</button>
        <button className="act" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: a.id }) }}><ArrowLeftRight size={18} />Transfer</button>
        <button className="act" onClick={() => setSetting(!setting)}><Scale size={18} />{a.type === 'invest' ? 'Update value' : 'Fix balance'}</button>
      </div>
      {setting && (
        <div className="card stack">
          <Field label={a.type === 'invest' ? 'Current value' : a.type === 'credit' ? 'Amount owed right now' : 'Actual balance right now'} hint="The difference is saved as an adjustment, not income or spending.">
            <AmountInput value={val} onChange={setVal} id="setbal" autoFocus />
          </Field>
          <Button variant="primary" onClick={doSet}>Update</Button>
        </div>
      )}
      <div className="section-head"><h2 className="h3 grow">Latest</h2><button className="linkbtn" onClick={() => { onClose(); go('history', { acc: a.id }) }}>All</button></div>
      {list.length ? <div className="list">{list.map((x) => <TxRow key={x.id} x={x} showDate />)}</div> : <p className="small muted">Nothing on this account yet.</p>}
      <div className="row gap8 wrap">
        <Button icon={<Pencil size={16} />} onClick={() => onEdit(a)}>Edit</Button>
        <Button variant="ghost" icon={<Archive size={16} />} onClick={() => { M.saveAccount({ ...a, archived: !a.archived }); toast(a.archived ? 'Restored' : 'Archived. History stays.'); onClose() }}>{a.archived ? 'Restore' : 'Archive'}</Button>
      </div>
    </Sheet>
  )
}

function AccountEdit({ a, onClose }: { a: Partial<M.Account>; onClose: () => void }) {
  const [name, setName] = useState(a.name || '')
  const [bank, setBank] = useState(a.bank || '')
  const [type, setType] = useState<M.AccType>(a.type || 'bank')
  const [tn, setTn] = useState(M.tone(a.tone))
  const [init, setInit] = useState(a.id ? '' : '')
  const [cycle, setCycle] = useState(a.cycleDay || 15)
  const [due, setDue] = useState(a.dueDay || 2)
  const [limit, setLimit] = useState(a.creditLimit ? String(a.creditLimit) : '')
  const save = () => {
    if (!name.trim()) return toast('Give it a name', undefined, 'error')
    const rec = M.saveAccount({ ...a, name: name.trim(), bank: bank.trim(), type, tone: tn, cycleDay: type === 'credit' ? cycle : null, dueDay: type === 'credit' ? due : null, creditLimit: type === 'credit' ? M.parseAmount(limit) : undefined })
    if (!a.id && init) { const n = M.parseAmount(init); if (n) M.saveTx({ type: 'adjust', amount: type === 'credit' ? -n : n, accountId: rec.id, date: today(), note: 'Starting balance' }) }
    toast(a.id ? 'Saved' : 'Account added'); onClose()
  }
  const del = async () => {
    const n = M.txs().filter((x) => x.accountId === a.id || x.toAccountId === a.id).length
    if (n) { toast(`It has ${n} transactions. Archive it instead to keep them.`, undefined, 'error'); return }
    if (await ask({ title: `Delete ${a.name}?`, confirm: 'Delete', danger: true }) !== 'confirm') return
    remove('mAccounts', a.id!); toast('Deleted'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={a.id ? 'Edit account' : 'New account'} footer={<div className="row gap8">{a.id && <Button variant="ghost" icon={<Trash2 size={18} />} aria-label="Delete account" onClick={del} />}<Button variant="primary" size="lg" block onClick={save}>Save</Button></div>}>
      <Field label="Type"><Chips label="Type" value={type} onChange={setType} options={M.ACC_TYPES.map((t) => ({ value: t.id, label: t.label }))} /></Field>
      <div className="grid2">
        <Field label="Name" htmlFor="a-name"><input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'invest' ? 'Bibit RDPU' : 'Daily Life'} data-autofocus={!a.id || undefined} /></Field>
        <Field label={type === 'invest' ? 'Platform' : 'Bank or app'} htmlFor="a-bank"><input id="a-bank" className="input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder={type === 'invest' ? 'Bibit' : 'Jago'} /></Field>
      </div>
      <Field label="Color">
        <div className="row gap8 wrap">{M.TONES.map((t) => <button key={t} type="button" className={cx('swatch', 'bg-' + t, tn === t && 'on')} aria-label={t} aria-pressed={tn === t} onClick={() => setTn(t)} />)}</div>
      </Field>
      {!a.id && <Field label={type === 'credit' ? 'Owed right now' : type === 'invest' ? 'Current value' : 'Balance right now'}><AmountInput value={init} onChange={setInit} id="a-init" /></Field>}
      {type === 'credit' && <>
        <div className="grid2">
          <Field label="Statement day" htmlFor="a-cyc" hint="Cycle starts on this date"><input id="a-cyc" className="input tnum" type="number" min={1} max={28} value={cycle} onChange={(e) => setCycle(Math.min(28, Math.max(1, +e.target.value || 1)))} /></Field>
          <Field label="Due day" htmlFor="a-due"><input id="a-due" className="input tnum" type="number" min={1} max={28} value={due} onChange={(e) => setDue(Math.min(28, Math.max(1, +e.target.value || 1)))} /></Field>
        </div>
        <Field label="Credit limit" hint="Optional"><AmountInput value={limit} onChange={setLimit} id="a-limit" /></Field>
      </>}
    </Sheet>
  )
}

// =========================== debts ===========================
function Debts() {
  const [open, setOpen] = useState<string | null>(null)
  const [add, setAdd] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const t = M.debtTotals()
  const all = M.debts().map((d) => ({ d, s: M.debtState(d) }))
  const live = all.filter((x) => !x.s.closed).sort((a, b) => b.s.left - a.s.left)
  const closed = all.filter((x) => x.s.closed)
  return (
    <>
      <div className="tiles">
        <div className="tile tint-sage"><span className="eyebrow">Owed to you</span><span className="tile-title tnum">{M.rp(t.owedToMe)}</span><span className="tile-foot small ink2">{live.filter((x) => x.d.direction === 'lent').length} people</span></div>
        <div className="tile tint-rose"><span className="eyebrow">You owe</span><span className="tile-title tnum">{M.rp(t.iOwe)}</span><span className="tile-foot small ink2">{live.filter((x) => x.d.direction === 'borrowed').length} people</span></div>
      </div>
      <div className="row end"><Button variant="primary" icon={<Plus size={17} />} onClick={() => setAdd(true)}>New debt</Button></div>
      {live.length ? (
        <div className="list">
          {live.map(({ d, s }) => (
            <button key={d.id} className="li" onClick={() => setOpen(d.id)}>
              <span className={cx('ic', d.direction === 'lent' ? 'bg-sage' : 'bg-rose')}><HandCoins size={18} /></span>
              <span className="li-main"><span className="li-title">{d.person}</span><span className="li-sub">{d.direction === 'lent' ? 'Owes you' : 'You owe'}{s.settled ? ` · ${M.rp(s.settled)} paid back` : ''}{d.due ? ` · due ${relDay(d.due).toLowerCase()}` : ''}</span></span>
              <span className={cx('tx-amt tnum', d.direction === 'lent' ? 'pos' : 'neg')}>{M.rp(s.left)}</span>
            </button>
          ))}
        </div>
      ) : <Empty icon={<HandCoins size={22} />} title="No open debts" body="Track money you lent or borrowed. Paybacks move the right account too." />}
      {closed.length > 0 && <>
        <button className="linkbtn row gap4" onClick={() => setShowClosed(!showClosed)}>Settled ({closed.length}) <ChevronDown size={16} className={cx('acc-chev', showClosed && 'up')} /></button>
        {showClosed && <div className="list">{closed.map(({ d, s }) => <button key={d.id} className="li" onClick={() => setOpen(d.id)}><span className="ic bg-grey"><HandCoins size={18} /></span><span className="li-main"><span className="li-title done-text">{d.person}</span><span className="li-sub">Settled</span></span><span className="tx-amt tnum muted">{M.rp(s.principal)}</span></button>)}</div>}
      </>}
      {add && <NewDebt onClose={() => setAdd(false)} />}
      {open && <DebtSheet id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function NewDebt({ onClose }: { onClose: () => void }) {
  const [person, setPerson] = useState('')
  const [dir, setDir] = useState<'lent' | 'borrowed'>('lent')
  const [amt, setAmt] = useState('')
  const [acc, setAcc] = useState(M.accounts()[0]?.id || '')
  const [date, setDate] = useState(today())
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const save = () => {
    const n = M.parseAmount(amt)
    if (!person.trim() || !n || !acc) return toast('Fill in the name, amount and account', undefined, 'error')
    const existing = M.debts().find((d) => d.person.toLowerCase() === person.trim().toLowerCase() && d.direction === dir && !M.debtState(d).closed)
    const d = existing || put('mDebts', { id: uid(), person: person.trim(), direction: dir, note: note.trim(), due })
    M.saveTx({ type: 'debt', action: dir === 'lent' ? 'lend' : 'borrow', debtId: d.id, amount: n, accountId: acc, date, note: note.trim() })
    toast(existing ? `Added to ${d.person}'s debt` : 'Debt saved'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="New debt" footer={<Button variant="primary" size="lg" block onClick={save}>Save</Button>}>
      <Segmented label="Direction" value={dir} onChange={setDir} options={[{ value: 'lent', label: 'I lent' }, { value: 'borrowed', label: 'I borrowed' }]} />
      <Field label={dir === 'lent' ? 'Lent to' : 'Borrowed from'} htmlFor="d-person"><input id="d-person" className="input" value={person} onChange={(e) => setPerson(e.target.value)} data-autofocus list="people" /></Field>
      <datalist id="people">{[...new Set(M.debts().map((d) => d.person))].map((p) => <option key={p} value={p} />)}</datalist>
      <AmountInput value={amt} onChange={setAmt} id="d-amount" />
      <AccountPick value={acc} onChange={setAcc} label={dir === 'lent' ? 'Paid from' : 'Received into'} allowCredit={false} />
      <div className="grid2"><DateField label="Date" value={date} onChange={(v) => setDate(v || today())} /><DateField label="Pay back by" value={due} onChange={setDue} placeholder="No date" /></div>
      <Field label="Note" htmlFor="d-note"><input id="d-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  )
}

function DebtSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const d = get<M.Debt>('mDebts', id)
  const [amt, setAmt] = useState('')
  const [acc, setAcc] = useState(M.accounts().find((a) => a.type !== 'credit')?.id || '')
  if (!d) return null
  const s = M.debtState(d)
  const pay = () => {
    const n = M.parseAmount(amt)
    if (!n) return toast('Enter an amount', undefined, 'error')
    M.saveTx({ type: 'debt', action: d.direction === 'lent' ? 'collect' : 'repay', debtId: d.id, amount: Math.min(n, s.left || n), accountId: acc, date: today() })
    toast(n >= s.left ? 'Settled' : 'Payment saved'); setAmt('')
  }
  const del = async () => {
    if (await ask({ title: `Delete ${d.person}'s debt?`, body: `Its ${s.entries.length} entries go too, and balances move back.`, confirm: 'Delete', danger: true }) !== 'confirm') return
    for (const x of s.entries) M.deleteTx(x.id)
    remove('mDebts', d.id); toast('Deleted'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={d.person} wide>
      <div className="calsum">
        <div><span className="eyebrow">{d.direction === 'lent' ? 'Still owes you' : 'You still owe'}</span><b className="tnum">{M.rp(s.left)}</b></div>
        <div><span className="eyebrow">Total</span><b className="tnum">{M.rp(s.principal)}</b></div>
        <div><span className="eyebrow">Paid back</span><b className="tnum">{M.rp(s.settled)}</b></div>
      </div>
      <Bar pct={s.principal ? s.settled / s.principal : 0} />
      {!s.closed && (
        <div className="card stack">
          <h3 className="h3">{d.direction === 'lent' ? 'Got money back' : 'Paid some back'}</h3>
          <AmountInput value={amt} onChange={setAmt} id="d-pay" />
          <div className="chips"><button className="chip" onClick={() => setAmt(String(s.left))}>All {M.rpc(s.left)}</button></div>
          <AccountPick value={acc} onChange={setAcc} label={d.direction === 'lent' ? 'Into' : 'From'} allowCredit={false} />
          <Button variant="primary" onClick={pay}>Save payment</Button>
        </div>
      )}
      <div className="list">{s.entries.map((x) => <TxRow key={x.id} x={x} showDate />)}</div>
      <div className="row"><Button variant="ghost" icon={<Trash2 size={16} />} onClick={del}>Delete debt</Button></div>
    </Sheet>
  )
}
