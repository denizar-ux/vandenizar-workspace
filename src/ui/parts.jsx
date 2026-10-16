import { useState, useEffect } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, TimeInput, Chips, NumberInput } from './kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, openSheet } from './overlay.jsx';
import { navigate } from '../lib/router.js';
import { get, all, patch, put, remove, useStore } from '../lib/db.js';
import { today, addDays, relDay, diffDays, fmtDay, fmtMinutes, recurrenceLabel, startOfWeek } from '../lib/date.js';
import * as M from '../lib/model.js';

// ---------- colors ----------
const TONES = ['t-blue', 't-orange', 't-green', 't-pink', 't-violet', 't-yellow', 't-grey'];
const CAT_TONE = { Work: 't-blue', Freelance: 't-orange', Growth: 't-green', Personal: 't-pink' };
export function catTone(cat) {
  if (CAT_TONE[cat]) return CAT_TONE[cat];
  const i = M.settings().categories.indexOf(cat);
  return TONES[(i < 0 ? 6 : i) % TONES.length];
}
export const toneVar = (tone) => `var(--${tone}, var(--t-grey))`;
export const dotColor = (tone) => `var(--${tone.replace('t-', 't-')})`;
export function pillarTone(p) { const i = M.settings().pillars.indexOf(p); return i < 0 ? 't-grey' : TONES[i % TONES.length]; }
export const CONTENT_TONE = { idea: 't-violet', scripting: 't-yellow', filming: 't-orange', editing: 't-blue', ready: 't-green', published: 't-grey', in_progress: 't-yellow' };
export const INVOICE_TONE = { draft: 't-grey', sent: 't-blue', partial: 't-yellow', paid: 't-green', overdue: 't-red' };
export const STAGE_TONE = { Lead: 't-grey', Contacted: 't-violet', Negotiation: 't-yellow', Booked: 't-blue', Production: 't-orange', Editing: 't-pink', Delivered: 't-green', Paid: 't-green' };
export const STAGE_COLOR = { Lead: 'var(--t-grey)', Contacted: 'var(--t-violet)', Negotiation: 'var(--t-yellow)', Booked: 'var(--t-blue)', Production: 'var(--t-orange)', Editing: 'var(--t-pink)', Delivered: 'var(--t-green)', Paid: 'var(--good)' };
export function Dot({ tone }) { return <span class="cat-dot" style={{ background: `var(--${tone})` }} />; }
export const ContentBadge = ({ status, sm }) => <span class={`badge ${sm ? 'sm ' : ''}${CONTENT_TONE[status]}`}>{M.CONTENT_STATUSES.find((s) => s.id === status)?.label}</span>;
export const InvoiceBadge = ({ status, sm }) => <span class={`badge ${sm ? 'sm ' : ''}${INVOICE_TONE[status]}`}>{M.INVOICE_STATUS[status]}</span>;
export const StageBadge = ({ stage, sm }) => <span class={`badge ${sm ? 'sm ' : ''}${STAGE_TONE[stage] || 't-grey'}`}>{stage}</span>;

// ---------- page chrome ----------
export function PageHeader({ eyebrow, title, actions, children }) {
  return (
    <div class="ph">
      <div class="ph-titles">
        {eyebrow && <div class="eyebrow">{eyebrow}</div>}
        <h1 class="ph-title">{title}</h1>
        {children}
      </div>
      {actions && <div class="ph-actions">{actions}</div>}
    </div>
  );
}
export function SubNav({ items, active }) {
  return (
    <nav class="subnav" aria-label="Section">
      {items.map((it) => <a href={'#' + it.path} class={active === it.id ? 'on' : ''} aria-current={active === it.id ? 'page' : undefined}>{it.label}</a>)}
    </nav>
  );
}
export const DAILY_NAV = [{ id: 'today', label: 'Today', path: '/' }, { id: 'tasks', label: 'Tasks', path: '/tasks' }, { id: 'calendar', label: 'Calendar', path: '/calendar' }, { id: 'goals', label: 'Goals', path: '/goals' }, { id: 'review', label: 'Review', path: '/review' }];
export const CONTENT_NAV = [{ id: 'overview', label: 'Overview', path: '/content' }, { id: 'board', label: 'Board', path: '/content/board' }, { id: 'calendar', label: 'Calendar', path: '/content/calendar' }, { id: 'threads', label: 'Threads', path: '/content/threads' }, { id: 'resources', label: 'Resources', path: '/content/resources' }];
export const FREELANCE_NAV = [{ id: 'overview', label: 'Overview', path: '/freelance' }, { id: 'pipeline', label: 'Pipeline', path: '/freelance/pipeline' }, { id: 'projects', label: 'Projects', path: '/freelance/projects' }, { id: 'clients', label: 'Clients', path: '/freelance/clients' }, { id: 'invoices', label: 'Invoices', path: '/freelance/invoices' }, { id: 'finance', label: 'Finance', path: '/freelance/finance' }, { id: 'templates', label: 'Templates', path: '/freelance/templates' }];

