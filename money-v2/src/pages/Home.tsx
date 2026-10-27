import React, { useEffect, useState } from 'react'
import { Check, ArrowRight, Plus, Tag as TagIc, AlertCircle, Repeat, SkipForward } from 'lucide-react'
import * as M from '../lib/money'
import { today, addDays, fmtDay, greeting, nowTime, relDay, monthLabel, diffDays } from '../lib/date'
import { go } from '../lib/router'
import { PhoneTop, Bar } from '../ui/Shell'
import { Button, toast, cx, Menu } from '../ui/kit'
import { openTx } from '../ui/TxSheet'
import { TxRow } from '../ui/parts'
import { CatIc } from '../ui/icons'
import { openBalances, needsBalances } from '../ui/Balances'
import { Wallet } from 'lucide-react'

export default function Home() {
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i) }, [])
  const t0 = today(), ym = t0.slice(0, 7)
  const st = M.settings()
  const month = M.stats(M.periodRange('month'))
  const todaySpent = M.spentIn({ start: t0, end: t0 })
  const total = M.budgets().find((b) => !b.catId && b.period === 'month')
  const tb = total ? M.budgetState(total) : null
  const alerts = M.budgets().filter((b) => b.catId).map((b) => ({ b, s: M.budgetState(b) })).filter((x) => x.s.active && x.s.status !== 'ok')
  const al = M.allowance()
  const tot = M.totals()
  const card = M.accounts().find((a) => a.type === 'credit')
  const ci = card ? M.cardInfo(card) : null
  const due = M.dueList(addDays(t0, 7))
  const autos = M.recurs().filter((r) => r.auto && !r.paused).map((r) => ({ r, date: M.nextDue(r) })).filter((x) => x.date && x.date <= addDays(t0, 7)) as { r: M.Recur; date: string }[]
  const recent = M.txSorted().slice(0, 6)
  const tag = st.activeTag ? M.tagIndex()[st.activeTag.toLowerCase()] : null

  return (
    <main className="main wide">
      <PhoneTop />
      <div className="hello">
        <div className="hello-line">{greeting()}, {st.name || 'there'}</div>
        <div className="eyebrow">{fmtDay(t0, { long: true })} · {nowTime().replace(':', '.')} WIB</div>
        <h1 className="page-title tnum">{M.rp(todaySpent)}</h1>
        <div className="hello-line">spent today{al ? ` · ${al.leftToday >= 0 ? M.rp(al.leftToday) + ' left in ' + al.acc.name : M.rp(-al.leftToday) + ' over your daily ' + M.rp(al.perDay)}` : ''}</div>
      </div>

      <div className="today-grid">
        <div className="stack">
          <button className={cx('upnext tap', tb ? (tb.status === 'over' ? 'tint-rose' : 'tint-butter') : 'tint-cyan')} onClick={() => go('budget')}>
            <span className="eyebrow">{monthLabel(ym)}{tb ? ' budget' : ''}</span>
            {tb ? <>
              <span className="upnext-title tnum">{tb.left >= 0 ? `${M.rp(tb.left)} left` : `${M.rp(-tb.left)} over`}</span>
              <Bar pct={tb.pct} status={tb.status} />
              <span className="small ink2 tnum">{tb.left > 0 ? `${M.rp(tb.perDay)} a day for ${tb.daysLeft} days · ` : ''}spent {M.rp(tb.spent)} of {M.rp(total!.amount)}</span>
            </> : <>
              <span className="upnext-title tnum">{M.rp(month.expense)} spent</span>
              <span className="small ink2 tnum">Income {M.rp(month.income)} · {month.net >= 0 ? 'saved' : 'short'} {M.rp(Math.abs(month.net))}</span>
              <span className="tile-plan">Set a monthly budget <ArrowRight size={15} /></span>
            </>}
          </button>

          {needsBalances() && (
            <button className="banner tap tint-butter" onClick={openBalances}>
              <Wallet size={18} /><span className="grow"><b>Set your starting balances</b> so net worth and the daily allowance show real numbers.</span><ArrowRight size={16} />
            </button>
          )}

          {alerts.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {alerts.slice(0, 3).map(({ b, s }) => (
                <button key={b.id} className={cx('banner tap', s.status === 'over' ? 'tint-rose' : 'tint-peach')} onClick={() => go('budget')}>
                  <AlertCircle size={18} />
                  <span className="grow">{M.budgetName(b)} {s.status === 'over' ? <>is <b className="tnum">{M.rp(-s.left)}</b> over</> : <>at {Math.round(s.pct * 100)}% with {s.daysLeft} days to go</>}</span>
                  <span className="xs ink2">{M.PERIOD_LABEL[b.period]}</span>
                </button>
              ))}
            </div>
          )}

          {tag && (
            <button className="banner tap tint-lavender" onClick={() => go('stats', { tag: tag.name })}>
              <TagIc size={18} /><span className="grow">New entries get <b>#{tag.name}</b> · {M.rp(tag.out)} so far</span><ArrowRight size={16} />
            </button>
          )}

          <div className="tiles">
            <button className="tile tint-sage" onClick={() => go('accounts')}>
              <span className="eyebrow">Net worth</span>
              <span className="tile-title tnum">{M.rp(tot.net)}</span>
              <span className="tile-foot small ink2">{M.accounts().length} accounts</span>
            </button>
            {al ? (
              <button className="tile tint-cyan" onClick={() => openTx({ type: 'expense', accountId: al.acc.id })}>
                <span className="eyebrow">Daily allowance</span>
                <span className="tile-title tnum">{M.rp(al.perDay)}</span>
                <span className="tile-foot small ink2">{al.acc.name} · {al.daysLeft} days left</span>
              </button>
            ) : (
              <button className="tile tint-cyan" onClick={() => go('stats')}>
                <span className="eyebrow">Income this month</span>
                <span className="tile-title tnum">{M.rp(month.income)}</span>
                <span className="tile-foot small ink2">See stats</span>
              </button>
            )}
            {ci && card && (
              <button className={cx('tile', ci.billLeft > 0 && ci.daysToDue <= 3 ? 'tint-rose' : 'tint-lavender')} onClick={() => go('accounts')}>
                <span className="eyebrow">{card.name}</span>
                <span className="tile-title tnum">{M.rp(ci.billLeft || ci.owed)}</span>
                <span className="tile-foot small ink2">{ci.billLeft > 0 ? `Due ${relDay(ci.due).toLowerCase()}` : ci.owed ? 'This cycle so far' : 'Nothing owed'}</span>
              </button>
            )}
            <button className="tile tint-peach" onClick={() => go('budget', { tab: 'recurring' })}>
              <span className="eyebrow">Subscriptions</span>
              <span className="tile-title tnum">{M.rp(M.recurs().filter((r) => r.sub && !r.paused).reduce((s, r) => s + M.monthlyCost(r), 0))}</span>
              <span className="tile-foot small ink2">a month · {M.recurs().filter((r) => r.sub && !r.paused).length} active</span>
            </button>
          </div>
        </div>

        <div className="stack">
          {(due.length > 0 || autos.length > 0) && <>
            <div className="section-head"><h2 className="h2 grow">Coming up</h2><button className="linkbtn" onClick={() => go('budget', { tab: 'recurring' })}>All recurring</button></div>
            <div className="list">
              {due.map(({ r, date }) => {
                const late = date < t0
                return (
                  <div key={r.id} className="li">
                    <button className={cx('task-check')} style={{ marginTop: 0 }} aria-label={`Log ${r.name}`} onClick={() => openTx({ due: { r, date } })} />
                    <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => openTx({ due: { r, date } })}>
                      <span className="li-title">{r.name}</span>
                      <span className={cx('li-sub', late && 'late-t')}>{late ? `${diffDays(t0, date)} day${diffDays(t0, date) > 1 ? 's' : ''} late` : relDay(date)} · {M.accName(r.accountId)}</span>
                    </button>
                    <span className="tx-amt tnum">{M.rp(r.amount)}</span>
                    <Menu items={[{ label: 'Skip this time', icon: <SkipForward size={17} />, onSelect: () => { M.skipRecur(r, date); toast(`Skipped ${r.name} for ${fmtDay(date)}`) } }]} />
                  </div>
                )
              })}
              {autos.map(({ r, date }) => (
                <div key={r.id + date} className="li">
                  <CatIc id={r.type === 'transfer' ? 'fee' : r.catId} />
                  <span className="li-main"><span className="li-title">{r.name}</span><span className="li-sub">{relDay(date)} · logs itself <Repeat size={12} style={{ verticalAlign: -1 }} /></span></span>
                  <span className={cx('tx-amt tnum', r.type === 'income' && 'pos')}>{r.type === 'income' ? '+' : ''}{M.rp(r.amount)}</span>
                </div>
              ))}
            </div>
          </>}

          <div className="section-head"><h2 className="h2 grow">Recent</h2>{recent.length > 0 && <button className="linkbtn" onClick={() => go('history')}>See all</button>}</div>
          {recent.length ? <div className="list">{recent.map((x) => <TxRow key={x.id} x={x} showDate />)}</div> : (
            <div className="today-empty">
              <p className="muted">Nothing logged yet. Start with today's first expense, it takes a few seconds.</p>
              <Button variant="primary" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => openTx({ type: 'expense' })}>Log an expense</Button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
