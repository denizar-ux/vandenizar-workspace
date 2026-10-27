import React, { useMemo, useState } from 'react'
import { Search, X, Plus, Repeat } from 'lucide-react'
import * as M from '../lib/money'
import { today, shiftYm, monthLabel, daysInMonth, dow, fmtDay, WEEKDAYS, monthEnd, diffDays } from '../lib/date'
import { useRoute, setQ } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { PhoneTop, PageHead, Stepper } from '../ui/Shell'
import { Segmented, Chips, Empty, Button, cx } from '../ui/kit'
import { DayGroups, TxRow } from '../ui/parts'
import { openTx } from '../ui/TxSheet'
import { CatIc } from '../ui/icons'

export default function History() {
  const r = useRoute()
  const [view, setView] = useState<'list' | 'cal'>(pref('histView', 'list'))
  const [ym, setYm] = useState(r.q.m || today().slice(0, 7))
  const cur = today().slice(0, 7)
  const sv = (v: 'list' | 'cal') => { setView(v); setPref('histView', v) }
  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="Every rupiah" title="History" />
      <div className="stack" style={{ gap: 16 }}>
        <div className="row gap8 wrap between">
          <Segmented label="View" className="seg-fit" value={view} onChange={sv} options={[{ value: 'list', label: 'List' }, { value: 'cal', label: 'Calendar' }]} />
          <Stepper label={monthLabel(ym)} onPrev={() => setYm(shiftYm(ym, -1))} onNext={() => setYm(shiftYm(ym, 1))} onReset={() => setYm(cur)} showReset={ym !== cur} />
        </div>
        {view === 'list' ? <ListView ym={ym} /> : <CalView ym={ym} />}
      </div>
    </main>
  )
}

