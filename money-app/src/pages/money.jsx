import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, Segmented, MoneyInput, Empty, DateInput } from '../ui/kit.jsx';
import { openOverlay, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, SubNav } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, put, patch, remove, uid, useStore, notifyAll, store } from '../lib/store.js';
import { today, addDays, diffDays, daysInMonth, nowTime, fmtShort, fmtDay, fmtLong, dayNum, weekday, startOfWeek, fmtWeekdayShort, fmtMonth, relDay } from '../lib/date.js';
import { fmtMoney } from '../lib/money.js';
import { t, tn, isID } from '../lib/i18n.js';
import * as $ from '../lib/money-data.js';
import { saveFile, saveMessage } from '../lib/files.js';
import * as M from '../lib/model-lite.js';
import { LANGS, lang } from '../lib/i18n.js';
import { copyText } from '../ui/kit.jsx';

// =====================================================================
// helpers
// =====================================================================
const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let HIDE = lsGet('vz:money-hide', false);
export const moneyHidden = () => HIDE;
export function setMoneyHidden(v) { HIDE = !!v; lsSet('vz:money-hide', HIDE); notifyAll(); }
// Rupiah everywhere: "Rp 1.500.000". Hidden amounts show dots.
export const rp = (n, { sign = false, show = false } = {}) => {
  if (HIDE && !show) return 'Rp •••';
  const s = fmtMoney(Math.abs(Math.round(n || 0)), 'IDR');
  return (n < 0 ? '−' : sign && n > 0 ? '+' : '') + s;
};
// Short form for tight spots: "240rb", "1,5jt"
const rpc = (n) => (HIDE ? '•••' : Math.abs(n) < 1000 ? String(Math.round(Math.abs(n))) : fmtMoney(Math.abs(n), 'IDR', { compact: true }).replace(/^Rp\s?/, ''));
const last = { get: () => lsGet('vz:money-last', {}), set: (ch) => lsSet('vz:money-last', { ...lsGet('vz:money-last', {}), ...ch }) };
const ymOf = (q) => { const cur = today().slice(0, 7); return /^\d{4}-\d{2}$/.test(q?.m || '') ? q.m : cur; };
const monthName = (ym) => fmtMonth(ym + '-01');
const dueText = (d) => d < 0 ? tn(-d, '{n} day late', '{n} days late') : d === 0 ? t('Due today') : d === 1 ? t('Due tomorrow') : t('Due in {n} days', { n: d });
const ordinal = (n) => (isID() ? `Tiap tanggal ${n}` : `Every ${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`);

export const MONEY_NAV = () => [
  { id: 'overview', label: t('Overview'), path: '/money' }, { id: 'history', label: t('History'), path: '/money/history' },
  { id: 'budget', label: t('Budget'), path: '/money/budget' }, { id: 'accounts', label: t('Accounts'), path: '/money/accounts' },
  { id: 'debts', label: t('Debts'), path: '/money/debts' }, { id: 'insights', label: t('Insights'), path: '/money/insights' },
  { id: 'settings', label: t('Settings'), path: '/money/settings' },
];

const CatIc = ({ c, size = 18, cls = '' }) => <span class={'mini-ic ' + $.catTone(c) + ' ' + cls}><Icon name={$.catIcon(c)} size={size} /></span>;
const AccIc = ({ a, cls = '' }) => <span class={'mini-ic ' + (a.tone || 't-grey') + ' ' + cls}>{a.type === 'credit' ? <Icon name="card" size={18} /> : a.type === 'cash' ? <Icon name="wallet" size={18} /> : <b class="mn-mono">{(a.name || '?').slice(0, 1).toUpperCase()}</b>}</span>;
const Dot = ({ tone }) => <span class="mn-dot" style={{ background: `var(--${tone || 't-grey'})` }} />;
const balText = (a, bal) => { const b = bal[a.id] || 0; return a.type === 'credit' ? (b < 0 ? t('{amount} owed', { amount: rp(-b) }) : rp(b)) : rp(b); };

function MonthNav({ ym, base }) {
  const cur = today().slice(0, 7);
  const go = (m) => navigate(base + (m !== cur ? (base.includes('?') ? '&' : '?') + 'm=' + m : ''), { replace: true });
  return (
    <div class="mn-mnav">
      {ym !== cur && <button class="chip" onClick={() => go(cur)}>{t('This month')}</button>}
      <button class="icon-btn" aria-label={t('Previous month')} onClick={() => go($.shiftYm(ym, -1))}><Icon name="chevronLeft" /></button>
      <button class="icon-btn" aria-label={t('Next month')} onClick={() => go($.shiftYm(ym, 1))}><Icon name="chevronRight" /></button>
    </div>
  );
}

function HideBtn() {
  return <button class="icon-btn glass" aria-label={HIDE ? t('Show amounts') : t('Hide amounts')} title={HIDE ? t('Show amounts') : t('Hide amounts')} onClick={() => setMoneyHidden(!HIDE)}><Icon name={HIDE ? 'eyeOff' : 'eye'} /></button>;
}
function Shell({ active, title, sub, actions, children, narrow = true }) {
  return (
    <div class={'page' + (narrow ? ' narrow' : '')}>
      <SubNav items={MONEY_NAV()} active={active} />
      <PageHeader eyebrow={t('Money')} title={title} actions={actions}>{sub && <div class="muted" style={{ marginTop: 6 }}>{sub}</div>}</PageHeader>
      {$.hasMoneySetup() || active === 'settings' ? children : store.ready ? <MoneySetup /> : <div class="card"><div class="empty"><div class="empty-title">{t('Loading your money…')}</div></div></div>}
    </div>
  );
}

// =====================================================================
// SETUP (first run)
// =====================================================================
function MoneySetup() {
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState(() => Object.fromEntries($.SUGGESTED.map((s) => [s.key, s.on])));
  const [bal, setBal] = useState({});
  const chosen = $.SUGGESTED.filter((s) => sel[s.key]);
  const finish = () => {
    $.ensureCats();
    let daily = '';
    chosen.forEach((s, i) => {
      const a = $.newAccount({ name: s.name, bank: s.bank, type: s.type, tone: s.tone, order: i, initial: s.type === 'credit' ? -(bal[s.key] || 0) : bal[s.key] || 0, cycleDay: s.cycleDay || null, dueDay: s.dueDay || null });
      if (s.key === 'daily') daily = a.id;
    });
    $.setMoneySettings({ allowanceAcc: daily });
    toast(t('All set. Tap + to add your first transaction.'));
  };
  return step === 1 ? (
    <>
      <div class="card">
        <div class="card-head"><div class="card-title">{t('Your accounts')}</div></div>
        <div class="muted" style={{ fontSize: 14, marginBottom: 6 }}>{t('Pre-filled with your Jago pockets and Tokopedia Card. Untick anything you don’t use. You can add more later.')}</div>
        <div class="list">
          {$.SUGGESTED.map((s) => (
            <button class="list-row clickable" onClick={() => setSel({ ...sel, [s.key]: !sel[s.key] })} aria-pressed={!!sel[s.key]}>
              <AccIc a={s} />
              <div class="row-main"><div class="row-title">{s.name}</div><div class="row-meta">{s.bank ? s.bank + ' · ' : ''}{$.accTypeLabel(s.type)}{s.type === 'credit' ? ' · ' + t('statement on the 15th, due on the 2nd') : ''}</div></div>
              <span class={'check' + (sel[s.key] ? ' on' : '')}><Icon name="check" size={14} stroke={2.6} /></span>
            </button>
          ))}
        </div>
      </div>
      <div class="row gap-8" style={{ justifyContent: 'flex-end' }}><button class="btn primary" disabled={!chosen.length} onClick={() => setStep(2)}>{t('Continue')}</button></div>
    </>
  ) : (
    <>
      <div class="card">
        <div class="card-head"><div class="card-title">{t('Starting balances')}</div></div>
        <div class="muted" style={{ fontSize: 14, marginBottom: 12 }}>{t('Today’s balance for each account. For the card, enter what you owe. Leave it empty if you’re not sure, you can adjust it later.')}</div>
        <div class="form">
          {chosen.map((s) => (
            <Field label={`${s.bank ? s.bank + ' ' : ''}${s.name} · ${s.type === 'credit' ? t('Amount owed') : t('Balance')}`} htmlFor={'mn-ob-' + s.key}>
              <MoneyInput id={'mn-ob-' + s.key} value={bal[s.key] || 0} onChange={(v) => setBal((b) => ({ ...b, [s.key]: v }))} />
            </Field>
          ))}
        </div>
      </div>
      <div class="row gap-8" style={{ justifyContent: 'flex-end' }}><button class="btn ghost" onClick={() => setStep(1)}>{t('Back')}</button><button class="btn primary" onClick={finish}>{t('Start tracking')}</button></div>
    </>
  );
}

// =====================================================================
// OVERVIEW
// =====================================================================
export const WIDGETS = () => [
  { id: 'month', label: t('This month'), sub: t('Money in, money out and what’s left') },
  { id: 'allowance', label: t('Daily allowance'), sub: t('Per-day spending from one pocket') },
  { id: 'cards', label: t('Credit cards'), sub: t('Bill to pay and due date') },
  { id: 'bills', label: t('Bills & subscriptions'), sub: t('This month’s recurring payments') },
  { id: 'budget', label: t('Budget'), sub: t('How much is left this month') },
  { id: 'debts', label: t('Debts'), sub: t('Who owes you and who you owe') },
  { id: 'spending', label: t('Top spending'), sub: t('Where the money went this month') },
  { id: 'accounts', label: t('Accounts'), sub: t('Every balance at a glance') },
  { id: 'recent', label: t('Recent activity'), sub: t('Your latest transactions') },
];
const WIDGET_ON = { month: true, allowance: true, cards: true, bills: true, budget: true, debts: true, recent: true };
export function widgetList() {
  const saved = $.moneySettings().widgets;
  const list = (Array.isArray(saved) ? saved : []).filter((w) => WIDGETS().some((x) => x.id === w.id));
  for (const w of WIDGETS()) if (!list.some((x) => x.id === w.id)) list.push({ id: w.id, on: !!WIDGET_ON[w.id] });
  return list;
}

export function MoneyOverview() {
  useStore();
  const desktop = useMedia('(min-width: 1040px)');
  const t0 = today(), ym = t0.slice(0, 7);
  const bal = $.balances();
  const tot = $.totals(bal);
  const ms = $.monthStats(ym);
  const spentToday = (ms.byDay[t0] || {}).out || 0;
  const W = { month: MonthW, allowance: AllowanceW, cards: CardsW, bills: BillsW, budget: BudgetW, debts: DebtsW, spending: SpendingW, accounts: AccountsW, recent: RecentW };
  const blocks = widgetList().filter((w) => w.on && W[w.id]).map((w) => { const C2 = W[w.id]; return <C2 key={w.id} ym={ym} ms={ms} bal={bal} />; });
  const left = desktop ? blocks.filter((_, i) => i % 2 === 0) : blocks, right = desktop ? blocks.filter((_, i) => i % 2 === 1) : [];
  return (
    <Shell active="overview" title={t('Your money')} narrow={false} actions={$.hasMoneySetup() && <><HideBtn /><button class="icon-btn glass" aria-label={t('Money settings')} onClick={() => navigate('/money/settings')}><Icon name="settings" /></button></>}>
      <div class="two-col even">
        <div class="stack">
          <div class="card mn-hero">
            <div class="stat-label">{t('Total balance')}</div>
            <div class="mn-balance">{HIDE ? '••••••' : <><span class="mn-cur">Rp</span>{tot.assets < 0 ? '−' : ''}{fmtMoney(Math.abs(tot.assets), 'IDR').replace(/^Rp\s?/, '')}</>}</div>
            <div class="mn-hero-lines">
              {tot.cardDebt > 0 && <span>{t('Card debt')} <b>{rp(tot.cardDebt)}</b></span>}
              <span>{t('Spent today')} <b>{rp(spentToday)}</b></span>
            </div>
            <div class="mn-actions">
              <button class="mn-action" onClick={() => openTx({ type: 'expense' })}><Icon name="arrowUp" size={18} />{t('Expense')}</button>
              <button class="mn-action" onClick={() => openTx({ type: 'income' })}><Icon name="arrowDown" size={18} />{t('Income')}</button>
              <button class="mn-action" onClick={() => openTx({ type: 'transfer' })}><Icon name="swap" size={18} />{t('Transfer')}</button>
            </div>
          </div>
          <ActiveTagBar />
          {left}
        </div>
        {desktop && <div class="stack">{right}</div>}
      </div>
      <button class="btn ghost" style={{ alignSelf: 'center' }} onClick={openCustomize}><Icon name="layout" size={17} />{t('Customize overview')}</button>
    </Shell>
  );
}
function ActiveTagBar() {
  const a = $.moneySettings().activeTag;
  if (!a) return null;
  const info = $.tagInfo(a);
  return (
    <div class="banner mn-tagbar">
      <Icon name="tag" size={18} />
      <button class="grow mn-plain" style={{ textAlign: 'left' }} onClick={() => openTag(a)}><b>{t('Tagging new transactions: {name}', { name: a })}</b><small>{t('{amount} so far', { amount: rp(info ? info.out : 0) })}</small></button>
      <button class="btn sm" onClick={() => { $.setMoneySettings({ activeTag: '' }); toast(t('Tag turned off')); }}>{t('Turn off')}</button>
    </div>
  );
}
const Head = ({ title, count, action, onAction, href }) => (
  <div class="card-head">
    <div class="card-title">{title}{count != null && count !== '' && <span class="count">{count}</span>}</div>
    {action && (href ? <a class="section-link mn-link" href={href}>{action}</a> : <button class="section-link mn-link" onClick={onAction}>{action}</button>)}
  </div>
);

