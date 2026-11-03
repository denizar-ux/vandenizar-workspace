import React, { useEffect, useState } from 'react'
import { ArrowRight, Plus, Minus, ArrowLeftRight, Tag as TagIc, AlertCircle, Repeat, SkipForward, Target, Wallet, CreditCard, TrendingUp, ChevronDown } from 'lucide-react'
import * as M from '../lib/money'
import { today, addDays, fmtDay, greeting, nowTime, relDay, monthLabel, monthShort, diffDays, shiftYm, monthEnd, daysInMonth } from '../lib/date'
import { go } from '../lib/router'
import { PhoneActions } from '../ui/Shell'
import { Button, toast, cx, Menu } from '../ui/kit'
import { openTx } from '../ui/TxSheet'
import { TxRow } from '../ui/parts'
import { CatIc } from '../ui/icons'
import { openBalances, needsBalances } from '../ui/Balances'

/** Rupiah with a small, quiet "Rp" so the number carries the weight. */
function Money({ n }: { n: number }) {
  if (M.hidden()) return <>•••</>
  const v = Math.round(n || 0)
  return <>{v < 0 ? '−' : ''}<small className="rp">Rp</small>{M.rp(Math.abs(v)).replace(/^Rp/, '')}</>
}

/** Striped budget bar with the percentage inside. Hidden mode shows no shape. */
function StripeBar({ pct }: { pct: number }) {
  const h = M.hidden()
  const p = Math.max(0, Math.min(1, pct || 0))
  return (
    <span className={cx('sbar', pct > 1 && 'over', pct > 0.85 && pct <= 1 && 'warn')} role="progressbar" aria-valuenow={h ? undefined : Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className="sbar-fill" style={{ width: h ? 0 : p * 100 + '%' }} />
      <span className="sbar-pct tnum">{h ? '•••' : Math.round((pct || 0) * 100) + '%'}</span>
    </span>
  )
}

/** Six months of spending as rounded bars; tap a month to read it. */
function SpendingBars({ ym }: { ym: string }) {
  const [sel, setSel] = useState(5)
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = shiftYm(ym, i - 5)
    const s = M.stats({ start: m + '-01', end: monthEnd(m) })
    return { m, out: s.expense, inc: s.income }
  })
  const max = Math.max(1, ...months.map((x) => x.out))
  const cur = months[sel], prev = months[sel - 1]
  const delta = prev && prev.out && sel < 5 ? (cur.out - prev.out) / prev.out : null
  const hide = M.hidden()
  return (
    <section className={cx('bars-card', hide && 'is-hidden')}>
      <div className="section-head"><h2 className="h2 grow">Spending activity</h2><button className="pill-soft" onClick={() => go('stats')}>Stats <ArrowRight size={13} /></button></div>
      <div className="bars-body">
        <div className="bars-num">
          <span className="bn-amt tnum">{M.rpc(cur.out)}</span>
          <span className="bn-sub">{monthLabel(cur.m)}{sel === 5 ? ' so far' : ''}</span>
          {delta != null && isFinite(delta) && !hide && <span className={cx('bn-delta tnum', delta > 0 ? 'up' : 'down')}>{delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}% vs {monthShort(prev.m)}</span>}
          <span className="bn-inc tnum">Income {M.rp(cur.inc)}</span>
        </div>
        <div className="bars" role="group" aria-label="Spending per month">
          {months.map((x, i) => (
            <button key={x.m} className={cx('bar', i === sel && 'on')} onClick={() => setSel(i)} aria-pressed={i === sel} aria-label={`${monthLabel(x.m)}: spent ${M.rp(x.out)}`}>
              <span className="bar-col"><span className="bar-fill" style={{ height: Math.max(6, (x.out / max) * 100) + '%' }} /></span>
              <span className="bar-lb">{monthShort(x.m).slice(0, 1)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i) }, [])
  const t0 = today(), ym = t0.slice(0, 7), dayN = +t0.slice(8)
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
  const subs = M.recurs().filter((r) => r.sub && !r.paused)
  const hide = M.hidden()

  // Same stretch of last month (1st to today's date). Only shown from day 7, before that it is noise.
  const pm = shiftYm(ym, -1)
  const prevSame = M.spentIn({ start: pm + '-01', end: `${pm}-${String(Math.min(dayN, daysInMonth(pm + '-01'))).padStart(2, '0')}` })
  const cmp = dayN >= 7 && prevSame > 0 ? (month.expense - prevSame) / prevSame : null

  const dayPct = al && al.perDay ? al.spentToday / al.perDay : 0

  return (
    <main className="main wide vz-home">
      <header className="prof">
        <span className="prof-av" aria-hidden>{(st.name || 'V').trim().slice(0, 1).toUpperCase()}</span>
        <div className="prof-main"><div className="prof-sub">{greeting()}</div><div className="prof-name">{st.name || 'there'}</div></div>
        <div className="prof-act only-phone"><PhoneActions /></div>
      </header>

      <div className="today-grid">
        <div className="stack">
          <button className={cx('hero', tb && tb.status === 'over' && 'hero-over')} onClick={() => go('budget')}>
            <span className="hero-top">
              <span className="hero-chip"><Target size={14} />{monthLabel(ym)} spending</span>
              <span className="hero-go" aria-hidden><ArrowRight size={16} /></span>
            </span>
            <span className="hero-amt tnum"><Money n={month.expense} /></span>
            <span className="hero-sub">
              spent this month
              {cmp != null && isFinite(cmp) && !hide && <span className={cx('hero-pill', cmp > 0 && 'up')}><ChevronDown size={13} />{Math.abs(Math.round(cmp * 100))}% {cmp > 0 ? 'more' : 'less'} than this point last month</span>}
            </span>
            {tb ? (
              <span className="hero-limit">
                <span className="hl-row"><span>Budget used</span><span className="tnum">{M.rpc(tb.spent)} of {M.rpc(total!.amount)}</span></span>
                <StripeBar pct={tb.pct} />
                <span className="hero-foot tnum"><b>{tb.left >= 0 ? `${M.rp(tb.left)} left` : `${M.rp(-tb.left)} over`}</b>{tb.left > 0 ? ` · ${M.rp(tb.perDay)} a day for ${tb.daysLeft} days` : ` · spent ${M.rp(tb.spent)} of ${M.rp(total!.amount)}`}</span>
              </span>
            ) : (
              <span className="hero-foot tnum">Income {M.rp(month.income)} · {month.net >= 0 ? 'saved' : 'short'} {M.rp(Math.abs(month.net))} · <b>Set a monthly budget →</b></span>
            )}
          </button>

          <section className="qa-wrap" aria-label="Quick actions">
            <div className="qa" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <button className="qa-b" onClick={() => openTx({ type: 'expense' })}><span className="qa-ic"><Minus size={19} /></span>Expense</button>
              <button className="qa-b" onClick={() => openTx({ type: 'income' })}><span className="qa-ic"><Plus size={19} /></span>Income</button>
              <button className="qa-b" onClick={() => openTx({ type: 'transfer' })}><span className="qa-ic"><ArrowLeftRight size={19} /></span>Transfer</button>
              <button className="qa-b" onClick={() => go('budget', { tab: 'recurring' })}><span className="qa-ic"><Repeat size={19} /></span>Recurring</button>
            </div>
          </section>

          <button className="today-card" onClick={() => openTx({ type: 'expense', accountId: al?.acc.id })} aria-label="Log an expense for today">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="tc-label">Today · {fmtDay(t0)} · {nowTime().replace(':', '.')} WIB</div>
              <div className="tc-amt tnum"><Money n={todaySpent} /></div>
              <div className="tc-sub tnum">{al ? (al.leftToday >= 0 ? `${M.rp(al.leftToday)} left of ${M.rp(al.perDay)} in ${al.acc.name}` : `${M.rp(-al.leftToday)} over your daily ${M.rp(al.perDay)}`) : 'spent today'}</div>
              {al && al.perDay > 0 && <div className={cx('tc-bar', dayPct > 1 && 'over')} aria-hidden><span style={{ width: hide ? 0 : Math.min(100, dayPct * 100) + '%' }} /></div>}
            </div>
            <span className="tc-go" aria-hidden><Plus size={20} /></span>
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

          {(due.length > 0 || autos.length > 0) && (
            <section className="stack" style={{ gap: 8 }}>
              <div className="section-head"><h2 className="h2 grow">Coming up</h2><button className="linkbtn see" onClick={() => go('budget', { tab: 'recurring' })}>All recurring <ArrowRight size={14} /></button></div>
              <div className="cu-row">
                {due.map(({ r, date }) => {
                  const late = date < t0
                  return (
                    <div key={r.id} className="cu">
                      <div className="cu-top">
                        <CatIc id={r.type === 'transfer' ? 'fee' : r.catId} />
                        <Menu items={[{ label: 'Skip this time', icon: <SkipForward size={17} />, onSelect: () => { M.skipRecur(r, date); toast(`Skipped ${r.name} for ${fmtDay(date)}`) } }]} />
                      </div>
                      <button className="cu-main" aria-label={`Log ${r.name}`} onClick={() => openTx({ due: { r, date } })}>
                        <span className="cu-name">{r.name}</span>
                        <span className={cx('cu-date', late && 'late-t')}>{late ? `${diffDays(t0, date)} day${diffDays(t0, date) > 1 ? 's' : ''} late` : relDay(date)}</span>
                        <span className="cu-sub">{M.accName(r.accountId)}</span>
                        <span className="cu-amt tnum">{M.rp(r.amount)}</span>
                        <span className="cu-log">Tap to log</span>
                      </button>
                    </div>
                  )
                })}
                {autos.map(({ r, date }) => (
                  <div key={r.id + date} className="cu">
                    <div className="cu-top"><CatIc id={r.type === 'transfer' ? 'fee' : r.catId} /><span className="cu-auto" title="Logs itself"><Repeat size={14} /></span></div>
                    <div className="cu-main">
                      <span className="cu-name">{r.name}</span>
                      <span className="cu-date">{relDay(date)}</span>
                      <span className="cu-sub">logs itself</span>
                      <span className={cx('cu-amt tnum', r.type === 'income' && 'pos')}>{r.type === 'income' ? '+' : ''}{M.rp(r.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="minis">
            <button className="mini mini-wide" onClick={() => go('accounts')}>
              <span className="mini-ic"><Wallet size={18} /></span>
              <span className="mw-main">
                <span className="mini-label">Net worth · {M.accounts().length} accounts</span>
                <span className="mini-val tnum"><Money n={tot.net} /></span>
                <span className="mw-split tnum"><span>Cash <b>{M.rpc(tot.cash)}</b></span>{tot.invest !== 0 && <span>Invest <b>{M.rpc(tot.invest)}</b></span>}{tot.cardDebt > 0 && <span>Card <b>−{M.rpc(tot.cardDebt)}</b></span>}</span>
              </span>
              <ArrowRight size={16} className="muted" />
            </button>
            {ci && card && (
              <button className={cx('mini', ci.billLeft > 0 && ci.daysToDue <= 3 && 'mini-warn')} onClick={() => go('accounts')}>
                <span className="mini-ic"><CreditCard size={17} /></span>
                <span className="mini-label">{card.name}</span>
                <span className="mini-val tnum"><Money n={ci.billLeft || ci.owed} /></span>
                <span className="mini-foot">{ci.billLeft > 0 ? `Due ${relDay(ci.due).toLowerCase()}` : ci.owed ? 'This cycle so far' : 'Nothing owed'}</span>
              </button>
            )}
            <button className="mini" onClick={() => go('budget', { tab: 'recurring' })}>
              <span className="mini-ic"><Repeat size={17} /></span>
              <span className="mini-label">Subscriptions</span>
              <span className="mini-val tnum"><Money n={subs.reduce((s, r) => s + M.monthlyCost(r), 0)} /><small> /mo</small></span>
              <span className="mini-foot">{subs.length} active</span>
            </button>
            {!al && (
              <button className="mini" onClick={() => go('stats')}>
                <span className="mini-ic"><TrendingUp size={17} /></span>
                <span className="mini-label">Income this month</span>
                <span className="mini-val tnum"><Money n={month.income} /></span>
                <span className="mini-foot">See stats</span>
              </button>
            )}
          </div>
        </div>

        <div className="stack">
          <SpendingBars ym={ym} />
          <section className="stack" style={{ gap: 8 }}>
            <div className="section-head"><h2 className="h2 grow">Recent</h2>{recent.length > 0 && <button className="linkbtn see" onClick={() => go('history')}>See all <ArrowRight size={14} /></button>}</div>
            {recent.length ? <div className="list">{recent.map((x) => <TxRow key={x.id} x={x} showDate />)}</div> : (
              <div className="today-empty stack" style={{ gap: 12 }}>
                <p className="muted">Nothing logged yet. Start with today's first expense, it takes a few seconds.</p>
                <Button variant="primary" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => openTx({ type: 'expense' })}>Log an expense</Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
