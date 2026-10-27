// Money model: accounts, transactions, categories (with sub-categories), budgets (weekly / monthly / custom),
// recurring transactions and subscriptions, debts, tags. Whole rupiah. Dates are WIB 'YYYY-MM-DD'.
import { get, all, put, patch, remove, uid, ver } from './store'
import { today, addDays, diffDays, daysInMonth, startOfWeek, addMonths, shiftYm, monthEnd, nowTime } from './date'

// ---------- types ----------
export type TxType = 'expense' | 'income' | 'transfer' | 'adjust' | 'debt'
export interface Tx { id: string; type: TxType; amount: number; fee?: number; catId?: string; accountId?: string; toAccountId?: string; date: string; time?: string; note?: string; tags?: string[]; debtId?: string; action?: 'lend' | 'borrow' | 'repay' | 'collect'; recurId?: string; createdAt?: number }
export type AccType = 'bank' | 'ewallet' | 'cash' | 'credit' | 'invest'
export interface Account { id: string; name: string; bank?: string; type: AccType; tone?: string; order?: number; initial?: number; archived?: boolean; cycleDay?: number | null; dueDay?: number | null; creditLimit?: number }
export interface Cat { id: string; kind: 'expense' | 'income'; icon: string; name: string; tone: string; order: number; parentId: string; system?: boolean; hidden?: boolean }
export type Period = 'week' | 'month' | 'custom'
export interface Budget { id: string; catId: string; amount: number; period: Period; start?: string; end?: string; name?: string }
export type Freq = 'day' | 'week' | 'month' | 'year'
export interface Recur { id: string; name: string; type: 'expense' | 'income' | 'transfer'; amount: number; fee?: number; catId?: string; accountId?: string; toAccountId?: string; note?: string; freq: Freq; every: number; start: string; end?: string; auto: boolean; sub: boolean; done?: string; paused?: boolean; url?: string }
export interface Debt { id: string; person: string; direction: 'lent' | 'borrowed'; note?: string; due?: string }

export const C = { acc: 'mAccounts', tx: 'mTx', cat: 'mCats', bud: 'mBudgets', rec: 'mRecur', debt: 'mDebts' } as const

// Pastel tones from the Content OS palette. Old 't-*' names from Money v1 map onto them.
export const TONES = ['cyan', 'lavender', 'rose', 'peach', 'butter', 'sage', 'grey'] as const
const OLD: Record<string, string> = { 't-blue': 'cyan', 't-violet': 'lavender', 't-pink': 'rose', 't-orange': 'peach', 't-yellow': 'butter', 't-green': 'sage', 't-grey': 'grey' }
export const tone = (t?: string) => (t && (OLD[t] || t)) || 'grey'

export const ACC_TYPES: { id: AccType; label: string; plural: string }[] = [
  { id: 'bank', label: 'Bank', plural: 'Bank' }, { id: 'ewallet', label: 'E-wallet', plural: 'E-wallets' }, { id: 'cash', label: 'Cash', plural: 'Cash' },
  { id: 'credit', label: 'Credit card', plural: 'Credit cards' }, { id: 'invest', label: 'Investment', plural: 'Investments' },
]
export const FEE_PRESETS = [{ v: 0, label: 'Free' }, { v: 2500, label: 'BI-FAST 2.500' }, { v: 6500, label: 'Online 6.500' }]

// ---------- money format ----------
let HIDE = false
try { HIDE = localStorage.getItem('vzm2:hide') === '1' } catch { /* */ }
export const hidden = () => HIDE
export function setHidden(v: boolean) { HIDE = v; try { localStorage.setItem('vzm2:hide', v ? '1' : '0') } catch { /* */ } }
const nf = new Intl.NumberFormat('id-ID')
export function rp(n: number, o: { sign?: boolean; show?: boolean } = {}) {
  if (HIDE && !o.show) return 'Rp •••'
  const v = Math.round(n || 0)
  return (v < 0 ? '−' : o.sign && v > 0 ? '+' : '') + 'Rp' + nf.format(Math.abs(v))
}
/** Compact: 950, 25rb, 1,5jt, 2,1M */
export function rpc(n: number) {
  if (HIDE) return '•••'
  const a = Math.abs(Math.round(n))
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',')
  const s = a >= 1e9 ? f(a / 1e9) + 'M' : a >= 1e6 ? f(a / 1e6) + 'jt' : a >= 1e5 ? Math.round(a / 1e3) + 'rb' : a >= 1e3 ? f(a / 1e3) + 'rb' : String(a)
  return (n < 0 ? '−' : '') + s
}
/** "1,5jt" "250rb" "25.000" "2.5m" → whole rupiah */
export function parseAmount(s: string): number {
  let t = String(s || '').toLowerCase().replace(/rp|\s/g, '')
  if (!t) return 0
  const mult = /(jt|juta|m)$/.test(t) ? 1e6 : /(rb|ribu|k)$/.test(t) ? 1e3 : 1
  t = t.replace(/(jt|juta|rb|ribu|k|m)$/, '')
  if (mult > 1) t = t.replace(',', '.')
  else t = t.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(t)
  return isFinite(n) ? Math.round(n * mult) : 0
}