function MonthW({ ym, ms }) {
  const net = ms.income - ms.expense;
  return (
    <div class="card">
      <Head title={monthName(ym)} action={t('Insights')} href="#/money/insights" />
      <div class="mn-figs">
        <div><span class="stat-label">{t('Money in')}</span><b class="mn-pos">{rp(ms.income)}</b></div>
        <div><span class="stat-label">{t('Money out')}</span><b>{rp(ms.expense)}</b></div>
      </div>
      <div class="mn-kv mn-total"><span>{net < 0 ? t('Overspent') : t('Left over')}</span><span class={net < 0 ? 'mn-neg' : ''}>{rp(Math.abs(net))}</span></div>
    </div>
  );
}
function AllowanceW() {
  const a = $.allowance();
  if (!a) return null;
  const pct = a.perDay ? Math.min(100, (a.spentToday / a.perDay) * 100) : a.spentToday ? 100 : 0;
  return (
    <div class="card">
      <Head title={<>{t('Daily allowance')} <span class="count">{a.acc.name}</span></>} action={t('Change')} onAction={openCustomize} />
      <div class="mn-big">{rp(a.perDay)}<small> / {t('day')}</small></div>
      <div class={'mn-bar' + (a.leftToday < 0 ? ' over' : pct > 80 ? ' warn' : '')}><i style={{ width: pct + '%' }} /></div>
      <div class="mn-note">{a.leftToday >= 0 ? <><b>{rp(a.leftToday)}</b> {t('left today')}</> : <><b class="mn-neg">{rp(-a.leftToday)}</b> {t('over today')}</>} · {t('{amount} for {days}', { amount: rp(Math.max(0, a.bal)), days: tn(a.daysLeft, '{n} day', '{n} days') })}</div>
    </div>
  );
}
function CardsW({ bal }) {
  const cards = $.accounts().filter((a) => a.type === 'credit');
  return <>{cards.map((a) => {
    const ci = $.cardInfo(a, bal);
    const pill = ci.billLeft <= 0 ? <span class="badge sm t-green">{t('Paid')}</span> : ci.daysToDue < 0 ? <span class="badge sm t-red">{dueText(ci.daysToDue)}</span> : ci.daysToDue <= 5 ? <span class="badge sm t-yellow">{dueText(ci.daysToDue)}</span> : null;
    return (
      <div class="card" key={a.id}>
        <div class="card-head"><button class="card-title mn-plain" onClick={() => openAccount(a.id)}><Icon name="card" size={18} />{a.name}</button>{pill || <button class="section-link mn-link" onClick={() => openAccount(a.id)}>{t('Details')}</button>}</div>
        <div class="stat-label">{t('To pay by {date}', { date: fmtShort(ci.due) })}</div>
        <div class="mn-big">{rp(ci.billLeft)}</div>
        <div class="mn-kv"><span>{t('This cycle, {from} – {to}', { from: fmtShort(ci.cycle[0]), to: fmtShort(ci.cycle[1]) })}</span><span>{rp(ci.cur)}</span></div>
        <div class="mn-kv"><span>{t('Total owed')}</span><span>{rp(ci.owed)}</span></div>
        {ci.billLeft > 0 && <button class="btn sm soft" style={{ marginTop: 10 }} onClick={() => payCard(a, ci)}>{t('Pay bill')}</button>}
      </div>
    );
  })}</>;
}
function BillsW({ ym }) {
  const bills = $.billsFor(ym);
  const open = bills.filter((b) => !b.paid).length;
  return (
    <div class="card">
      <Head title={t('Bills & subscriptions')} count={bills.length ? (open ? t('{n} to pay', { n: open }) : t('all paid')) : ''} action={bills.length ? t('Manage') : ''} onAction={openBills} />
      {bills.length ? <div class="list">{bills.map((b) => <BillRow key={b.b.id} item={b} ym={ym} />)}</div> : (
        <div class="today-empty"><span class="mini-ic t-violet"><Icon name="repeat" size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}><div class="row-title">{t('Add installments, rent and subscriptions once')}</div><div class="row-meta">{t('Each month they show up here with a Pay button.')}</div></div>
          <button class="btn sm soft" onClick={() => openBillEdit()}><Icon name="plus" size={15} />{t('Bill')}</button></div>
      )}
    </div>
  );
}
function BillRow({ item, ym }) {
  const { b, date, paid } = item;
  const d = diffDays(date, today());
  const c = $.cat(b.catId);
  const status = paid ? <span class="mn-pos">{t('Paid')}</span> : d < 0 ? <span class="mn-neg">{dueText(d)}</span> : d <= 3 ? <span class="mn-warn">{dueText(d)}</span> : t('Due {date}', { date: fmtShort(date) });
  return (
    <div class="list-row">
      <CatIc c={c} />
      <div class="row-main"><div class="row-title">{b.name}</div><div class="row-meta">{status} · {rp(b.amount)}</div></div>
      {paid ? <span class="mn-paid"><Icon name="check" size={18} stroke={2.4} /></span>
        : <button class="btn sm soft" onClick={() => openTx({ type: 'expense', prefill: { amount: b.amount, catId: b.catId, accountId: b.accountId, note: b.name }, billId: b.id, billYm: ym })}>{t('Pay')}</button>}
    </div>
  );
}
function BudgetW({ ym }) {
  const bu = $.budgetFor(ym);
  if (!bu.total) return (
    <div class="card"><Head title={t('Budget')} />
      <div class="today-empty"><span class="mini-ic t-green"><Icon name="target" size={18} /></span>
        <div class="grow" style={{ minWidth: 0 }}><div class="row-title">{t('No budget yet')}</div><div class="row-meta">{t('Set a monthly limit for the categories you want to watch.')}</div></div>
        <a class="btn sm soft" href="#/money/budget">{t('Set budget')}</a></div>
    </div>
  );
  const r = bu.spent / bu.total;
  return (
    <div class="card">
      <Head title={t('Budget')} action={t('Details')} href="#/money/budget" />
      <div class="mn-big">{bu.left >= 0 ? rp(bu.left) : rp(-bu.left)}<small> {bu.left >= 0 ? t('left') : t('over')}</small></div>
      <div class={'mn-bar' + (r > 1 ? ' over' : r > 0.85 ? ' warn' : '')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div>
      <div class="mn-note">{t('{spent} of {total} spent', { spent: rp(bu.spent), total: rp(bu.total) })}{bu.perDay > 0 && <> · <b>{rp(bu.perDay)}</b> / {t('day')}</>}</div>
    </div>
  );
}
function DebtsW() {
  const d = $.debtTotals();
  const open = $.liveDebts().filter((x) => $.debtState(x).left > 0).length;
  return (
    <div class="card">
      <Head title={t('Debts')} count={open || ''} action={open ? t('All') : t('Add')} onAction={() => (open ? navigate('/money/debts') : openDebtEdit())} />
      {open ? (
        <div class="mn-figs">
          <div><span class="stat-label">{t('Owed to you')}</span><b class="mn-pos">{rp(d.owedToMe)}</b></div>
          <div><span class="stat-label">{t('You owe')}</span><b>{rp(d.iOwe)}</b></div>
        </div>
      ) : <div class="mn-note">{t('Lent money to a friend or borrowed some? Track it here so nothing gets forgotten.')}</div>}
    </div>
  );
}
function SpendingW({ ms }) {
  const rows = Object.entries(ms.byCat).map(([id, amt]) => ({ c: $.cat(id), id, amt })).sort((a, b) => b.amt - a.amt).slice(0, 4);
  return (
    <div class="card">
      <Head title={t('Top spending')} action={t('All')} href="#/money/insights" />
      {rows.length ? rows.map((r) => (
        <div class="mn-brow" key={r.id}>
          <div class="mn-brow-top"><CatIc c={r.c} /><span class="grow row-title">{$.catName(r.c)}</span><b class="tnum">{rp(r.amt)}</b></div>
          <div class="mn-bar thin"><i style={{ width: Math.max(2, (r.amt / (ms.expense || 1)) * 100) + '%', background: `var(--${$.catTone(r.c)})` }} /></div>
        </div>
      )) : <div class="mn-note">{t('Nothing spent yet this month.')}</div>}
    </div>
  );
}
function AccountsW({ bal }) {
  return (
    <div class="card">
      <Head title={t('Accounts')} action={t('All')} href="#/money/accounts" />
      <div class="list">{$.accounts().slice(0, 6).map((a) => (
        <button class="list-row clickable" onClick={() => openAccount(a.id)}><AccIc a={a} /><div class="row-main"><div class="row-title">{a.name}</div></div><b class="tnum mn-amt">{balText(a, bal)}</b></button>
      ))}</div>
    </div>
  );
}
function RecentW() {
  const list = $.txSorted().slice(0, 6);
  return (
    <div class="card">
      <Head title={t('Recent activity')} action={list.length ? t('History') : ''} href="#/money/history" />
      {list.length ? <div class="list">{list.map((x) => <TxRow key={x.id} x={x} />)}</div> : <div class="mn-note">{t('Nothing yet. Tap Expense above or the + button to add your first one.')}</div>}
    </div>
  );
}

// =====================================================================
// TRANSACTION ROWS
// =====================================================================
function txView(x) {
  const a = $.account(x.accountId), b = $.account(x.toAccountId);
  if (x.type === 'transfer') return { icon: <span class="mini-ic t-accent"><Icon name="swap" size={18} /></span>, title: x.note || t('Transfer'), meta: `${a ? a.name : '?'} → ${b ? b.name : '?'}` + (x.fee ? ' · ' + t('fee {amount}', { amount: rp(x.fee) }) : ''), amt: rp(x.amount), cls: '' };
  if (x.type === 'adjust') return { icon: <span class="mini-ic t-grey"><Icon name="scale" size={18} /></span>, title: t('Balance adjustment'), meta: a ? a.name : '', amt: rp(x.amount, { sign: true }), cls: x.amount > 0 ? 'mn-pos' : '' };
  if (x.type === 'debt') {
    const d = get($.C.debt, x.debtId);
    const label = { lend: t('Lent to {name}'), borrow: t('Borrowed from {name}'), repay: t('Paid back {name}'), collect: t('{name} paid you back') }[x.action] || t('Debt');
    const into = x.action === 'borrow' || x.action === 'collect';
    return { icon: <span class="mini-ic t-yellow"><Icon name="handshake" size={18} /></span>, title: label.replace('{name}', d ? d.person : '?'), meta: [x.note, a ? a.name : t('Not through an account')].filter(Boolean).join(' · '), amt: HIDE ? rp(x.amount) : (into ? '+' : '−') + rp(x.amount), cls: into ? 'mn-pos' : '' };
  }
  const c = $.cat(x.catId);
  return { icon: <CatIc c={c} />, title: x.note || $.catName(c), meta: [x.note ? $.catLabel(x.catId) : (c && c.parentId ? $.catName($.cat(c.parentId)) : ''), a ? a.name : t('Deleted account')].filter(Boolean).join(' · '), amt: HIDE ? rp(x.amount) : (x.type === 'expense' ? '−' : '+') + rp(x.amount), cls: x.type === 'income' ? 'mn-pos' : '' };
}
function TxRow({ x }) {
  const v = txView(x);
  const tg = $.txTags(x);
  if (tg.length) v.meta = [v.meta, tg.map((n) => '#' + n).join(' ')].filter(Boolean).join(' · ');
  const open = () => (x.type === 'adjust' ? openAdjust(x) : x.type === 'debt' ? openDebt(x.debtId) : openTx({ tx: x }));
  return (
    <button class="list-row clickable mn-tx" onClick={open}>
      {v.icon}
      <div class="row-main"><div class="row-title ellipsis">{v.title}</div><div class="row-meta mn-ellip">{v.meta}</div></div>
      <div class="mn-tx-end"><b class={'tnum mn-amt ' + v.cls}>{v.amt}</b><span class="tnum">{(x.time || '').replace(':', '.')}</span></div>
    </button>
  );
}
function TxGroups({ list, empty }) {
  if (!list.length) return <Empty icon="wallet" title={empty || t('No transactions yet')} />;
  const groups = [];
  let cur = null;
  for (const x of list) {
    if (!cur || cur.date !== x.date) { cur = { date: x.date, items: [], out: 0 }; groups.push(cur); }
    cur.items.push(x);
    if (x.type === 'expense') cur.out += x.amount; else if (x.type === 'transfer') cur.out += x.fee || 0;
  }
  return groups.map((g) => (
    <div key={g.date}>
      <div class="mn-day"><span class={g.date === today() ? 'mn-today' : ''}>{relDay(g.date)}</span>{g.out > 0 && <span class="tnum">−{rp(g.out)}</span>}</div>
      <div class="list">{g.items.map((x) => <TxRow key={x.id} x={x} />)}</div>
    </div>
  ));
}

// =====================================================================
// HISTORY (calendar + list)
// =====================================================================
export function MoneyHistory({ query = {} }) {
  useStore();
  const ym = ymOf(query);
  const t0 = today();
  const [type, setType] = useState('all');
  const [day, setDay] = useState('');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const catF = query.cat || '';
  useEffect(() => { setDay(''); }, [ym]);
  const ms = $.monthStats(ym);
  const plan = {};
  for (const b of $.billsFor(ym)) if (!b.paid && b.date >= t0) plan[b.date] = (plan[b.date] || 0) + b.b.amount;
  const first = ym + '-01';
  const ws = M.settings().weekStart;
  const lead = (weekday(first) - ws + 7) % 7;
  const n = daysInMonth(first);
  const cells = Array.from({ length: Math.ceil((lead + n) / 7) * 7 }, (_, i) => addDays(first, i - lead));
  const dows = Array.from({ length: 7 }, (_, i) => fmtWeekdayShort(addDays(startOfWeek(t0, ws), i)).slice(0, 2));
  const term = q.trim().toLowerCase();
  const list = $.txSorted().filter((x) => {
    if (x.date.slice(0, 7) !== ym) return false;
    if (day && x.date !== day) return false;
    if (type !== 'all' && !(x.type === type || (type === 'transfer' && (x.type === 'adjust' || x.type === 'debt')))) return false;
    if (catF && !(x.catId === catF || $.topCatId(x.catId) === catF || (catF === 'fee' && x.type === 'transfer' && x.fee))) return false;
    if (term) { const v = txView(x); if (![v.title, v.meta, String(x.amount)].join(' ').toLowerCase().includes(term)) return false; }
    return true;
  });
  const catC = catF && $.cat(catF);
  return (
    <Shell active="history" title={t('History')} sub={monthName(ym)} actions={$.hasMoneySetup() && <MonthNav ym={ym} base={'/money/history' + (catF ? '?cat=' + catF : '')} />}>
      <div class="card mn-calcard">
        <div class="mn-cal" role="grid" aria-label={monthName(ym)}>
          {dows.map((d) => <span class="mn-cal-dow">{d}</span>)}
          {cells.map((d) => {
            const other = d.slice(0, 7) !== ym, x = ms.byDay[d], sel = day === d;
            return (
              <button class={'mn-cell' + (other ? ' other' : '') + (d === t0 ? ' today' : '') + (d > t0 ? ' future' : '') + (sel ? ' sel' : '')} disabled={other} tabIndex={other ? -1 : 0}
                aria-label={fmtLong(d)} aria-pressed={sel} onClick={() => setDay(sel ? '' : d)}>
                <span class="mn-n">{dayNum(d)}</span>
                {!other && x && x.out > 0 && <span class="mn-ca">{rpc(x.out)}</span>}
                {!other && x && x.in > 0 && <span class="mn-ca in">+{rpc(x.in)}</span>}
                {!other && plan[d] && !(x && (x.out || x.in)) && <span class="mn-ca plan">{rpc(plan[d])}</span>}
              </button>
            );
          })}
        </div>
        <div class="mn-calfoot"><span>{t('In')} <b class="mn-pos">{rp(ms.income)}</b></span><span>{t('Out')} <b>{rp(ms.expense)}</b></span>{Object.keys(plan).length > 0 && <span>{t('Grey = upcoming bill')}</span>}</div>
      </div>
      <div class="row gap-8">
        <Segmented class="full grow" options={[{ id: 'all', label: t('All') }, { id: 'expense', label: t('Out') }, { id: 'income', label: t('In') }, { id: 'transfer', label: t('Other') }]} value={type} onChange={setType} />
        <button class="icon-btn glass" aria-label={t('Search')} onClick={() => { if (searching) setQ(''); setSearching(!searching); }}><Icon name={searching ? 'x' : 'search'} /></button>
      </div>
      {searching && <div class="search-box"><Icon name="search" size={18} class="muted" /><input id="mn-q" autoFocus value={q} placeholder={t('Search notes, categories, accounts')} onInput={(e) => setQ(e.currentTarget.value)} /></div>}
      {(day || catC) && (
        <div class="chips">
          {day && <button class="chip on" onClick={() => setDay('')}>{fmtLong(day)}<Icon name="x" size={14} /></button>}
          {catC && <button class="chip on" onClick={() => navigate('/money/history' + (ym !== t0.slice(0, 7) ? '?m=' + ym : ''), { replace: true })}>{$.catLabel(catF)}<Icon name="x" size={14} /></button>}
        </div>
      )}
      <div class="card">
        <TxGroups list={list} empty={day ? t('Nothing on this day') : term || catC || type !== 'all' ? t('No matches') : t('No transactions this month')} />
      </div>
    </Shell>
  );
}

// =====================================================================
// BUDGET
// =====================================================================
export function MoneyBudget({ query = {} }) {
  useStore();
  const ym = ymOf(query);
  const bu = $.budgetFor(ym);
  const cats = $.catsOf('expense');
  const [editing, setEditing] = useState('');
  const totalSet = $.moneySettings().totalBudget || 0;
  const pctTotal = bu.total ? bu.spent / bu.total : 0;
  const isNow = ym === today().slice(0, 7);
  return (
    <Shell active="budget" title={t('Budget')} sub={monthName(ym)} actions={$.hasMoneySetup() && <MonthNav ym={ym} base="/money/budget" />}>
      <div class="card mn-hero">
        <div class="stat-label">{bu.total ? (bu.left >= 0 ? t('Left to spend') : t('Over budget by')) : t('Monthly budget')}</div>
        <div class="mn-balance sm">{bu.total ? rp(Math.abs(bu.left)) : t('Not set')}</div>
        {bu.total > 0 && <>
          <div class={'mn-bar' + (pctTotal > 1 ? ' over' : pctTotal > 0.85 ? ' warn' : '')}><i style={{ width: Math.min(100, pctTotal * 100) + '%' }} /></div>
          <div class="mn-hero-lines"><span>{t('Spent')} <b>{rp(bu.spent)}</b></span><span>{t('Budget')} <b>{rp(bu.total)}</b></span>{isNow && bu.perDay > 0 && <span>{t('Per day')} <b>{rp(bu.perDay)}</b></span>}</div>
        </>}
        {editing === '__total' ? (
          <BudgetEdit value={totalSet} hint={t('Leave empty to use the sum of category budgets ({amount}).', { amount: rp(bu.limits, { show: true }) })} onSave={(v) => { $.setMoneySettings({ totalBudget: v }); setEditing(''); }} onCancel={() => setEditing('')} />
        ) : <button class="btn sm soft" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setEditing('__total')}><Icon name="edit" size={15} />{totalSet ? t('Edit total budget') : t('Set a total budget')}</button>}
      </div>
      <div class="card">
        <Head title={t('By category')} />
        <div class="mn-note" style={{ marginTop: -4, marginBottom: 6 }}>{t('Tap a category to set its monthly limit. Limits repeat every month.')}</div>
        {cats.map((c) => {
          const spent = bu.ms.byCat[c.id] || 0, lim = c.limit || 0, r = lim ? spent / lim : 0;
          return (
            <div class="mn-brow" key={c.id}>
              <button class="mn-brow-top mn-plain" onClick={() => setEditing(editing === c.id ? '' : c.id)}>
                <CatIc c={c} />
                <span class="grow" style={{ minWidth: 0, textAlign: 'left' }}><span class="row-title" style={{ display: 'block' }}>{$.catName(c)}</span>
                  <span class="row-meta">{lim ? (spent > lim ? <span class="mn-neg">{t('{amount} over', { amount: rp(spent - lim) })}</span> : t('{left} left of {limit}', { left: rp(lim - spent), limit: rp(lim) })) : spent ? t('{amount} spent, no limit', { amount: rp(spent) }) : t('No limit')}</span></span>
                <b class="tnum">{rp(spent)}</b>
              </button>
              {lim > 0 && <div class={'mn-bar thin' + (r > 1 ? ' over' : r > 0.85 ? ' warn' : '')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div>}
              {editing === c.id && <BudgetEdit value={lim} onSave={(v) => { $.ensureCats(); patch($.C.cat, c.id, { limit: v }); setEditing(''); toast(v ? t('Budget saved') : t('Limit removed')); }} onCancel={() => setEditing('')} />}
            </div>
          );
        })}
        {bu.ms.byCat.fee > 0 && <div class="mn-kv"><span>{t('Admin fees (no limit)')}</span><span>{rp(bu.ms.byCat.fee)}</span></div>}
        {bu.cats.length > 0 && bu.unbudgeted > 0 && <div class="mn-kv"><span>{t('Spent outside your budgets')}</span><span>{rp(bu.unbudgeted)}</span></div>}
      </div>
    </Shell>
  );
}
function BudgetEdit({ value, onSave, onCancel, hint }) {
  const [v, setV] = useState(value || 0);
  return (
    <div class="mn-edit">
      <Field label={t('Monthly limit')} htmlFor="mn-limit" hint={hint}><MoneyInput id="mn-limit" value={v} onChange={setV} placeholder={t('No limit')} /></Field>
      <div class="row gap-8" style={{ justifyContent: 'flex-end' }}>
        {value > 0 && <button class="btn sm ghost" onClick={() => onSave(0)}>{t('Remove limit')}</button>}
        <button class="btn sm ghost" onClick={onCancel}>{t('Cancel')}</button><button class="btn sm primary" onClick={() => onSave(Math.max(0, v || 0))}>{t('Save')}</button>
      </div>
    </div>
  );
}

// =====================================================================
// ACCOUNTS
// =====================================================================
export function MoneyAccounts() {
  useStore();
  const bal = $.balances();
  const tot = $.totals(bal);
  const list = $.accounts();
  const groups = [];
  const add = (label, items, credit) => { if (items.length) groups.push({ label, items, credit }); };
  [...new Set(list.filter((a) => a.type !== 'credit' && a.bank).map((a) => a.bank))].forEach((b) => add(b, list.filter((a) => a.type !== 'credit' && a.bank === b)));
  add(t('Banks & e-wallets'), list.filter((a) => !a.bank && (a.type === 'bank' || a.type === 'ewallet')));
  add(t('Cash'), list.filter((a) => !a.bank && a.type === 'cash'));
  add(t('Credit cards'), list.filter((a) => a.type === 'credit'), true);
  const archived = $.allAccounts().filter((a) => a.archived);
  return (
    <Shell active="accounts" title={t('Accounts')} sub={tn(list.length, '{n} account', '{n} accounts')} actions={$.hasMoneySetup() && <button class="btn primary" onClick={() => openAccountEdit()}><Icon name="plus" size={18} />{t('Account')}</button>}>
      <div class="card mn-hero">
        <div class="stat-label">{t('Total balance')}</div>
        <div class="mn-balance">{rp(tot.assets)}</div>
        <div class="mn-hero-lines"><span>{t('Card debt')} <b>{rp(tot.cardDebt)}</b></span>{(tot.owedToMe > 0 || tot.iOwe > 0) && <span>{t('Debts')} <b>{rp(tot.owedToMe - tot.iOwe, { sign: true })}</b></span>}<span>{t('Net worth')} <b>{rp(tot.net)}</b></span></div>
      </div>
      {groups.map((g) => (
        <div class="card">
          <div class="card-head"><div class="card-title">{g.label}</div><span class="muted tnum" style={{ fontSize: 13, fontWeight: 700 }}>{g.credit ? t('{amount} owed', { amount: rp(g.items.reduce((s, a) => s + Math.max(0, -(bal[a.id] || 0)), 0)) }) : rp(g.items.reduce((s, a) => s + (bal[a.id] || 0), 0))}</span></div>
          <div class="list">{g.items.map((a) => (
            <button class="list-row clickable" onClick={() => openAccount(a.id)}>
              <AccIc a={a} />
              <div class="row-main"><div class="row-title">{a.name}</div>{a.type === 'credit' ? <div class="row-meta">{cardLine(a, bal)}</div> : a.type === 'ewallet' && !a.bank ? <div class="row-meta">{t('E-wallet')}</div> : null}</div>
              <b class={'tnum mn-amt' + (a.type !== 'credit' && (bal[a.id] || 0) < 0 ? ' mn-neg' : '')}>{a.type === 'credit' ? rp(Math.max(0, -(bal[a.id] || 0))) : rp(bal[a.id] || 0)}</b>
            </button>
          ))}</div>
        </div>
      ))}
      {archived.length > 0 && (
        <details class="card"><summary class="card-title" style={{ cursor: 'pointer' }}>{t('Archived')} <span class="count">{archived.length}</span></summary>
          <div class="list" style={{ marginTop: 8 }}>{archived.map((a) => <button class="list-row clickable" style={{ opacity: 0.7 }} onClick={() => openAccount(a.id)}><AccIc a={a} /><div class="row-main"><div class="row-title">{a.name}</div></div><b class="tnum mn-amt">{rp(bal[a.id] || 0)}</b></button>)}</div>
        </details>
      )}
      <div class="muted" style={{ fontSize: 13, textAlign: 'center' }}>{t('Balance doesn’t match your bank app? Open the account and tap Adjust balance.')}</div>
    </Shell>
  );
}
const cardLine = (a, bal) => { const ci = $.cardInfo(a, bal); return ci.billLeft > 0 ? t('{amount} due {date}', { amount: rp(ci.billLeft), date: fmtShort(ci.due) }) : t('Cycle {from} – {to}', { from: fmtShort(ci.cycle[0]), to: fmtShort(ci.cycle[1]) }); };

// =====================================================================
// DEBTS
// =====================================================================
export function MoneyDebts() {
  useStore();
  const tot = $.debtTotals();
  const rows = $.liveDebts().map((d) => ({ d, s: $.debtState(d) })).sort((a, b) => (a.s.left > 0 ? 0 : 1) - (b.s.left > 0 ? 0 : 1) || (a.d.dueDate || '9999').localeCompare(b.d.dueDate || '9999') || (b.s.last || '').localeCompare(a.s.last || ''));
  const open = rows.filter((r) => r.s.left > 0);
  const closed = rows.filter((r) => r.s.left <= 0);
  const lent = open.filter((r) => r.d.direction === 'lent'), borrowed = open.filter((r) => r.d.direction !== 'lent');
  return (
    <Shell active="debts" title={t('Debts')} sub={t('Money you lent or borrowed. Not counted as income or spending.')} actions={$.hasMoneySetup() && <button class="btn primary" onClick={() => openDebtEdit()}><Icon name="plus" size={18} />{t('Debt')}</button>}>
      <div class="stats mn-stats2">
        <div class="stat"><div class="stat-label">{t('Owed to you')}</div><div class="stat-value mn-pos">{rp(tot.owedToMe)}</div><div class="stat-sub">{tn(lent.length, '{n} person', '{n} people')}</div></div>
        <div class="stat"><div class="stat-label">{t('You owe')}</div><div class="stat-value">{rp(tot.iOwe)}</div><div class="stat-sub">{tn(borrowed.length, '{n} person', '{n} people')}</div></div>
      </div>
      {!rows.length && <div class="card"><Empty icon="handshake" title={t('No debts')} action={<button class="btn primary sm" onClick={() => openDebtEdit()}><Icon name="plus" size={15} />{t('Add a debt')}</button>}>{t('When you lend money or borrow some, add it here. Record each payment back until it’s settled.')}</Empty></div>}
      {lent.length > 0 && <div class="card"><Head title={t('They owe you')} count={lent.length} /><div class="list">{lent.map((r) => <DebtRow r={r} />)}</div></div>}
      {borrowed.length > 0 && <div class="card"><Head title={t('You owe them')} count={borrowed.length} /><div class="list">{borrowed.map((r) => <DebtRow r={r} />)}</div></div>}
      {closed.length > 0 && <details class="card"><summary class="card-title" style={{ cursor: 'pointer' }}>{t('Settled')} <span class="count">{closed.length}</span></summary><div class="list" style={{ marginTop: 8 }}>{closed.map((r) => <DebtRow r={r} />)}</div></details>}
    </Shell>
  );
}
function DebtRow({ r }) {
  const { d, s } = r;
  const due = d.dueDate && s.left > 0 ? diffDays(d.dueDate, today()) : null;
  return (
    <button class="list-row clickable" onClick={() => openDebt(d.id)}>
      <span class={'mini-ic ' + (d.direction === 'lent' ? 't-green' : 't-orange')}><b class="mn-mono">{(d.person || '?').slice(0, 1).toUpperCase()}</b></span>
      <div class="row-main"><div class="row-title">{d.person}</div>
        <div class="row-meta">{s.left <= 0 ? t('Settled') : s.settled > 0 ? t('{paid} of {total} paid back', { paid: rp(s.settled), total: rp(s.principal) }) : (d.note || (d.direction === 'lent' ? t('You lent') : t('You borrowed')))}{due != null && <> · <span class={due < 0 ? 'mn-neg' : due <= 3 ? 'mn-warn' : ''}>{due < 0 ? tn(-due, '{n} day late', '{n} days late') : t('Due {date}', { date: fmtShort(d.dueDate) })}</span></>}</div></div>
      <b class={'tnum mn-amt' + (d.direction === 'lent' && s.left > 0 ? ' mn-pos' : '')}>{rp(s.left > 0 ? s.left : s.principal)}</b>
    </button>
  );
}

// =====================================================================
// INSIGHTS
// =====================================================================
export function MoneyInsights({ query = {} }) {
  useStore();
  const ym = ymOf(query);
  const t0 = today();
  const [kind, setKind] = useState('expense');
  const [open, setOpen] = useState('');
  const ms = $.monthStats(ym);
  const prev = $.shiftYm(ym, -1);
  const msPrev = $.monthStats(prev);
  const map = kind === 'expense' ? ms.byCat : ms.inCat;
  const total = kind === 'expense' ? ms.expense : ms.income;
  const rows = Object.entries(map).map(([id, amt]) => ({ id, amt, c: $.cat(id) })).filter((r) => r.amt > 0).sort((a, b) => b.amt - a.amt);
  const isNow = ym === t0.slice(0, 7), past = ym < t0.slice(0, 7);
  const days = isNow ? +t0.slice(8) : past ? daysInMonth(ym + '-01') : 0;
  const cmp = isNow ? $.spentUntil(prev, +t0.slice(8)) : msPrev.expense;
  const diff = ms.expense - cmp;
  const R = 50, CIRC = 2 * Math.PI * R;
  let off = 0;
  const segs = rows.map((r) => { const len = total ? (r.amt / total) * CIRC : 0; const s = { r, len, off }; off += len; return s; });
  return (
    <Shell active="insights" title={t('Insights')} sub={monthName(ym)} actions={$.hasMoneySetup() && <MonthNav ym={ym} base="/money/insights" />}>
      <Segmented class="full" options={[{ id: 'expense', label: t('Spending') }, { id: 'income', label: t('Income') }]} value={kind} onChange={(v) => { setKind(v); setOpen(''); }} />
      <div class="card mn-donut-card">
        <div class="mn-donut">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" stroke-width="12" />
            {segs.map((s) => <circle key={s.r.id} cx="60" cy="60" r={R} fill="none" stroke={`var(--${$.catTone(s.r.c)})`} stroke-width="12" stroke-dasharray={`${Math.max(0, s.len - (segs.length > 1 ? 2 : 0))} ${CIRC}`} stroke-dashoffset={-s.off} />)}
          </svg>
          <div class="mn-donut-c"><small>{kind === 'expense' ? t('Spent') : t('Earned')}</small><b>{rpc(total)}</b></div>
        </div>
        <div class="mn-notes">
          {kind === 'expense' ? <>
            <span>{t('You spent')} <b>{rp(ms.expense)}</b>{days > 0 && <>, {t('about')} <b>{rp(ms.expense / days)}</b> {t('a day')}</>}.</span>
            {cmp > 0 && (isNow || past) && <span>{diff <= 0 ? <b class="mn-pos">{t('{amount} less', { amount: rp(-diff) })}</b> : <b>{t('{amount} more', { amount: rp(diff) })}</b>} {isNow ? t('than {month} by this date', { month: fmtMonth(prev + '-01').split(' ')[0] }) : t('than {month}', { month: fmtMonth(prev + '-01').split(' ')[0] })}.</span>}
            {rows[0] && <span>{t('Biggest category')}: <b>{$.catName(rows[0].c)}</b>, {Math.round((rows[0].amt / (ms.expense || 1)) * 100)}%.</span>}
          </> : <>
            <span>{t('You earned')} <b>{rp(ms.income)}</b> {t('from')} {tn(rows.length, '{n} source', '{n} sources')}.</span>
            <span>{ms.income - ms.expense >= 0 ? t('Left after spending') : t('Overspent by')} <b class={ms.income - ms.expense >= 0 ? 'mn-pos' : 'mn-neg'}>{rp(Math.abs(ms.income - ms.expense))}</b>.</span>
          </>}
        </div>
      </div>
      <div class="card">
        <Head title={t('By category')} action={kind === 'expense' ? t('Budget') : ''} href="#/money/budget" />
        {rows.length ? rows.map((r) => {
          const lim = kind === 'expense' && r.c && r.c.limit > 0 ? r.c.limit : 0;
          const pct = total ? r.amt / total : 0;
          const subs = Object.entries(ms.bySub).filter(([id]) => id !== r.id && $.topCatId(id) === r.id).map(([id, amt]) => ({ id, amt, c: $.cat(id) })).sort((a, b) => b.amt - a.amt);
          const own = ms.bySub[r.id] || 0;
          const expanded = open === r.id;
          return (
            <div class="mn-brow" key={r.id}>
              <button class="mn-brow-top mn-plain" onClick={() => (subs.length ? setOpen(expanded ? '' : r.id) : navigate('/money/history?cat=' + r.id + (ym !== t0.slice(0, 7) ? '&m=' + ym : '')))} aria-expanded={subs.length ? expanded : undefined}>
                <CatIc c={r.c} />
                <span class="grow" style={{ minWidth: 0, textAlign: 'left' }}><span class="row-title" style={{ display: 'block' }}>{$.catName(r.c)}</span>
                  <span class="row-meta">{lim ? (r.amt > lim ? <span class="mn-neg">{t('{amount} over budget', { amount: rp(r.amt - lim) })}</span> : t('{left} left of {limit}', { left: rp(lim - r.amt), limit: rp(lim) })) : t('{pct} of {what}', { pct: (pct > 0 && pct < 0.01 ? '<1' : Math.round(pct * 100)) + '%', what: kind === 'expense' ? t('spending') : t('income') })}{subs.length > 0 && ' · ' + tn(subs.length, '{n} sub-category', '{n} sub-categories')}</span></span>
                <b class="tnum">{rp(r.amt)}</b>
                {subs.length > 0 && <Icon name="chevronDown" size={16} class={'mn-chev' + (expanded ? ' open' : '')} />}
              </button>
              <div class={'mn-bar thin' + (lim ? (r.amt / lim > 1 ? ' over' : r.amt / lim > 0.85 ? ' warn' : '') : '')}><i style={{ width: Math.max(2, Math.min(100, (lim ? r.amt / lim : pct) * 100)) + '%', ...(lim ? {} : { background: `var(--${$.catTone(r.c)})` }) }} /></div>
              {expanded && (
                <div class="mn-subs">
                  {subs.map((s2) => <a class="mn-sub" href={'#/money/history?cat=' + s2.id + (ym !== t0.slice(0, 7) ? '&m=' + ym : '')}><span class="grow">{$.catName(s2.c)}</span><b class="tnum">{rp(s2.amt)}</b></a>)}
                  {own > 0 && <a class="mn-sub" href={'#/money/history?cat=' + r.id}><span class="grow muted">{t('No sub-category')}</span><b class="tnum">{rp(own)}</b></a>}
                </div>
              )}
            </div>
          );
        }) : <Empty icon="pie" title={kind === 'expense' ? t('No spending in {month}', { month: monthName(ym) }) : t('No income in {month}', { month: monthName(ym) })} />}
      </div>
      <TagsCard />
    </Shell>
  );
}

// =====================================================================
// TRANSACTION SHEET
// =====================================================================
export function openTx(opts = {}) {
  if (!$.hasMoneySetup()) { navigate('/money'); toast(t('Set up your accounts first.')); return; }
  openOverlay((close) => <TxSheet {...opts} close={close} />, { kind: 'sheet' });
}
function AmountField({ id, value, onChange, autoFocus }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus && ref.current && matchMedia('(pointer: fine)').matches) setTimeout(() => ref.current && ref.current.focus(), 60); }, []);
  const fmt = (n) => (n ? new Intl.NumberFormat('id-ID').format(n) : '');
  return (
    <label class="mn-amount" for={id}>
      <span>Rp</span>
      <input ref={ref} id={id} inputMode="numeric" autoComplete="off" placeholder="0" value={fmt(value)}
        onInput={(e) => { const n = parseInt(e.currentTarget.value.replace(/\D/g, '').slice(0, 13) || '0', 10); e.currentTarget.value = fmt(n); onChange(n); }} />
    </label>
  );
}
// Tags: free labels for an event or trip ("Bali trip", "Lebaran"), across categories and months
function TagField({ value, onChange }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const has = (n) => value.some((x) => x.toLowerCase() === n.toLowerCase());
  const add = (raw) => { const n = $.normTag(raw); if (n && !has(n)) onChange([...value, n]); setText(''); };
  const q = text.trim().toLowerCase().replace(/^#/, '');
  const sugg = $.allTags().filter((g) => !has(g.name) && (!q || g.key.includes(q))).slice(0, 6);
  return (
    <Field label={<>{t('Tags')} <span class="muted" style={{ fontWeight: 600 }}>{t('optional, for an event or trip')}</span></>}>
      <div class="chips">
        {value.map((n) => <button class="chip on" aria-label={t('Remove tag {name}', { name: n })} onClick={() => onChange(value.filter((x) => x !== n))}><Icon name="tag" size={14} />{n}<Icon name="x" size={13} /></button>)}
        {!adding && sugg.slice(0, value.length ? 3 : 5).map((g) => <button class="chip" onClick={() => add(g.name)}><Icon name="plus" size={13} />{g.name}</button>)}
        {!adding && <button class="chip mn-tagadd" onClick={() => setAdding(true)}><Icon name="tag" size={14} />{t('New tag')}</button>}
      </div>
      {adding && <>
        <input class="input" id="mn-tag" autoFocus autoComplete="off" value={text} placeholder={t('e.g. Bali trip, Lebaran, Wedding Raka')}
          onInput={(e) => { const v = e.currentTarget.value; if (/[,\n]/.test(v)) add(v.replace(/[,\n]/g, '')); else setText(v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text); else setAdding(false); } if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setText(''); } }}
          onBlur={() => setTimeout(() => { setText((cur) => { if (cur.trim()) add(cur); return ''; }); setAdding(false); }, 150)} />
        {sugg.length > 0 && <div class="chips sm">{sugg.map((g) => <button class="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => add(g.name)}><Icon name="tag" size={13} />{g.name}</button>)}</div>}
      </>}
    </Field>
  );
}
export function openTag(name) { openOverlay((close) => <TagSheet name={name} close={close} />, { kind: 'sheet' }); }
function TagSheet({ name: name0, close }) {
  useStore();
  const [name, setName] = useState(name0);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name0);
  const info = $.tagInfo(name);
  const list = $.txWithTag(name);
  const active = ($.moneySettings().activeTag || '').toLowerCase() === name.toLowerCase();
  const byCat = {};
  for (const x of list) if (x.type === 'expense') { const k = $.topCatId(x.catId); byCat[k] = (byCat[k] || 0) + x.amount; } else if (x.type === 'transfer' && x.fee) byCat.fee = (byCat.fee || 0) + x.fee;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const doRename = () => { const n = $.normTag(draft); if (n && n !== name) { $.renameTag(name, n); setName(n); toast(t('Tag renamed')); } setRenaming(false); };
  const del = async () => {
    if (!(await confirmDialog({ title: t('Remove tag “{name}”?', { name }), body: t('The transactions stay, only the tag is removed from them.'), confirmLabel: t('Remove tag'), danger: true }))) return;
    $.removeTag(name); close(); toast(t('Tag removed'));
  };
  return (
    <>
      <SheetHead title={<span class="row gap-8"><Icon name="tag" size={18} />{name}</span>} onClose={close} />
      <SheetBody>
        <div class="form">
          {renaming ? <div class="row gap-8"><input class="input grow" id="mn-tag-name" autoFocus value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && doRename()} /><button class="btn primary" onClick={doRename}>{t('Save')}</button></div> : null}
          <div class="mn-figs">
            <div><span class="stat-label">{t('Spent')}</span><b>{rp(info ? info.out : 0)}</b></div>
            <div><span class="stat-label">{info && info.in ? t('Money in') : t('Transactions')}</span><b class={info && info.in ? 'mn-pos' : ''}>{info && info.in ? rp(info.in) : (info ? info.count : 0)}</b></div>
          </div>
          {info && <div class="mn-note">{info.first === info.last ? fmtLong(info.first) : `${fmtShort(info.first)} – ${fmtShort(info.last)}`} · {tn(info.count, '{n} transaction', '{n} transactions')}</div>}
          {cats.length > 0 && <div class="list">{cats.map(([id, amt]) => { const c = $.cat(id); return <div class="list-row"><CatIc c={c} /><div class="row-main"><div class="row-title">{$.catName(c)}</div></div><b class="tnum mn-amt">{rp(amt)}</b></div>; })}</div>}
          <div class="mn-toggle-row"><span class="grow"><b>{t('Add to new transactions')}</b><small>{t('Turn on during the event, every new transaction gets this tag. Turn off when it ends.')}</small></span>
            <button class={'toggle ' + (active ? 'on' : '')} role="switch" aria-checked={active} aria-label={t('Add to new transactions')} onClick={() => $.setMoneySettings({ activeTag: active ? '' : name })} /></div>
          <div class="card mn-inner"><TxGroups list={list} empty={t('No transactions with this tag')} /></div>
          <div class="row gap-8">
            <button class="btn soft grow" onClick={() => { setDraft(name); setRenaming(true); }}><Icon name="edit" size={16} />{t('Rename')}</button>
            <button class="btn danger-soft grow" onClick={del}><Icon name="trash" size={16} />{t('Remove tag')}</button>
          </div>
        </div>
      </SheetBody>
    </>
  );
}
function TagsCard() {
  const tags = $.allTags();
  if (!tags.length) return (
    <div class="card"><Head title={t('Tags')} /><div class="mn-note">{t('Add a tag like “Bali trip” to transactions to see what an event cost, across categories and months.')}</div></div>
  );
  return (
    <div class="card">
      <Head title={t('Tags')} count={tags.length} />
      <div class="list">{tags.map((g) => (
        <button class="list-row clickable" onClick={() => openTag(g.name)}>
          <span class="mini-ic t-accent"><Icon name="tag" size={17} /></span>
          <div class="row-main"><div class="row-title">{g.name}</div><div class="row-meta">{(g.first === g.last ? fmtShort(g.first) : `${fmtShort(g.first)} – ${fmtShort(g.last)}`) + ' · ' + tn(g.count, '{n} transaction', '{n} transactions')}</div></div>
          <b class="tnum mn-amt">{rp(g.out)}</b>
        </button>
      ))}</div>
    </div>
  );
}

