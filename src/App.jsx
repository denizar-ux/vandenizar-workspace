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
import { ContentOverview, ContentBoard, ContentEditor, ContentCalendar, ResourcesPage, createContentAndOpen } from './pages/content.jsx';
import { FreelanceOverview, PipelinePage, ProjectsPage, ProjectDetail, ClientsPage, ClientDetail, InvoicesPage, InvoiceEditor, FinancePage, TemplatesPage, openProjectSheet, openClientSheet, createInvoiceAndOpen } from './pages/freelance.jsx';
import { SettingsPage, TrashPage, useReminders, useTheme, useSync, syncLabel } from './pages/settings.jsx';
import { htmlToText } from './ui/kit.jsx';

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

  let page, section = 'today', sub = '';
  if (!p0) { page = <TodayPage />; sub = 'today'; }
  else if (p0 === 'tasks') { page = <TasksPage query={r.query} />; sub = 'tasks'; }
  else if (p0 === 'goals') { page = <GoalsPage />; sub = 'goals'; }
  else if (p0 === 'review') { page = <ReviewPage mode={p1 === 'weekly' ? 'weekly' : 'daily'} date={r.query.d} />; sub = 'review'; }
  else if (p0 === 'content') {
    section = 'content';
    if (!p1) { page = <ContentOverview />; sub = 'overview'; }
    else if (p1 === 'board') { page = <ContentBoard query={r.query} />; sub = 'board'; }
    else if (p1 === 'calendar') { page = <ContentCalendar query={r.query} />; sub = 'calendar'; }
    else if (p1 === 'resources') { page = <ResourcesPage />; sub = 'resources'; }
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
  } else if (p0 === 'settings') { section = 'settings'; page = <SettingsPage />; }
  else if (p0 === 'trash') { section = 'settings'; page = <TrashPage />; }
  if (!page) page = <NotFound />;

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
      {!desktop && <BottomNav section={section} sub={sub} />}
      <Overlays />
      <Toasts />
    </div>
  );
}

function NotFound() {
  return <div class="page"><div class="card"><div class="empty"><div class="empty-title">This page moved or no longer exists</div><a class="btn primary" href="#/">Go to Today</a></div></div></div>;
}

function SaveBanner() {
  if (persist.status !== 'error') return null;
  return (
    <div class="page" style={{ marginBottom: 14 }}>
      <div class="banner"><Icon name="alert" size={18} /><div class="grow"><b>Changes are not saved yet.</b> {persist.error} {persist.mode !== 'memory' && 'Your edits are kept in this tab. Try again, or export a backup from Settings.'}</div>
        {persist.mode !== 'memory' && <button class="btn sm" onClick={async () => { const ok = await flush(); toast(ok ? 'Saved' : 'Still failing. Export a backup from Settings.', { tone: ok ? '' : 'warn' }); }}>Retry</button>}</div>
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
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700 }}>Focusing · <span class="timer">{fmtDuration(Date.now() - t.focusStartedAt)}</span></div>
          <div class="ellipsis" style={{ fontWeight: 800 }}>{t.title}</div>
        </div>
        <button class="btn sm" onClick={() => { M.stopFocus(); toast('Focus paused'); }}>Pause</button>
        <button class="btn sm accent" onClick={() => { M.completeTask(t.id); toast('Nice. Task done.'); }}><Icon name="check" size={16} />Done</button>
      </div>
    </div>
  );
}

const SIDE = [
  { group: 'Daily', items: [{ id: 'today', label: 'Today', icon: 'home', path: '/' }, { id: 'tasks', label: 'Tasks', icon: 'tasks', path: '/tasks' }, { id: 'goals', label: 'Goals', icon: 'target', path: '/goals' }, { id: 'review', label: 'Review', icon: 'review', path: '/review' }] },
  { group: 'Content OS', key: 'content', items: [{ id: 'overview', label: 'Overview', icon: 'spark', path: '/content' }, { id: 'board', label: 'Content board', icon: 'kanban', path: '/content/board' }, { id: 'calendar', label: 'Calendar', icon: 'calendar', path: '/content/calendar' }, { id: 'resources', label: 'Resources', icon: 'link', path: '/content/resources' }] },
  { group: 'Freelance OS', key: 'freelance', items: [{ id: 'overview', label: 'Overview', icon: 'briefcase', path: '/freelance' }, { id: 'pipeline', label: 'Pipeline', icon: 'kanban', path: '/freelance/pipeline' }, { id: 'projects', label: 'Projects', icon: 'video', path: '/freelance/projects' }, { id: 'clients', label: 'Clients', icon: 'users', path: '/freelance/clients' }, { id: 'invoices', label: 'Invoices', icon: 'file', path: '/freelance/invoices' }, { id: 'finance', label: 'Finance', icon: 'wallet', path: '/freelance/finance' }, { id: 'templates', label: 'Templates', icon: 'template', path: '/freelance/templates' }] },
];

