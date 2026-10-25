import React, { useState } from 'react'
import { Plus, Repeat, Pause, ExternalLink, Trash2 } from 'lucide-react'
import * as M from '../lib/money'
import { today, fmtDay, fmtShort, relDay, addDays, diffDays } from '../lib/date'
import { go, useRoute, setQ } from '../lib/router'
import { get, remove } from '../lib/store'
import { safeUrl } from '../lib/prefs'
import { PhoneTop, PageHead, Bar } from '../ui/Shell'
import { Segmented, Chips, Sheet, Button, Field, Empty, toast, ask, cx } from '../ui/kit'
import { DateField } from '../ui/DateInput'
import { AmountInput, AccountPick, CatPick } from '../ui/TxSheet'
import { CatIc } from '../ui/icons'

export default function Budget() {
  const r = useRoute()
  const tab = (r.q.tab as 'budgets' | 'recurring') || 'budgets'
  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="Plan ahead" title={tab === 'budgets' ? 'Budget' : 'Recurring'} />
      <div className="stack" style={{ gap: 16 }}>
        <Segmented label="Section" className="seg-fit" value={tab} onChange={(v) => setQ({ tab: v })} options={[{ value: 'budgets', label: 'Budgets', count: M.budgets().length || undefined }, { value: 'recurring', label: 'Recurring & subscriptions' }]} />
        {tab === 'budgets' ? <Budgets /> : <Recurring />}
      </div>
    </main>
  )
}

// =========================== budgets ===========================
const rangeText = (b: M.Budget, s: ReturnType<typeof M.budgetState>) => b.period === 'week' ? `This week · ${fmtShort(s.r.start)}–${fmtShort(s.r.end)}` : b.period === 'month' ? 'This month' : `${fmtShort(s.r.start)}–${fmtShort(s.r.end)}`