function ListView({ ym }: { ym: string }) {
  const r = useRoute()
  const [q, setQs] = useState('')
  const [type, setType] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const fCat = r.q.cat || '', fTag = r.q.tag || '', fAcc = r.q.acc || ''
  const range = { start: ym + '-01', end: monthEnd(ym) }
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return M.txSorted().filter((x) => {
      if (!s && !M.inRange(x.date, range)) return false
      if (type === 'expense' && !M.spendOf(x)) return false
      if (type !== 'all' && type !== 'expense' && x.type !== type) return false
      if (fCat && M.topCatId(M.spendCat(x)) !== fCat && M.spendCat(x) !== fCat) return false
      if (fTag && !M.hasTag(x, fTag)) return false
      if (fAcc && x.accountId !== fAcc && x.toAccountId !== fAcc) return false
      if (s) {
        const hay = [x.note, M.catLabel(x.catId), M.accName(x.accountId), M.accName(x.toAccountId), ...M.txTags(x), String(x.amount)].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [q, type, ym, fCat, fTag, fAcc, M.txs()])
  const out = list.reduce((s, x) => s + M.spendOf(x), 0), inc = list.reduce((s, x) => s + (x.type === 'income' ? x.amount : 0), 0)
  return (
    <>
      <div className="search"><Search size={18} /><input id="hist-search" className="input" placeholder="Search transactions" value={q} onChange={(e) => setQs(e.target.value)} aria-label="Search all transactions" /></div>
      <Chips label="Type" value={type} onChange={setType} scroll options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfers' }]} />
      {(fCat || fTag || fAcc) && (
        <div className="chips">
          {fCat && <button className="chip on chip-x" onClick={() => setQ({ cat: '' })}>{M.catLabel(fCat)} <X size={14} /></button>}
          {fTag && <button className="chip on chip-x" onClick={() => setQ({ tag: '' })}>#{fTag} <X size={14} /></button>}
          {fAcc && <button className="chip on chip-x" onClick={() => setQ({ acc: '' })}>{M.accName(fAcc)} <X size={14} /></button>}
        </div>
      )}
      <p className="small muted tnum">{q ? 'All months · ' : ''}{list.length} transaction{list.length === 1 ? '' : 's'} · spent {M.rp(out)}{inc ? ` · in ${M.rp(inc)}` : ''}</p>
      <DayGroups list={list} empty={<Empty title={q ? 'No matches' : 'Nothing this month'} body={q ? 'Try a different word or amount.' : 'Transactions you log show up here, newest first.'} action={!q ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => openTx({})}>New transaction</Button> : undefined} />} />
    </>
  )
}

function CalView({ ym }: { ym: string }) {
  const t0 = today()
  const [sel, setSel] = useState(ym === t0.slice(0, 7) ? t0 : ym + '-01')
  const selDay = sel.slice(0, 7) === ym ? sel : ym + '-01'
  const range = { start: ym + '-01', end: monthEnd(ym) }
  const s = M.stats(range)
  const planned = M.plannedOn(range.start, range.end)
  const max = Math.max(1, ...Object.values(s.byDay).map((d) => d.out))
  const n = daysInMonth(range.start), lead = dow(range.start)
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  const days = ym === t0.slice(0, 7) ? +t0.slice(8) : ym < t0.slice(0, 7) ? n : 0
  const dayList = M.txSorted().filter((x) => x.date === selDay)
  const dayPlan = planned[selDay] || []
  return (
    <div className="cal-wrap">
      <div className="stack">
        <div className="calsum">
          <div><span className="eyebrow">Spent</span><b className="tnum">{M.rp(s.expense)}</b></div>
          <div><span className="eyebrow">Income</span><b className="tnum pos">{M.rp(s.income)}</b></div>
          <div><span className="eyebrow">Per day</span><b className="tnum">{M.rp(days ? s.expense / days : 0)}</b></div>
        </div>
        <div className="month" role="grid" aria-label={monthLabel(ym)}>
          {WEEKDAYS.map((w) => <div key={w} className="mhead">{w.slice(0, 1)}<span className="sr">{w}</span></div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'e' + i} className="mcell out" aria-hidden />
            const day = s.byDay[d]
            const out = day?.out || 0
            const heat = out ? 0.18 + 0.82 * (out / max) : 0
            return (
              <button key={d} className={cx('mcell', d === t0 && 'today', d === selDay && 'sel')} onClick={() => setSel(d)} style={heat ? { background: `color-mix(in srgb, var(--peach-s) ${Math.round(heat * 70)}%, var(--surface))` } : undefined} aria-label={`${fmtDay(d)}: spent ${M.rp(out)}`}>
                <span className="mnum">{+d.slice(8)}</span>
                {out > 0 && <span className="mamt tnum">{M.rpc(out)}</span>}
                <span className="dots row gap4">{day?.in ? <span className="dot dot-in" /> : null}{planned[d] ? <span className="dot dot-plan" /> : null}</span>
              </button>
            )
          })}
        </div>
        <div className="legend xs muted"><span><span className="dot dot-in" />Income</span><span><span className="dot dot-plan" />Recurring due</span><span>Darker = spent more</span></div>
      </div>
      <div className="day-panel stack">
        <div className="section-head"><h2 className="h2 grow">{fmtDay(selDay)}</h2><Button size="sm" icon={<Plus size={16} />} onClick={() => openTx({ date: selDay })}>Add</Button></div>
        {dayPlan.length > 0 && (
          <div className="list">
            {dayPlan.map(({ r, date }) => (
              <button key={r.id} className="li" onClick={() => !r.auto && openTx({ due: { r, date } })} disabled={r.auto && date > t0}>
                <CatIc id={r.type === 'transfer' ? 'fee' : r.catId} />
                <span className="li-main"><span className="li-title">{r.name}</span><span className="li-sub">{r.auto ? 'Logs itself' : date < t0 ? 'Not logged yet' : 'Planned'} <Repeat size={12} style={{ verticalAlign: -1 }} /></span></span>
                <span className="tx-amt tnum muted">{M.rp(r.amount)}</span>
              </button>
            ))}
          </div>
        )}
        {dayList.length ? <div className="list">{dayList.map((x) => <TxRow key={x.id} x={x} />)}</div> : !dayPlan.length && <p className="muted small">Nothing on this day.</p>}
      </div>
    </div>
  )
}
