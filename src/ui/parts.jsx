import { Icon } from './Icon.jsx';
import { Check } from './kit.jsx';
import { openMenu, toast, openOverlay, SheetHead, SheetBody, SheetFoot, confirmDialog } from './overlay.jsx';
import { navigate } from '../lib/router.js';
import { get, patch } from '../lib/db.js';
import { today, addDays, relDay, fmtShort, fmtMinutes, startOfWeek } from '../lib/date.js';
import { DateInput, TimeInput, Field } from './kit.jsx';
import { useState } from 'preact/hooks';
import * as M from '../lib/model.js';

// ---------- page chrome ----------
export function PageHeader({ eyebrow, title, actions, children, sub }) {
  return (
    <header class="ph">
      <div class="ph-titles">
        {eyebrow && <div class="eyebrow">{eyebrow}</div>}
        <h1 class="ph-title">{title}</h1>
        {sub && <div class="ph-sub">{sub}</div>}
        {children}
      </div>
      {actions && <div class="ph-actions">{actions}</div>}
    </header>
  );
}
export function BackBar({ onBack, right, label = 'Back' }) {
  return (
    <div class="back-row">
      <button class="icon-btn ghost" onClick={onBack} aria-label={label}><Icon name="arrowLeft" size={22} /></button>
      <div class="grow" />
      {right}
    </div>
  );
}
export const AddBtn = ({ onClick, label = 'Add' }) => <button class="fab-inline" aria-label={label} onClick={onClick}><Icon name="plus" size={22} stroke={2} /></button>;

// ---------- pills ----------
export const Pill = ({ tone = 'plain', icon, children, onClick, sm }) => {
  const C = onClick ? 'button' : 'span';
  return <C class={'pill t-' + tone + (sm ? ' sm' : '') + (onClick ? ' clickable' : '')} onClick={onClick}>{icon && <Icon name={icon} size={sm ? 13 : 15} />}{children}</C>;
};
export const StagePill = ({ stage, onClick, sm }) => { const s = M.stageOf(stage); return <Pill tone="glass" icon={stage === 'client_review' || stage === 'revision' ? 'chat' : stage === 'completed' || stage === 'approved' ? 'check' : 'chat'} onClick={onClick} sm={sm}>{s.label}</Pill>; };
export const DeliverablePill = ({ status, onClick }) => { const s = M.deliverableStatus(status); return <Pill tone={s.tone} sm onClick={onClick}>{s.label}</Pill>; };
export const InvoicePill = ({ status }) => <Pill tone={M.INVOICE_TONE[status]} sm>{M.INVOICE_STATUS[status]}</Pill>;

export function stageMenu(e, p) {
  openMenu(e, M.STAGES.map((s) => ({ label: s.label, active: p.stage === s.id, onSelect: () => { M.setStage(p.id, s.id); toast('Stage: ' + s.label); } })), { title: 'Project stage' });
}

// ---------- labels ----------
export function whenLabel(date, time) {
  if (!date) return '';
  return relDay(date) + (time ? ' ' + time : '');
}
export const dateTimeShort = (date, time) => (date ? fmtShort(date) + (time ? ', ' + time : '') : '');

// ---------- task row ----------
export function TaskRow({ t, hideProject, dragProps, compact }) {
  const done = t.status === 'done';
  const overdue = M.isOverdue(t);
  const behind = M.isBehind(t);
  const project = t.projectId && get('pmProjects', t.projectId);
  const sc = M.subtaskCount(t);
  const toggle = (v) => {
    if (v) { M.completeTask(t.id); toast(t.recurrence?.freq ? 'Done. Next one is scheduled.' : 'Task done', { action: t.recurrence?.freq ? null : { label: 'Undo', run: () => M.reopenTask(t.id) } }); }
    else M.reopenTask(t.id);
  };
  const meta = [];
  if (!hideProject && project) meta.push(<span class="m">{project.name}</span>);
  if (t.workDate) meta.push(<span class={'m' + (behind ? ' warn' : '')}>{behind ? 'Not done yet · ' : ''}{whenLabel(t.workDate, t.workTime)}</span>);
  if (t.deadlineDate) meta.push(<span class={'m' + (overdue ? ' bad' : '')}><Icon name="flag" size={12} />{overdue ? 'Overdue · ' : 'Deadline '}{dateTimeShort(t.deadlineDate, t.deadlineTime)}</span>);
  if (t.estimateMinutes) meta.push(<span class="m">{fmtMinutes(t.estimateMinutes)}</span>);
  if (sc.total) meta.push(<span class="m">{sc.done}/{sc.total}</span>);
  if (t.priority === 'high') meta.push(<span class="m strong">High</span>);
  return (
    <div class={'task-row' + (done ? ' done' : '') + (t.status === 'in_progress' ? ' active' : '')} {...(dragProps || {})}>
      <Check checked={done} onChange={toggle} label={done ? 'Mark not done' : 'Complete ' + t.title} />
      <a class="task-main" href={'#/tasks/' + t.id}>
        <span class="task-title">{t.title || 'Untitled task'}</span>
        {!compact && meta.length > 0 && <span class="task-meta">{meta.reduce((a, m, i) => (i ? [...a, <span class="sep">·</span>, m] : [m]), [])}</span>}
      </a>
      <button class="icon-btn ghost sm" aria-label="Task actions" onClick={(e) => taskMenu(e, t)}><Icon name="more" /></button>
    </div>
  );
}

