// Personal money: accounts (bank pockets, e-wallets, cash, credit cards), transactions, categories with
// sub-categories and monthly budgets, recurring bills and debts (money lent or borrowed).
// Amounts are whole rupiah (IDR has no minor units). Dates are 'YYYY-MM-DD' in WIB, like the rest of the app.
import { get, all, put, patch, remove, uid } from './store.js';
import { today, addDays, diffDays, daysInMonth } from './date.js';
import { t } from './i18n.js';

export const C = { acc: 'mAccounts', tx: 'mTx', cat: 'mCats', bill: 'mBills', debt: 'mDebts' };
export const TONES = ['t-blue', 't-violet', 't-pink', 't-orange', 't-yellow', 't-green', 't-grey'];
export const ACC_TYPES = [{ id: 'bank', label: 'Bank' }, { id: 'ewallet', label: 'E-wallet' }, { id: 'cash', label: 'Cash' }, { id: 'credit', label: 'Credit card' }];
export const accTypeLabel = (type) => t({ bank: 'Bank pocket', ewallet: 'E-wallet', cash: 'Cash', credit: 'Credit card' }[type] || 'Account');
export const FEE_PRESETS = [0, 2500, 6500];

// ---------- default categories (with sub-categories) ----------
const D = (id, kind, icon, name, tone, subs = [], extra = {}) => ({ id, kind, icon, name, tone, subs, ...extra });
const DEFAULTS = [
  D('food', 'expense', 'food', 'Food & drinks', 't-orange', [['groceries', 'Groceries'], ['eatout', 'Eating out'], ['snacks', 'Coffee & snacks']]),
  D('transport', 'expense', 'fuel', 'Transport', 't-blue', [['fuel', 'Fuel'], ['parking', 'Toll & parking'], ['rides', 'Online rides'], ['carservice', 'Car service']]),
  D('hangouts', 'expense', 'coffee', 'Hangouts & dates', 't-pink'),
  D('shopping', 'expense', 'bag', 'Shopping', 't-violet', [['clothes', 'Clothes'], ['household', 'Household']]),
  D('installments', 'expense', 'car', 'Installments', 't-grey', [['carloan', 'Car'], ['gearloan', 'Gear']]),
  D('rent', 'expense', 'home', 'Rent & utilities', 't-yellow', [['kos', 'Rent'], ['electricity', 'Electricity'], ['internet', 'Internet'], ['phonecredit', 'Phone credit']]),
  D('family', 'expense', 'heart', 'Family', 't-green', [['parents', 'Parents']]),
  D('subscriptions', 'expense', 'tv', 'Subscriptions', 't-violet', [['streaming', 'Streaming'], ['apps', 'Apps & software'], ['cloud', 'Cloud storage']]),
  D('gear', 'expense', 'camera', 'Gear & production', 't-blue'),
  D('health', 'expense', 'health', 'Health', 't-green', [['gym', 'Gym'], ['medical', 'Medical']]),
  D('other', 'expense', 'box', 'Other', 't-grey'),
  D('fee', 'expense', 'receipt', 'Admin fees', 't-grey', [], { system: true }),
  D('salary', 'income', 'briefcase', 'Salary', 't-green'),
  D('freelance', 'income', 'video', 'Freelance', 't-blue'),
  D('affiliate', 'income', 'link', 'Affiliate', 't-orange'),
  D('other-income', 'income', 'tray', 'Other income', 't-violet'),
];
export const DEFAULT_CATS = (() => {
  const out = [];
  DEFAULTS.forEach((c, i) => {
    out.push({ id: c.id, kind: c.kind, icon: c.icon, name: c.name, tone: c.tone, order: i * 10, parentId: '', limit: 0, system: !!c.system, def: true });
    c.subs.forEach(([sid, sname], j) => out.push({ id: c.id + '.' + sid, kind: c.kind, icon: c.icon, name: sname, tone: c.tone, order: i * 10 + j + 1, parentId: c.id, limit: 0, def: true }));
  });
  return out;
})();
const DEF_MAP = Object.fromEntries(DEFAULT_CATS.map((c) => [c.id, c]));
// A default category keeps following the app language until it is renamed.
export const catName = (c) => (c ? (c.def ? t(c.name) : c.name) : t('Other'));