function TxSheet({ close, tx: ex, type: type0, prefill = {}, accountId: accPreset, payCardId, billId, billYm }) {
  useStore();
  const bal = $.balances();
  const active = $.accounts();
  const valid = (id) => (id && active.some((a) => a.id === id) ? id : '');
  const firstCash = () => (active.find((a) => a.type !== 'credit') || active[0] || {}).id || '';
  const L = last.get();
  const defAcc = (ty) => valid(accPreset) || valid(L[ty]) || (ty === 'expense' && (active.find((a) => /daily/i.test(a.name)) || {}).id) || firstCash();
  const [type, setType] = useState(ex ? ex.type : type0 || 'expense');
  const [amount, setAmount] = useState(ex ? ex.amount : prefill.amount || 0);
  const exCat = ex && ex.catId ? $.cat(ex.catId) : prefill.catId ? $.cat(prefill.catId) : null;
  const [top, setTop] = useState(exCat ? (exCat.parentId || exCat.id) : '');
  const [sub, setSub] = useState(exCat && exCat.parentId ? exCat.id : '');
  const [accId, setAcc] = useState(ex && ex.type !== 'transfer' ? ex.accountId : valid(prefill.accountId) || defAcc(type));
  const [fromId, setFrom] = useState(() => { if (ex && ex.type === 'transfer') return ex.accountId; const f = valid(accPreset) || valid(L.from) || firstCash(); return f === payCardId ? firstCash() : f; });
  const [toId, setTo] = useState(() => { if (ex && ex.type === 'transfer') return ex.toAccountId; if (valid(payCardId)) return payCardId; const x = valid(L.to); return x && x !== fromId ? x : ''; });
  const [fee, setFee] = useState(ex && ex.fee ? ex.fee : 0);
  const [feeOther, setFeeOther] = useState(!!(ex && ex.fee && !$.FEE_PRESETS.includes(ex.fee)));
  const [note, setNote] = useState(ex ? ex.note || '' : prefill.note || '');
  const [date, setDate] = useState(ex ? ex.date : prefill.date || today());
  const [time, setTime] = useState(ex ? ex.time || nowTime() : nowTime());
  const [noteFocus, setNoteFocus] = useState(false);
  const [tags, setTags] = useState(() => (ex ? $.txTags(ex) : prefill.tags || ($.moneySettings().activeTag ? [$.moneySettings().activeTag] : [])));
  const [spin, setSpin] = useState(false);
  const isT = type === 'transfer';
  const kind = type === 'income' ? 'income' : 'expense';
  const tops = $.catsOf(kind);
  const subs = top ? $.catsOf(kind, top) : [];
  const from = $.account(fromId), to = $.account(toId);
  const sameBank = from && to && from.bank && from.bank === to.bank;
  const t0 = today(), y0 = addDays(t0, -1);
  const changeType = (k) => { setType(k); if (k !== 'transfer') { const c = $.cat(top); if (!c || c.kind !== k) { setTop(''); setSub(''); } if (!ex) setAcc(defAcc(k)); } };
  const missing = !amount ? t('Enter an amount') : isT ? (!fromId ? t('Choose where it comes from') : !toId ? t('Choose where it goes') : fromId === toId ? t('Pick two different accounts') : '') : !top ? t('Choose a category') : !accId ? t('Choose an account') : '';
  const sugg = (() => {
    if (isT) return [];
    const seen = new Set(), out = [], q = note.trim().toLowerCase();
    for (const x of $.txSorted()) {
      if (x.type !== type || !x.note) continue;
      const k = x.note.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      if (q && (!k.includes(q) || k === q)) continue;
      out.push(x); if (out.length >= 6) break;
    }
    return out;
  })();
  const save = () => {
    if (missing) return;
    const rec = { ...(ex || {}), id: ex ? ex.id : uid(), type, amount, date, time, note: note.trim() };
    if (tags.length) rec.tags = tags; else delete rec.tags;
    if (isT) { rec.accountId = fromId; rec.toAccountId = toId; rec.fee = fee || 0; delete rec.catId; last.set({ from: fromId, to: toId }); }
    else { rec.accountId = accId; rec.catId = sub || top; delete rec.toAccountId; delete rec.fee; last.set({ [type]: accId }); }
    $.saveTx(rec);
    if (billId) $.markBillPaid(billId, billYm, rec.id);
    close();
    if (ex) toast(t('Changes saved'));
    else toast(t('{what} of {amount} saved', { what: isT ? t('Transfer') : type === 'expense' ? t('Expense') : t('Income'), amount: rp(amount, { show: true }) }), { action: { label: t('Undo'), run: () => $.deleteTx(rec.id) } });
  };
  const del = async () => {
    if (!(await confirmDialog({ title: t('Delete this transaction?'), body: t('Balances update right away.'), confirmLabel: t('Delete'), danger: true }))) return;
    $.deleteTx(ex.id); close(); toast(t('Transaction deleted'), { action: { label: t('Undo'), run: () => put($.C.tx, ex) } });
  };
  const pick = (setter, exclude, title) => pickAccount({ title, exclude, onPick: setter });
  return (
    <>
      <SheetHead title={ex ? t('Edit transaction') : t('New transaction')} onClose={close} />
      <SheetBody>
        <div class="form mn-form">
          <Segmented class="full" options={[{ id: 'expense', label: t('Expense') }, { id: 'income', label: t('Income') }, { id: 'transfer', label: t('Transfer') }]} value={type} onChange={changeType} />
          <AmountField id="mn-amt" value={amount} onChange={setAmount} autoFocus={!ex && !prefill.amount} />
          {isT ? <>
            <div class="mn-xfer">
              <button class={'mn-acctile' + (from ? '' : ' empty')} onClick={() => pick((id) => { setFrom(id); if (id === toId) setTo(''); }, '', t('Transfer from'))}>
                <small>{t('From')}</small>{from ? <><b><Dot tone={from.tone} /><span>{from.name}</span></b><em>{balText(from, bal)}</em></> : <b>{t('Choose')}</b>}</button>
              <button class={'mn-swap' + (spin ? ' spin' : '')} aria-label={t('Swap accounts')} onClick={() => { setSpin(!spin); setFrom(toId); setTo(fromId); }}><Icon name="swap" size={18} /></button>
              <button class={'mn-acctile' + (to ? '' : ' empty')} onClick={() => pick((id) => setTo(id), fromId, t('Transfer to'))}>
                <small>{t('To')}</small>{to ? <><b><Dot tone={to.tone} /><span>{to.name}</span></b><em>{balText(to, bal)}</em></> : <b>{t('Choose')}</b>}</button>
            </div>
            <Field label={<span class="row between" style={{ width: '100%' }}>{t('Admin fee')}{sameBank && <span class="muted" style={{ fontWeight: 600 }}>{t('Usually free between {bank} pockets', { bank: from.bank })}</span>}</span>}>
              <div class="chips">
                {$.FEE_PRESETS.map((f) => <button class={'chip' + (!feeOther && fee === f ? ' on' : '')} onClick={() => { setFeeOther(false); setFee(f); }}>{f === 0 ? t('Free') : rp(f, { show: true }) + (f === 2500 ? ' BI-FAST' : ' Online')}</button>)}
                <button class={'chip' + (feeOther ? ' on' : '')} onClick={() => { setFeeOther(true); if ($.FEE_PRESETS.includes(fee)) setFee(0); }}>{t('Other')}</button>
              </div>
              {feeOther && <MoneyInput id="mn-fee" value={fee} onChange={setFee} placeholder={t('Fee amount')} />}
            </Field>
            {amount > 0 && from && to && (
              <div class="mn-summary">
                <div class="mn-kv"><span>{from.name}</span><span>−{rp(amount + (fee || 0), { show: true })}</span></div>
                <div class="mn-kv"><span>{to.name}</span><span class="mn-pos">+{rp(amount, { show: true })}</span></div>
                {fee > 0 && <div class="mn-kv"><span>{t('Fee, counted as spending')}</span><span>{rp(fee, { show: true })}</span></div>}
              </div>
            )}
          </> : <>
            <Field label={<span class="row between" style={{ width: '100%' }}>{t('Category')}<button class="link-btn" onClick={() => openCategories(kind)}>{t('Edit')}</button></span>}>
              <div class="mn-catgrid">{tops.map((c) => (
                <button class={'mn-catbtn' + (top === c.id ? ' on' : '')} aria-pressed={top === c.id} onClick={() => { setTop(c.id); if (top !== c.id) setSub(''); }}><CatIc c={c} size={21} cls="lg" /><span>{$.catName(c)}</span></button>
              ))}</div>
            </Field>
            {subs.length > 0 && (
              <Field label={<>{t('Sub-category')} <span class="muted" style={{ fontWeight: 600 }}>{t('optional')}</span></>}>
                <div class="chips">
                  <button class={'chip' + (!sub ? ' on' : '')} onClick={() => setSub('')}>{t('General')}</button>
                  {subs.map((c) => <button class={'chip' + (sub === c.id ? ' on' : '')} onClick={() => setSub(c.id)}>{$.catName(c)}</button>)}
                </div>
              </Field>
            )}
            <Field label={type === 'expense' ? t('Paid from') : t('Received in')}>
              <div class="chips scroll mn-accchips">{active.map((a) => (
                <button class={'mn-accchip' + (accId === a.id ? ' on' : '')} onClick={() => setAcc(a.id)}><Dot tone={a.tone} /><span><b>{a.name}</b><small>{balText(a, bal)}</small></span></button>
              ))}</div>
            </Field>
          </>}
          <Field label={t('Date')}>
            <div class="chips">
              <button class={'chip' + (date === t0 ? ' on' : '')} onClick={() => setDate(t0)}>{t('Today')}</button>
              <button class={'chip' + (date === y0 ? ' on' : '')} onClick={() => setDate(y0)}>{t('Yesterday')}</button>
              <span class={'chip mn-pick' + (date !== t0 && date !== y0 ? ' on' : '')}><Icon name="calendar" size={15} />{date !== t0 && date !== y0 ? fmtShort(date) : t('Other date')}
                <input type="date" id="mn-date" aria-label={t('Pick a date')} value={date} onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} /></span>
              <span class="chip mn-pick tnum">{time.replace(':', '.')}<input type="time" id="mn-time" aria-label={t('Pick a time')} value={time} onChange={(e) => e.currentTarget.value && setTime(e.currentTarget.value)} /></span>
            </div>
          </Field>
          <Field label={<>{t('Note')} <span class="muted" style={{ fontWeight: 600 }}>{t('optional')}</span></>} htmlFor="mn-note">
            <input class="input" id="mn-note" autoComplete="off" value={note} placeholder={isT ? t('e.g. Card payment') : type === 'expense' ? t('e.g. Nasi padang') : t('e.g. Brand video')}
              onInput={(e) => setNote(e.currentTarget.value)} onFocus={() => setNoteFocus(true)} onBlur={() => setTimeout(() => setNoteFocus(false), 160)} />
            {sugg.length > 0 && (noteFocus || !note) && (
              <div class="chips sm">{sugg.map((x) => { const c = $.cat(x.catId); return (
                <button class="chip" onClick={() => { setNote(x.note); if (c && c.kind === kind) { setTop(c.parentId || c.id); setSub(c.parentId ? c.id : ''); } if (!amount) setAmount(x.amount); }}><Icon name={$.catIcon(c)} size={14} />{x.note}</button>
              ); })}</div>
            )}
          </Field>
          <TagField value={tags} onChange={setTags} />
        </div>
      </SheetBody>
      <SheetFoot>
        {ex && <button class="btn danger-soft" aria-label={t('Delete transaction')} onClick={del}><Icon name="trash" size={17} /></button>}
        <button class="btn primary grow" disabled={!!missing} onClick={save}>{missing || (ex ? t('Save changes') : t('Save'))}</button>
      </SheetFoot>
    </>
  );
}

