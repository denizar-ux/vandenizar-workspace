import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, TimeInput, Chips, NumberInput } from './kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, openSheet } from './overlay.jsx';
import { navigate } from '../lib/router.js';
import { get, all, patch, put, remove, useStore } from '../lib/db.js';
import { today, addDays, relDay, diffDays, fmtDay, fmtMinutes, recurrenceLabel, startOfWeek } from '../lib/date.js';
import * as M from '../lib/model.js';
import { t as _t, tn as _tn } from '../lib/i18n.js';

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
export const InvoiceBadge = ({ status, sm }) => <span class={`badge ${sm ? 'sm ' : ''}${INVOICE_TONE[status]}`}>{_t(M.INVOICE_STATUS[status])}</span>;
export const StageBadge = ({ stage, sm }) => <span class={`badge ${sm ? 'sm ' : ''}${STAGE_TONE[stage] || 't-grey'}`}>{_t(stage)}</span>;

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
// Section menu on phones: one liquid-glass capsule, the active item sits on a lens
// that slides over from wherever it was on the previous page.
const lensMemory = {};
export function SubNav({ items, active }) {
  const wrap = useRef(), track = useRef(), lens = useRef();
  const group = items[0].path;
  useLayoutEffect(() => {
    const el = track.current && track.current.querySelector('a.on');
    const L = lens.current;
    if (!el || !L) { if (L) L.style.opacity = '0'; return; }
    const to = { x: el.offsetLeft, w: el.offsetWidth };
    const from = lensMemory[group];
    const place = (p) => { L.style.transform = `translateX(${p.x}px)`; L.style.width = p.w + 'px'; };
    L.style.opacity = '1';
    if (from && (from.x !== to.x || from.w !== to.w)) {
      L.style.transition = 'none'; place(from); void L.offsetWidth;
      L.style.transition = ''; requestAnimationFrame(() => place(to));
    } else place(to);
    lensMemory[group] = to;
    // keep the active item in view without moving the page
    const w = wrap.current;
    if (w && (to.x < w.scrollLeft || to.x + to.w > w.scrollLeft + w.clientWidth - 24)) w.scrollLeft = Math.max(0, to.x - 24);
  }, [active, group]);
  return (
    <nav class="subnav" ref={wrap} aria-label={_t('Section')}>
      <div class="subnav-track lg" ref={track}>
        <span class="subnav-lens" ref={lens} aria-hidden="true" />
        {items.map((it) => <a href={'#' + it.path} class={active === it.id ? 'on' : ''} aria-current={active === it.id ? 'page' : undefined}>{it.label}</a>)}
      </div>
    </nav>
  );
}
export const DAILY_NAV = [{ id: 'today', get label() { return _t('Today'); }, path: '/' }, { id: 'tasks', get label() { return _t('Tasks'); }, path: '/tasks' }, { id: 'calendar', get label() { return _t('Calendar'); }, path: '/calendar' }, { id: 'habits', get label() { return _t('Habits'); }, path: '/habits' }, { id: 'goals', get label() { return _t('Goals'); }, path: '/goals' }, { id: 'review', get label() { return _t('Review'); }, path: '/review' }];
export const CONTENT_NAV = [{ id: 'overview', get label() { return _t('Overview'); }, path: '/content' }, { id: 'board', get label() { return _t('Board'); }, path: '/content/board' }, { id: 'calendar', get label() { return _t('Calendar'); }, path: '/content/calendar' }, { id: 'threads', get label() { return _t('Threads'); }, path: '/content/threads' }, { id: 'resources', get label() { return _t('Resources'); }, path: '/content/resources' }];
export const FREELANCE_NAV = [{ id: 'overview', get label() { return _t('Overview'); }, path: '/freelance' }, { id: 'pipeline', get label() { return _t('Pipeline'); }, path: '/freelance/pipeline' }, { id: 'projects', get label() { return _t('Projects'); }, path: '/freelance/projects' }, { id: 'clients', get label() { return _t('Clients'); }, path: '/freelance/clients' }, { id: 'invoices', get label() { return _t('Invoices'); }, path: '/freelance/invoices' }, { id: 'finance', get label() { return _t('Finance'); }, path: '/freelance/finance' }, { id: 'templates', get label() { return _t('Templates'); }, path: '/freelance/templates' }];

