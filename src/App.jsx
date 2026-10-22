import { useEffect, useState } from 'preact/hooks';
import { Icon } from './ui/Icon.jsx';
import { Overlays, Toasts, openOverlay, SheetHead, SheetBody, useMedia, DESKTOP_Q, toast, closeAll } from './ui/overlay.jsx';
import { Field, DateInput, TimeInput, NumberInput, TextArea, Segmented } from './ui/kit.jsx';
import { pickProject, InvoicePill, StagePill, whenLabel } from './ui/parts.jsx';
import { useRoute, navigate } from './lib/router.js';
import { useStore, persist, flush, get } from './lib/db.js';
import * as M from './lib/model.js';
import { fmtDuration, today, addDays, relDay } from './lib/date.js';
import { fmtMoney } from './lib/money.js';
import { useUpdateAvailable, applyUpdate } from './lib/update.js';
import { TodayPage } from './pages/today.jsx';
import { TasksPage, TaskDetail } from './pages/tasks.jsx';
import { CalendarPage } from './pages/calendar.jsx';
import { ProjectsPage, ProjectDetail, openProjectSheet } from './pages/projects.jsx';
import { ClientsPage, ClientDetail, openClientSheet } from './pages/clients.jsx';
import { InvoicesPage, InvoiceEditor, createInvoiceAndOpen } from './pages/invoices.jsx';
import { TemplatesPage } from './pages/templates.jsx';
import { SettingsPage, TrashPage, MorePage, useSync, syncLabel } from './pages/settings.jsx';

export function App() {
  useStore();
  const r = useRoute();
  const desktop = useMedia(DESKTOP_Q);
  const [p0, p1] = r.parts;

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
  // Deep links for iPhone Shortcuts: #/?add=task, #/?add=search
  useEffect(() => {
    const add = r.query.add;
    if (!add) return;
    const q = { ...r.query }; delete q.add;
    const rest = new URLSearchParams(q).toString();
    navigate(r.path + (rest ? '?' + rest : ''), { replace: true });
    setTimeout(() => { if (add === 'task') openQuickAdd(); else if (add === 'search') openSearch(); }, 120);
  }, [r.full]);

  let page, nav = 'today';
  if (!p0) page = <TodayPage />;
  else if (p0 === 'tasks') { nav = 'tasks'; page = p1 ? <TaskDetail id={p1} key={p1} /> : <TasksPage query={r.query} />; }
  else if (p0 === 'projects') { nav = 'projects'; page = p1 ? <ProjectDetail id={p1} key={p1} /> : <ProjectsPage />; }
  else if (p0 === 'calendar') { nav = 'calendar'; page = <CalendarPage query={r.query} />; }
  else if (p0 === 'clients') { nav = 'clients'; page = p1 ? <ClientDetail id={p1} key={p1} /> : <ClientsPage />; }
  else if (p0 === 'invoices') { nav = 'invoices'; page = p1 ? <InvoiceEditor id={p1} key={p1} /> : <InvoicesPage query={r.query} />; }
  else if (p0 === 'templates') { nav = 'templates'; page = <TemplatesPage />; }
  else if (p0 === 'settings') { nav = 'settings'; page = <SettingsPage section={p1} />; }
  else if (p0 === 'trash') { nav = 'trash'; page = <TrashPage />; }
  else if (p0 === 'more') { nav = 'more'; page = <MorePage />; }
  else if (p0 === 'search') { nav = 'search'; page = <SearchPage />; }
  if (!page) page = <div class="page narrow"><div class="empty"><div class="empty-title">This page moved or no longer exists.</div><a class="btn primary" href="#/">Go to Today</a></div></div>;
  const detail = (p0 === 'tasks' || p0 === 'projects' || p0 === 'invoices' || p0 === 'clients') && p1;

  return (
    <div class={'app' + (detail ? ' is-detail' : '')}>
      {desktop && <Sidebar nav={nav} />}
      <main class="main" id="main">
        <SaveBanner />
        <FocusBar />
        {page}
      </main>
      {!desktop && <Dock nav={nav} />}
      <Overlays />
      <UpdatePill />
      <Toasts />
    </div>
  );
}

function SaveBanner() {
  if (persist.status !== 'error') return null;
  return (
    <div class="page" style={{ marginBottom: 12 }}>
      <div class="status-banner t-rose"><Icon name="alert" size={18} /><div class="grow"><b>Changes are not saved yet.</b> {persist.error} {persist.mode !== 'memory' && 'Your edits are kept in this tab. Try again, or export a backup from Settings.'}</div>
        {persist.mode !== 'memory' && <button class="btn sm primary" onClick={async () => { const ok = await flush(); toast(ok ? 'Saved' : 'Still failing. Export a backup from Settings.', { tone: ok ? '' : 'warn' }); }}>Retry</button>}</div>
    </div>
  );
}