export function BackBar({ onBack, children, right }) {
  return (
    <div class="back-row">
      <button class="icon-btn" onClick={onBack} aria-label="Back"><Icon name="arrowLeft" /></button>
      <div class="grow">{children}</div>
      {right}
    </div>
  );
}

// ---------- task row ----------
export function dueLabel(t) {
  if (!t.dueDate) return null;
  const d = diffDays(t.dueDate, today());
  const cls = d < 0 && M.isOpen(t) ? 'over' : d === 0 && M.isOpen(t) ? 'today' : '';
  return <span class={'m ' + cls}><Icon name="calendar" />{relDay(t.dueDate)}{t.dueTime ? ' ' + t.dueTime : ''}</span>;
}
export function TaskRow({ t, hideDate, hideCat, compact, dragProps }) {
  const done = t.status === 'done';
  const focusing = M.meta('focus', {}).taskId === t.id;
  const content = t.contentId && get('contents', t.contentId);
  const project = t.projectId && get('projects', t.projectId);
  const invoice = t.invoiceId && get('invoices', t.invoiceId);
  const goal = t.goalId && get('goals', t.goalId);
  const toggle = (v) => {
    if (v) { M.completeTask(t.id); toast(t.recurrence?.freq ? 'Done. Next one is scheduled.' : 'Task done', { action: t.recurrence?.freq ? null : { label: 'Undo', run: () => M.reopenTask(t.id) } }); }
    else M.reopenTask(t.id);
  };
  return (
    <div class={'task ' + (done ? 'done ' : '') + (focusing ? 'focusing' : '')} {...(dragProps || {})}>
      {dragProps && <span class="grip" data-drag-handle aria-label="Drag to reorder"><Icon name="grip" size={16} /></span>}
      <Check checked={done} onChange={toggle} tone={t.priority === 'high' ? 'prio-high' : t.priority === 'medium' ? 'prio-medium' : ''} label={done ? 'Mark not done' : 'Complete ' + t.title} />
      <div class="task-body" onClick={() => openTaskSheet(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTaskSheet(t.id)}>
        <div class="task-title">{t.title || 'Untitled task'}</div>
        {!compact && (
          <div class="task-meta">
            {!hideDate && dueLabel(t)}
            {hideDate && t.dueTime && <span class="m" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{t.dueTime}</span>}
            {!hideCat && t.category && <span class="m"><Dot tone={catTone(t.category)} />{t.category}</span>}
            {t.priority === 'high' && <span class="m" style={{ color: 'var(--accent-text)' }}><Icon name="flag" />High</span>}
            {t.recurrence?.freq && <span class="m"><Icon name="repeat" />{recurrenceLabel(t.recurrence)}</span>}
            {t.estimate > 0 && <span class="m"><Icon name="clock" />{fmtMinutes(t.estimate)}</span>}
            {content && <span class="m"><Icon name="video" />{content.title}</span>}
            {project && <span class="m"><Icon name="briefcase" />{project.name}</span>}
            {invoice && <span class="m"><Icon name="file" />{invoice.number}</span>}
            {goal && <span class="m"><Icon name="target" />{goal.title}</span>}
          </div>
        )}
      </div>
      <div class="task-actions">
        {!done && !focusing && t.status !== 'cancelled' && <button class="icon-btn ghost sm" aria-label={'Start focus on ' + t.title} title="Start focus" onClick={() => M.startFocus(t.id)}><Icon name="play" size={14} /></button>}
        <button class="icon-btn ghost sm" aria-label="More actions" onClick={(e) => taskMenu(e, t)}><Icon name="more" /></button>
      </div>
    </div>
  );
}

export function taskMenu(e, t) {
  const plan = M.dayPlan(today());
  const isMain = plan.mainTaskId === t.id;
  const isKey = (plan.keyTaskIds || []).includes(t.id);
  const open = M.isOpen(t);
  openMenu(e, [
    open && { label: 'Start focus', icon: 'play', onSelect: () => M.startFocus(t.id) },
    { label: 'Edit', icon: 'edit', onSelect: () => openTaskSheet(t.id) },
    open && { label: 'Do today', icon: 'sun', onSelect: () => patch('tasks', t.id, { dueDate: today() }) },
    open && { label: 'Defer to tomorrow', icon: 'chevronRight', onSelect: () => { M.deferTask(t.id, 1); toast('Moved to tomorrow'); } },
    open && { label: 'Reschedule…', icon: 'calendar', onSelect: () => openReschedule(t) },
    { divider: true },
    t.status !== 'deferred' && open && { label: 'Mark deferred', icon: 'clock', onSelect: () => patch('tasks', t.id, { status: 'deferred' }) },
    (t.status === 'deferred' || t.status === 'cancelled' || t.status === 'done') && { label: 'Reopen', icon: 'restore', onSelect: () => patch('tasks', t.id, { status: 'todo', completedAt: null }) },
    t.status !== 'cancelled' && t.status !== 'done' && { label: 'Cancel task', icon: 'x', onSelect: () => patch('tasks', t.id, { status: 'cancelled' }) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { const c = { ...t }; delete c.id; delete c.createdAt; M.newTask({ ...c, title: t.title + ' (copy)', status: 'todo', completedAt: null, completions: [], focusSessions: [], focusStartedAt: null }); toast('Duplicated'); } },
    { label: 'Archive', icon: 'archive', onSelect: () => { patch('tasks', t.id, { archived: true }); toast('Archived', { action: { label: 'Undo', run: () => patch('tasks', t.id, { archived: false }) } }); } },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => { M.trashTask(t.id); toast('Moved to Trash', { action: { label: 'Undo', run: () => patch('tasks', t.id, { deletedAt: null }) } }); } },
  ], { title: t.title });
}
export function togglePlan(t, kind, iso = today()) {
  const p = M.dayPlan(iso);
  if (kind === 'main') {
    if (p.mainTaskId === t.id) M.setDayPlan(iso, { mainTaskId: '' });
    else { M.setDayPlan(iso, { mainTaskId: t.id, keyTaskIds: (p.keyTaskIds || []).filter((x) => x !== t.id) }); if (!t.dueDate || diffDays(t.dueDate, iso) > 0) patch('tasks', t.id, { dueDate: iso }); toast('Main priority set'); }
  } else {
    const keys = (p.keyTaskIds || []).filter((x) => M.isOpen(get('tasks', x)) || x === t.id);
    if (keys.includes(t.id)) M.setDayPlan(iso, { keyTaskIds: keys.filter((x) => x !== t.id) });
    else if (keys.length >= 3) toast('You already have 3 key tasks. Remove one first.', { tone: 'warn' });
    else { M.setDayPlan(iso, { keyTaskIds: [...keys, t.id], mainTaskId: p.mainTaskId === t.id ? '' : p.mainTaskId }); if (!t.dueDate || diffDays(t.dueDate, iso) > 0) patch('tasks', t.id, { dueDate: iso }); }
  }
}