function Sidebar({ section, sub }) {
  const s = M.settings();
  const overdue = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < today()).length;
  const overdueInv = M.liveInvoices().filter((i) => !i.archived && M.calcInvoice(i).status === 'overdue').length;
  const isOn = (g, it) => (g.key ? section === g.key : section === 'today') && sub === it.id;
  return (
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><div class="brand-mark"><Icon name="calCheck" size={20} stroke={2.2} /></div><div><div class="brand-name">Vandenizar</div><div class="brand-sub">Creator workspace</div></div></div>
      <div class="row gap-6 side-new">
        <button class="btn primary grow" onClick={openQuickAdd}><Icon name="plus" size={18} />New</button>
        <button class="icon-btn soft" onClick={openSearch} aria-label="Search" title="Search (⌘K)"><Icon name="search" size={18} /></button>
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
        <a href="#/trash" class={'side-link ' + (section === 'settings' && location.hash.includes('trash') ? 'on' : '')}><Icon name="trash" size={18} />Trash</a>
        <a href="#/settings" class={'side-link ' + (section === 'settings' && !location.hash.includes('trash') ? 'on' : '')}><Icon name="settings" size={18} />Settings</a>
        <SaveState />
        <div class="save-state" style={{ paddingTop: 0 }}>{s.name} · <span class="kbd">⌘K</span> search · <span class="kbd">N</span> new</div>
      </div>
    </aside>
  );
}
function SaveState() {
  const s = useSync();
  if (s.user) return <a href="#/settings" class={'save-state ' + (s.status === 'error' ? 'error' : s.status === 'syncing' ? 'saving' : '')} style={{ textDecoration: 'none' }}><span class="save-dot" />{syncLabel(s)}</a>;
  const label = persist.status === 'error' ? 'Not saved' : persist.status === 'saving' ? 'Saving…' : persist.mode === 'idb' ? 'Saved on this device' : persist.mode === 'local' ? 'Saved (basic storage)' : 'Not saving';
  return <div class={'save-state ' + persist.status}><span class="save-dot" />{label}</div>;
}

function BottomNav({ section, sub }) {
  const tabs = [
    { id: 'today', label: 'Home', icon: 'home', path: '/', on: section === 'today' },
    { id: 'search', label: 'Search', icon: 'search', action: openSearch, on: false },
    { id: 'content', label: 'Content', icon: 'video', path: '/content', on: section === 'content' },
    { id: 'freelance', label: 'Freelance', icon: 'briefcase', path: '/freelance', on: section === 'freelance' },
  ];
  return (
    <nav class="bottom" aria-label="Main navigation">
      <div class="tabbar">
        {tabs.map((t) => (
          <button class={'tab ' + (t.on ? 'on' : '')} aria-label={t.label} aria-current={t.on ? 'page' : undefined} onClick={() => (t.action ? t.action() : navigate(t.path))}>
            <Icon name={t.icon} size={21} /><span>{t.label}</span>
          </button>
        ))}
      </div>
      <button class="fab" onClick={openQuickAdd} aria-label="Create new"><Icon name="plus" size={24} /></button>
    </nav>
  );
}