// ---------- account picker ----------
function pickAccount({ title, exclude, onPick, allowNone }) {
  openOverlay((close) => {
    const bal = $.balances();
    return (
      <>
        <SheetHead title={title || t('Choose account')} onClose={close} />
        <SheetBody>
          <div class="list">
            {allowNone && <button class="list-row clickable" onClick={() => { onPick(''); close(); }}><span class="mini-ic t-grey"><Icon name="x" size={18} /></span><div class="row-main"><div class="row-title">{t('Not through an account')}</div><div class="row-meta">{t('Only tracks the debt, balances stay the same')}</div></div></button>}
            {$.accounts().filter((a) => a.id !== exclude).map((a) => (
              <button class="list-row clickable" onClick={() => { onPick(a.id); close(); }}>
                <AccIc a={a} /><div class="row-main"><div class="row-title">{a.name}</div><div class="row-meta">{a.bank ? a.bank + ' · ' : ''}{$.accTypeLabel(a.type)}</div></div><b class="tnum mn-amt">{balText(a, bal)}</b>
              </button>
            ))}
          </div>
          <button class="btn sm soft" style={{ marginTop: 10 }} onClick={() => openAccountEdit()}><Icon name="plus" size={15} />{t('New account')}</button>
        </SheetBody>
      </>
    );
  }, { kind: 'sheet' });
}

