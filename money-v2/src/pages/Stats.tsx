import React, { useState } from 'react'
import { Tag as TagIc, ArrowRight } from 'lucide-react'
import * as M from '../lib/money'
import { today, addDays, startOfWeek, shiftYm, monthLabel, monthEnd, fmtShort, monthShort, daysInMonth, WEEKDAYS, diffDays, fmtDay } from '../lib/date'
import { useRoute, go, setQ } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { PhoneTop, PageHead, Stepper, Bar } from '../ui/Shell'
import { Segmented, Sheet, Button, Empty, toast, cx } from '../ui/kit'
import { Donut, Columns, TxRow, toneVar } from '../ui/parts'
import { CatIc } from '../ui/icons'

type Span = 'week' | 'month' | 'year'
function rangeOf(span: Span, ref: string): M.Range {
  if (span === 'week') { const s = startOfWeek(ref); return { start: s, end: addDays(s, 6) } }
  if (span === 'month') return { start: ref.slice(0, 7) + '-01', end: monthEnd(ref.slice(0, 7)) }
  return M.yearRange(ref.slice(0, 4))
}
const shift = (span: Span, ref: string, n: number) => span === 'week' ? addDays(ref, 7 * n) : span === 'month' ? shiftYm(ref.slice(0, 7), n) + '-01' : `${+ref.slice(0, 4) + n}-01-01`
const label = (span: Span, r: M.Range) => span === 'week' ? `${fmtShort(r.start)} – ${fmtShort(r.end)}` : span === 'month' ? monthLabel(r.start.slice(0, 7)) : r.start.slice(0, 4)