// ---------- quick add ----------
export function openQuickAdd() {
  openOverlay((close) => <QuickAdd close={close} />, { kind: 'sheet' });
}
function QuickAdd({ close }) {
  const actions = [
    { label: 'Task', sub: 'To do, today or later', icon: 'tasks', tone: 't-blue', run: () => { close(); openTaskSheet(null, { dueDate: today() }); } },
    { label: 'Content', sub: 'New idea in Content OS', icon: 'video', tone: 't-violet', run: () => { close(); createContentAndOpen({}); } },
    { label: 'Project', sub: 'Freelance job or lead', icon: 'briefcase', tone: 't-orange', run: () => { close(); openProjectSheet(); } },
    { label: 'Client', sub: 'Brand or contact', icon: 'users', tone: 't-pink', run: () => { close(); openClientSheet(); } },
    { label: 'Invoice', sub: 'Bill a client', icon: 'file', tone: 't-green', run: () => { close(); createInvoiceAndOpen({}); } },
    { label: 'Goal', sub: 'Weekly or monthly', icon: 'target', tone: 't-yellow', run: () => { close(); navigate('/goals?new=1'); } },
  ];
  return (
    <>
      <SheetHead title="Create" onClose={close} />
      <SheetBody>
        <div class="qa-grid">
          {actions.map((a) => (
            <button class="qa" onClick={a.run}><span class={'mini-ic ' + a.tone}><Icon name={a.icon} size={19} /></span><span>{a.label}<small>{a.sub}</small></span></button>
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
    if (tasks.length) groups.push({ label: 'Tasks', rows: tasks.map((t) => ({ key: t.id, icon: 'tasks', title: t.title, meta: [t.dueDate ? relDay(t.dueDate) : 'Inbox', t.category, M.TASK_STATUSES.find((s) => s.id === t.status)?.label].filter(Boolean).join(' · '), run: () => { close(); openTaskSheet(t.id); } })) });
    if (content.length) groups.push({ label: 'Content', rows: content.map((c) => ({ key: c.id, icon: 'video', title: c.title, meta: [c.pillar, (c.platforms || []).join(', ')].filter(Boolean).join(' · '), badge: <ContentBadge status={c.status} sm />, run: () => go('/content/item/' + c.id) })) });
    if (projects.length) groups.push({ label: 'Projects', rows: projects.map((p) => ({ key: p.id, icon: 'briefcase', title: p.name, meta: M.clientName(p.clientId) + (p.archived ? ' · Archived' : ''), badge: <StageBadge stage={p.stage} sm />, run: () => go('/freelance/projects/' + p.id) })) });
    if (clients.length) groups.push({ label: 'Clients', rows: clients.map((c) => ({ key: c.id, icon: 'users', title: c.name, meta: [c.pic, c.archived ? 'Archived' : ''].filter(Boolean).join(' · '), run: () => go('/freelance/clients/' + c.id) })) });
    if (invoices.length) groups.push({ label: 'Invoices', rows: invoices.map((i) => { const c = M.calcInvoice(i); return { key: i.id, icon: 'file', title: i.number, meta: `${M.clientName(i.clientId)} · ${fmtMoney(c.total, i.currency)}`, badge: <InvoiceBadge status={c.status} sm />, run: () => go('/freelance/invoices/' + i.id) }; }) });
  }
  const recent = (M.meta('recent', { items: [] }).items || []).map(recentRow).filter(Boolean).slice(0, 6);
  return (
    <>
      <SheetHead title="Search" onClose={close} />
      <SheetBody>
        <div class="search-box">
          <Icon name="search" size={18} class="muted" />
          <input id="global-search" value={q} placeholder="Tasks, content, projects, clients, invoices" onInput={(e) => setQ(e.currentTarget.value)} autoFocus ref={(el) => el && setTimeout(() => el.focus(), 50)}
            onKeyDown={(e) => { if (e.key === 'Enter' && groups[0]) groups[0].rows[0].run(); }} />
          {q && <button class="icon-btn ghost sm" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
        {term && !groups.length && <div class="empty"><div class="empty-title">Nothing matches “{q}”</div><div class="empty-text">Try a client name, an invoice number or a word from a script.</div></div>}
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
            <div class="result-label">Recently opened</div>
            {recent.length ? recent.map((r) => (
              <button class="list-row clickable" onClick={() => go(r.path)}><span class={'icon-btn sm ' + r.tone}><Icon name={r.icon} size={16} /></span><div class="row-main"><div class="row-title">{r.title}</div><div class="row-meta">{r.kind}</div></div></button>
            )) : <div class="muted" style={{ padding: '8px 4px', fontSize: 13.5 }}>Things you open show up here.</div>}
          </div>
        )}
      </SheetBody>
    </>
  );
}
export function recentRow(x) {
  if (x.type === 'content') { const c = get('contents', x.id); return c && !c.deletedAt && { title: c.title, kind: 'Content', icon: 'video', tone: 't-violet', path: '/content/item/' + c.id }; }
  if (x.type === 'project') { const p = get('projects', x.id); return p && !p.deletedAt && { title: p.name, kind: 'Project · ' + M.clientName(p.clientId), icon: 'briefcase', tone: 't-orange', path: '/freelance/projects/' + p.id }; }
  if (x.type === 'client') { const c = get('clients', x.id); return c && !c.deletedAt && { title: c.name, kind: 'Client', icon: 'users', tone: 't-pink', path: '/freelance/clients/' + c.id }; }
  if (x.type === 'invoice') { const i = get('invoices', x.id); return i && !i.deletedAt && { title: i.number, kind: 'Invoice · ' + M.clientName(i.clientId), icon: 'file', tone: 't-green', path: '/freelance/invoices/' + i.id }; }
  return null;
}
