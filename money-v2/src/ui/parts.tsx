import React from 'react'
import { ArrowLeftRight, Scale, HandCoins, Repeat } from 'lucide-react'
import * as M from '../lib/money'
import { get } from '../lib/store'
import { fmtDay, relDay } from '../lib/date'
import { openTx } from './TxSheet'
import { CatIc, AccIc } from './icons'
import { cx } from './kit'

export function txTitle(x: M.Tx) {
  if (x.note) return x.note
  if (x.type === 'transfer') return `${M.accName(x.accountId)} → ${M.accName(x.toAccountId)}`
  if (x.type === 'adjust') return 'Balance adjustment'
  if (x.type === 'debt') { const d = get<M.Debt>('mDebts', x.debtId); return d ? `${({ lend: 'Lent to', borrow: 'Borrowed from', repay: 'Paid back', collect: 'Got back from' } as any)[x.action!]} ${d.person}` : 'Debt' }
  return M.catShort(x.catId)
}

export function TxRow({ x, showDate }: { x: M.Tx; showDate?: boolean }) {
  const a = M.account(x.accountId)
  const sub = [
    x.type === 'expense' || x.type === 'income' ? (x.note ? M.catLabel(x.catId) : M.cat(x.catId)?.parentId ? M.catLabel(x.catId).split(' · ')[0] : '') : x.type === 'transfer' && x.note ? `${M.accName(x.accountId)} → ${M.accName(x.toAccountId)}` : '',
    x.type !== 'transfer' ? a?.name : '',
    showDate ? relDay(x.date) : x.time ? x.time.replace(':', '.') : '',
  ].filter(Boolean).join(' · ')
  const sign = x.type === 'income' ? 1 : x.type === 'expense' ? -1 : x.type === 'adjust' ? Math.sign(x.amount) : x.type === 'debt' ? (x.action === 'borrow' || x.action === 'collect' ? 1 : -1) : 0
  const Ic = x.type === 'transfer' ? ArrowLeftRight : x.type === 'adjust' ? Scale : x.type === 'debt' ? HandCoins : null
  return (
    <button className="li tx" onClick={() => openTx({ tx: x })}>
      {Ic ? <span className="ic bg-grey"><Ic size={18} /></span> : <CatIc id={x.catId} />}
      <span className="li-main">
        <span className="li-title">{txTitle(x)}</span>
        <span className="li-sub">{sub}{x.recurId && <Repeat size={12} style={{ marginLeft: 6, verticalAlign: -1 }} aria-label="Recurring" />}{M.txTags(x).map((t) => <span key={t} className="tagmini">#{t}</span>)}</span>
      </span>
      <span className="tx-amt">
        <span className={cx('tnum', sign > 0 && 'pos', sign === 0 && 'muted')}>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{M.rp(Math.abs(x.amount))}</span>
        {x.type === 'transfer' && !!x.fee && <span className="xs muted tnum">fee {M.rpc(x.fee)}</span>}
      </span>
    </button>
  )
}

/** List grouped by day with the day's spending on the right. */
export function DayGroups({ list, empty }: { list: M.Tx[]; empty?: React.ReactNode }) {
  if (!list.length) return <>{empty}</>
  const groups: { date: string; items: M.Tx[] }[] = []
  for (const x of list) { const g = groups[groups.length - 1]; if (g && g.date === x.date) g.items.push(x); else groups.push({ date: x.date, items: [x] }) }
  return (
    <div className="stack" style={{ gap: 18 }}>
      {groups.map((g) => {
        const out = g.items.reduce((s, x) => s + M.spendOf(x), 0)
        const inc = g.items.reduce((s, x) => s + (x.type === 'income' ? x.amount : 0), 0)
        return (
          <section key={g.date} className="stack" style={{ gap: 6 }}>
            <div className="dayhead"><span className="group-title">{relDay(g.date) === fmtDay(g.date) ? fmtDay(g.date) : `${relDay(g.date)} · ${fmtDay(g.date)}`}</span><span className="small muted tnum">{inc ? <span className="pos">+{M.rpc(inc)}</span> : null}{inc && out ? '  ' : ''}{out ? '−' + M.rpc(out) : ''}</span></div>
            <div className="list">{g.items.map((x) => <TxRow key={x.id} x={x} />)}</div>
          </section>
        )
      })}
    </div>
  )
}

const TONE_VAR: Record<string, string> = { cyan: '--cyan-s', lavender: '--lavender-s', rose: '--rose-s', peach: '--peach-s', butter: '--butter-s', sage: '--sage-s', grey: '--grey-s' }
export const toneVar = (t: string) => `var(${TONE_VAR[t] || '--grey-s'})`

/** Donut of shares; segments use the category tones. */
export function Donut({ parts, center, sub }: { parts: { id: string; value: number; tone: string }[]; center: string; sub: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const R = 52, CIRC = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${sub}: ${center}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {total > 0 && parts.map((p) => {
          const len = (p.value / total) * CIRC
          const gap = parts.length > 1 ? Math.min(2, len / 3) : 0
          const el = <circle key={p.id} cx="70" cy="70" r={R} fill="none" stroke={toneVar(p.tone)} strokeWidth="18" strokeDasharray={`${Math.max(0, len - gap)} ${CIRC}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
          acc += len
          return el
        })}
      </svg>
      <div className="donut-mid"><b className="tnum">{center}</b><span>{sub}</span></div>
    </div>
  )
}

/** Simple column chart; `hi` marks the current column. */
export function Columns({ cols, onPick, sel }: { cols: { key: string; label: string; out: number; inc?: number; hi?: boolean }[]; onPick?: (k: string) => void; sel?: string }) {
  const max = Math.max(1, ...cols.map((c) => Math.max(c.out, c.inc || 0)))
  const showInc = cols.some((c) => c.inc)
  return (
    <div className="cols" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map((c) => (
        <button key={c.key} type="button" className={cx('col-b', c.hi && 'hi', sel === c.key && 'sel')} onClick={() => onPick?.(c.key)} aria-label={`${c.label}: spent ${M.rp(c.out)}${showInc ? `, income ${M.rp(c.inc || 0)}` : ''}`} disabled={!onPick}>
          <span className="col-bars">
            {showInc && <span className="col-in" style={{ height: ((c.inc || 0) / max) * 100 + '%' }} />}
            <span className="col-out" style={{ height: (c.out / max) * 100 + '%' }} />
          </span>
          <span className="col-l">{c.label}</span>
        </button>
      ))}
    </div>
  )
}

export function AccRow({ a, onClick, right }: { a: M.Account; onClick?: () => void; right?: React.ReactNode }) {
  const b = M.balances()[a.id] || 0
  return (
    <button className="li" onClick={onClick}>
      <AccIc a={a} />
      <span className="li-main"><span className="li-title">{a.name}</span><span className="li-sub">{[a.bank, M.ACC_TYPES.find((t) => t.id === a.type)?.label].filter(Boolean).join(' · ')}</span></span>
      {right ?? <span className={cx('tx-amt tnum', b < 0 && 'neg')}>{a.type === 'credit' && b < 0 ? M.rp(-b) + ' owed' : M.rp(b)}</span>}
    </button>
  )
}