export function taskMenu(e, t) {
  const open = M.isOpen(t);
  const t0 = today();
  openMenu(e, [
    open && { label: 'Start work', icon: 'play', onSelect: () => M.startFocus(t.id) },
    open && { label: t.pinnedOn === t0 ? 'Unpin from today' : 'Pin to today', icon: 'pin', onSelect: () => M.patchTask(t.id, { pinnedOn: t.pinnedOn === t0 ? null : t0 }) },
    open && { label: 'Reschedule…', icon: 'calendar', onSelect: () => openReschedule(t) },
    open && { label: 'Schedule tomorrow', icon: 'chevronRight', onSelect: () => { M.rescheduleWork(t.id, addDays(t0, 1), t.workTime); toast('Work moved to tomorrow. Deadline unchanged.'); } },
    { divider: true },
    open && t.status !== 'deferred' && { label: 'Defer', icon: 'clock', onSelect: () => patch('pmTasks', t.id, { status: 'deferred' }) },
    !open && { label: 'Reopen', icon: 'restore', onSelect: () => M.reopenTask(t.id) },
    { label: 'Archive', icon: 'archive', onSelect: () => { patch('pmTasks', t.id, { archived: true }); toast('Archived', { action: { label: 'Undo', run: () => patch('pmTasks', t.id, { archived: false }) } }); } },
    { label: 'Move to Trash', icon: 'trash', danger: true, onSelect: () => { M.trashTask(t.id); toast('Moved to Trash', { action: { label: 'Undo', run: () => patch('pmTasks', t.id, { deletedAt: null }) } }); } },
  ], { title: t.title });
}

// Reschedule moves the work schedule only.
export function openReschedule(t) { openOverlay((close) => <RescheduleSheet t={t} close={close} />, { kind: 'sheet' }); }
function RescheduleSheet({ t, close }) {
  const [d, setD] = useState(t.workDate || today());
  const [tm, setTm] = useState(t.workTime || '');
  const set = (date, time = tm) => { M.rescheduleWork(t.id, date, date ? time : null); close(); toast(date ? 'Work scheduled ' + whenLabel(date, time) : 'Work schedule cleared'); };
  const nextMon = addDays(startOfWeek(today(), 1), 7);
  return (
    <>
      <SheetHead title="Reschedule work" sub={t.deadlineDate ? 'Deadline stays ' + dateTimeShort(t.deadlineDate, t.deadlineTime) + '.' : t.title} onClose={close} />
      <SheetBody>
        <div class="form">
          <div class="chips">
            <button class="chip" onClick={() => set(today())}>Today</button>
            <button class="chip" onClick={() => set(addDays(today(), 1))}>Tomorrow</button>
            <button class="chip" onClick={() => set(nextMon)}>Next Monday</button>
            <button class="chip" onClick={() => set('')}>No schedule</button>
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

// ---------- pickers ----------
export function pickProject({ onPick, allowNone = true, title = 'Link project' }) {
  openOverlay((close) => <ProjectPicker onPick={(p) => { close(); onPick(p); }} allowNone={allowNone} title={title} close={close} />, { kind: 'sheet' });
}
function ProjectPicker({ onPick, allowNone, title, close }) {
  const [q, setQ] = useState('');
  const list = M.liveProjects().filter((p) => !p.archived && p.stage !== 'completed' && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <SheetHead title={title} onClose={close} />
      <SheetBody>
        <div class="search-box" style={{ marginBottom: 8 }}><Icon name="search" size={18} /><input value={q} placeholder="Search projects" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <div class="list">
          {allowNone && <button class="list-row clickable" onClick={() => onPick(null)}><div class="row-main"><div class="row-title">No project</div></div></button>}
          {list.map((p) => (
            <button class="list-row clickable" onClick={() => onPick(p)}>
              <span class={'swatch t-' + M.stageOf(p.stage).tone} />
              <div class="row-main"><div class="row-title">{p.name}</div><div class="row-meta">{(p.clientId ? M.clientName(p.clientId) + ' · ' : '') + (p.workspace === 'in_house' ? 'In-house' : 'Freelance')}</div></div>
            </button>
          ))}
          {!list.length && <div class="muted" style={{ padding: 12 }}>No active projects yet.</div>}
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
export const workspaceLabel = (w) => (w === 'in_house' ? 'In-house' : 'Freelance');
export { confirmDialog, navigate };