export function openReschedule(t) {
  openOverlay((close) => <RescheduleSheet t={t} close={close} />, { kind: 'sheet' });
}
function RescheduleSheet({ t, close }) {
  const [d, setD] = useState(t.dueDate || today());
  const [tm, setTm] = useState(t.dueTime || '');
  const set = (date) => { patch('tasks', t.id, { dueDate: date, dueTime: date ? tm : '', status: t.status === 'deferred' ? 'todo' : t.status }); close(); toast(date ? 'Rescheduled to ' + relDay(date) : 'Moved to Inbox'); };
  const nextMon = addDays(startOfWeek(today(), 1), 7);
  return (
    <>
      <SheetHead title="Reschedule" sub={t.title} onClose={close} />
      <SheetBody>
        <div class="form">
          <div class="chips">
            <button class="chip" onClick={() => set(today())}>Today</button>
            <button class="chip" onClick={() => set(addDays(today(), 1))}>Tomorrow</button>
            <button class="chip" onClick={() => set(addDays(today(), 2))}>{relDay(addDays(today(), 2))}</button>
            <button class="chip" onClick={() => set(nextMon)}>Next Monday</button>
            <button class="chip" onClick={() => set('')}>No date (Inbox)</button>
          </div>
          <div class="form-row">
            <Field label="Date" htmlFor="rs-date"><DateInput id="rs-date" value={d} onChange={setD} /></Field>
            <Field label="Time" htmlFor="rs-time"><TimeInput id="rs-time" value={tm} onChange={setTm} /></Field>
          </div>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={() => set(d)}>Save</button></SheetFoot>
    </>
  );
}