function payCard(a, ci) { openTx({ type: 'transfer', prefill: { amount: ci.billLeft || 0, note: t('{card} payment', { card: a.name }) }, payCardId: a.id }); }

// =====================================================================
// ACCOUNT SHEETS
// =====================================================================
export function openAccount(id) { openOverlay((close) => <AccountSheet id={id} close={close} />, { kind: 'sheet' }); }
function AccountSheet({ id, close }) {
  useStore();
  const a = $.account(id);
  const bal = $.balances();
  const isC = !!a && a.type === 'credit';
  const cur = a ? bal[a.id] || 0 : 0;
  const [adj, setAdj] = useState(false);
  const [actual, setActual] = useState(0);
  if (!a) return <><SheetHead title={t('Account')} onClose={close} /><SheetBody><Empty title={t('This account was deleted.')} /></SheetBody></>;
  const list = $.txSorted().filter((x) => x.accountId === a.id || x.toAccountId === a.id).slice(0, 80);
  const ci = isC ? $.cardInfo(a, bal) : null;
  const delta = (isC ? -actual : actual) - cur;
  const saveAdj = () => { if (delta) { $.saveTx({ type: 'adjust', amount: delta, accountId: a.id, date: today(), time: nowTime(), note: '' }); toast(t('Balance adjusted')); } setAdj(false); };
  return (
    <>
      <SheetHead title={a.name} sub={(a.bank ? a.bank + ' · ' : '') + $.accTypeLabel(a.type) + (a.archived ? ' · ' + t('archived') : '')} onClose={close}
        right={<button class="icon-btn ghost" aria-label={t('Edit account')} onClick={() => openAccountEdit(a.id)}><Icon name="edit" /></button>} />
      <SheetBody>
        <div class="form">
          <div><div class="stat-label">{isC ? t('Amount owed') : t('Balance')}</div><div class={'mn-balance sm' + (!isC && cur < 0 ? ' mn-neg' : '')}>{isC ? rp(Math.max(0, -cur)) : rp(cur)}</div></div>
          {ci && (
            <div class="mn-summary">
              <div class="mn-kv"><span>{t('Statement to {date}', { date: fmtShort(ci.statementEnd) })}</span><span>{rp(ci.closed)}</span></div>
              <div class="mn-kv"><span>{t('Paid since {date}', { date: fmtShort(ci.cycle[0]) })}</span><span class={ci.paid ? 'mn-pos' : ''}>{ci.paid ? '−' + rp(ci.paid) : rp(0)}</span></div>
              <div class="mn-kv mn-total"><span>{t('Left to pay by {date}', { date: fmtShort(ci.due) })}</span><span class={ci.billLeft ? '' : 'mn-pos'}>{ci.billLeft ? rp(ci.billLeft) : t('Paid')}</span></div>
              <div class="mn-kv"><span>{t('This cycle, {from} – {to}', { from: fmtShort(ci.cycle[0]), to: fmtShort(ci.cycle[1]) })}</span><span>{rp(ci.cur)}</span></div>
            </div>
          )}
          {adj ? (
            <div class="mn-edit">
              <Field label={isC ? t('Actual amount owed now') : t('Actual balance now')} htmlFor="mn-adj"><MoneyInput id="mn-adj" value={actual} onChange={setActual} /></Field>
              <div class="mn-note">{delta === 0 ? t('Same as now. Nothing to change.') : <>{t('Adds a')} <b class={delta > 0 ? 'mn-pos' : ''}>{rp(delta, { sign: true, show: true })}</b> {t('adjustment. It isn’t counted as spending.')}</>}</div>
              <div class="row gap-8" style={{ justifyContent: 'flex-end' }}><button class="btn sm ghost" onClick={() => setAdj(false)}>{t('Cancel')}</button><button class="btn sm primary" onClick={saveAdj}>{t('Save')}</button></div>
            </div>
          ) : (
            <div class="row gap-8 wrap">
              {isC ? <button class="btn primary" onClick={() => payCard(a, ci)}>{t('Pay bill')}</button> : <button class="btn primary" onClick={() => openTx({ type: 'expense', accountId: a.id })}><Icon name="plus" size={16} />{t('Add')}</button>}
              <button class="btn" onClick={() => { setActual(isC ? Math.max(0, -cur) : Math.max(0, cur)); setAdj(true); }}><Icon name="scale" size={16} />{t('Adjust balance')}</button>
            </div>
          )}
          <TxGroups list={list} empty={t('No transactions in this account yet.')} />
        </div>
      </SheetBody>
    </>
  );
}

