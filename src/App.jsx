import { useEffect, useState } from 'preact/hooks';
import { Icon } from './ui/Icon.jsx';
import { Overlays, Toasts, openOverlay, SheetHead, SheetBody, useMedia, DESKTOP_Q, toast, closeAll } from './ui/overlay.jsx';
import { useRoute, navigate } from './lib/router.js';
import { useStore, persist, flush, get, all } from './lib/db.js';
import * as M from './lib/model.js';
import { fmtDuration, today, relDay } from './lib/date.js';
import { fmtMoney } from './lib/money.js';
import { openTaskSheet, catTone, Dot, ContentBadge, InvoiceBadge, StageBadge } from './ui/parts.jsx';
import { TodayPage, TasksPage, GoalsPage, ReviewPage } from './pages/daily.jsx';
import { HabitsPage } from './pages/habits.jsx';
import { ContentOverview, ContentBoard, ContentEditor, ContentCalendar, ResourcesPage, createContentAndOpen } from './pages/content.jsx';
import { FreelanceOverview, PipelinePage, ProjectsPage, ProjectDetail, ClientsPage, ClientDetail, InvoicesPage, InvoiceEditor, FinancePage, TemplatesPage, openProjectSheet, openClientSheet, createInvoiceAndOpen } from './pages/freelance.jsx';
import { useUpdateAvailable, applyUpdate } from './lib/update.js';
import { ThreadsPage } from './pages/threads.jsx';
import { CalendarPage } from './pages/calendar.jsx';
import { SettingsPage, TrashPage, useReminders, useTheme, useSync, syncLabel } from './pages/settings.jsx';
import { htmlToText } from './ui/kit.jsx';
import { MoneyOverview, MoneyHistory, MoneyBudget, MoneyAccounts, MoneyDebts, MoneyInsights, openTx, rp as moneyRp } from './pages/money.jsx';
import * as $ from './lib/money-data.js';
import { t } from './lib/i18n.js';
import { t as _t, tn as _tn } from './lib/i18n.js';