// ---------- task editor sheet ----------
export function openTaskSheet(id, preset = {}) {
  openOverlay((close) => <TaskSheet id={id} preset={preset} close={close} />, { kind: 'sheet' });
}
function TaskSheet({ id, preset, close }) {
  useStore();
  const s = M.settings();
  useEffect(() => { if (id) { const t = get('tasks', id); if (!t || t.deletedAt || t.archived) close(); } });
  const existing = id ? get('tasks', id) : null;
  const [draft, setDraft] = useState(() => existing ? { ...existing } : { title: '', notes: '', category: s.defaultCategory, status: 'todo', priority: s.defaultPriority, dueDate: '', dueTime: '', estimate: 0, recurrence: null, goalId: '', contentId: '', projectId: '', invoiceId: '', ...preset });
  const live = existing ? get('tasks', id) || draft : draft;
  const set = (ch) => {
    const n = { ...live, ...ch };
    setDraft(n);
    if (existing) patch('tasks', id, ch);
  };
  const create = () => {
    if (!draft.title.trim()) return toast('Give the task a name first.', { tone: 'warn' });
    M.newTask({ ...draft, title: draft.title.trim() });
    toast(draft.dueDate ? `Added for ${relDay(draft.dueDate)}` : 'Added to Inbox');
    close();
  };
  const goals = M.activeGoals();
  const contents = M.liveContents().filter((c) => c.status !== 'published' || c.id === live.contentId);
  const projects = M.liveProjects().filter((p) => !p.archived || p.id === live.projectId);
  const invoices = M.liveInvoices().filter((i) => !i.archived || i.id === live.invoiceId);
  const rec = live.recurrence || null;
  const focusTotal = (live.focusSessions || []).reduce((a, x) => a + (x.end - x.start), 0);
  return (
    <>
      <SheetHead title={existing ? 'Task' : 'New task'} onClose={close} sub={existing ? (live.status === 'done' ? 'Completed' : 'Changes save automatically') : null}
        right={existing && <button class="icon-btn ghost" aria-label="More" onClick={(e) => taskMenu(e, live)}><Icon name="more" /></button>} />
      <SheetBody>
        <div class="form">
          <Field label="Title" htmlFor="t-title"><TextInput id="t-title" value={live.title} onInput={(v) => set({ title: v })} placeholder="What needs doing?" autoFocus={!existing} onEnter={() => !existing && create()} /></Field>
          <div class="form-row">
            <Field label="Due date" htmlFor="t-due"><DateInput id="t-due" value={live.dueDate} onChange={(v) => set({ dueDate: v, ...(v ? {} : { dueTime: '' }) })} /></Field>
            <Field label="Time (optional)" htmlFor="t-time"><TimeInput id="t-time" value={live.dueTime} onChange={(v) => set({ dueTime: v })} /></Field>
          </div>
          <div class="chips sm">
            <button class="chip" onClick={() => set({ dueDate: today() })}>Today</button>
            <button class="chip" onClick={() => set({ dueDate: addDays(today(), 1) })}>Tomorrow</button>
            <button class="chip" onClick={() => set({ dueDate: addDays(startOfWeek(today(), 1), 7) })}>Next week</button>
            {live.dueDate && <button class="chip" onClick={() => set({ dueDate: '', dueTime: '' })}>Inbox</button>}
          </div>
          <Field label="Category"><Chips options={s.categories.map((c) => ({ id: c, label: c, dot: `var(--${catTone(c)})` }))} value={live.category} onChange={(v) => set({ category: v })} /></Field>
          <div class="form-row">
            <Field label="Priority" htmlFor="t-prio"><Select id="t-prio" value={live.priority} onChange={(v) => set({ priority: v })} options={M.PRIORITIES} /></Field>
            <Field label="Status" htmlFor="t-status"><Select id="t-status" value={live.status} onChange={(v) => set({ status: v, completedAt: v === 'done' ? live.completedAt || Date.now() : null })} options={M.TASK_STATUSES} /></Field>
          </div>
          <div class="form-row">
            <Field label="Estimate (minutes)" htmlFor="t-est"><NumberInput id="t-est" value={live.estimate || ''} onChange={(v) => set({ estimate: v || 0 })} step={5} placeholder="e.g. 45" /></Field>
            <Field label="Repeat" htmlFor="t-rep"><Select id="t-rep" value={rec?.freq || ''} onChange={(v) => set({ recurrence: v ? { freq: v, interval: rec?.interval || 1 } : null, ...(v && !live.dueDate ? { dueDate: today() } : {}) })} placeholder="Does not repeat" options={[{ id: 'daily', label: 'Daily' }, { id: 'weekdays', label: 'Weekdays' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }]} /></Field>
          </div>
          {rec?.freq && rec.freq !== 'weekdays' && (
            <Field label={`Repeat every … ${rec.freq === 'daily' ? 'days' : rec.freq === 'weekly' ? 'weeks' : 'months'}`} htmlFor="t-int" hint="Completing a repeating task moves it to the next date. No copies are made.">
              <NumberInput id="t-int" value={rec.interval || 1} min={1} onChange={(v) => set({ recurrence: { ...rec, interval: Math.max(1, +v || 1) } })} />
            </Field>
          )}
          <Field label="Notes" htmlFor="t-notes"><TextArea id="t-notes" value={live.notes} onInput={(v) => set({ notes: v })} placeholder="Details, links, context" /></Field>
          <details class="card soft tight" open={!!(live.goalId || live.contentId || live.projectId || live.invoiceId)}>
            <summary style={{ fontWeight: 800, cursor: 'pointer' }}>Link to goal, content, project or invoice</summary>
            <div class="form" style={{ marginTop: 12 }}>
              <Field label="Goal" htmlFor="t-goal"><Select id="t-goal" value={live.goalId} onChange={(v) => set({ goalId: v })} placeholder="None" options={goals.map((g) => ({ id: g.id, label: g.title }))} /></Field>
              <Field label="Content item" htmlFor="t-content"><Select id="t-content" value={live.contentId} onChange={(v) => set({ contentId: v })} placeholder="None" options={contents.map((c) => ({ id: c.id, label: c.title }))} /></Field>
              <Field label="Freelance project" htmlFor="t-project"><Select id="t-project" value={live.projectId} onChange={(v) => set({ projectId: v })} placeholder="None" options={projects.map((p) => ({ id: p.id, label: `${p.name} · ${M.clientName(p.clientId)}` }))} /></Field>
              <Field label="Invoice" htmlFor="t-invoice"><Select id="t-invoice" value={live.invoiceId} onChange={(v) => set({ invoiceId: v })} placeholder="None" options={invoices.map((i) => ({ id: i.id, label: `${i.number} · ${M.clientName(i.clientId)}` }))} /></Field>
            </div>
          </details>
          {existing && (
            <div class="row gap-8 wrap">
              {live.contentId && <button class="btn sm soft" onClick={() => { close(); navigate('/content/item/' + live.contentId); }}><Icon name="video" size={16} />Open content</button>}
              {live.projectId && <button class="btn sm soft" onClick={() => { close(); navigate('/freelance/projects/' + live.projectId); }}><Icon name="briefcase" size={16} />Open project</button>}
              {live.invoiceId && <button class="btn sm soft" onClick={() => { close(); navigate('/freelance/invoices/' + live.invoiceId); }}><Icon name="file" size={16} />Open invoice</button>}
            </div>
          )}
          {existing && (focusTotal > 0 || (live.completions || []).length > 0) && (
            <div class="muted" style={{ fontSize: 13 }}>
              {focusTotal > 0 && <div>Focused {fmtMinutes(Math.round(focusTotal / 60000)) || '<1m'} across {(live.focusSessions || []).length} session(s)</div>}
              {(live.completions || []).length > 0 && <div>Completed {(live.completions || []).length} time(s)</div>}
            </div>
          )}
        </div>
      </SheetBody>
      <SheetFoot>
        {existing ? (
          <>
            {M.isOpen(live) && <button class="btn soft" onClick={() => { M.startFocus(id); close(); }}><Icon name="play" size={14} />Focus</button>}
            {M.isOpen(live) ? <button class="btn primary" onClick={() => { M.completeTask(id); toast('Task done'); close(); }}><Icon name="check" size={16} />Complete</button> : <button class="btn primary" onClick={close}>Done</button>}
          </>
        ) : (
          <>
            <button class="btn ghost" onClick={close}>Cancel</button>
            <button class="btn primary" onClick={create}>Add task</button>
          </>
        )}
      </SheetFoot>
    </>
  );
}