function FocusBar() {
  const t = M.focusTask();
  const [, tick] = useState(0);
  useEffect(() => { if (!t) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [t && t.id]);
  if (!t) return null;
  return (
    <div class="focusbar" role="status">
      <span class="pulse" />
      <a class="grow fb-main" href={'#/tasks/' + t.id}><span class="fb-time tnum">{fmtDuration(Date.now() - t.focusStartedAt)}</span><span class="ellipsis">{t.title}</span></a>
      <button class="fb-btn" onClick={() => { M.stopFocus(); toast('Paused'); }} aria-label="Pause"><Icon name="pause" size={14} /></button>
      <button class="fb-btn on" onClick={() => { M.completeTask(t.id); toast('Done', { action: { label: 'Undo', run: () => M.reopenTask(t.id) } }); }} aria-label="Done"><Icon name="check" size={16} /></button>
    </div>
  );
}

const SIDE = [
  { id: 'today', label: 'Today', icon: 'home', path: '/' },
  { id: 'projects', label: 'Projects', icon: 'folder', path: '/projects' },
  { id: 'tasks', label: 'Tasks', icon: 'square', path: '/tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', path: '/calendar' },
  { id: 'clients', label: 'Clients', icon: 'users', path: '/clients' },
  { id: 'invoices', label: 'Invoices', icon: 'file', path: '/invoices' },
  { id: 'templates', label: 'Templates', icon: 'template', path: '/templates' },
];
function Sidebar({ nav }) {
  const s = useSync();
  const overdue = M.liveTasks().filter(M.isOverdue).length;
  const invOver = M.liveInvoices().filter((i) => !i.archived && M.calcInvoice(i).status === 'overdue').length;
  return (
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-word">vandenizar</span><span class="brand-sub">focus on the work</span></div>
      <button class="btn primary block" onClick={() => openQuickAdd()}><Icon name="plus" size={18} />Add</button>
      <nav class="side-nav">
        {SIDE.map((it) => (
          <a href={'#' + it.path} class={'side-link' + (nav === it.id ? ' on' : '')} aria-current={nav === it.id ? 'page' : undefined}>
            <Icon name={it.icon} size={19} />{it.label}
            {it.id === 'tasks' && overdue > 0 && <span class="side-count">{overdue}</span>}
            {it.id === 'invoices' && invOver > 0 && <span class="side-count">{invOver}</span>}
          </a>
        ))}
      </nav>
      <div class="side-foot">
        <button class="side-link" onClick={() => openSearch()}><Icon name="search" size={19} />Search<span class="kbd">⌘K</span></button>
        <a href="#/settings" class={'side-link' + (nav === 'settings' ? ' on' : '')}><Icon name="settings" size={19} />Settings</a>
        <a href="#/trash" class={'side-link' + (nav === 'trash' ? ' on' : '')}><Icon name="trash" size={19} />Trash</a>
        <a class="save-state" href="#/settings/account"><span class={'save-dot ' + (persist.status === 'error' || s.status === 'error' ? 'error' : persist.status === 'saving' || s.status === 'syncing' ? 'saving' : '')} />{persist.status === 'error' ? 'Not saved' : persist.status === 'saving' ? 'Saving…' : syncLabel(s)}</a>
      </div>
    </aside>
  );
}

function Dock({ nav }) {
  const tabs = [
    { id: 'today', label: 'Today', icon: 'home', path: '/' },
    { id: 'projects', label: 'Projects', icon: 'folder', path: '/projects' },
    { id: 'tasks', label: 'Tasks', icon: 'square', path: '/tasks' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', path: '/calendar' },
    { id: 'more', label: 'More', icon: 'menu', path: '/more' },
  ];
  const moreOn = ['more', 'clients', 'invoices', 'templates', 'settings', 'trash', 'search'].includes(nav);
  return (
    <nav class="dock" aria-label="Main navigation">
      {tabs.map((t) => {
        const on = t.id === 'more' ? moreOn : nav === t.id;
        return (
          <a href={'#' + t.path} class={'dock-tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
            <span class="dock-ic"><Icon name={t.icon} size={20} stroke={on ? 2 : 1.7} /></span><span class="dock-label">{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function UpdatePill() {
  const v = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  return <div class="update-pill" role="status"><span>New version ready</span><button class="btn xs primary" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>{busy ? 'Updating…' : 'Update'}</button></div>;
}

// =====================================================================
// QUICK ADD
// =====================================================================
export function openQuickAdd(opts = {}) {
  openOverlay((close) => <QuickAdd close={close} {...opts} />, { kind: 'sheet', quick: true });
}
function QuickAdd({ close, when = 'today', date, time, projectId = null }) {
  const [title, setTitle] = useState('');
  const [w, setW] = useState(date ? 'date' : when);
  const [pid, setPid] = useState(projectId);
  const [open, setOpen] = useState(false);
  const [dl, setDl] = useState({ date: '', time: '' });
  const [est, setEst] = useState('');
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const project = pid && get('pmProjects', pid);
  const workDate = w === 'today' ? today() : w === 'tomorrow' ? addDays(today(), 1) : w === 'date' ? date : null;
  const add = () => {
    const tt = title.trim();
    if (!tt) return toast('Write the task first.', { tone: 'warn' });
    const subtasks = steps.split('\n').map((x) => x.trim()).filter(Boolean).map((t, i) => ({ id: Math.random().toString(36).slice(2, 10), title: t, done: false, order: i }));
    const t = M.newTask({ title: tt, workDate, workTime: w === 'date' ? time || null : null, projectId: pid || null, deadlineDate: dl.date || null, deadlineTime: dl.date ? dl.time || null : null, estimateMinutes: est ? +est : M.settings().defaultEstimate || null, subtasks, notes });
    close();
    toast(workDate ? 'Added for ' + relDay(workDate).toLowerCase() + (w === 'date' && time ? ' ' + time : '') : 'Added to Inbox', { action: { label: 'Open', run: () => navigate('/tasks/' + t.id) } });
  };
  const whenOpts = [{ id: 'today', label: 'Today' }, { id: 'tomorrow', label: 'Tomorrow' }, { id: 'none', label: 'No schedule' }];
  if (date) whenOpts.unshift({ id: 'date', label: relDay(date) + (time ? ' ' + time : '') });
  return (
    <>
      <SheetHead title="Add task" onClose={close} />
      <SheetBody>
        <div class="form">
          <input class="qa-title" id="qa-title" value={title} placeholder="What needs doing?" onInput={(e) => setTitle(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} ref={(el) => el && !el.dataset.f && (el.dataset.f = 1) && setTimeout(() => el.focus(), 60)} aria-label="Task title" />
          <div><button class={'pill clickable ' + (project ? 't-butter' : 't-plain')} onClick={() => pickProject({ onPick: (p) => setPid(p ? p.id : null) })}><Icon name="folder" size={15} />{project ? project.name : 'Link project'}</button></div>
          <div class="seg-pills" role="radiogroup" aria-label="Work schedule">
            {whenOpts.map((o) => <button role="radio" aria-checked={w === o.id} class={'seg-pill' + (w === o.id ? ' on' : '')} onClick={() => setW(o.id)}>{o.id === 'today' || o.id === 'date' ? <Icon name="calendar" size={15} /> : null}{o.label}</button>)}
          </div>
          <details class="more-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>Add deadline & details<Icon name="chevronDown" size={16} /></summary>
            <div class="form" style={{ marginTop: 12 }}>
              <Field label="Deadline"><div class="dt-pair"><DateInput id="qa-dl" value={dl.date} onChange={(v) => setDl({ ...dl, date: v })} /><TimeInput id="qa-dlt" value={dl.time} onChange={(v) => setDl({ ...dl, time: v })} /></div></Field>
              <Field label="Estimate (minutes)" htmlFor="qa-est"><NumberInput id="qa-est" value={est} onChange={setEst} step={15} placeholder="e.g. 60" /></Field>
              <Field label="Subtasks, one per line" htmlFor="qa-steps"><TextArea id="qa-steps" value={steps} onInput={setSteps} minRows={2} placeholder={'Pick footage\nSound design'} /></Field>
              <Field label="Notes" htmlFor="qa-notes"><TextArea id="qa-notes" value={notes} onInput={setNotes} minRows={2} /></Field>
            </div>
          </details>
          <div class="qa-hint">Just write it first. Details can follow.</div>
          <button class="btn primary block lg" onClick={add}>Add task</button>
          <div class="qa-more">
            <button class="btn outline" onClick={() => { close(); openProjectSheet(); }}><Icon name="plus" size={15} />Project</button>
            <button class="btn outline" onClick={() => { close(); openClientSheet(); }}><Icon name="plus" size={15} />Client</button>
            <button class="btn outline" onClick={() => { close(); createInvoiceAndOpen({}); }}><Icon name="plus" size={15} />Invoice</button>
          </div>
        </div>
      </SheetBody>
    </>
  );
}

// =====================================================================
// SEARCH
// =====================================================================
export function openSearch() { openOverlay((close) => <Search close={close} />, { kind: 'sheet', wide: true }); }
function SearchPage() { return <div class="page narrow"><Search /></div>; }
function Search({ close }) {
  useStore();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const has = (...xs) => xs.some((x) => (x || '').toString().toLowerCase().includes(term));
  const go = (path) => { close && close(); navigate(path); };
  const groups = [];
  if (term) {
    const tasks = M.liveTasks().filter((t) => has(t.title, t.notes, (t.subtasks || []).map((s) => s.title).join(' '))).slice(0, 8);
    const projects = M.liveProjects().filter((p) => has(p.name, p.brief, p.notes, M.clientName(p.clientId))).slice(0, 8);
    const clients = M.liveClients().filter((c) => has(c.name, c.pic, c.email, c.phone)).slice(0, 6);
    const invoices = M.liveInvoices().filter((i) => has(i.number, M.clientName(i.clientId), (i.items || []).map((x) => x.desc).join(' '))).slice(0, 6);
    if (tasks.length) groups.push({ label: 'Tasks', rows: tasks.map((t) => ({ key: t.id, icon: 'square', title: t.title, meta: [M.projectName(t.projectId), t.workDate ? whenLabel(t.workDate, t.workTime) : M.isOpen(t) ? 'Inbox' : 'Done'].filter(Boolean).join(' · '), path: '/tasks/' + t.id })) });
    if (projects.length) groups.push({ label: 'Projects', rows: projects.map((p) => ({ key: p.id, icon: 'folder', title: p.name, meta: (p.clientId ? M.clientName(p.clientId) + ' · ' : '') + M.stageOf(p.stage).label, path: '/projects/' + p.id })) });
    if (clients.length) groups.push({ label: 'Clients', rows: clients.map((c) => ({ key: c.id, icon: 'users', title: c.name, meta: c.pic || '', path: '/clients/' + c.id })) });
    if (invoices.length) groups.push({ label: 'Invoices', rows: invoices.map((i) => { const c = M.calcInvoice(i); return { key: i.id, icon: 'file', title: i.number, meta: M.clientName(i.clientId) + ' · ' + fmtMoney(c.total, i.currency), badge: <InvoicePill status={c.status} />, path: '/invoices/' + i.id }; }) });
  }
  const recent = (M.meta('recent', { items: [] }).items || []).map((x) => {
    const coll = { project: 'pmProjects', client: 'clients', invoice: 'invoices', task: 'pmTasks' }[x.type];
    const r = coll && get(coll, x.id);
    if (!r || r.deletedAt) return null;
    return { key: x.type + x.id, icon: { project: 'folder', client: 'users', invoice: 'file', task: 'square' }[x.type], title: r.name || r.number || r.title, meta: x.type[0].toUpperCase() + x.type.slice(1), path: '/' + x.type + 's/' + x.id };
  }).filter(Boolean).slice(0, 6);
  const Rows = ({ rows }) => rows.map((r) => <button class="list-row clickable" onClick={() => go(r.path)}><span class="row-ic"><Icon name={r.icon} size={16} /></span><div class="row-main"><div class="row-title">{r.title}</div>{r.meta && <div class="row-meta">{r.meta}</div>}</div>{r.badge}</button>);
  const body = (
    <>
      <div class="search-box big"><Icon name="search" size={18} /><input id="global-search" value={q} placeholder="Tasks, projects, clients, invoices" onInput={(e) => setQ(e.currentTarget.value)} ref={(el) => el && setTimeout(() => el.focus(), 50)} onKeyDown={(e) => { if (e.key === 'Enter' && groups[0]) go(groups[0].rows[0].path); }} />{q && <button class="icon-btn ghost xs" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
      {term && !groups.length && <div class="empty"><div class="empty-title">Nothing matches "{q}"</div><div class="empty-text">Try a client name, an invoice number or a word from a task.</div></div>}
      {groups.map((g) => <div class="result-group"><div class="group-label">{g.label}</div><Rows rows={g.rows} /></div>)}
      {!term && <div class="result-group"><div class="group-label">Recently opened</div>{recent.length ? <Rows rows={recent} /> : <div class="quiet-note">Things you open show up here.</div>}</div>}
    </>
  );
  if (!close) return body;
  return <><SheetHead title="Search" onClose={close} /><SheetBody>{body}</SheetBody></>;
}
export { StagePill };