export function App() {
  useStore();
  useTheme();
  useReminders();
  const r = useRoute();
  const desktop = useMedia(DESKTOP_Q);
  const [p0, p1, p2] = r.parts;

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '/') { e.preventDefault(); openSearch(); }
        else if (e.key === 'n') { e.preventDefault(); openQuickAdd(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { closeAll(); }, [r.path]);
  // Deep links for iPhone Shortcuts: #/money?add=expense, #/?add=task and so on
  useEffect(() => {
    const add = r.query.add;
    if (!add) return;
    const q = { ...r.query }; delete q.add;
    const rest = new URLSearchParams(q).toString();
    navigate(r.path + (rest ? '?' + rest : ''), { replace: true });
    setTimeout(() => {
      if (add === 'task') openTaskSheet(null, { dueDate: today() });
      else if (['expense', 'income', 'transfer'].includes(add)) openTx({ type: add });
      else if (add === 'search') openSearch();
    }, 120);
  }, [r.full]);

  let page, section = 'today', sub = '';
  if (!p0) { page = <TodayPage />; sub = 'today'; }
  else if (p0 === 'tasks') { page = <TasksPage query={r.query} />; sub = 'tasks'; }
  else if (p0 === 'calendar') { page = <CalendarPage query={r.query} />; sub = 'calendar'; }
  else if (p0 === 'habits') { page = <HabitsPage query={r.query} />; sub = 'habits'; }
  else if (p0 === 'goals') { page = <GoalsPage />; sub = 'goals'; }
  else if (p0 === 'review') { page = <ReviewPage mode={p1 === 'weekly' || p1 === 'monthly' ? p1 : 'daily'} date={r.query.d} />; sub = 'review'; }
  else if (p0 === 'content') {
    section = 'content';
    if (!p1) { page = <ContentOverview />; sub = 'overview'; }
    else if (p1 === 'board') { page = <ContentBoard query={r.query} />; sub = 'board'; }
    else if (p1 === 'calendar') { page = <ContentCalendar query={r.query} />; sub = 'calendar'; }
    else if (p1 === 'resources') { page = <ResourcesPage />; sub = 'resources'; }
    else if (p1 === 'threads') { page = <ThreadsPage query={r.query} />; sub = 'threads'; }
    else if (p1 === 'item') { page = <ContentEditor id={p2} key={p2} />; sub = 'board'; }
  } else if (p0 === 'freelance') {
    section = 'freelance';
    if (!p1) { page = <FreelanceOverview />; sub = 'overview'; }
    else if (p1 === 'pipeline') { page = <PipelinePage />; sub = 'pipeline'; }
    else if (p1 === 'projects') { page = p2 ? <ProjectDetail id={p2} key={p2} /> : <ProjectsPage query={r.query} />; sub = 'projects'; }
    else if (p1 === 'clients') { page = p2 ? <ClientDetail id={p2} key={p2} /> : <ClientsPage />; sub = 'clients'; }
    else if (p1 === 'invoices') { page = p2 ? <InvoiceEditor id={p2} key={p2} /> : <InvoicesPage query={r.query} />; sub = 'invoices'; }
    else if (p1 === 'finance') { page = <FinancePage />; sub = 'finance'; }
    else if (p1 === 'templates') { page = <TemplatesPage />; sub = 'templates'; }
  } else if (p0 === 'money') {
    section = 'money';
    if (!p1) { page = <MoneyOverview />; sub = 'overview'; }
    else if (p1 === 'history') { page = <MoneyHistory query={r.query} />; sub = 'history'; }
    else if (p1 === 'budget') { page = <MoneyBudget query={r.query} />; sub = 'budget'; }
    else if (p1 === 'accounts') { page = <MoneyAccounts />; sub = 'accounts'; }
    else if (p1 === 'debts') { page = <MoneyDebts />; sub = 'debts'; }
    else if (p1 === 'insights') { page = <MoneyInsights query={r.query} />; sub = 'insights'; }
  } else if (p0 === 'settings') { section = 'settings'; page = <SettingsPage section={p1} />; }
  else if (p0 === 'trash') { section = 'settings'; page = <TrashPage />; }
  if (!page) page = <NotFound />;
  // No floating + inside editors and settings, where it would sit on top of the form
  const hideFab = (p0 === 'content' && p1 === 'item') || (p0 === 'freelance' && p2) || p0 === 'settings' || p0 === 'trash';

  return (
    <div class="app">
      <div class="glow" aria-hidden="true" />
      {desktop && <Sidebar section={section} sub={sub} />}
      <main class="main" id="main">
        <div class="page-shell">
          <SaveBanner />
          <FocusBar />
          {page}
        </div>
      </main>
      {!desktop && <BottomNav section={section} />}
      {!desktop && !hideFab && <Fab path={r.path} />}
      <Overlays />
      <UpdateBanner />
      <Toasts />
    </div>
  );
}

function NotFound() {
  return <div class="page"><div class="card"><div class="empty"><div class="empty-title">{_t('This page moved or no longer exists')}</div><a class="btn primary" href="#/">{_t('Go to Today')}</a></div></div></div>;
}

function SaveBanner() {
  if (persist.status !== 'error') return null;
  return (
    <div class="page" style={{ marginBottom: 14 }}>
      <div class="banner"><Icon name="alert" size={18} /><div class="grow"><b>{_t('Changes are not saved yet.')}</b> {persist.error} {persist.mode !== 'memory' && _t('Your edits are kept in this tab. Try again, or export a backup from Settings.')}</div>
        {persist.mode !== 'memory' && <button class="btn sm" onClick={async () => { const ok = await flush(); toast(ok ? _t('Saved') : _t('Still failing. Export a backup from Settings.'), { tone: ok ? '' : 'warn' }); }}>{_t('Retry')}</button>}</div>
    </div>
  );
}