// ---------- pickers ----------
export function pickTask({ title = 'Pick a task', filter = () => true, onPick, allowNew = true, newPreset = {} }) {
  openOverlay((close) => <TaskPicker title={title} filter={filter} onPick={(t) => { close(); onPick(t); }} allowNew={allowNew} newPreset={newPreset} close={close} />, { kind: 'sheet' });
}
function TaskPicker({ title, filter, onPick, allowNew, newPreset, close }) {
  useStore();
  const [q, setQ] = useState('');
  const list = M.sortTasks(M.liveTasks().filter((t) => M.isOpen(t) && filter(t) && (!q || t.title.toLowerCase().includes(q.toLowerCase()))));
  const createNew = () => { if (!q.trim()) return; const t = M.newTask({ title: q.trim(), dueDate: today(), ...newPreset }); onPick(t); };
  return (
    <>
      <SheetHead title={title} onClose={close} />
      <SheetBody>
        <div class="search-box" style={{ marginBottom: 10 }}>
          <Icon name="search" size={18} class="muted" />
          <input id="pick-q" value={q} placeholder={allowNew ? 'Search or type a new task' : 'Search tasks'} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && allowNew && !list.length) createNew(); }} />
        </div>
        {allowNew && q.trim() && <button class="list-row clickable" onClick={createNew}><span class="icon-btn soft sm"><Icon name="plus" size={16} /></span><div class="row-main"><div class="row-title">Create “{q.trim()}”</div><div class="row-meta">New task for today</div></div></button>}
        <div class="list">
          {list.slice(0, 60).map((t) => (
            <button class="list-row clickable" onClick={() => onPick(t)}>
              <Dot tone={catTone(t.category)} />
              <div class="row-main"><div class="row-title">{t.title}</div><div class="row-meta">{t.dueDate ? relDay(t.dueDate) : 'Inbox'}{t.category ? ' · ' + t.category : ''}</div></div>
            </button>
          ))}
          {!list.length && !q && <div class="muted" style={{ padding: 12 }}>No open tasks yet. Type above to create one.</div>}
        </div>
      </SheetBody>
    </>
  );
}

export function fmtAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d + 'd ago';
}
export { confirmDialog, openSheet };