// ---------- categories ----------
const D = (id: string, kind: 'expense' | 'income', icon: string, name: string, tn: string, subs: [string, string][] = [], extra: Partial<Cat> = {}) => ({ id, kind, icon, name, tone: tn, subs, extra })
const DEFAULTS = [
  D('food', 'expense', 'food', 'Food & drinks', 'peach', [['groceries', 'Groceries'], ['eatout', 'Eating out'], ['snacks', 'Coffee & snacks']]),
  D('transport', 'expense', 'fuel', 'Transport', 'cyan', [['fuel', 'Fuel'], ['parking', 'Toll & parking'], ['rides', 'Online rides'], ['carservice', 'Car service']]),
  D('hangouts', 'expense', 'coffee', 'Hangouts & dates', 'rose'),
  D('shopping', 'expense', 'bag', 'Shopping', 'lavender', [['clothes', 'Clothes'], ['household', 'Household']]),
  D('installments', 'expense', 'car', 'Installments', 'grey', [['carloan', 'Car'], ['gearloan', 'Gear']]),
  D('rent', 'expense', 'home', 'Rent & utilities', 'butter', [['kos', 'Rent'], ['electricity', 'Electricity'], ['internet', 'Internet'], ['phonecredit', 'Phone credit']]),
  D('family', 'expense', 'heart', 'Family', 'sage', [['parents', 'Parents']]),
  D('subscriptions', 'expense', 'tv', 'Subscriptions', 'lavender', [['streaming', 'Streaming'], ['apps', 'Apps & software'], ['cloud', 'Cloud storage']]),
  D('gear', 'expense', 'camera', 'Gear & production', 'cyan'),
  D('health', 'expense', 'health', 'Health', 'sage', [['gym', 'Gym'], ['medical', 'Medical']]),
  D('other', 'expense', 'box', 'Other', 'grey'),
  D('fee', 'expense', 'receipt', 'Admin fees', 'grey', [], { system: true }),
  D('salary', 'income', 'briefcase', 'Salary', 'sage'),
  D('freelance', 'income', 'video', 'Freelance', 'cyan'),
  D('affiliate', 'income', 'link', 'Affiliate', 'peach'),
  D('other-income', 'income', 'tray', 'Other income', 'lavender'),
]
export const DEFAULT_CATS: Cat[] = (() => {
  const out: Cat[] = []
  DEFAULTS.forEach((c, i) => {
    out.push({ id: c.id, kind: c.kind, icon: c.icon, name: c.name, tone: c.tone, order: i * 10, parentId: '', ...c.extra })
    c.subs.forEach(([sid, sn], j) => out.push({ id: c.id + '.' + sid, kind: c.kind, icon: c.icon, name: sn, tone: c.tone, order: i * 10 + j + 1, parentId: c.id }))
  })
  return out
})()
const DEF_MAP = Object.fromEntries(DEFAULT_CATS.map((c) => [c.id, c]))

function memo<T>(fn: () => T): () => T { let k = -1, v: T; return () => { const n = ver(); if (n === k) return v; k = n; v = fn(); return v } }