export default function Stats() {
  const route = useRoute()
  const [span, setSpan] = useState<Span>(pref('statSpan', 'month'))
  const [ref, setRef] = useState(today())
  const [kind, setKind] = useState<'out' | 'in'>('out')
  const [drill, setDrill] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(route.q.tag || null)
  const r = rangeOf(span, ref)
  const prevR = rangeOf(span, shift(span, ref, -1))
  const s = M.stats(r), p = M.stats(prevR)
  const isNow = M.inRange(today(), r)
  const map = kind === 'out' ? s.byCat : s.inCat
  const totalK = kind === 'out' ? s.expense : s.income
  const parts = Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, value: v, tone: M.catTone(id) }))
  const delta = p.expense ? (s.expense - p.expense) / p.expense : null

  let cols: { key: string; label: string; out: number; inc?: number; hi?: boolean }[] = []
  if (span === 'week') cols = Array.from({ length: 7 }, (_, i) => { const d = addDays(r.start, i); return { key: d, label: WEEKDAYS[i].slice(0, 1), out: s.byDay[d]?.out || 0, inc: s.byDay[d]?.in || 0, hi: d === today() } })
  else if (span === 'month') { const n = daysInMonth(r.start); cols = Array.from({ length: n }, (_, i) => { const d = addDays(r.start, i); return { key: d, label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', out: s.byDay[d]?.out || 0, hi: d === today() } }) }
  else cols = Array.from({ length: 12 }, (_, i) => { const ym = `${r.start.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`; const m = M.stats({ start: ym + '-01', end: monthEnd(ym) }); return { key: ym, label: monthShort(ym).slice(0, 1), out: m.expense, inc: m.income, hi: ym === today().slice(0, 7) } })
  const days = span === 'year' ? (isNow ? diffDays(today(), r.start) + 1 : 365) : isNow ? diffDays(today(), r.start) + 1 : diffDays(r.end, r.start) + 1
  const top = M.txSorted().filter((x) => M.inRange(x.date, r) && x.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5)
  const tags = M.allTags()

  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="Where it went" title="Stats" />
      <div className="stack" style={{ gap: 16 }}>
        <div className="row gap8 wrap between">
          <Segmented label="Span" className="seg-fit" value={span} onChange={(v) => { setSpan(v); setPref('statSpan', v); setRef(today()) }} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
          <Stepper label={label(span, r)} onPrev={() => setRef(shift(span, ref, -1))} onNext={() => setRef(shift(span, ref, 1))} onReset={() => setRef(today())} showReset={!isNow} />
        </div>

        <div className="stats-grid">
          <div className="stack">
            <div className="calsum">
              <div><span className="eyebrow">Spent</span><b className="tnum">{M.rp(s.expense)}</b>{delta != null && <span className={cx('xs tnum', delta > 0 ? 'neg' : 'pos')}>{delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}% vs last {span}</span>}</div>
              <div><span className="eyebrow">Income</span><b className="tnum pos">{M.rp(s.income)}</b></div>
              <div><span className="eyebrow">{s.net >= 0 ? 'Saved' : 'Short'}</span><b className={cx('tnum', s.net < 0 && 'neg')}>{M.rp(Math.abs(s.net))}</b>{s.income > 0 && <span className="xs muted tnum">{Math.round((s.net / s.income) * 100)}% of income</span>}</div>
            </div>

            <section className="card stack">
              <div className="row between wrap gap8"><h2 className="h3">By category</h2><Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'out', label: 'Spending' }, { value: 'in', label: 'Income' }]} /></div>
              {parts.length ? <>
                <Donut parts={parts} center={M.rpc(totalK)} sub={kind === 'out' ? 'spent' : 'earned'} />
                <div className="legend-list">
                  {parts.map((x) => (
                    <button key={x.id} className="lrow" onClick={() => setDrill(x.id)}>
                      <CatIc id={x.id} size={16} />
                      <span className="grow">
                        <span className="row between"><span className="lrow-name">{M.catShort(x.id)}</span><span className="tnum small">{M.rp(x.value)}</span></span>
                        <span className="lbar"><span style={{ width: (x.value / parts[0].value) * 100 + '%', background: toneVar(x.tone) }} /></span>
                      </span>
                      <span className="xs muted tnum lpct">{Math.round((x.value / totalK) * 100)}%</span>
                    </button>
                  ))}
                </div>
              </> : <p className="muted small">Nothing {kind === 'out' ? 'spent' : 'earned'} in this {span}.</p>}
            </section>
          </div>

          <div className="stack">
            <section className="card stack">
              <div className="row between"><h2 className="h3">{span === 'year' ? 'Month by month' : 'Day by day'}</h2><span className="small muted tnum">{M.rpc(days ? s.expense / days : 0)}/day avg</span></div>
              <Columns cols={cols} onPick={span === 'year' ? (k) => { setSpan('month'); setRef(k + '-01') } : undefined} />
              {span === 'year' && <div className="legend xs muted"><span><span className="dot" style={{ background: 'var(--sage-s)' }} />Income</span><span><span className="dot" style={{ background: 'var(--ink)' }} />Spent</span><span>Tap a month to open it</span></div>}
            </section>

            {top.length > 0 && (
              <section className="stack">
                <div className="section-head"><h2 className="h2 grow">Biggest expenses</h2></div>
                <div className="list">{top.map((x) => <TxRow key={x.id} x={x} showDate />)}</div>
              </section>
            )}

            <section className="stack">
              <div className="section-head"><h2 className="h2 grow">Tags</h2></div>
              {tags.length ? (
                <div className="list">
                  {tags.slice(0, 8).map((t) => (
                    <button key={t.key} className="li" onClick={() => setTag(t.name)}>
                      <span className="ic bg-lavender"><TagIc size={17} /></span>
                      <span className="li-main"><span className="li-title">#{t.name}</span><span className="li-sub">{t.count} entries · {t.first === t.last ? fmtShort(t.first) : `${fmtShort(t.first)} – ${fmtShort(t.last)}`}</span></span>
                      <span className="tx-amt tnum">{M.rp(t.out)}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="small muted">Tag entries with a trip or event (like #Lebaran) to see what it cost in total.</p>}
            </section>
          </div>
        </div>
      </div>
      {drill && <DrillSheet id={drill} r={r} kind={kind} title={label(span, r)} onClose={() => setDrill(null)} />}
      {tag && <TagSheet name={tag} onClose={() => { setTag(null); if (route.q.tag) setQ({ tag: '' }) }} />}
    </main>
  )
}

function DrillSheet({ id, r, kind, title, onClose }: { id: string; r: M.Range; kind: 'out' | 'in'; title: string; onClose: () => void }) {
  const list = M.txSorted().filter((x) => M.inRange(x.date, r) && (kind === 'out' ? M.spendOf(x) > 0 && M.topCatId(M.spendCat(x)) === id : x.type === 'income' && M.topCatId(x.catId) === id))
  const total = list.reduce((s, x) => s + (kind === 'out' ? M.spendOf(x) : x.amount), 0)
  const subs: Record<string, number> = {}
  for (const x of list) { const k = kind === 'out' ? M.spendCat(x) : x.catId || id; subs[k] = (subs[k] || 0) + (kind === 'out' ? M.spendOf(x) : x.amount) }
  const subList = Object.entries(subs).sort((a, b) => b[1] - a[1])
  return (
    <Sheet open onClose={onClose} title={M.catShort(id)} wide>
      <p className="muted tnum">{title} · {M.rp(total)} · {list.length} entries</p>
      {subList.length > 1 && (
        <div className="card stack" style={{ gap: 10 }}>
          {subList.map(([sid, v]) => (
            <div key={sid} className="stack" style={{ gap: 4 }}>
              <div className="row between small"><span>{sid === id ? 'No sub-category' : M.catShort(sid)}</span><span className="tnum">{M.rp(v)}</span></div>
              <Bar pct={v / subList[0][1]} />
            </div>
          ))}
        </div>
      )}
      <div className="list">{list.map((x) => <TxRow key={x.id} x={x} showDate />)}</div>
      <Button onClick={() => { onClose(); go('history', { cat: id }) }}>Open in History <ArrowRight size={16} /></Button>
    </Sheet>
  )
}

function TagSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const info = M.tagIndex()[name.toLowerCase()]
  const list = M.txSorted().filter((x) => M.hasTag(x, name))
  const active = M.settings().activeTag.toLowerCase() === name.toLowerCase()
  const byCat: Record<string, number> = {}
  for (const x of list) { const v = M.spendOf(x); if (v) { const c = M.topCatId(M.spendCat(x)); byCat[c] = (byCat[c] || 0) + v } }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  return (
    <Sheet open onClose={onClose} title={'#' + name} wide>
      {!info ? <Empty title="No entries with this tag" /> : <>
        <div className="calsum">
          <div><span className="eyebrow">Spent</span><b className="tnum">{M.rp(info.out)}</b></div>
          <div><span className="eyebrow">Entries</span><b className="tnum">{info.count}</b></div>
          <div><span className="eyebrow">Dates</span><b className="small">{info.first === info.last ? fmtShort(info.first) : `${fmtShort(info.first)} – ${fmtShort(info.last)}`}</b></div>
        </div>
        {cats.length > 0 && <div className="chips">{cats.map(([c, v]) => <span key={c} className={'badge bg-' + M.catTone(c)}>{M.catShort(c)} · {M.rpc(v)}</span>)}</div>}
        <Button variant={active ? 'secondary' : 'primary'} onClick={() => { M.setSettings({ activeTag: active ? '' : name }); toast(active ? 'Auto-tag off' : `New entries get #${name}`) }}>{active ? 'Stop auto-tagging' : 'Tag new entries automatically'}</Button>
        <div className="list">{list.map((x) => <TxRow key={x.id} x={x} showDate />)}</div>
      </>}
    </Sheet>
  )
}