function FocusBar() {
  const f = M.meta('focus', {});
  const t = f.taskId && get('tasks', f.taskId);
  const [, tick] = useState(0);
  useEffect(() => { if (!t) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [t && t.id]);
  if (!t || !t.focusStartedAt) return null;
  return (
    <div class="page" style={{ marginBottom: 14, position: 'sticky', top: 'calc(var(--sat) + 8px)', zIndex: 30 }}>
      <div class="focusbar" role="status">
        <span class="pulse" />
        <div class="grow" style={{ minWidth: 0 }} onClick={() => openTaskSheet(t.id)}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700 }}>{_t('Focusing ·')}{' '}<span class="timer">{fmtDuration(Date.now() - t.focusStartedAt)}</span></div>
          <div class="ellipsis" style={{ fontWeight: 800 }}>{t.title}</div>
        </div>
        <button class="btn sm" onClick={() => { M.stopFocus(); toast(_t('Focus paused')); }}>{_t('Pause')}</button>
        <button class="btn sm accent" onClick={() => { M.completeTask(t.id); toast(_t('Nice. Task done.')); }}><Icon name="check" size={16} />{_t('Done')}</button>
      </div>
    </div>
  );
}

const SIDE = [
  { get group() { return _t('Daily'); }, items: [{ id: 'today', get label() { return _t('Today'); }, icon: 'home', path: '/' }, { id: 'tasks', get label() { return _t('Tasks'); }, icon: 'tasks', path: '/tasks' }, { id: 'calendar', get label() { return _t('Calendar'); }, icon: 'calendar', path: '/calendar' }, { id: 'habits', get label() { return _t('Habits'); }, icon: 'habit', path: '/habits' }, { id: 'goals', get label() { return _t('Goals'); }, icon: 'target', path: '/goals' }, { id: 'review', get label() { return _t('Review'); }, icon: 'review', path: '/review' }] },
  { get group() { return _t('Content OS'); }, key: 'content', items: [{ id: 'overview', get label() { return _t('Overview'); }, icon: 'spark', path: '/content' }, { id: 'board', get label() { return _t('Content board'); }, icon: 'kanban', path: '/content/board' }, { id: 'calendar', get label() { return _t('Calendar'); }, icon: 'calendar', path: '/content/calendar' }, { id: 'threads', get label() { return _t('Threads'); }, icon: 'at', path: '/content/threads' }, { id: 'resources', get label() { return _t('Resources'); }, icon: 'link', path: '/content/resources' }] },
  { get group() { return _t('Money'); }, key: 'money', items: [{ id: 'overview', get label() { return _t('Overview'); }, icon: 'wallet', path: '/money' }, { id: 'history', get label() { return _t('History'); }, icon: 'calendar', path: '/money/history' }, { id: 'budget', get label() { return _t('Budget'); }, icon: 'target', path: '/money/budget' }, { id: 'accounts', get label() { return _t('Accounts'); }, icon: 'card', path: '/money/accounts' }, { id: 'debts', get label() { return _t('Debts'); }, icon: 'handshake', path: '/money/debts' }, { id: 'insights', get label() { return _t('Insights'); }, icon: 'pie', path: '/money/insights' }] },
  { get group() { return _t('Freelance OS'); }, key: 'freelance', items: [{ id: 'overview', get label() { return _t('Overview'); }, icon: 'briefcase', path: '/freelance' }, { id: 'pipeline', get label() { return _t('Pipeline'); }, icon: 'kanban', path: '/freelance/pipeline' }, { id: 'projects', get label() { return _t('Projects'); }, icon: 'video', path: '/freelance/projects' }, { id: 'clients', get label() { return _t('Clients'); }, icon: 'users', path: '/freelance/clients' }, { id: 'invoices', get label() { return _t('Invoices'); }, icon: 'file', path: '/freelance/invoices' }, { id: 'finance', get label() { return _t('Finance'); }, icon: 'wallet', path: '/freelance/finance' }, { id: 'templates', get label() { return _t('Templates'); }, icon: 'template', path: '/freelance/templates' }] },
];