export function BackBar({ onBack, children, right }) {
  return (
    <div class="back-row">
      <button class="icon-btn" onClick={onBack} aria-label={_t('Back')}><Icon name="arrowLeft" /></button>
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
    if (v) { M.completeTask(t.id); toast(t.recurrence?.freq ? _t('Done. Next one is scheduled.') : _t('Task done'), { action: t.recurrence?.freq ? null : { label: _t('Undo'), run: () => M.reopenTask(t.id) } }); }
    else M.reopenTask(t.id);
  };
  return (
    <div class={'task ' + (done ? 'done ' : '') + (focusing ? 'focusing' : '')} {...(dragProps || {})}>
      {dragProps && <span class="grip" data-drag-handle aria-label={_t('Drag to reorder')}><Icon name="grip" size={16} /></span>}
      <Check checked={done} onChange={toggle} tone={t.priority === 'high' ? 'prio-high' : t.priority === 'medium' ? 'prio-medium' : ''} label={done ? _t('Mark not done') : _t('Complete {0}', [t.title])} />
      <div class="task-body" onClick={() => openTaskSheet(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTaskSheet(t.id)}>
        <div class="task-title">{t.title || _t('Untitled task')}</div>
        {!compact && (
          <div class="task-meta">
            {!hideDate && dueLabel(t)}
            {hideDate && t.dueTime && <span class="m" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{t.dueTime}</span>}
            {!hideCat && t.category && <span class="m"><Dot tone={catTone(t.category)} />{t.category}</span>}
            {t.priority === 'high' && <span class="m" style={{ color: 'var(--accent-text)' }}><Icon name="flag" />{_t('High')}</span>}
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
        {!done && !focusing && t.status !== 'cancelled' && <button class="icon-btn ghost sm" aria-label={_t('Start focus on {0}', [t.title])} title={_t('Start focus')} onClick={() => M.startFocus(t.id)}><Icon name="play" size={14} /></button>}
        <button class="icon-btn ghost sm" aria-label={_t('More actions')} onClick={(e) => taskMenu(e, t)}><Icon name="more" /></button>
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
    open && { label: _t('Start focus'), icon: 'play', onSelect: () => M.startFocus(t.id) },
    { label: _t('Edit'), icon: 'edit', onSelect: () => openTaskSheet(t.id) },
    open && { label: _t('Do today'), icon: 'sun', onSelect: () => patch('tasks', t.id, { dueDate: today() }) },
    open && { label: _t('Defer to tomorrow'), icon: 'chevronRight', onSelect: () => { M.deferTask(t.id, 1); toast(_t('Moved to tomorrow')); } },
    open && { label: _t('Reschedule…'), icon: 'calendar', onSelect: () => openReschedule(t) },
    { divider: true },
    t.status !== 'deferred' && open && { label: _t('Mark deferred'), icon: 'clock', onSelect: () => patch('tasks', t.id, { status: 'deferred' }) },
    (t.status === 'deferred' || t.status === 'cancelled' || t.status === 'done') && { label: _t('Reopen'), icon: 'restore', onSelect: () => patch('tasks', t.id, { status: 'todo', completedAt: null }) },
    t.status !== 'cancelled' && t.status !== 'done' && { label: _t('Cancel task'), icon: 'x', onSelect: () => patch('tasks', t.id, { status: 'cancelled' }) },
    { label: _t('Duplicate'), icon: 'copy', onSelect: () => { const c = { ...t }; delete c.id; delete c.createdAt; M.newTask({ ...c, title: t.title + ' (copy)', status: 'todo', completedAt: null, completions: [], focusSessions: [], focusStartedAt: null }); toast(_t('Duplicated')); } },
    { label: _t('Archive'), icon: 'archive', onSelect: () => { patch('tasks', t.id, { archived: true }); toast(_t('Archived'), { action: { label: _t('Undo'), run: () => patch('tasks', t.id, { archived: false }) } }); } },
    { label: _t('Delete'), icon: 'trash', danger: true, onSelect: () => { M.trashTask(t.id); toast(_t('Moved to Trash'), { action: { label: _t('Undo'), run: () => patch('tasks', t.id, { deletedAt: null }) } }); } },
  ], { title: t.title });
}
export function togglePlan(t, kind, iso = today()) {
  const p = M.dayPlan(iso);
  if (kind === 'main') {
    if (p.mainTaskId === t.id) M.setDayPlan(iso, { mainTaskId: '' });
    else { M.setDayPlan(iso, { mainTaskId: t.id, keyTaskIds: (p.keyTaskIds || []).filter((x) => x !== t.id) }); if (!t.dueDate || diffDays(t.dueDate, iso) > 0) patch('tasks', t.id, { dueDate: iso }); toast(_t('Main priority set')); }
  } else {
    const keys = (p.keyTaskIds || []).filter((x) => M.isOpen(get('tasks', x)) || x === t.id);
    if (keys.includes(t.id)) M.setDayPlan(iso, { keyTaskIds: keys.filter((x) => x !== t.id) });
    else if (keys.length >= 3) toast(_t('You already have 3 key tasks. Remove one first.'), { tone: 'warn' });
    else { M.setDayPlan(iso, { keyTaskIds: [...keys, t.id], mainTaskId: p.mainTaskId === t.id ? '' : p.mainTaskId }); if (!t.dueDate || diffDays(t.dueDate, iso) > 0) patch('tasks', t.id, { dueDate: iso }); }
  }
}

export function openReschedule(t) {
  openOverlay((close) => <RescheduleSheet t={t} close={close} />, { kind: 'sheet' });
}
function RescheduleSheet({ t, close }) {
  const [d, setD] = useState(t.dueDate || today());
  const [tm, setTm] = useState(t.dueTime || '');
  const set = (date) => { patch('tasks', t.id, { dueDate: date, dueTime: date ? tm : '', status: t.status === 'deferred' ? 'todo' : t.status }); close(); toast(date ? _t('Rescheduled to {0}', [relDay(date)]) : _t('Moved to Inbox')); };
  const nextMon = addDays(startOfWeek(today(), 1), 7);
  return (
    <>
      <SheetHead title={_t('Reschedule')} sub={t.title} onClose={close} />
      <SheetBody>
        <div class="form">
          <div class="chips">
            <button class="chip" onClick={() => set(today())}>{_t('Today')}</button>
            <button class="chip" onClick={() => set(addDays(today(), 1))}>{_t('Tomorrow')}</button>
            <button class="chip" onClick={() => set(addDays(today(), 2))}>{relDay(addDays(today(), 2))}</button>
            <button class="chip" onClick={() => set(nextMon)}>{_t('Next Monday')}</button>
            <button class="chip" onClick={() => set('')}>{_t('No date (Inbox)')}</button>
          </div>
          <div class="form-row">
            <Field label={_t('Date')} htmlFor="rs-date"><DateInput id="rs-date" value={d} onChange={setD} /></Field>
            <Field label={_t('Time')} htmlFor="rs-time"><TimeInput id="rs-time" value={tm} onChange={setTm} /></Field>
          </div>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>{_t('Cancel')}</button><button class="btn primary" onClick={() => set(d)}>{_t('Save')}</button></SheetFoot>
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
    if (!draft.title.trim()) return toast(_t('Give the task a name first.'), { tone: 'warn' });
    M.newTask({ ...draft, title: draft.title.trim() });
    toast(draft.dueDate ? _t('Added for {0}', [relDay(draft.dueDate)]) : _t('Added to Inbox'));
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
      <SheetHead title={existing ? _t('Task') : _t('New task')} onClose={close} sub={existing ? (live.status === 'done' ? _t('Completed') : _t('Changes save automatically')) : null}
        right={existing && <button class="icon-btn ghost" aria-label={_t('More')} onClick={(e) => taskMenu(e, live)}><Icon name="more" /></button>} />
      <SheetBody>
        <div class="form">
          <Field label={_t('Title')} htmlFor="t-title"><TextInput id="t-title" value={live.title} onInput={(v) => set({ title: v })} placeholder={_t('What needs doing?')} autoFocus={!existing} onEnter={() => !existing && create()} /></Field>
          <div class="form-row">
            <Field label={_t('Due date')} htmlFor="t-due"><DateInput id="t-due" value={live.dueDate} onChange={(v) => set({ dueDate: v, ...(v ? {} : { dueTime: '' }) })} /></Field>
            <Field label={_t('Time (optional)')} htmlFor="t-time"><TimeInput id="t-time" value={live.dueTime} onChange={(v) => set({ dueTime: v })} /></Field>
          </div>
          <div class="chips sm">
            <button class="chip" onClick={() => set({ dueDate: today() })}>{_t('Today')}</button>
            <button class="chip" onClick={() => set({ dueDate: addDays(today(), 1) })}>{_t('Tomorrow')}</button>
            <button class="chip" onClick={() => set({ dueDate: addDays(startOfWeek(today(), 1), 7) })}>{_t('Next week')}</button>
            {live.dueDate && <button class="chip" onClick={() => set({ dueDate: '', dueTime: '' })}>{_t('Inbox')}</button>}
          </div>
          <Field label={_t('Category')}><Chips options={s.categories.map((c) => ({ id: c, label: c, dot: `var(--${catTone(c)})` }))} value={live.category} onChange={(v) => set({ category: v })} /></Field>
          <div class="form-row">
            <Field label={_t('Priority')} htmlFor="t-prio"><Select id="t-prio" value={live.priority} onChange={(v) => set({ priority: v })} options={M.PRIORITIES} /></Field>
            <Field label={_t('Status')} htmlFor="t-status"><Select id="t-status" value={live.status} onChange={(v) => set({ status: v, completedAt: v === 'done' ? live.completedAt || Date.now() : null })} options={M.TASK_STATUSES} /></Field>
          </div>
          <div class="form-row">
            <Field label={_t('Estimate (minutes)')} htmlFor="t-est"><NumberInput id="t-est" value={live.estimate || ''} onChange={(v) => set({ estimate: v || 0 })} step={5} placeholder={_t('e.g. 45')} /></Field>
            <Field label={_t('Repeat')} htmlFor="t-rep"><Select id="t-rep" value={rec?.freq || ''} onChange={(v) => set({ recurrence: v ? { freq: v, interval: rec?.interval || 1 } : null, ...(v && !live.dueDate ? { dueDate: today() } : {}) })} placeholder={_t('Does not repeat')} options={[{ id: 'daily', label: _t('Daily') }, { id: 'weekdays', label: _t('Weekdays') }, { id: 'weekly', label: _t('Weekly') }, { id: 'monthly', label: _t('Monthly') }]} /></Field>
          </div>
          {rec?.freq && rec.freq !== 'weekdays' && (
            <Field label={_t('Repeat every … {0}', [rec.freq === 'daily' ? _t('days') : rec.freq === 'weekly' ? _t('weeks') : _t('months')])} htmlFor="t-int" hint={_t('Completing a repeating task moves it to the next date. No copies are made.')}>
              <NumberInput id="t-int" value={rec.interval || 1} min={1} onChange={(v) => set({ recurrence: { ...rec, interval: Math.max(1, +v || 1) } })} />
            </Field>
          )}
          <Field label={_t('Notes')} htmlFor="t-notes"><TextArea id="t-notes" value={live.notes} onInput={(v) => set({ notes: v })} placeholder={_t('Details, links, context')} /></Field>
          <details class="card soft tight" open={!!(live.goalId || live.contentId || live.projectId || live.invoiceId)}>
            <summary style={{ fontWeight: 800, cursor: 'pointer' }}>{_t('Link to goal, content, project or invoice')}</summary>
            <div class="form" style={{ marginTop: 12 }}>
              <Field label={_t('Goal')} htmlFor="t-goal"><Select id="t-goal" value={live.goalId} onChange={(v) => set({ goalId: v })} placeholder={_t('None')} options={goals.map((g) => ({ id: g.id, label: g.title }))} /></Field>
              <Field label={_t('Content item')} htmlFor="t-content"><Select id="t-content" value={live.contentId} onChange={(v) => set({ contentId: v })} placeholder={_t('None')} options={contents.map((c) => ({ id: c.id, label: c.title }))} /></Field>
              <Field label={_t('Freelance project')} htmlFor="t-project"><Select id="t-project" value={live.projectId} onChange={(v) => set({ projectId: v })} placeholder={_t('None')} options={projects.map((p) => ({ id: p.id, label: `${p.name} · ${M.clientName(p.clientId)}` }))} /></Field>
              <Field label={_t('Invoice')} htmlFor="t-invoice"><Select id="t-invoice" value={live.invoiceId} onChange={(v) => set({ invoiceId: v })} placeholder={_t('None')} options={invoices.map((i) => ({ id: i.id, label: `${i.number} · ${M.clientName(i.clientId)}` }))} /></Field>
            </div>
          </details>
          {existing && (
            <div class="row gap-8 wrap">
              {live.contentId && <button class="btn sm soft" onClick={() => { close(); navigate('/content/item/' + live.contentId); }}><Icon name="video" size={16} />{_t('Open content')}</button>}
              {live.projectId && <button class="btn sm soft" onClick={() => { close(); navigate('/freelance/projects/' + live.projectId); }}><Icon name="briefcase" size={16} />{_t('Open project')}</button>}
              {live.invoiceId && <button class="btn sm soft" onClick={() => { close(); navigate('/freelance/invoices/' + live.invoiceId); }}><Icon name="file" size={16} />{_t('Open invoice')}</button>}
            </div>
          )}
          {existing && (focusTotal > 0 || (live.completions || []).length > 0) && (
            <div class="muted" style={{ fontSize: 13 }}>
              {focusTotal > 0 && <div>{_t('Focused')}{' '}{fmtMinutes(Math.round(focusTotal / 60000)) || '<1m'}{' '}{_t('across')}{' '}{(live.focusSessions || []).length}{' '}{_t('session(s)')}</div>}
              {(live.completions || []).length > 0 && <div>{_t('Completed')}{' '}{(live.completions || []).length}{' '}{_t('time(s)')}</div>}
            </div>
          )}
        </div>
      </SheetBody>
      <SheetFoot>
        {existing ? (
          <>
            {M.isOpen(live) && <button class="btn soft" onClick={() => { M.startFocus(id); close(); }}><Icon name="play" size={14} />{_t('Focus')}</button>}
            {M.isOpen(live) ? <button class="btn primary" onClick={() => { M.completeTask(id); toast(_t('Task done')); close(); }}><Icon name="check" size={16} />{_t('Complete')}</button> : <button class="btn primary" onClick={close}>{_t('Done')}</button>}
          </>
        ) : (
          <>
            <button class="btn ghost" onClick={close}>{_t('Cancel')}</button>
            <button class="btn primary" onClick={create}>{_t('Add task')}</button>
          </>
        )}
      </SheetFoot>
    </>
  );
}

// ---------- pickers ----------
export function pickTask({ title = _t('Pick a task'), filter = () => true, onPick, allowNew = true, newPreset = {} }) {
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
          <input id="pick-q" value={q} placeholder={allowNew ? _t('Search or type a new task') : _t('Search tasks')} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && allowNew && !list.length) createNew(); }} />
        </div>
        {allowNew && q.trim() && <button class="list-row clickable" onClick={createNew}><span class="icon-btn soft sm"><Icon name="plus" size={16} /></span><div class="row-main"><div class="row-title">{_t('Create “')}{q.trim()}”</div><div class="row-meta">{_t('New task for today')}</div></div></button>}
        <div class="list">
          {list.slice(0, 60).map((t) => (
            <button class="list-row clickable" onClick={() => onPick(t)}>
              <Dot tone={catTone(t.category)} />
              <div class="row-main"><div class="row-title">{t.title}</div><div class="row-meta">{t.dueDate ? relDay(t.dueDate) : _t('Inbox')}{t.category ? ' · ' + t.category : ''}</div></div>
            </button>
          ))}
          {!list.length && !q && <div class="muted" style={{ padding: 12 }}>{_t('No open tasks yet. Type above to create one.')}</div>}
        </div>
      </SheetBody>
    </>
  );
}

export function fmtAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return _t('just now');
  if (s < 3600) return _t('{0}m ago', [Math.floor(s / 60)]);
  if (s < 86400) return _t('{0}h ago', [Math.floor(s / 3600)]);
  const d = Math.floor(s / 86400);
  return d === 1 ? _t('yesterday') : _t('{0}d ago', [d]);
}
export { confirmDialog, openSheet };