export function openAccountEdit(id) { openOverlay((close) => <AccountEdit id={id} close={close} />, { kind: 'sheet' }); }
function AccountEdit({ id, close }) {
  const a = id ? $.account(id) : null;
  const [f, setF] = useState(() => a ? { ...a } : { name: '', bank: '', type: 'bank', tone: $.TONES[$.allAccounts().length % $.TONES.length], initial: 0, cycleDay: 15, dueDay: 2 });
  const [initial, setInitial] = useState(0);
  const set = (ch) => setF({ ...f, ...ch });
  const used = a ? $.liveTx().some((x) => x.accountId === a.id || x.toAccountId === a.id) : false;
  const banks = [...new Set($.allAccounts().map((x) => x.bank).filter(Boolean))];
  const save = () => {
    const name = (f.name || '').trim();
    if (!name) return toast(t('Give the account a name first.'), { tone: 'warn' });
    const data = { name, bank: f.type === 'bank' || f.type === 'ewallet' ? (f.bank || '').trim() : '', type: f.type, tone: f.tone, cycleDay: f.type === 'credit' ? Math.min(28, Math.max(1, +f.cycleDay || 15)) : null, dueDay: f.type === 'credit' ? Math.min(28, Math.max(1, +f.dueDay || 2)) : null };
    if (a) patch($.C.acc, a.id, data); else $.newAccount({ ...data, initial: f.type === 'credit' ? -initial : initial });
    toast(a ? t('Account saved') : t('Account added'));
    close();
  };
  const archive = () => { patch($.C.acc, a.id, { archived: !a.archived }); toast(a.archived ? t('Account restored') : t('Account archived. Its history stays.')); close(); };
  const del = async () => { if (await confirmDialog({ title: t('Delete this account?'), confirmLabel: t('Delete'), danger: true })) { remove($.C.acc, a.id); toast(t('Account deleted')); close(); } };
  return (
    <>
      <SheetHead title={a ? t('Edit account') : t('New account')} onClose={close} />
      <SheetBody>
        <div class="form">
          <Segmented class="full" options={$.ACC_TYPES.map((x) => ({ id: x.id, label: t(x.label) }))} value={f.type} onChange={(v) => set({ type: v })} />
          <Field label={t('Name')} htmlFor="mn-acc-name"><TextInput id="mn-acc-name" value={f.name} onInput={(v) => set({ name: v })} placeholder={f.type === 'credit' ? 'Tokopedia Card' : f.type === 'bank' ? 'Daily Life' : f.type === 'ewallet' ? 'GoPay' : t('Wallet')} autoFocus={!a} /></Field>
          {(f.type === 'bank' || f.type === 'ewallet') && (
            <Field label={t('Bank')} htmlFor="mn-acc-bank" hint={t('Optional. Groups pockets from the same bank together.')}>
              <TextInput id="mn-acc-bank" value={f.bank} onInput={(v) => set({ bank: v })} placeholder="Jago" />
              {banks.length > 0 && <div class="chips sm" style={{ marginTop: 6 }}>{banks.map((b) => <button class={'chip' + (f.bank === b ? ' on' : '')} onClick={() => set({ bank: f.bank === b ? '' : b })}>{b}</button>)}</div>}
            </Field>
          )}
          {!a && <Field label={f.type === 'credit' ? t('Amount owed now') : t('Balance now')} htmlFor="mn-acc-init"><MoneyInput id="mn-acc-init" value={initial} onChange={setInitial} /></Field>}
          {f.type === 'credit' && (
            <div class="form-row">
              <Field label={t('Statement day')} htmlFor="mn-acc-cyc"><input class="input" id="mn-acc-cyc" type="number" inputMode="numeric" min="1" max="28" value={f.cycleDay || 15} onInput={(e) => set({ cycleDay: +e.currentTarget.value })} /></Field>
              <Field label={t('Due day')} htmlFor="mn-acc-due"><input class="input" id="mn-acc-due" type="number" inputMode="numeric" min="1" max="28" value={f.dueDay || 2} onInput={(e) => set({ dueDay: +e.currentTarget.value })} /></Field>
            </div>
          )}
          <Field label={t('Color')}><div class="mn-tones">{$.TONES.map((tn2) => <button class={f.tone === tn2 ? 'on' : ''} aria-label={tn2} onClick={() => set({ tone: tn2 })}><Dot tone={tn2} /></button>)}</div></Field>
          {a && <div class="field-hint">{t('To change the balance, use Adjust balance on the account page so your history stays correct.')}</div>}
        </div>
      </SheetBody>
      <SheetFoot>
        {a && (used ? <button class="btn" onClick={archive}><Icon name="archive" size={16} />{a.archived ? t('Restore') : t('Archive')}</button> : <button class="btn danger-soft" aria-label={t('Delete account')} onClick={del}><Icon name="trash" size={16} /></button>)}
        <button class="btn primary grow" onClick={save}>{a ? t('Save') : t('Add account')}</button>
      </SheetFoot>
    </>
  );
}

function openAdjust(x) {
  openOverlay((close) => {
    const a = $.account(x.accountId);
    const del = async () => { if (await confirmDialog({ title: t('Delete this adjustment?'), confirmLabel: t('Delete'), danger: true })) { $.deleteTx(x.id); close(); toast(t('Adjustment deleted'), { action: { label: t('Undo'), run: () => put($.C.tx, x) } }); } };
    return (
      <>
        <SheetHead title={t('Balance adjustment')} sub={(a ? a.name + ' · ' : '') + fmtLong(x.date)} onClose={close} />
        <SheetBody><div class="form"><div class={'mn-balance sm' + (x.amount > 0 ? ' mn-pos' : '')}>{rp(x.amount, { sign: true })}</div><div class="muted" style={{ fontSize: 14 }}>{t('Added when this account’s balance was matched to the real one. It isn’t counted as spending or income.')}</div></div></SheetBody>
        <SheetFoot><button class="btn danger-soft" onClick={del}><Icon name="trash" size={16} />{t('Delete adjustment')}</button></SheetFoot>
      </>
    );
  }, { kind: 'sheet' });
}