// ---------- lookups ----------
export const allAccounts = () => all(C.acc).filter((a) => !a.deletedAt);
export const accounts = () => allAccounts().filter((a) => !a.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const account = (id) => get(C.acc, id);
export const hasMoneySetup = () => allAccounts().length > 0;
// Small caches keyed on the store arrays, which only change identity when data changes
const memo = (deps, fn) => { let k = null, v; return () => { const d = deps(); if (k && d.every((x, i) => x === k[i])) return v; k = d; v = fn(); return v; }; };
export const catMap = memo(() => [all(C.cat)], () => {
  const stored = all(C.cat);
  if (!stored.length) return DEF_MAP;
  const m = { ...DEF_MAP };
  for (const c of stored) m[c.id] = c;
  return m;
});
export const cat = (id) => catMap()[id];
export const catsOf = (kind, parentId = '') => Object.values(catMap()).filter((c) => c.kind === kind && !c.system && !c.hidden && (c.parentId || '') === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const parentOf = (c) => (c && c.parentId ? cat(c.parentId) || c : c);
export const topCatId = (id) => { const c = cat(id); return c && c.parentId ? c.parentId : id; };
export const catIcon = (c) => (c && (c.icon || parentOf(c)?.icon)) || 'tag';
export const catTone = (c) => (c && (parentOf(c)?.tone || c.tone)) || 't-grey';
export const catLabel = (id) => { const c = cat(id); if (!c) return t('Other'); const p = c.parentId ? cat(c.parentId) : null; return p ? `${catName(p)} · ${catName(c)}` : catName(c); };
// Make sure categories exist in storage before the first edit (until then the defaults are virtual)
export function ensureCats() { if (!all(C.cat).length) for (const c of DEFAULT_CATS) put(C.cat, { ...c }); }

export const moneySettings = () => ({ widgets: null, allowanceAcc: '', totalBudget: 0, activeTag: '', ...(get('meta', 'money') || {}) });
export const setMoneySettings = (ch) => put('meta', { ...moneySettings(), ...ch, id: 'money' });

export const liveTx = memo(() => [all(C.tx)], () => all(C.tx).filter((x) => !x.deletedAt));
export const txSorted = () => liveTx().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.createdAt || 0) - (a.createdAt || 0));
export const liveBills = () => all(C.bill).filter((b) => !b.deletedAt).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
export const liveDebts = () => all(C.debt).filter((d) => !d.deletedAt);

// ---------- balances ----------
export const DEBT_SIGN = { lend: -1, borrow: 1, repay: -1, collect: 1 };
export const balances = memo(() => [all(C.tx), all(C.acc)], balancesNow);
function balancesNow() {
  const bal = {};
  for (const a of allAccounts()) bal[a.id] = a.initial || 0;
  const add = (id, n) => { if (id) bal[id] = (bal[id] || 0) + n; };
  for (const x of liveTx()) {
    if (x.type === 'expense') add(x.accountId, -x.amount);
    else if (x.type === 'income') add(x.accountId, x.amount);
    else if (x.type === 'transfer') { add(x.accountId, -(x.amount + (x.fee || 0))); add(x.toAccountId, x.amount); }
    else if (x.type === 'adjust') add(x.accountId, x.amount);
    else if (x.type === 'debt') add(x.accountId, (DEBT_SIGN[x.action] || 0) * x.amount);
  }
  return bal;
}
export function totals(bal = balances()) {
  let assets = 0, cardDebt = 0;
  for (const a of accounts()) { if (a.type === 'credit') cardDebt += Math.max(0, -(bal[a.id] || 0)); else assets += bal[a.id] || 0; }
  const d = debtTotals();
  return { assets, cardDebt, owedToMe: d.owedToMe, iOwe: d.iOwe, net: assets - cardDebt + d.owedToMe - d.iOwe };
}