export const catMap = memo(() => { const m: Record<string, Cat> = { ...DEF_MAP }; for (const c of all<Cat>(C.cat)) m[c.id] = { ...m[c.id], ...c }; return m })
export const cat = (id?: string) => (id ? catMap()[id] : undefined)
export const catsOf = (kind: 'expense' | 'income', parentId = '') => Object.values(catMap()).filter((c) => c.kind === kind && !c.system && !c.hidden && (c.parentId || '') === parentId).sort((a, b) => a.order - b.order)
export const topCatId = (id?: string) => { const c = cat(id); return c && c.parentId ? c.parentId : id || '' }
export const parentOf = (c?: Cat) => (c && c.parentId ? cat(c.parentId) || c : c)
export const catTone = (id?: string) => tone(parentOf(cat(id))?.tone)
export const catIcon = (id?: string) => cat(id)?.icon || parentOf(cat(id))?.icon || 'tag'
export const catLabel = (id?: string) => { const c = cat(id); if (!c) return 'Other'; const p = c.parentId ? cat(c.parentId) : null; return p ? `${p.name} · ${c.name}` : c.name }
export const catShort = (id?: string) => cat(id)?.name || 'Other'
export function saveCat(c: Partial<Cat> & { kind: Cat['kind'] }) {
  return put(C.cat, { icon: 'tag', tone: 'grey', parentId: '', order: Object.keys(catMap()).length * 10 + 500, name: 'New category', ...c, id: c.id || 'c' + uid() } as any)
}
/** Hide instead of delete so old transactions keep their names. */
export const hideCat = (id: string) => { const c = cat(id); if (c) put(C.cat, { ...c, hidden: true }) }

// ---------- settings ----------
export interface Settings { name: string; allowanceAcc: string; activeTag: string; totalBudget?: number }
export const settings = (): Settings => ({ name: 'Denizar', allowanceAcc: '', activeTag: '', ...(get('meta', 'money') || {}) })
export const setSettings = (ch: Partial<Settings>) => put('meta', { ...(get('meta', 'money') || {}), ...ch, id: 'money' })

// ---------- lookups ----------
export const allAccounts = () => all<Account>(C.acc)
export const accounts = memo(() => allAccounts().filter((a) => !a.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)))
export const account = (id?: string) => get<Account>(C.acc, id)
export const accName = (id?: string) => { const a = account(id); return a ? a.name : '—' }
export const txs = memo(() => all<Tx>(C.tx))
export const txSorted = memo(() => [...txs()].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.createdAt || 0) - (a.createdAt || 0)))
export const budgets = () => all<Budget>(C.bud)
export const recurs = () => all<Recur>(C.rec).sort((a, b) => a.name.localeCompare(b.name))
export const debts = () => all<Debt>(C.debt)

/** Spending of a transaction (expense amount, or a transfer's admin fee). */
export const spendOf = (x: Tx) => (x.type === 'expense' ? x.amount : x.type === 'transfer' ? x.fee || 0 : 0)
export const spendCat = (x: Tx) => (x.type === 'transfer' ? 'fee' : x.catId || 'other')

// ---------- balances ----------
const DEBT_SIGN = { lend: -1, borrow: 1, repay: -1, collect: 1 }
export const balances = memo(() => {
  const bal: Record<string, number> = {}
  for (const a of allAccounts()) bal[a.id] = a.initial || 0
  const add = (id: string | undefined, n: number) => { if (id) bal[id] = (bal[id] || 0) + n }
  for (const x of txs()) {
    if (x.type === 'expense') add(x.accountId, -x.amount)
    else if (x.type === 'income') add(x.accountId, x.amount)
    else if (x.type === 'transfer') { add(x.accountId, -(x.amount + (x.fee || 0))); add(x.toAccountId, x.amount) }
    else if (x.type === 'adjust') add(x.accountId, x.amount)
    else if (x.type === 'debt' && x.action) add(x.accountId, DEBT_SIGN[x.action] * x.amount)
  }
  return bal
})
export function totals() {
  const bal = balances()
  let cash = 0, invest = 0, cardDebt = 0
  for (const a of accounts()) {
    const b = bal[a.id] || 0
    if (a.type === 'credit') cardDebt += Math.max(0, -b)
    else if (a.type === 'invest') invest += b
    else cash += b
  }
  const d = debtTotals()
  return { cash, invest, cardDebt, owedToMe: d.owedToMe, iOwe: d.iOwe, net: cash + invest - cardDebt + d.owedToMe - d.iOwe }
}