// =====================================================================
// CATEGORIES (with sub-categories)
// =====================================================================
export function openCategories(kind = 'expense') { openOverlay((close) => <CategoriesSheet kind0={kind} close={close} />, { kind: 'sheet' }); }
const PICK_ICONS = ['food', 'coffee', 'fuel', 'car', 'bag', 'shirt', 'home', 'bolt', 'wifi', 'phone', 'tv', 'camera', 'video', 'health', 'dumbbell', 'heart', 'gift', 'book', 'send', 'receipt', 'box', 'briefcase', 'link', 'tray', 'users', 'spark'];
function CategoriesSheet({ kind0, close }) {
  useStore();
  const [kind, setKind] = useState(kind0);
  const [edit, setEdit] = useState(null);
  const ms = $.monthStats(today().slice(0, 7));
  const tops = Object.values($.catMap()).filter((c) => c.kind === kind && !c.hidden && !c.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const saveCat = (c) => { $.ensureCats(); const { subsDraft, ...rec } = c; put($.C.cat, rec); setEdit(null); toast(t('Category saved')); };
  const removeCat = async (c) => {
    const used = $.liveTx().some((x) => x.catId === c.id || (!c.parentId && $.topCatId(x.catId) === c.id));
    if (!(await confirmDialog({ title: t('Delete “{name}”?', { name: $.catName(c) }), body: used ? t('Past transactions keep their amounts and still show under this name.') : null, confirmLabel: t('Delete'), danger: true }))) return;
    $.ensureCats();
    const kids = Object.values($.catMap()).filter((x) => x.parentId === c.id);
    if (used) { put($.C.cat, { ...c, hidden: true }); kids.forEach((k) => put($.C.cat, { ...k, hidden: true })); }
    else { remove($.C.cat, c.id); kids.forEach((k) => remove($.C.cat, k.id)); }
    setEdit(null); toast(t('Category deleted'));
  };
  const newSub = (p) => setEdit({ id: '', parentId: p.id, kind, name: '', icon: p.icon, tone: p.tone, limit: 0 });
  const Row = ({ c, depth }) => edit && edit.id === c.id ? <CatForm c={edit} onSave={saveCat} onCancel={() => setEdit(null)} onDelete={c.system ? null : () => removeCat(c)} /> : (
    <button class={'list-row clickable' + (depth ? ' mn-subrow' : '')} onClick={() => setEdit({ ...c })}>
      {depth ? <span class="mn-subdot" /> : <CatIc c={c} />}
      <div class="row-main"><div class="row-title">{$.catName(c)}</div>
        {!depth && <div class="row-meta">{c.system ? t('Filled in from transfer fees') : kind === 'expense' ? (c.limit ? t('{spent} of {limit} this month', { spent: rp(ms.byCat[c.id] || 0), limit: rp(c.limit, { show: true }) }) : t('No budget')) : t('Income')}</div>}</div>
      <Icon name="edit" size={16} class="muted" />
    </button>
  );
  return (
    <>
      <SheetHead title={t('Categories')} sub={t('Sub-categories are optional. Budgets are set on main categories.')} onClose={close} />
      <SheetBody>
        <div class="form">
          <Segmented class="full" options={[{ id: 'expense', label: t('Spending') }, { id: 'income', label: t('Income') }]} value={kind} onChange={(v) => { setKind(v); setEdit(null); }} />
          <div class="list">
            {tops.map((c) => {
              const kids = Object.values($.catMap()).filter((x) => x.parentId === c.id && !x.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
              return (
                <div key={c.id}>
                  <Row c={c} depth={0} />
                  {kids.map((k) => <Row key={k.id} c={k} depth={1} />)}
                  {edit && !edit.id && edit.parentId === c.id ? <CatForm c={edit} sub onSave={(x) => saveCat({ ...x, id: c.id + '.' + uid(), order: (c.order || 0) + 9 })} onCancel={() => setEdit(null)} />
                    : !c.system && <button class="mn-addsub" onClick={() => newSub(c)}><Icon name="plus" size={14} />{t('Sub-category')}</button>}
                </div>
              );
            })}
          </div>
          {edit && !edit.id && !edit.parentId ? <CatForm c={edit} onSave={(x) => saveCat({ ...x, id: uid(), kind, order: 1000 + tops.length })} onCancel={() => setEdit(null)} />
            : <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ id: '', parentId: '', kind, name: '', icon: 'spark', tone: 't-blue', limit: 0 })}><Icon name="plus" size={15} />{t('New category')}</button>}
        </div>
      </SheetBody>
    </>
  );
}
function CatForm({ c, sub, onSave, onCancel, onDelete }) {
  const [f, setF] = useState({ ...c, name: c.def ? $.catName(c) : c.name });
  const isSub = sub || !!c.parentId;
  const changed = (f.name || '').trim() !== (c.def ? $.catName(c) : c.name);
  return (
    <div class="mn-edit">
      <Field label={isSub ? t('Sub-category name') : t('Name')} htmlFor="mn-cat-name"><TextInput id="mn-cat-name" value={f.name} onInput={(v) => setF({ ...f, name: v })} placeholder={isSub ? t('e.g. Coffee') : t('e.g. Groceries')} autoFocus /></Field>
      {!isSub && !c.system && <Field label={t('Icon')}><div class="mn-iconpick">{PICK_ICONS.map((n) => <button class={f.icon === n ? 'on' : ''} aria-label={n} onClick={() => setF({ ...f, icon: n })}><Icon name={n} size={18} /></button>)}</div></Field>}
      {!isSub && <Field label={t('Color')}><div class="mn-tones">{$.TONES.map((tn2) => <button class={f.tone === tn2 ? 'on' : ''} aria-label={tn2} onClick={() => setF({ ...f, tone: tn2 })}><Dot tone={tn2} /></button>)}</div></Field>}
      {!isSub && c.kind === 'expense' && !c.system && <Field label={t('Monthly budget')} htmlFor="mn-cat-lim" hint={t('Optional')}><MoneyInput id="mn-cat-lim" value={f.limit || 0} onChange={(v) => setF({ ...f, limit: v })} placeholder={t('No limit')} /></Field>}
      <div class="row gap-8" style={{ justifyContent: 'flex-end' }}>
        {onDelete && <button class="btn sm danger-soft" aria-label={t('Delete category')} onClick={onDelete}><Icon name="trash" size={15} /></button>}
        <span class="grow" />
        <button class="btn sm ghost" onClick={onCancel}>{t('Cancel')}</button>
        <button class="btn sm primary" disabled={!(f.name || '').trim()} onClick={() => onSave({ ...f, name: (f.name || '').trim(), def: c.def && !changed })}>{t('Save')}</button>
      </div>
    </div>
  );
}

// =====================================================================
// BILLS
// =====================================================================
export function openBills() { openOverlay((close) => <BillsSheet close={close} />, { kind: 'sheet' }); }
function BillsSheet({ close }) {
  useStore();
  const ym = today().slice(0, 7);
  const bills = $.billsFor(ym);
  const total = $.liveBills().reduce((s, b) => s + b.amount, 0);
  const subsTotal = $.liveBills().filter((b) => $.topCatId(b.catId) === 'subscriptions').reduce((s, b) => s + b.amount, 0);
  return (
    <>
      <SheetHead title={t('Bills & subscriptions')} sub={bills.length ? t('{amount} a month', { amount: rp(total) }) + (subsTotal ? ' · ' + t('{amount} on subscriptions', { amount: rp(subsTotal) }) : '') : t('Payments that repeat on the same day each month')} onClose={close} />
      <SheetBody>
        {bills.length ? <div class="list">{bills.map(({ b, paid }) => { const a = $.account(b.accountId); return (
          <button class="list-row clickable" onClick={() => openBillEdit(b.id)}>
            <CatIc c={$.cat(b.catId)} /><div class="row-main"><div class="row-title">{b.name}</div><div class="row-meta">{ordinal(b.day)} · {a ? a.name : t('Deleted account')}{paid ? ' · ' + t('paid this month') : ''}</div></div><b class="tnum mn-amt">{rp(b.amount)}</b>
          </button>
        ); })}</div> : <Empty icon="repeat" title={t('No bills yet')}>{t('Car installment on the 25th, rent on the 1st, streaming, money for family. They show on Overview and as grey amounts in the History calendar.')}</Empty>}
      </SheetBody>
      <SheetFoot><button class="btn primary grow" onClick={() => openBillEdit()}><Icon name="plus" size={16} />{t('Add a bill')}</button></SheetFoot>
    </>
  );
}
export function openBillEdit(id) { openOverlay((close) => <BillEdit id={id} close={close} />, { kind: 'sheet' }); }
function BillEdit({ id, close }) {
  const b = id ? get($.C.bill, id) : null;
  const accs = $.accounts();
  const [f, setF] = useState(() => b ? { ...b } : { name: '', amount: 0, day: +today().slice(8), catId: 'installments', accountId: (accs.find((a) => /fix/i.test(a.name)) || accs[0] || {}).id || '' });
  const set = (ch) => setF({ ...f, ...ch });
  const top = $.topCatId(f.catId);
  const subs = $.catsOf('expense', top);
  const ok = (f.name || '').trim() && f.amount > 0 && f.day >= 1 && f.day <= 31 && f.accountId;
  const save = () => {
    if (!ok) return;
    const data = { name: f.name.trim(), amount: f.amount, day: Math.round(f.day), catId: f.catId, accountId: f.accountId };
    if (b) patch($.C.bill, b.id, data); else put($.C.bill, { id: uid(), start: today().slice(0, 7), paid: {}, ...data });
    toast(b ? t('Bill saved') : t('Bill added')); close();
  };
  const del = async () => { if (await confirmDialog({ title: t('Delete this bill?'), body: t('Payments already saved stay in your history.'), confirmLabel: t('Delete'), danger: true })) { remove($.C.bill, b.id); toast(t('Bill deleted')); close(); } };
  return (
    <>
      <SheetHead title={b ? t('Edit bill') : t('New bill')} onClose={close} />
      <SheetBody>
        <div class="form">
          <Field label={t('Name')} htmlFor="mn-bill-name"><TextInput id="mn-bill-name" value={f.name} onInput={(v) => set({ name: v })} placeholder={t('Car installment')} autoFocus={!b} /></Field>
          <div class="form-row">
            <Field label={t('Amount')} htmlFor="mn-bill-amt"><MoneyInput id="mn-bill-amt" value={f.amount} onChange={(v) => set({ amount: v })} /></Field>
            <Field label={t('Day of the month')} htmlFor="mn-bill-day"><input class="input" id="mn-bill-day" type="number" inputMode="numeric" min="1" max="31" value={f.day} onInput={(e) => set({ day: +e.currentTarget.value })} /></Field>
          </div>
          <Field label={t('Category')}><div class="mn-catgrid">{$.catsOf('expense').map((c) => <button class={'mn-catbtn' + (top === c.id ? ' on' : '')} onClick={() => set({ catId: c.id })}><CatIc c={c} size={21} cls="lg" /><span>{$.catName(c)}</span></button>)}</div></Field>
          {subs.length > 0 && <Field label={t('Sub-category')}><div class="chips"><button class={'chip' + (f.catId === top ? ' on' : '')} onClick={() => set({ catId: top })}>{t('General')}</button>{subs.map((c) => <button class={'chip' + (f.catId === c.id ? ' on' : '')} onClick={() => set({ catId: c.id })}>{$.catName(c)}</button>)}</div></Field>}
          <Field label={t('Paid from')}><div class="chips scroll mn-accchips">{accs.map((a) => <button class={'mn-accchip' + (f.accountId === a.id ? ' on' : '')} onClick={() => set({ accountId: a.id })}><Dot tone={a.tone} /><span><b>{a.name}</b><small>{a.bank || $.accTypeLabel(a.type)}</small></span></button>)}</div></Field>
        </div>
      </SheetBody>
      <SheetFoot>
        {b && <button class="btn danger-soft" aria-label={t('Delete bill')} onClick={del}><Icon name="trash" size={16} /></button>}
        <button class="btn primary grow" disabled={!ok} onClick={save}>{ok ? t('Save') : !(f.name || '').trim() ? t('Enter a name') : !f.amount ? t('Enter an amount') : t('Fill in the details')}</button>
      </SheetFoot>
    </>
  );
}