function Sidebar({ section, sub }) {
  const s = M.settings();
  const overdue = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < today()).length;
  const overdueInv = M.liveInvoices().filter((i) => !i.archived && M.calcInvoice(i).status === 'overdue').length;
  const isOn = (g, it) => (g.key ? section === g.key : section === 'today') && sub === it.id;
  return (
    <aside class="sidebar" aria-label={_t('Main navigation')}>
      <div class="brand"><div class="brand-mark"><Icon name="calCheck" size={20} stroke={2.2} /></div><div><div class="brand-name">{_t('Vandenizar')}</div><div class="brand-sub">{_t('Creator workspace')}</div></div></div>
      <div class="row gap-6 side-new">
        <button class="btn primary grow" onClick={openQuickAdd}><Icon name="plus" size={18} />{_t('New')}</button>
        <button class="icon-btn soft" onClick={openSearch} aria-label={_t('Search')} title={_t('Search (⌘K)')}><Icon name="search" size={18} /></button>
      </div>
      {SIDE.map((g) => (
        <div class="side-group">
          <div class="side-label">{g.group}</div>
          {g.items.map((it) => (
            <a href={'#' + it.path} class={'side-link ' + (isOn(g, it) ? 'on' : '')} aria-current={isOn(g, it) ? 'page' : undefined}>
              <Icon name={it.icon} size={18} />{it.label}
              {it.id === 'tasks' && !g.key && overdue > 0 && <span class="badge sm t-red">{overdue}</span>}
              {it.id === 'invoices' && overdueInv > 0 && <span class="badge sm t-red">{overdueInv}</span>}
            </a>
          ))}
        </div>
      ))}
      <div class="side-foot">
        <a href="#/trash" class={'side-link ' + (section === 'settings' && location.hash.includes('trash') ? 'on' : '')}><Icon name="trash" size={18} />{_t('Trash')}</a>
        <a href="#/settings" class={'side-link ' + (section === 'settings' && !location.hash.includes('trash') ? 'on' : '')}><Icon name="settings" size={18} />{_t('Settings')}</a>
        <SaveState />
        <div class="save-state" style={{ paddingTop: 0 }}>{s.name} · <span class="kbd">{_t('⌘K')}</span>{' '}{_t('search ·')}{' '}<span class="kbd">{_t('N')}</span>{' '}{_t('new')}</div>
      </div>
    </aside>
  );
}
function SaveState() {
  const s = useSync();
  if (s.user) return <a href="#/settings/account" class={'save-state ' + (s.status === 'error' ? 'error' : s.status === 'syncing' ? 'saving' : '')} style={{ textDecoration: 'none' }}><span class="save-dot" />{syncLabel(s)}</a>;
  const label = persist.status === 'error' ? 'Not saved' : persist.status === 'saving' ? 'Saving…' : persist.mode === 'idb' ? 'Saved on this device' : persist.mode === 'local' ? 'Saved (basic storage)' : 'Not saving';
  return <div class={'save-state ' + persist.status}><span class="save-dot" />{label}</div>;
}

function UpdateBanner() {
  const v = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  return (
    <div class="update-pill" role="status">
      <Icon name="spark" size={16} /><span>{_t('New version ready')}</span>
      <button class="btn xs primary" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>{busy ? _t('Updating…') : _t('Update')}</button>
    </div>
  );
}