// ---------- ranges & stats ----------
export interface Range { start: string; end: string }
export function periodRange(p: Period, ref = today(), b?: Budget): Range {
  if (p === 'week') { const s = startOfWeek(ref); return { start: s, end: addDays(s, 6) } }
  if (p === 'month') { const ym = ref.slice(0, 7); return { start: ym + '-01', end: monthEnd(ym) } }
  return { start: b?.start || ref, end: b?.end || ref }
}
export const yearRange = (y: string): Range => ({ start: y + '-01-01', end: y + '-12-31' })
export const inRange = (d: string, r: Range) => d >= r.start && d <= r.end

export function stats(r: Range) {
  let income = 0, expense = 0
  const byCat: Record<string, number> = {}, bySub: Record<string, number> = {}, inCat: Record<string, number> = {}, byDay: Record<string, { in: number; out: number }> = {}
  let count = 0
  for (const x of txs()) {
    if (!inRange(x.date, r)) continue
    const day = byDay[x.date] || (byDay[x.date] = { in: 0, out: 0 })
    const s = spendOf(x)
    if (s) {
      count++
      expense += s; day.out += s
      const sc = spendCat(x), top = topCatId(sc) || 'other'
      byCat[top] = (byCat[top] || 0) + s
      bySub[sc] = (bySub[sc] || 0) + s
    } else if (x.type === 'income') {
      count++
      income += x.amount; day.in += x.amount
      const top = topCatId(x.catId) || 'other-income'
      inCat[top] = (inCat[top] || 0) + x.amount
    }
  }
  return { income, expense, net: income - expense, byCat, bySub, inCat, byDay, count }
}
export function spentIn(r: Range, catId = '') {
  let s = 0
  for (const x of txs()) {
    if (!inRange(x.date, r)) continue
    const v = spendOf(x); if (!v) continue
    if (catId) { const sc = spendCat(x); if (sc !== catId && topCatId(sc) !== catId) continue }
    s += v
  }
  return s
}

// ---------- budgets ----------
export function budgetState(b: Budget, ref = today()) {
  const r = periodRange(b.period, ref, b)
  const spent = spentIn(r, b.catId)
  const t0 = today()
  const days = diffDays(r.end, r.start) + 1
  const elapsed = t0 < r.start ? 0 : t0 > r.end ? days : diffDays(t0, r.start) + 1
  const daysLeft = t0 > r.end ? 0 : t0 < r.start ? days : days - elapsed + 1
  const left = b.amount - spent
  const pct = b.amount ? spent / b.amount : 0
  const pace = days ? elapsed / days : 1 // share of the period gone
  const status: 'over' | 'warn' | 'ok' = left < 0 ? 'over' : pct > pace + 0.1 && pct > 0.5 ? 'warn' : 'ok'
  return { r, spent, left, pct, pace, days, daysLeft, perDay: daysLeft && left > 0 ? Math.floor(left / daysLeft) : 0, status, active: inRange(t0, r) || b.period !== 'custom' }
}
export const budgetName = (b: Budget) => b.name || (b.catId ? catLabel(b.catId) : 'All spending')
export const PERIOD_LABEL: Record<Period, string> = { week: 'Weekly', month: 'Monthly', custom: 'Custom' }
export function saveBudget(b: Partial<Budget>) { return put(C.bud, { catId: '', amount: 0, period: 'month', ...b, id: b.id || uid() }) }
/** v1 kept monthly limits on categories; turn them into budgets once. */
export function migrateV1() {
  if (budgets().length) return
  for (const c of all<any>(C.cat)) if (c.limit > 0 && !c.parentId) saveBudget({ catId: c.id, amount: c.limit, period: 'month' })
  const tb = (get<any>('meta', 'money') || {}).totalBudget
  if (tb > 0) saveBudget({ catId: '', amount: tb, period: 'month' })
}