function Budgets() {
  const [edit, setEdit] = useState<Partial<M.Budget> | null>(null)
  const [f, setF] = useState<'all' | M.Period>('all')
  const list = M.budgets().filter((b) => f === 'all' || b.period === f).sort((a, b) => (a.catId ? 1 : 0) - (b.catId ? 1 : 0) || ['week', 'month', 'custom'].indexOf(a.period) - ['week', 'month', 'custom'].indexOf(b.period) || M.budgetName(a).localeCompare(M.budgetName(b)))
  const month = M.stats(M.periodRange('month'))
  const covered = new Set(M.budgets().filter((b) => b.period === 'month' && b.catId).map((b) => M.topCatId(b.catId)))
  const loose = Object.entries(month.byCat).filter(([id, v]) => v > 0 && !covered.has(id) && id !== 'fee').sort((a, b) => b[1] - a[1])
  return (
    <>
      <div className="row gap8 wrap between">
        <Chips label="Period" value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'custom', label: 'Custom' }]} />
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit({ period: 'month', catId: '' })}>New budget</Button>
      </div>
      {list.length ? (
        <div className="cards">
          {list.map((b) => {
            const s = M.budgetState(b)
            const tint = !s.active ? 'pcard-plain' : s.status === 'over' ? 'tint-rose' : s.status === 'warn' ? 'tint-peach' : b.catId ? 'pcard-plain' : 'tint-butter'
            return (
              <article key={b.id} className={cx('pcard', tint)}>
                <button className="pcard-open" onClick={() => setEdit(b)}>
                  <span className="pcard-top"><span className="eyebrow">{M.PERIOD_LABEL[b.period]} · {rangeText(b, s)}</span>{b.catId && <CatIc id={b.catId} size={16} />}</span>
                  <span className="pcard-title">{M.budgetName(b)}</span>
                  <span className="tnum budget-big">{s.left >= 0 ? <>{M.rp(s.left)} <span className="muted">left</span></> : <><span className="neg">{M.rp(-s.left)}</span> <span className="muted">over</span></>}</span>
                </button>
                <Bar pct={s.pct} status={s.status} />
                <div className="row between small ink2 tnum">
                  <span>{M.rp(s.spent)} of {M.rp(b.amount)}</span>
                  <span>{!s.active ? (s.r.start > today() ? `Starts ${relDay(s.r.start).toLowerCase()}` : 'Ended') : s.perDay ? `${M.rpc(s.perDay)}/day · ${s.daysLeft}d left` : `${s.daysLeft}d left`}</span>
                </div>
                {b.catId && <button className="linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => go('history', { cat: b.catId })}>See transactions</button>}
              </article>
            )
          })}
        </div>
      ) : (
        <Empty title="No budgets yet" body="Set a limit for all spending or one category, per week, per month, or for a custom stretch like a trip." action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ period: 'month', catId: '' })}>New budget</Button>} />
      )}
      {loose.length > 0 && f !== 'week' && f !== 'custom' && (
        <section className="stack">
          <div className="section-head"><h2 className="h2 grow">No monthly budget yet</h2></div>
          <div className="list">
            {loose.map(([id, v]) => (
              <button key={id} className="li" onClick={() => setEdit({ period: 'month', catId: id, amount: Math.ceil(v / 50000) * 50000 })}>
                <CatIc id={id} /><span className="li-main"><span className="li-title">{M.catShort(id)}</span><span className="li-sub">Spent {M.rp(v)} this month</span></span><span className="linkbtn">Set budget</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {edit && <BudgetSheet b={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function BudgetSheet({ b, onClose }: { b: Partial<M.Budget>; onClose: () => void }) {
  const [amt, setAmt] = useState(b.amount ? String(b.amount) : '')
  const [period, setPeriod] = useState<M.Period>(b.period || 'month')
  const [scope, setScope] = useState<'all' | 'cat'>(b.catId ? 'cat' : 'all')
  const [catId, setCat] = useState(b.catId || '')
  const [start, setStart] = useState(b.start || today())
  const [end, setEnd] = useState(b.end || addDays(today(), 6))
  const [name, setName] = useState(b.name || '')
  const save = () => {
    const n = M.parseAmount(amt)
    if (!n) return toast('Enter an amount', undefined, 'error')
    if (scope === 'cat' && !catId) return toast('Pick a category', undefined, 'error')
    if (period === 'custom' && end < start) return toast('The end date is before the start', undefined, 'error')
    const c = scope === 'cat' ? catId : ''
    const dup = M.budgets().find((x) => x.id !== b.id && x.period === period && x.catId === c && period !== 'custom')
    if (dup) return toast(`There's already a ${M.PERIOD_LABEL[period].toLowerCase()} budget for ${M.budgetName(dup)}`, undefined, 'error')
    M.saveBudget({ ...b, amount: n, period, catId: c, start: period === 'custom' ? start : undefined, end: period === 'custom' ? end : undefined, name: period === 'custom' ? name.trim() : '' })
    toast('Budget saved'); onClose()
  }
  const del = async () => {
    if (await ask({ title: 'Delete this budget?', body: 'Your transactions stay. Only the limit goes.', confirm: 'Delete', danger: true }) !== 'confirm') return
    const old = get<M.Budget>('mBudgets', b.id)!
    remove('mBudgets', b.id!)
    toast('Budget deleted', { label: 'Undo', run: () => M.saveBudget(old) }); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={b.id ? 'Edit budget' : 'New budget'} footer={<div className="row gap8">{b.id && <Button variant="ghost" icon={<Trash2 size={18} />} aria-label="Delete budget" onClick={del} />}<Button variant="primary" size="lg" block onClick={save}>Save</Button></div>}>
      <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'custom', label: 'Custom' }]} />
      <AmountInput value={amt} onChange={setAmt} autoFocus={!b.id} />
      {period === 'custom' && <>
        <Field label="Name" htmlFor="b-name" hint="Optional, like Bali trip"><input id="b-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid2"><DateField label="From" value={start} onChange={(v) => setStart(v || today())} /><DateField label="Until" value={end} onChange={(v) => setEnd(v || start)} min={start} /></div>
      </>}
      <Field label="Covers">
        <Chips label="Covers" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All spending' }, { value: 'cat', label: 'One category' }]} />
      </Field>
      {scope === 'cat' && <CatPick kind="expense" value={catId} onChange={setCat} />}
      <p className="small muted">{period === 'week' ? 'Weeks run Monday to Sunday and reset each Monday.' : period === 'month' ? 'Resets on the 1st of every month.' : 'Counts spending between the two dates.'} Admin fees from transfers count as spending.</p>
    </Sheet>
  )
}

// =========================== recurring ===========================
function Recurring() {
  const [edit, setEdit] = useState<Partial<M.Recur> | null>(null)
  const [f, setF] = useState<'all' | 'sub' | 'bill' | 'income'>('all')
  const all = M.recurs()
  const subs = all.filter((r) => r.sub && !r.paused)
  const subMonth = subs.reduce((s, r) => s + M.monthlyCost(r), 0)
  const outMonth = all.filter((r) => !r.paused && r.type === 'expense').reduce((s, r) => s + M.monthlyCost(r), 0)
  const inMonth = all.filter((r) => !r.paused && r.type === 'income').reduce((s, r) => s + M.monthlyCost(r), 0)
  const list = all.filter((r) => f === 'all' || (f === 'sub' ? r.sub : f === 'income' ? r.type === 'income' : !r.sub && r.type !== 'income'))
    .map((r) => ({ r, next: M.nextDue(r) })).sort((a, b) => (a.r.paused ? 1 : 0) - (b.r.paused ? 1 : 0) || (a.next || '9').localeCompare(b.next || '9'))
  const t0 = today()
  return (
    <>
      <div className="tiles">
        <div className="tile tint-lavender"><span className="eyebrow">Subscriptions</span><span className="tile-title tnum">{M.rp(subMonth)}<span className="small ink2"> /mo</span></span><span className="tile-foot small ink2 tnum">{M.rp(subMonth * 12)} a year · {subs.length} active</span></div>
        <div className="tile tint-sage"><span className="eyebrow">Fixed each month</span><span className="tile-title tnum">{M.rp(outMonth)}</span><span className="tile-foot small ink2 tnum">{inMonth ? `Income ${M.rp(inMonth)}` : 'All recurring spending'}</span></div>
      </div>
      <div className="row gap8 wrap between">
        <Chips label="Filter" value={f} onChange={setF} scroll options={[{ value: 'all', label: 'All' }, { value: 'sub', label: 'Subscriptions' }, { value: 'bill', label: 'Bills & other' }, { value: 'income', label: 'Income' }]} />
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit({ sub: f === 'sub', type: f === 'income' ? 'income' : 'expense', auto: f !== 'bill', freq: 'month', every: 1, start: today(), catId: f === 'sub' ? 'subscriptions' : '' })}>Add</Button>
      </div>
      {list.length ? (
        <div className="list">
          {list.map(({ r, next }) => (
            <button key={r.id} className={cx('li', r.paused && 'is-paused')} onClick={() => setEdit(r)}>
              <CatIc id={r.type === 'transfer' ? 'fee' : r.catId} />
              <span className="li-main">
                <span className="li-title">{r.name || M.catShort(r.catId)}</span>
                <span className={cx('li-sub', next && next < t0 && !r.auto && 'late-t')}>{r.paused ? 'Paused' : `${M.freqText(r)} · ${next ? (next < t0 ? `${diffDays(t0, next)}d late` : relDay(next)) : 'Ended'}`} · {r.auto ? 'Auto' : 'Remind me'}{r.sub ? ' · Subscription' : ''}</span>
              </span>
              <span className="tx-amt"><span className={cx('tnum', r.type === 'income' && 'pos')}>{r.type === 'income' ? '+' : ''}{M.rp(r.amount)}</span>{r.freq !== 'month' && <span className="xs muted tnum">{M.rpc(M.monthlyCost(r))}/mo</span>}</span>
            </button>
          ))}
        </div>
      ) : <Empty icon={<Repeat size={22} />} title={f === 'sub' ? 'No subscriptions yet' : 'Nothing recurring yet'} body="Add salary, rent, installments, Netflix or iCloud once. Auto items log themselves on the date; reminders show up on Home with a Pay button." />}
      {edit && <RecurSheet r={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function RecurSheet({ r, onClose }: { r: Partial<M.Recur>; onClose: () => void }) {
  const isNew = !r.id
  const next0 = r.id ? M.nextDue(r as M.Recur) || r.start || today() : r.start || today()
  const [name, setName] = useState(r.name || '')
  const [type, setType] = useState<M.Recur['type']>(r.type || 'expense')
  const [amt, setAmt] = useState(r.amount ? String(r.amount) : '')
  const [catId, setCat] = useState(r.catId || '')
  const [acc, setAcc] = useState(r.accountId || M.accounts()[0]?.id || '')
  const [to, setTo] = useState(r.toAccountId || '')
  const [freq, setFreq] = useState<M.Freq>(r.freq || 'month')
  const [every, setEvery] = useState(r.every || 1)
  const [next, setNext] = useState(next0)
  const [end, setEnd] = useState(r.end || '')
  const [auto, setAuto] = useState(r.auto ?? true)
  const [sub, setSub] = useState(!!r.sub)
  const [paused, setPaused] = useState(!!r.paused)
  const [url, setUrl] = useState(r.url || '')
  const logged = r.id ? M.txs().filter((x) => x.recurId === r.id) : []
  const save = () => {
    const n = M.parseAmount(amt)
    if (!n) return toast('Enter an amount', undefined, 'error')
    if (!acc) return toast('Pick an account', undefined, 'error')
    if (type === 'transfer' && !to) return toast('Pick where the money goes', undefined, 'error')
    if (type !== 'transfer' && !catId) return toast('Pick a category', undefined, 'error')
    const moved = next !== next0
    M.saveRecur({ ...r, name: name.trim() || (type === 'transfer' ? 'Transfer' : M.catShort(catId)), type, amount: n, catId: type === 'transfer' ? undefined : catId, accountId: acc, toAccountId: type === 'transfer' ? to : undefined, freq, every: Math.max(1, every), start: isNew || moved ? next : r.start, done: isNew || moved ? '' : r.done, end, auto, sub, paused, url: url.trim() })
    const ran = M.runAutoRecurs()
    toast(ran ? `Saved · logged ${ran} past date${ran > 1 ? 's' : ''}` : 'Saved'); onClose()
  }
  const del = async () => {
    if (await ask({ title: `Delete ${r.name || 'this item'}?`, body: logged.length ? `The ${logged.length} transaction${logged.length > 1 ? 's' : ''} it already logged stay in History.` : 'Nothing has been logged from it yet.', confirm: 'Delete', danger: true }) !== 'confirm') return
    remove('mRecur', r.id!)
    toast('Deleted'); onClose()
  }
  const link = safeUrl(url)
  return (
    <Sheet open onClose={onClose} title={isNew ? (sub ? 'New subscription' : 'New recurring') : r.name || 'Recurring'} footer={<div className="row gap8">{!isNew && <Button variant="ghost" icon={<Trash2 size={18} />} aria-label="Delete" onClick={del} />}<Button variant="primary" size="lg" block onClick={save}>Save</Button></div>}>
      <Field label="Name" htmlFor="r-name"><input id="r-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={sub ? 'Netflix, iCloud, CapCut Pro' : 'Salary, rent, car installment'} data-autofocus={isNew || undefined} /></Field>
      <Segmented label="Type" value={type} onChange={setType} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} />
      <AmountInput value={amt} onChange={setAmt} id="r-amount" />
      {type !== 'transfer' && <CatPick kind={type} value={catId} onChange={setCat} />}
      <AccountPick value={acc} onChange={setAcc} label={type === 'income' ? 'Into' : type === 'transfer' ? 'From' : 'Paid from'} exclude={type === 'transfer' ? to : undefined} />
      {type === 'transfer' && <AccountPick value={to} onChange={setTo} label="To" exclude={acc} />}
      <Field label="Repeats">
        <div className="chips">
          {(['day', 'week', 'month', 'year'] as M.Freq[]).map((f) => <button key={f} type="button" className={cx('chip', freq === f && 'on')} onClick={() => setFreq(f)}>{({ day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' })[f]}</button>)}
        </div>
        <div className="row gap8 mt4 small"><span>Every</span><input className="input time tnum" style={{ width: 70 }} type="number" min={1} max={99} value={every} onChange={(e) => setEvery(Math.max(1, +e.target.value || 1))} aria-label="Interval" /><span>{M.FREQ_LABEL[freq][every > 1 ? 1 : 0]}</span></div>
      </Field>
      <div className="grid2">
        <DateField label={isNew ? 'First date' : 'Next date'} value={next} onChange={(v) => setNext(v || today())} />
        <DateField label="Ends" value={end} onChange={setEnd} min={next} placeholder="Never" />
      </div>
      <SwitchRow label="Log automatically" sub={auto ? 'Saved on each date by itself. Good for salary and fixed debits.' : 'Shows on Home when due, with a Pay button. Good for bills that change.'} on={auto} set={setAuto} />
      <SwitchRow label="Subscription" sub="Counted in the subscriptions total" on={sub} set={setSub} />
      {sub && <Field label="Manage link" htmlFor="r-url" hint="Where you cancel or change the plan"><div className="row gap8"><input id="r-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" />{link && <a className="iconbtn boxed" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open link"><ExternalLink size={18} /></a>}</div></Field>}
      {!isNew && <SwitchRow label="Paused" sub="Stops logging and reminders until you turn it back on" on={paused} set={setPaused} />}
      {logged.length > 0 && <p className="small muted tnum">Logged {logged.length} time{logged.length > 1 ? 's' : ''}, {M.rp(logged.reduce((s, x) => s + x.amount, 0))} in total. Last on {fmtDay(logged.map((x) => x.date).sort().pop()!)}.</p>}
    </Sheet>
  )
}

export function SwitchRow({ label, sub, on, set }: { label: string; sub?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="nrow">
      <div className="grow"><div className="nrow-title">{label}</div>{sub && <div className="small muted">{sub}</div>}</div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('switch', on && 'on')} onClick={() => set(!on)}><span /></button>
    </div>
  )
}