function BottomNav({ section }) {
  const tabs = [
    { id: 'daily', label: _t('Daily'), icon: 'calCheck', path: '/', on: section === 'today' },
    { id: 'content', label: _t('Content'), icon: 'video', path: '/content', on: section === 'content' },
    { id: 'freelance', label: _t('Freelance'), icon: 'briefcase', path: '/freelance', on: section === 'freelance' },
    { id: 'money', label: _t('Money'), icon: 'wallet', path: '/money', on: section === 'money' },
    { id: 'search', label: _t('Search'), icon: 'search', action: openSearch, on: false },
  ];
  const idx = tabs.findIndex((t) => t.on);
  return (
    <nav class="bottom" aria-label={_t('Main navigation')}>
      <div class="tabbar lg">
        {/* liquid lens: slides to the active tab, the inner drop stretches on each move */}
        <span class={'dock-lens' + (idx < 0 ? ' off' : '')} style={{ transform: `translateX(${Math.max(0, idx) * 100}%)` }} aria-hidden="true"><i key={idx} /></span>
        {tabs.map((t) => (
          <button class={'tab ' + (t.on ? 'on' : '')} aria-label={t.label} aria-current={t.on ? 'page' : undefined} onClick={() => (t.action ? t.action() : navigate(t.path))}>
            <Icon name={t.icon} size={25} stroke={t.on ? 2.1 : 1.8} /><span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---------- floating create button (phones) ----------
// A + that floats above the dock and opens the create menu.
function Fab({ path }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const isField = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]');
    const onIn = (e) => setTyping(isField(e.target));
    const onOut = () => setTimeout(() => setTyping(isField(document.activeElement)), 60);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  const run = (fn) => { setOpen(false); setTimeout(fn, 60); };
  const hidden = typing && !open;
  return (
    <>
      <div class={'fab-scrim' + (open ? ' on' : '')} onClick={() => setOpen(false)} aria-hidden="true" />
      <div class={'fab-wrap' + (open ? ' open' : '') + (hidden ? ' gone' : '')}>
        <div class="fab-menu" role="menu" aria-hidden={!open} aria-label={_t('Create')}>
          {createActions().map((a, i) => (
            <button class="fab-item" role="menuitem" style={{ '--i': i }} tabIndex={open ? 0 : -1} onClick={() => run(a.run)}>
              <span class={'mini-ic ' + a.tone}><Icon name={a.icon} size={18} /></span>
              <span class="fab-label">{a.label}<small>{a.sub}</small></span>
            </button>
          ))}
        </div>
        <button class="fab" aria-label={open ? _t('Close create menu') : _t('Create new')} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'x' : 'plus'} size={open ? 24 : 26} stroke={2.3} />
        </button>
      </div>
    </>
  );
}

// ---------- quick add ----------
export function openQuickAdd() {
  openOverlay((close) => <QuickAdd close={close} />, { kind: 'sheet' });
}
export function createActions() {
  return [
    { label: _t('Task'), sub: _t('Today or later'), icon: 'tasks', tone: 't-blue', run: () => openTaskSheet(null, { dueDate: today() }) },
    { label: _t('Expense'), sub: _t('Or income, transfer'), icon: 'wallet', tone: 't-orange', run: () => openTx({ type: 'expense' }) },
    { label: _t('Content'), sub: _t('New idea in Content OS'), icon: 'video', tone: 't-violet', run: () => createContentAndOpen({}) },
    { label: _t('Threads post'), sub: _t('Add to today'), icon: 'at', tone: 't-grey', run: () => { navigate('/content/threads'); setTimeout(() => { const el = document.querySelector('.th-composer textarea'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }, 250); } },
    { label: _t('Project'), sub: _t('Freelance job or lead'), icon: 'briefcase', tone: 't-orange', run: () => openProjectSheet() },
    { label: _t('Client'), sub: _t('Brand or contact'), icon: 'users', tone: 't-pink', run: () => openClientSheet() },
    { label: _t('Invoice'), sub: _t('Bill a client'), icon: 'file', tone: 't-green', run: () => createInvoiceAndOpen({}) },
    { label: _t('Habit'), sub: _t('Daily or weekly'), icon: 'habit', tone: 't-green', run: () => navigate('/habits?new=1') },
    { label: _t('Goal'), sub: _t('Weekly or monthly'), icon: 'target', tone: 't-yellow', run: () => navigate('/goals?new=1') },
  ];
}
function QuickAdd({ close }) {
  return (
    <>
      <SheetHead title={_t('Create')} onClose={close} />
      <SheetBody>
        <div class="qa-grid">
          {createActions().map((a) => (
            <button class="qa" onClick={() => { close(); a.run(); }}><span class={'mini-ic ' + a.tone}><Icon name={a.icon} size={19} /></span><span>{a.label}<small>{a.sub}</small></span></button>
          ))}
        </div>
      </SheetBody>
    </>
  );
}

// ---------- global search ----------
export function openSearch() {
  openOverlay((close) => <Search close={close} />, { kind: 'sheet', wide: true });
}
function Search({ close }) {
  useStore();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const has = (...xs) => xs.some((x) => (x || '').toString().toLowerCase().includes(term));
  const go = (path) => { close(); navigate(path); };
  const groups = [];
  if (term) {
    const tasks = M.liveTasks().filter((t) => has(t.title, t.notes, t.category)).slice(0, 8);
    const content = M.liveContents().filter((c) => has(c.title, c.description, c.hook, htmlToText(c.script), c.pillar, c.caption)).slice(0, 8);
    const projects = M.liveProjects().filter((p) => has(p.name, p.type, p.location, (p.tags || []).join(' '), M.clientName(p.clientId))).slice(0, 8);
    const clients = M.liveClients().filter((c) => has(c.name, c.pic, c.email, c.phone)).slice(0, 8);
    const invoices = M.liveInvoices().filter((i) => has(i.number, M.clientName(i.clientId), (i.items || []).map((x) => x.desc).join(' '))).slice(0, 8);
    if (tasks.length) groups.push({ label: _t('Tasks'), rows: tasks.map((t) => ({ key: t.id, icon: 'tasks', title: t.title, meta: [t.dueDate ? relDay(t.dueDate) : 'Inbox', t.category, M.TASK_STATUSES.find((s) => s.id === t.status)?.label].filter(Boolean).join(' · '), run: () => { close(); openTaskSheet(t.id); } })) });
    if (content.length) groups.push({ label: _t('Content'), rows: content.map((c) => ({ key: c.id, icon: 'video', title: c.title, meta: [c.pillar, (c.platforms || []).join(', ')].filter(Boolean).join(' · '), badge: <ContentBadge status={c.status} sm />, run: () => go('/content/item/' + c.id) })) });
    if (projects.length) groups.push({ label: _t('Projects'), rows: projects.map((p) => ({ key: p.id, icon: 'briefcase', title: p.name, meta: M.clientName(p.clientId) + (p.archived ? ' · Archived' : ''), badge: <StageBadge stage={p.stage} sm />, run: () => go('/freelance/projects/' + p.id) })) });
    if (clients.length) groups.push({ label: _t('Clients'), rows: clients.map((c) => ({ key: c.id, icon: 'users', title: c.name, meta: [c.pic, c.archived ? 'Archived' : ''].filter(Boolean).join(' · '), run: () => go('/freelance/clients/' + c.id) })) });
    const posts = M.liveThreads().filter((t) => has(t.text, t.pillar)).slice(0, 6);
    if (posts.length) groups.push({ label: _t('Threads'), rows: posts.map((t) => ({ key: t.id, icon: 'at', title: t.text.length > 90 ? t.text.slice(0, 90) + '…' : t.text, meta: [t.date ? relDay(t.date) + (t.time ? ' ' + t.time : '') : 'Idea', t.pillar, t.status === 'posted' ? 'Posted' : ''].filter(Boolean).join(' · '), run: () => go(t.date ? '/content/threads?d=' + t.date : '/content/threads?view=ideas') })) });
    const money = $.txSorted().filter((x) => (x.type === 'expense' || x.type === 'income' || x.type === 'transfer') && has(x.note, $.catLabel(x.catId), String(x.amount))).slice(0, 8);
    if (money.length) groups.push({ label: _t('Money'), rows: money.map((x) => ({ key: x.id, icon: 'wallet', title: x.note || $.catLabel(x.catId) || 'Transfer', meta: `${relDay(x.date)} · ${x.type === 'expense' ? '−' : x.type === 'income' ? '+' : ''}${moneyRp(x.amount)}`, run: () => { close(); openTx({ tx: x }); } })) });
    if (invoices.length) groups.push({ label: _t('Invoices'), rows: invoices.map((i) => { const c = M.calcInvoice(i); return { key: i.id, icon: 'file', title: i.number, meta: `${M.clientName(i.clientId)} · ${fmtMoney(c.total, i.currency)}`, badge: <InvoiceBadge status={c.status} sm />, run: () => go('/freelance/invoices/' + i.id) }; }) });
  }
  const recent = (M.meta('recent', { items: [] }).items || []).map(recentRow).filter(Boolean).slice(0, 6);
  return (
    <>
      <SheetHead title={_t('Search')} onClose={close} />
      <SheetBody>
        <div class="search-box">
          <Icon name="search" size={18} class="muted" />
          <input id="global-search" value={q} placeholder={_t('Tasks, content, Threads, clients, invoices')} onInput={(e) => setQ(e.currentTarget.value)} autoFocus ref={(el) => el && setTimeout(() => el.focus(), 50)}
            onKeyDown={(e) => { if (e.key === 'Enter' && groups[0]) groups[0].rows[0].run(); }} />
          {q && <button class="icon-btn ghost sm" aria-label={_t('Clear')} onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
        {term && !groups.length && <div class="empty"><div class="empty-title">{_t('Nothing matches “')}{q}”</div><div class="empty-text">{_t('Try a client name, an invoice number or a word from a script.')}</div></div>}
        {groups.map((g) => (
          <div class="result-group">
            <div class="result-label">{g.label}</div>
            {g.rows.map((r) => (
              <button class="list-row clickable" key={r.key} onClick={r.run}>
                <span class="icon-btn soft sm"><Icon name={r.icon} size={16} /></span>
                <div class="row-main"><div class="row-title">{r.title}</div>{r.meta && <div class="row-meta">{r.meta}</div>}</div>
                {r.badge}
              </button>
            ))}
          </div>
        ))}
        {!term && (
          <div class="result-group">
            <div class="result-label">{_t('Recently opened')}</div>
            {recent.length ? recent.map((r) => (
              <button class="list-row clickable" onClick={() => go(r.path)}><span class={'icon-btn sm ' + r.tone}><Icon name={r.icon} size={16} /></span><div class="row-main"><div class="row-title">{r.title}</div><div class="row-meta">{r.kind}</div></div></button>
            )) : <div class="muted" style={{ padding: '8px 4px', fontSize: 13.5 }}>{_t('Things you open show up here.')}</div>}
          </div>
        )}
      </SheetBody>
    </>
  );
}
export function recentRow(x) {
  if (x.type === 'content') { const c = get('contents', x.id); return c && !c.deletedAt && { title: c.title, kind: _t('Content'), icon: 'video', tone: 't-violet', path: '/content/item/' + c.id }; }
  if (x.type === 'project') { const p = get('projects', x.id); return p && !p.deletedAt && { title: p.name, kind: 'Project · ' + M.clientName(p.clientId), icon: 'briefcase', tone: 't-orange', path: '/freelance/projects/' + p.id }; }
  if (x.type === 'client') { const c = get('clients', x.id); return c && !c.deletedAt && { title: c.name, kind: _t('Client'), icon: 'users', tone: 't-pink', path: '/freelance/clients/' + c.id }; }
  if (x.type === 'invoice') { const i = get('invoices', x.id); return i && !i.deletedAt && { title: i.number, kind: 'Invoice · ' + M.clientName(i.clientId), icon: 'file', tone: 't-green', path: '/freelance/invoices/' + i.id }; }
  return null;
}