// ---------- month numbers ----------
// Spending counts expenses plus transfer admin fees. Transfers, adjustments and debts are not income or spending.
export function monthStats(ym, list = liveTx()) {
  let income = 0, expense = 0;
  const byCat = {}, bySub = {}, inCat = {}, byDay = {};
  for (const x of list) {
    if (x.date.slice(0, 7) !== ym) continue;
    const day = byDay[x.date] || (byDay[x.date] = { in: 0, out: 0 });
    if (x.type === 'expense') {
      expense += x.amount; day.out += x.amount;
      const top = topCatId(x.catId) || 'other';
      byCat[top] = (byCat[top] || 0) + x.amount;
      bySub[x.catId || 'other'] = (bySub[x.catId || 'other'] || 0) + x.amount;
    } else if (x.type === 'income') {
      income += x.amount; day.in += x.amount;
      const top = topCatId(x.catId) || 'other-income';
      inCat[top] = (inCat[top] || 0) + x.amount;
      bySub[x.catId || 'other-income'] = (bySub[x.catId || 'other-income'] || 0) + x.amount;
    } else if (x.type === 'transfer' && x.fee) {
      expense += x.fee; day.out += x.fee;
      byCat.fee = (byCat.fee || 0) + x.fee; bySub.fee = (bySub.fee || 0) + x.fee;
    }
  }
  return { income, expense, byCat, bySub, inCat, byDay };
}
export function spentUntil(ym, dayN) {
  let s = 0;
  for (const x of liveTx()) {
    if (x.date.slice(0, 7) !== ym || +x.date.slice(8) > dayN) continue;
    if (x.type === 'expense') s += x.amount; else if (x.type === 'transfer') s += x.fee || 0;
  }
  return s;
}
export const shiftYm = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// ---------- budgets ----------
// Budgets are monthly limits on top-level spending categories. The overall budget is either set on its own
// or, when left at 0, the sum of the category limits.
export function budgetFor(ym) {
  const ms = monthStats(ym);
  const cats = catsOf('expense').filter((c) => c.limit > 0);
  const limits = cats.reduce((s, c) => s + c.limit, 0);
  const total = moneySettings().totalBudget || limits;
  const budgeted = cats.reduce((s, c) => s + (ms.byCat[c.id] || 0), 0);
  const t0 = today();
  const isNow = ym === t0.slice(0, 7);
  const daysLeft = isNow ? daysInMonth(t0) - +t0.slice(8) + 1 : ym > t0.slice(0, 7) ? daysInMonth(ym + '-01') : 0;
  const left = total - ms.expense;
  return { ms, cats, limits, total, spent: ms.expense, budgeted, unbudgeted: ms.expense - budgeted, left, daysLeft, perDay: daysLeft && left > 0 ? Math.floor(left / daysLeft) : 0 };
}

// ---------- credit card cycle ----------
export function cardInfo(a, bal = balances()) {
  const cd = Math.min(28, Math.max(1, a.cycleDay || 15)), dd = Math.min(28, Math.max(1, a.dueDay || 2));
  const t0 = today();
  const [y, m, d] = t0.split('-').map(Number);
  const mk = (yy, mm, dd2) => new Date(Date.UTC(yy, mm - 1, dd2)).toISOString().slice(0, 10);
  const start = d >= cd ? mk(y, m, cd) : mk(y, m - 1, cd);
  const [sy, sm] = start.split('-').map(Number);
  const end = mk(sy, sm + 1, cd - 1);
  const stmtEnd = mk(sy, sm, cd - 1);
  const [ey, em] = stmtEnd.split('-').map(Number);
  let due = mk(ey, em, dd);
  if (due <= stmtEnd) due = mk(ey, em + 1, dd);
  let cur = 0, paid = 0;
  for (const x of liveTx()) {
    let spend = 0;
    if (x.accountId === a.id) {
      if (x.type === 'expense') spend = x.amount;
      else if (x.type === 'income') spend = -x.amount;
      else if (x.type === 'transfer') spend = x.amount + (x.fee || 0);
    }
    if (x.type === 'transfer' && x.toAccountId === a.id && x.date >= start) paid += x.amount;
    if (spend && x.date >= start && x.date <= end) cur += spend;
  }
  const owed = Math.max(0, -(bal[a.id] || 0));
  const billLeft = Math.max(0, Math.min(owed, owed - cur));
  return { cycle: [start, end], statementEnd: stmtEnd, due, cur, paid, owed, billLeft, closed: billLeft + paid, daysToDue: diffDays(due, t0) };
}