// =====================================================================
// DEBTS (sheets)
// =====================================================================
export function openDebtEdit(id) { openOverlay((close) => <DebtEdit id={id} close={close} />, { kind: 'sheet' }); }
function DebtEdit({ id, close }) {
  const d = id ? get($.C.debt, id) : null;
  const L = last.get();
  const [f, setF] = useState(() => d ? { ...d } : { direction: 'lent', person: '', note: '', dueDate: '' });
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState(L.debt || (($.accounts().find((a) => a.type !== 'credit') || {}).id || ''));
  const [date, setDate] = useState(today());
  const set = (ch) => setF({ ...f, ...ch });
  const people = [...new Set($.liveDebts().map((x) => x.person).filter(Boolean))];
  const acc = $.account(accountId);
  const ok = (f.person || '').trim() && (d || amount > 0);
  const save = () => {
    if (!ok) return;
    const data = { direction: f.direction, person: f.person.trim(), note: (f.note || '').trim(), dueDate: f.dueDate || '' };
    if (d) { patch($.C.debt, d.id, data); toast(t('Debt saved')); close(); return; }
    const rec = put($.C.debt, { id: uid(), ...data });
    $.saveTx({ type: 'debt', debtId: rec.id, action: f.direction === 'lent' ? 'lend' : 'borrow', amount, accountId, date, time: nowTime(), note: '' });
    last.set({ debt: accountId });
    toast(f.direction === 'lent' ? t('Saved: {name} owes you {amount}', { name: data.person, amount: rp(amount, { show: true }) }) : t('Saved: you owe {name} {amount}', { name: data.person, amount: rp(amount, { show: true }) }));
    close();
  };
  return (
    <>
      <SheetHead title={d ? t('Edit debt') : t('New debt')} onClose={close} />
      <SheetBody>
        <div class="form">
          <Segmented class="full" options={[{ id: 'lent', label: t('I lent money') }, { id: 'borrowed', label: t('I borrowed money') }]} value={f.direction} onChange={(v) => set({ direction: v })} />
          <Field label={f.direction === 'lent' ? t('Who owes you') : t('Who you owe')} htmlFor="mn-debt-person">
            <TextInput id="mn-debt-person" value={f.person} onInput={(v) => set({ person: v })} placeholder={t('Name')} autoFocus={!d} />
            {people.length > 0 && !d && <div class="chips sm" style={{ marginTop: 6 }}>{people.slice(0, 8).map((p) => <button class={'chip' + (f.person === p ? ' on' : '')} onClick={() => set({ person: p })}>{p}</button>)}</div>}
          </Field>
          {!d && <>
            <AmountField id="mn-debt-amt" value={amount} onChange={setAmount} />
            <Field label={f.direction === 'lent' ? t('Paid from') : t('Received in')}>
              <button class="mn-acctile wide" onClick={() => pickAccount({ title: t('Account'), allowNone: true, onPick: setAccountId })}>
                {acc ? <b><Dot tone={acc.tone} /><span>{acc.name}</span></b> : <b>{t('Not through an account')}</b>}
                <em>{acc ? t('Balance changes by this amount') : t('Only tracks the debt, balances stay the same')}</em>
              </button>
            </Field>
            <Field label={t('Date')} htmlFor="mn-debt-date"><DateInput id="mn-debt-date" value={date} onChange={(v) => v && setDate(v)} clearable={false} /></Field>
          </>}
          <Field label={<>{t('Pay back by')} <span class="muted" style={{ fontWeight: 600 }}>{t('optional')}</span></>} htmlFor="mn-debt-due"><DateInput id="mn-debt-due" value={f.dueDate} onChange={(v) => set({ dueDate: v })} /></Field>
          <Field label={<>{t('Note')} <span class="muted" style={{ fontWeight: 600 }}>{t('optional')}</span></>} htmlFor="mn-debt-note"><TextInput id="mn-debt-note" value={f.note} onInput={(v) => set({ note: v })} placeholder={t('e.g. Concert tickets')} /></Field>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>{t('Cancel')}</button><button class="btn primary" disabled={!ok} onClick={save}>{d ? t('Save') : t('Add debt')}</button></SheetFoot>
    </>
  );
}
export function openDebt(id) { openOverlay((close) => <DebtSheet id={id} close={close} />, { kind: 'sheet' }); }
function DebtSheet({ id, close }) {
  useStore();
  const d = get($.C.debt, id);
  const [mode, setMode] = useState('');
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState(last.get().debt || '');
  const [date, setDate] = useState(today());
  if (!d) return <><SheetHead title={t('Debt')} onClose={close} /><SheetBody><Empty title={t('This debt was deleted.')} /></SheetBody></>;
  const s = $.debtState(d);
  const lent = d.direction === 'lent';
  const acc = $.account(accountId);
  const startPay = () => { setMode('pay'); setAmount(s.left); };
  const record = () => {
    if (!amount) return;
    const action = mode === 'pay' ? (lent ? 'collect' : 'repay') : (lent ? 'lend' : 'borrow');
    $.saveTx({ type: 'debt', debtId: d.id, action, amount, accountId, date, time: nowTime(), note: '' });
    last.set({ debt: accountId });
    setMode('');
    const leftAfter = mode === 'pay' ? s.left - amount : s.left + amount;
    toast(mode === 'pay' ? (leftAfter <= 0 ? t('Settled. Nice.') : t('Payment saved. {amount} left.', { amount: rp(leftAfter, { show: true }) })) : t('Added to the debt'));
  };
  const del = async () => {
    if (!(await confirmDialog({ title: t('Delete this debt?'), body: t('Its payments are deleted too and balances update.'), confirmLabel: t('Delete'), danger: true }))) return;
    s.entries.forEach((x) => $.deleteTx(x.id)); remove($.C.debt, d.id); toast(t('Debt deleted')); close();
  };
  const actionLabel = (x) => ({ lend: t('You lent'), borrow: t('You borrowed'), repay: t('You paid back'), collect: t('Paid back to you') }[x.action] || '');
  return (
    <>
      <SheetHead title={d.person} sub={lent ? t('Owes you') : t('You owe')} onClose={close} right={<button class="icon-btn ghost" aria-label={t('Edit debt')} onClick={() => openDebtEdit(d.id)}><Icon name="edit" /></button>} />
      <SheetBody>
        <div class="form">
          <div><div class="stat-label">{s.left > 0 ? t('Left to pay back') : t('Settled')}</div><div class={'mn-balance sm' + (lent && s.left > 0 ? ' mn-pos' : '')}>{rp(s.left > 0 ? s.left : s.principal)}</div>
            {s.principal > 0 && <div class={'mn-bar' + (s.left <= 0 ? ' done' : '')} style={{ marginTop: 10 }}><i style={{ width: Math.min(100, (s.settled / s.principal) * 100) + '%' }} /></div>}
            <div class="mn-note">{t('{paid} of {total} paid back', { paid: rp(s.settled), total: rp(s.principal) })}{d.dueDate ? ' · ' + t('due {date}', { date: fmtShort(d.dueDate) }) : ''}{d.note ? ' · ' + d.note : ''}</div></div>
          {mode ? (
            <div class="mn-edit">
              <div class="row-title">{mode === 'pay' ? (lent ? t('{name} paid you back', { name: d.person }) : t('You paid {name} back', { name: d.person })) : (lent ? t('Lend more') : t('Borrow more'))}</div>
              <AmountField id="mn-debt-pay" value={amount} onChange={setAmount} autoFocus />
              <button class="mn-acctile wide" onClick={() => pickAccount({ title: t('Account'), allowNone: true, onPick: setAccountId })}>
                {acc ? <b><Dot tone={acc.tone} /><span>{acc.name}</span></b> : <b>{t('Not through an account')}</b>}
                <em>{acc ? ((mode === 'pay') === lent ? t('Money goes into this account') : t('Money comes out of this account')) : t('Only tracks the debt, balances stay the same')}</em>
              </button>
              <Field label={t('Date')} htmlFor="mn-debt-pdate"><DateInput id="mn-debt-pdate" value={date} onChange={(v) => v && setDate(v)} clearable={false} /></Field>
              <div class="row gap-8" style={{ justifyContent: 'flex-end' }}><button class="btn sm ghost" onClick={() => setMode('')}>{t('Cancel')}</button><button class="btn sm primary" disabled={!amount} onClick={record}>{t('Save')}</button></div>
            </div>
          ) : (
            <div class="row gap-8 wrap">
              {s.left > 0 && <button class="btn primary" onClick={startPay}>{lent ? t('Record payment received') : t('Record payment made')}</button>}
              <button class="btn" onClick={() => { setMode('more'); setAmount(0); }}><Icon name="plus" size={15} />{lent ? t('Lend more') : t('Borrow more')}</button>
            </div>
          )}
          <div class="section-title" style={{ fontSize: 15, marginTop: 4 }}>{t('History')}</div>
          <div class="list">{[...s.entries].reverse().map((x) => { const a = $.account(x.accountId); const into = x.action === 'borrow' || x.action === 'collect'; return (
            <div class="list-row">
              <div class="row-main"><div class="row-title">{actionLabel(x)}</div><div class="row-meta">{fmtDay(x.date)} · {a ? a.name : t('Not through an account')}</div></div>
              <b class={'tnum mn-amt' + (into ? ' mn-pos' : '')}>{(into ? '+' : '−') + rp(x.amount)}</b>
              <button class="icon-btn ghost sm" aria-label={t('Delete entry')} onClick={async () => { if (await confirmDialog({ title: t('Delete this entry?'), confirmLabel: t('Delete'), danger: true })) $.deleteTx(x.id); }}><Icon name="trash" size={15} /></button>
            </div>
          ); })}</div>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn danger-soft" onClick={del}><Icon name="trash" size={16} />{t('Delete debt')}</button></SheetFoot>
    </>
  );
}

// =====================================================================
// CUSTOMIZE OVERVIEW
// =====================================================================
export function openCustomize() { openOverlay((close) => <CustomizeSheet close={close} />, { kind: 'sheet' }); }
function CustomizeSheet({ close }) {
  useStore();
  const list = widgetList();
  const meta = Object.fromEntries(WIDGETS().map((w) => [w.id, w]));
  const save = (widgets) => $.setMoneySettings({ widgets });
  const toggle = (i) => save(list.map((w, j) => (j === i ? { ...w, on: !w.on } : w)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  const al = $.allowance();
  const bal = $.balances();
  return (
    <>
      <SheetHead title={t('Customize overview')} sub={t('Total balance always stays on top')} onClose={close} />
      <SheetBody>
        <div class="list">{list.map((w, i) => (
          <div class="list-row" key={w.id}>
            <button class="row-main mn-plain" style={{ textAlign: 'left' }} onClick={() => toggle(i)}><div class="row-title" style={w.on ? null : { color: 'var(--muted)' }}>{meta[w.id].label}</div><div class="row-meta">{meta[w.id].sub}</div></button>
            <button class="icon-btn ghost sm" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronDown" size={17} style={{ transform: 'rotate(180deg)' }} /></button>
            <button class="icon-btn ghost sm" aria-label={t('Move down')} disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" size={17} /></button>
            <button class={'toggle ' + (w.on ? 'on' : '')} role="switch" aria-checked={w.on} aria-label={meta[w.id].label} onClick={() => toggle(i)} />
          </div>
        ))}</div>
        {list.find((w) => w.id === 'allowance' && w.on) && (
          <Field label={t('Daily allowance comes from')}>
            <div class="chips scroll mn-accchips">{$.accounts().filter((a) => a.type !== 'credit').map((a) => (
              <button class={'mn-accchip' + (al && al.acc.id === a.id ? ' on' : '')} onClick={() => $.setMoneySettings({ allowanceAcc: a.id })}><Dot tone={a.tone} /><span><b>{a.name}</b><small>{rp(bal[a.id] || 0)}</small></span></button>
            ))}</div>
          </Field>
        )}
      </SheetBody>
    </>
  );
}

// =====================================================================
// SETTINGS SECTION (Settings → Money)
// =====================================================================
export function MoneySettingsSection() {
  useStore();
  const c = $.moneyCounts();
  const exportCsv = async () => {
    const r = await saveFile(`vandenizar-money-${today()}.csv`, '﻿' + $.toCsv(), 'text/csv');
    const [msg, tone] = saveMessage(r, t('CSV saved'));
    toast(msg, { tone });
  };
  const reset = async () => {
    if (!(await confirmDialog({ title: t('Reset all money data?'), body: t('This deletes {accounts}, {tx}, {bills} and {debts}, plus your categories and budgets, on every device. You can’t undo this, so export a CSV first if you want a copy.', { accounts: tn(c.accounts, '{n} account', '{n} accounts'), tx: tn(c.tx, '{n} transaction', '{n} transactions'), bills: tn(c.bills, '{n} bill', '{n} bills'), debts: tn(c.debts, '{n} debt', '{n} debts') }), confirmLabel: t('Delete everything'), danger: true }))) return;
    $.resetMoney(); toast(t('Money data deleted')); navigate('/money');
  };
  const SetRow = ({ icon, tone, title, sub, onClick, end }) => (
    <button class="set-nav-item mn-setrow" onClick={onClick}><span class={'set-ico ' + tone}><Icon name={icon} size={18} /></span><span class="grow"><span class="set-nav-label">{title}</span><span class="set-nav-sub">{sub}</span></span>{end || <Icon name="chevronRight" size={16} class="set-chev" />}</button>
  );
  return (
    <>
      <div class="set-nav">
        <SetRow icon="layout" tone="t-blue" title={t('Customize overview')} sub={t('Choose and order what shows on Overview')} onClick={openCustomize} />
        <SetRow icon="tag" tone="t-orange" title={t('Categories & sub-categories')} sub={t('Names, icons, sub-categories and budgets')} onClick={() => openCategories('expense')} />
        <SetRow icon="repeat" tone="t-violet" title={t('Bills & subscriptions')} sub={c.bills ? tn(c.bills, '{n} bill each month', '{n} bills each month') : t('Installments, rent, streaming')} onClick={openBills} />
        <SetRow icon="eyeOff" tone="t-grey" title={t('Hide amounts')} sub={t('For opening the app around other people')} onClick={() => setMoneyHidden(!HIDE)} end={<span class={'toggle ' + (HIDE ? 'on' : '')} role="switch" aria-checked={HIDE} />} />
        <SetRow icon="download" tone="t-green" title={t('Export CSV')} sub={t('All transactions, opens in Google Sheets')} onClick={exportCsv} end={<span />} />
      </div>
      <div class="field-hint" style={{ padding: '0 4px' }}>{t('Amounts are in rupiah. Months run from the 1st to the last day, times in WIB.')}</div>
      <div class="card set-card">
        <div class="set-card-head"><div class="card-title" style={{ color: 'var(--bad)' }}>{t('Reset money data')}</div><div class="set-card-hint">{t('Deletes accounts, transactions, bills, debts and categories, on every device.')}</div></div>
        <div><button class="btn sm danger-soft" disabled={!c.accounts && !c.tx} onClick={reset}><Icon name="restore" size={15} />{t('Reset money data')}</button></div>
      </div>
    </>
  );
}
export function MoneySettingsPage() {
  useStore();
  const base = 'https://claude.ai/artifact/' + (window.__MZ_ID__ || '…');
  const links = [['expense', t('Add expense')], ['income', t('Add income')], ['transfer', t('Transfer between accounts')]];
  return (
    <Shell active="settings" title={t('Settings')}>
      <MoneySettingsSection />
      <div class="card set-card">
        <div class="set-card-head"><div class="card-title">{t('Language')}</div></div>
        <Segmented class="full" options={LANGS.map((l) => ({ id: l.id, label: l.label }))} value={lang()} onChange={(v) => { M.setSettings({ language: v }); try { localStorage.setItem('vz:lang', v); } catch {} notifyAll(); }} />
      </div>
      <div class="card set-card">
        <div class="set-card-head"><div class="card-title">{t('Where your data lives')}</div>
          <div class="set-card-hint">{store.mode === 'cloud' ? t('Saved in this app’s own storage and synced to every device where you open it. A copy stays in this browser so it opens fast.') : store.mode === 'local' ? t('Saved in this browser only right now. Open the app from claude.ai while signed in to sync it.') : t('Connecting…')}</div></div>
        {store.error && <div class="field-hint" style={{ color: 'var(--bad)' }}>{t('Some changes could not be saved ({code}). Reload the page and try again.', { code: store.error })}</div>}
      </div>
      <div class="card set-card">
        <div class="set-card-head"><div class="card-title">{t('Quick links')}</div><div class="set-card-hint">{t('Open this app straight into a form. Add one to your iPhone Home Screen or a Shortcut.')}</div></div>
        <div class="list">{links.map(([h, label]) => (
          <div class="list-row"><div class="row-main"><div class="row-title">{label}</div><div class="row-meta sc-url">{base + '#' + h}</div></div>
            <button class="btn xs soft" onClick={() => copyText(base + '#' + h, t('Link copied'))}><Icon name="copy" size={14} />{t('Copy')}</button></div>
        ))}</div>
      </div>
    </Shell>
  );
}
export const moneySettingsSummary = () => { const c = $.moneyCounts(); return c.accounts ? tn(c.accounts, '{n} account', '{n} accounts') + ' · ' + tn(c.tx, '{n} transaction', '{n} transactions') : t('Not set up yet'); };