// ---------- recurring ----------
export const FREQ_LABEL: Record<Freq, [string, string]> = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] }
export const freqText = (r: Pick<Recur, 'freq' | 'every'>) => r.every > 1 ? `Every ${r.every} ${FREQ_LABEL[r.freq][1]}` : ({ day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' } as const)[r.freq]
/** n-th occurrence after start (0 = start). */
function nth(r: Recur, n: number) {
  const e = Math.max(1, r.every || 1)
  if (r.freq === 'day') return addDays(r.start, n * e)
  if (r.freq === 'week') return addDays(r.start, n * e * 7)
  if (r.freq === 'month') return addMonths(r.start, n * e)
  return addMonths(r.start, n * e * 12)
}
/** Occurrences in [from, to], capped. */
export function occurrences(r: Recur, from: string, to: string, limit = 400): string[] {
  const out: string[] = []
  if (!r.start || r.paused) return out
  // jump close to `from`
  let n = 0
  const gap = diffDays(from, r.start)
  if (gap > 0) {
    const per = r.freq === 'day' ? r.every : r.freq === 'week' ? r.every * 7 : r.freq === 'month' ? r.every * 28 : r.every * 365
    n = Math.max(0, Math.floor(gap / Math.max(1, per)) - 2)
  }
  for (let i = 0; i < 5000 && out.length < limit; i++, n++) {
    const d = nth(r, n)
    if (d > to || (r.end && d > r.end)) break
    if (d >= from) out.push(d)
  }
  return out
}
/** Next occurrence that hasn't been handled (logged or skipped). */
export function nextDue(r: Recur): string | null {
  if (r.paused) return null
  const from = r.done ? addDays(r.done, 1) : r.start
  const o = occurrences(r, from, addDays(from, 3700), 1)
  return o[0] || null
}
export const recurTxId = (r: Recur, d: string) => `r_${r.id}_${d}`
export function logRecur(r: Recur, date: string, amount = r.amount) {
  const x: Tx = { id: recurTxId(r, date), type: r.type, amount, fee: r.type === 'transfer' ? r.fee || 0 : undefined, catId: r.type === 'transfer' ? undefined : r.catId, accountId: r.accountId, toAccountId: r.type === 'transfer' ? r.toAccountId : undefined, date, time: '', note: r.note || r.name, recurId: r.id }
  put(C.tx, x)
  patch(C.rec, r.id, { done: date > (r.done || '') ? date : r.done })
  return x
}
export function skipRecur(r: Recur, date: string) { patch(C.rec, r.id, { done: date > (r.done || '') ? date : r.done }) }
/** Auto-log every due occurrence up to today. Idempotent: ids are r_<recur>_<date>. */
export function runAutoRecurs() {
  const t0 = today()
  let n = 0
  for (const r of recurs()) {
    if (!r.auto || r.paused || !r.accountId) continue
    let d = nextDue(r), guard = 0
    while (d && d <= t0 && guard++ < 60) {
      if (!get(C.tx, recurTxId(r, d))) { logRecur(r, d); n++ } else patch(C.rec, r.id, { done: d })
      d = nextDue(get<Recur>(C.rec, r.id)!)
    }
  }
  return n
}
/** Manual (reminder) items that are due by `until`. */
export function dueList(until = addDays(today(), 7)) {
  const out: { r: Recur; date: string }[] = []
  for (const r of recurs()) {
    if (r.auto || r.paused) continue
    const d = nextDue(r)
    if (d && d <= until) out.push({ r, date: d })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
/** Monthly-equivalent cost. */
export const monthlyCost = (r: Recur) => { const e = Math.max(1, r.every); return r.freq === 'day' ? (r.amount * 30.44) / e : r.freq === 'week' ? (r.amount * 52) / 12 / e : r.freq === 'month' ? r.amount / e : r.amount / 12 / e }
export function saveRecur(r: Partial<Recur>) { return put(C.rec, { type: 'expense', amount: 0, freq: 'month', every: 1, start: today(), auto: false, sub: false, name: '', ...r, id: r.id || uid() }) }
/** Planned recurring items on a day (for the calendar). */
export function plannedOn(from: string, to: string) {
  const m: Record<string, { r: Recur; date: string }[]> = {}
  const t0 = today()
  for (const r of recurs()) for (const d of occurrences(r, from, to)) {
    if (d < t0 && (get(C.tx, recurTxId(r, d)) || (r.done && d <= r.done))) continue
    if (get(C.tx, recurTxId(r, d))) continue
    ;(m[d] || (m[d] = [])).push({ r, date: d })
  }
  return m
}

// ---------- credit card ----------
export function cardInfo(a: Account) {
  const bal = balances()
  const cd = Math.min(28, Math.max(1, a.cycleDay || 15)), dd = Math.min(28, Math.max(1, a.dueDay || 2))
  const t0 = today()
  const d = +t0.slice(8)
  const ym = t0.slice(0, 7)
  const start = d >= cd ? `${ym}-${String(cd).padStart(2, '0')}` : `${shiftYm(ym, -1)}-${String(cd).padStart(2, '0')}`
  const end = addDays(addMonths(start, 1, cd), -1)
  const stmtEnd = addDays(start, -1)
  let due = `${stmtEnd.slice(0, 7)}-${String(dd).padStart(2, '0')}`
  if (due <= stmtEnd) due = `${shiftYm(stmtEnd.slice(0, 7), 1)}-${String(dd).padStart(2, '0')}`
  let cur = 0
  for (const x of txs()) {
    if (x.accountId !== a.id || x.date < start || x.date > end) continue
    if (x.type === 'expense') cur += x.amount
    else if (x.type === 'income') cur -= x.amount
    else if (x.type === 'transfer') cur += x.amount + (x.fee || 0)
  }
  const owed = Math.max(0, -(bal[a.id] || 0))
  const billLeft = Math.max(0, owed - Math.max(0, cur))
  return { start, end, due, cur, owed, billLeft, daysToDue: diffDays(due, t0), available: a.creditLimit ? a.creditLimit - owed : null }
}

// ---------- debts ----------
export function debtState(d: Debt) {
  let principal = 0, settled = 0
  const entries = txSorted().filter((x) => x.type === 'debt' && x.debtId === d.id)
  for (const x of entries) { if (x.action === 'lend' || x.action === 'borrow') principal += x.amount; else settled += x.amount }
  const left = Math.max(0, principal - settled)
  return { principal, settled, left, entries, closed: principal > 0 && left <= 0 }
}
export const debtTotals = memo(() => {
  let owedToMe = 0, iOwe = 0
  for (const d of debts()) { const s = debtState(d); if (d.direction === 'lent') owedToMe += s.left; else iOwe += s.left }
  return { owedToMe, iOwe }
})

// ---------- daily allowance ----------
export function allowance() {
  const st = settings()
  const list = accounts().filter((a) => a.type !== 'credit' && a.type !== 'invest')
  const acc = list.find((a) => a.id === st.allowanceAcc) || list.find((a) => /daily/i.test(a.name))
  if (!acc) return null
  const t0 = today()
  const daysLeft = daysInMonth(t0) - +t0.slice(8) + 1
  let spentToday = 0
  for (const x of txs()) if (x.date === t0 && x.accountId === acc.id) spentToday += spendOf(x)
  const bal = balances()[acc.id] || 0
  const perDay = Math.max(0, Math.floor((bal + spentToday) / daysLeft))
  return { acc, bal, daysLeft, perDay, spentToday, leftToday: perDay - spentToday }
}

// ---------- tags ----------
export const normTag = (s: string) => String(s || '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 32)
const tagKey = (s: string) => normTag(s).toLowerCase()
export const txTags = (x: Tx) => (Array.isArray(x.tags) ? x.tags : [])
export const tagIndex = memo(() => {
  const m: Record<string, { key: string; name: string; count: number; out: number; in: number; first: string; last: string }> = {}
  for (const x of txs()) for (const tg of txTags(x)) {
    const k = tagKey(tg); if (!k) continue
    const r = m[k] || (m[k] = { key: k, name: normTag(tg), count: 0, out: 0, in: 0, first: x.date, last: x.date })
    r.count++; r.out += spendOf(x); if (x.type === 'income') r.in += x.amount
    if (x.date < r.first) r.first = x.date
    if (x.date > r.last) r.last = x.date
  }
  return m
})
export const allTags = () => Object.values(tagIndex()).sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count)
export const hasTag = (x: Tx, name: string) => txTags(x).some((t) => tagKey(t) === tagKey(name))

// ---------- mutations ----------
export function saveTx(x: Partial<Tx>) { return put(C.tx, { time: nowTime(), ...x, id: x.id || uid() } as any) as Tx }
export function deleteTx(id: string) { remove(C.tx, id) }
export function saveAccount(a: Partial<Account>) { return put(C.acc, { name: '', bank: '', type: 'bank', tone: 'cyan', order: allAccounts().length, initial: 0, archived: false, ...a, id: a.id || uid() }) }
/** Investment/value update: logs the difference as an adjustment (not income or spending). */
export function setBalance(accId: string, value: number, note = 'Value update') {
  const diff = value - (balances()[accId] || 0)
  if (!diff) return null
  return saveTx({ type: 'adjust', amount: diff, accountId: accId, date: today(), note })
}

// ---------- CSV ----------
const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
export function toCsv() {
  const rows = [['Date', 'Time', 'Type', 'Amount', 'Admin fee', 'Category', 'Account', 'To account', 'Note', 'Tags']]
  const J: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', adjust: 'Adjustment', debt: 'Debt' }
  for (const x of [...txSorted()].reverse()) rows.push([x.date, x.time || '', J[x.type] || x.type, String(x.amount), String(x.fee || 0), x.type === 'expense' || x.type === 'income' ? catLabel(x.catId) : '', accName(x.accountId), x.toAccountId ? accName(x.toAccountId) : '', x.note || '', txTags(x).join('; ')])
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch; continue }
    if (ch === '"') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((c) => c.trim())) rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row)
  return rows
}
function normDate(s: string): string {
  s = s.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/) // dd/mm/yyyy
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return ''
}
/** Reads this app's export or any sheet with Date + Amount columns (Category, Account, Note, Type optional). */
export function readImport(text: string, fallbackAcc: string) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { items: [] as Tx[], skipped: 0, error: 'The file has no rows.' }
  const h = rows[0].map((x) => x.trim().toLowerCase())
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)))
  const iDate = col('date', 'tanggal'), iAmt = col('amount', 'jumlah', 'nominal'), iType = col('type', 'tipe', 'jenis'), iCat = col('category', 'kategori'), iAcc = col('account', 'akun', 'rekening'), iTo = col('to account'), iNote = col('note', 'catatan', 'description', 'memo'), iFee = col('admin fee', 'fee'), iTags = col('tags', 'tag'), iTime = col('time', 'jam')
  if (iDate < 0 || iAmt < 0) return { items: [], skipped: 0, error: 'Need at least a Date and an Amount column.' }
  const byLabel: Record<string, string> = {}
  for (const c of Object.values(catMap())) { byLabel[catLabel(c.id).toLowerCase()] = c.id; byLabel[c.name.toLowerCase()] ||= c.id }
  const accBy: Record<string, string> = {}
  for (const a of allAccounts()) accBy[a.name.toLowerCase()] = a.id
  const items: Tx[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const date = normDate(r[iDate] || ''), raw = parseAmount((r[iAmt] || '').replace(/^[−-]/, '-'))
    const typeTxt = (iType >= 0 ? r[iType] : '').toLowerCase()
    if (!date || !raw) { skipped++; continue }
    let type: TxType = /income|pemasukan|masuk/.test(typeTxt) ? 'income' : /transfer/.test(typeTxt) ? 'transfer' : /adjust/.test(typeTxt) ? 'adjust' : /debt|utang|hutang/.test(typeTxt) ? 'debt' : 'expense'
    if (type === 'debt') { skipped++; continue }
    if (!typeTxt && raw > 0 && iType < 0 && /^\+/.test((r[iAmt] || '').trim())) type = 'income'
    const amount = type === 'adjust' ? raw : Math.abs(raw)
    const catTxt = (iCat >= 0 ? r[iCat] : '').trim().toLowerCase()
    const accId = (iAcc >= 0 && accBy[(r[iAcc] || '').trim().toLowerCase()]) || fallbackAcc
    const x: Tx = { id: uid() + items.length, type, amount, date, time: iTime >= 0 ? (r[iTime] || '').slice(0, 5) : '', accountId: accId, note: iNote >= 0 ? (r[iNote] || '').trim() : '' }
    if (type === 'expense' || type === 'income') x.catId = byLabel[catTxt] || (type === 'income' ? 'other-income' : 'other')
    if (type === 'transfer') { x.toAccountId = (iTo >= 0 && accBy[(r[iTo] || '').trim().toLowerCase()]) || undefined; x.fee = iFee >= 0 ? parseAmount(r[iFee] || '') : 0; if (!x.toAccountId) { skipped++; continue } }
    if (iTags >= 0 && r[iTags]) x.tags = r[iTags].split(/[;,]/).map(normTag).filter(Boolean)
    items.push(x)
  }
  return { items, skipped, error: '' }
}
export function importTxs(items: Tx[]) { for (const x of items) put(C.tx, x) }

export function resetAll() {
  for (const c of Object.values(C)) for (const r of all<any>(c)) remove(c, r.id)
  remove('meta', 'money')
}
export const counts = () => ({ accounts: allAccounts().length, tx: txs().length, budgets: budgets().length, recur: recurs().length, debts: debts().length })
export { today }