// ---------- bills ----------
export function billsFor(ym) {
  return liveBills().filter((b) => !b.start || ym >= b.start).map((b) => {
    const date = `${ym}-${String(Math.min(b.day, daysInMonth(ym + '-01'))).padStart(2, '0')}`;
    const txId = b.paid && b.paid[ym];
    const x = txId && get(C.tx, txId);
    return { b, date, paid: !!(x && !x.deletedAt) };
  });
}

// ---------- debts ----------
export function debtState(d) {
  let principal = 0, settled = 0, last = '';
  const entries = liveTx().filter((x) => x.type === 'debt' && x.debtId === d.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  for (const x of entries) {
    if (x.action === 'lend' || x.action === 'borrow') principal += x.amount; else settled += x.amount;
    last = x.date;
  }
  const left = Math.max(0, principal - settled);
  return { principal, settled, left, entries, last, closed: principal > 0 && left <= 0 };
}
export const debtTotals = memo(() => [all(C.tx), all(C.debt)], debtTotalsNow);
function debtTotalsNow() {
  let owedToMe = 0, iOwe = 0;
  for (const d of liveDebts()) { const s = debtState(d); if (d.direction === 'lent') owedToMe += s.left; else iOwe += s.left; }
  return { owedToMe, iOwe };
}

// ---------- daily allowance ----------
export function allowance() {
  const ms = moneySettings();
  const list = accounts();
  const acc = (ms.allowanceAcc && list.find((a) => a.id === ms.allowanceAcc)) || list.find((a) => /daily/i.test(a.name)) || list.find((a) => a.type !== 'credit');
  if (!acc) return null;
  const t0 = today();
  const daysLeft = daysInMonth(t0) - +t0.slice(8) + 1;
  let spentToday = 0;
  for (const x of liveTx()) {
    if (x.date !== t0 || x.accountId !== acc.id) continue;
    if (x.type === 'expense') spentToday += x.amount; else if (x.type === 'transfer' && x.fee) spentToday += x.fee;
  }
  const bal = balances()[acc.id] || 0;
  const perDay = Math.max(0, Math.floor((bal + spentToday) / daysLeft));
  return { acc, bal, daysLeft, perDay, spentToday, leftToday: perDay - spentToday };
}

// ---------- mutations ----------
export function saveTx(rec) { return put(C.tx, { ...rec, id: rec.id || uid() }); }
export function deleteTx(id) { remove(C.tx, id); }
export function newAccount(p) { return put(C.acc, { id: uid(), name: '', bank: '', type: 'bank', tone: 't-blue', order: allAccounts().length, initial: 0, archived: false, ...p }); }
export function markBillPaid(billId, ym, txId) { const b = get(C.bill, billId); if (b) patch(C.bill, billId, { paid: { ...(b.paid || {}), [ym]: txId } }); }

// Wipe only the money data (Settings → Money → Reset)
export function resetMoney() {
  for (const coll of Object.values(C)) for (const r of all(coll)) remove(coll, r.id);
  if (get('meta', 'money')) remove('meta', 'money');
}
export const moneyCounts = () => ({ accounts: allAccounts().length, tx: liveTx().length, bills: liveBills().length, debts: liveDebts().length });

// Suggested starting accounts, matched to Denizar's Jago pockets and Tokopedia Card
export const SUGGESTED = [
  { key: 'main', name: 'Main', bank: 'Jago', type: 'bank', tone: 't-blue', on: true },
  { key: 'daily', name: 'Daily Life', bank: 'Jago', type: 'bank', tone: 't-orange', on: true },
  { key: 'fix', name: 'Fix Cost', bank: 'Jago', type: 'bank', tone: 't-violet', on: true },
  { key: 'transport', name: 'Transport', bank: 'Jago', type: 'bank', tone: 't-pink', on: true },
  { key: 'goals', name: 'Goals', bank: 'Jago', type: 'bank', tone: 't-green', on: true },
  { key: 'buffer', name: 'Buffer', bank: 'Jago', type: 'bank', tone: 't-grey', on: true },
  { key: 'tokped', name: 'Tokopedia Card', bank: '', type: 'credit', tone: 't-green', on: true, cycleDay: 15, dueDay: 2 },
  { key: 'cash', name: 'Cash', bank: '', type: 'cash', tone: 't-yellow', on: true },
  { key: 'gopay', name: 'GoPay', bank: '', type: 'ewallet', tone: 't-blue', on: false },
  { key: 'spay', name: 'ShopeePay', bank: '', type: 'ewallet', tone: 't-orange', on: false },
];

// ---------- tags (free labels for events or trips, e.g. "Bali trip", "Lebaran") ----------
export const normTag = (s) => String(s || '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 32);
const tagKey = (s) => normTag(s).toLowerCase();
export const txTags = (x) => (Array.isArray(x && x.tags) ? x.tags : []);
// Spending under a tag = expenses + transfer admin fees; money in = income. Transfers and debts are not counted.
export const tagIndex = memo(() => [all(C.tx)], () => {
  const m = {};
  for (const x of liveTx()) for (const tg of txTags(x)) {
    const k = tagKey(tg); if (!k) continue;
    const r = m[k] || (m[k] = { key: k, name: normTag(tg), count: 0, out: 0, in: 0, first: x.date, last: x.date });
    r.count++;
    if (x.type === 'expense') r.out += x.amount; else if (x.type === 'transfer') r.out += x.fee || 0; else if (x.type === 'income') r.in += x.amount;
    if (x.date < r.first) r.first = x.date;
    if (x.date > r.last) { r.last = x.date; r.name = normTag(tg); }
  }
  return m;
});
export const allTags = () => Object.values(tagIndex()).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.count - a.count));
export const tagInfo = (name) => tagIndex()[tagKey(name)] || null;
export const hasTag = (x, name) => txTags(x).some((tg) => tagKey(tg) === tagKey(name));
export const txWithTag = (name) => txSorted().filter((x) => hasTag(x, name));
export function renameTag(from, to) {
  const n = normTag(to); if (!n) return;
  for (const x of txWithTag(from)) put(C.tx, { ...x, tags: [...new Set(txTags(x).map((tg) => (tagKey(tg) === tagKey(from) ? n : tg)))] });
  const a = moneySettings().activeTag; if (a && tagKey(a) === tagKey(from)) setMoneySettings({ activeTag: n });
}
export function removeTag(name) {
  for (const x of txWithTag(name)) put(C.tx, { ...x, tags: txTags(x).filter((tg) => tagKey(tg) !== tagKey(name)) });
  const a = moneySettings().activeTag; if (a && tagKey(a) === tagKey(name)) setMoneySettings({ activeTag: '' });
}

export function toCsv() {
  const rows = [['Date', 'Time', 'Type', 'Amount', 'Admin fee', 'Category', 'Account', 'To account', 'Debt', 'Note', 'Tags']];
  const J = { expense: 'Expense', income: 'Income', transfer: 'Transfer', adjust: 'Adjustment', debt: 'Debt' };
  const accName = (id) => { const a = account(id); return a ? (a.bank ? a.bank + ' ' : '') + a.name : ''; };
  for (const x of [...txSorted()].reverse()) {
    const d = x.debtId ? get(C.debt, x.debtId) : null;
    rows.push([x.date, x.time || '', J[x.type] || x.type, x.amount, x.fee || 0, x.type === 'expense' || x.type === 'income' ? catLabel(x.catId) : '', accName(x.accountId), accName(x.toAccountId), d ? `${d.person} (${x.action})` : '', x.note || '', txTags(x).join('; ')]);
  }
  return rows.map((r) => r.map((v) => { const s = String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
}
export { addDays };
