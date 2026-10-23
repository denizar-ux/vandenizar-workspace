import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, DateInput, TimeInput, NumberInput, Check, Empty, Segmented } from '../ui/kit.jsx';
import { openMenu, toast, confirmDialog, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, BackBar, TaskRow, AddBtn, openReschedule, pickProject, dateTimeShort, whenLabel, fmtAgo, workspaceLabel, categoryFilterMenu } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, all, patch, remove, uid, useStore, persist } from '../lib/db.js';
import { today, addDays, diffDays, relDay, fmtShort, fmtMinutes, fmtFull, isoOf, fmtDuration } from '../lib/date.js';
import { dragHandlers, orderBetween, moveInArray } from '../lib/dnd.js';
import * as M from '../lib/model.js';
import { openQuickAdd } from '../App.jsx';

const MAIN_VIEWS = [{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'inbox', label: 'Inbox' }, { id: 'overdue', label: 'Overdue' }];
const MORE_VIEWS = [{ id: 'all', label: 'All open', icon: 'list' }, { id: 'done', label: 'Done', icon: 'check' }, { id: 'other', label: 'Deferred', icon: 'clock' }, { id: 'archived', label: 'Archived', icon: 'archive' }];
const VIEWS = [...MAIN_VIEWS, ...MORE_VIEWS];
const loadPref = (k, d) => { try { const v = localStorage.getItem('vz:pm:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem('vz:pm:' + k, JSON.stringify(v)); } catch {} };

function viewFilter(view) {
  const t0 = today();
  return (t) => {
    if (view === 'archived') return t.archived && !t.deletedAt;
    if (t.archived || t.deletedAt) return false;
    if (view === 'today') return M.isOpen(t) && (t.workDate === t0 || t.pinnedOn === t0 || t.deadlineDate === t0 || M.isOverdue(t));
    if (view === 'upcoming') return M.isOpen(t) && ((t.workDate && t.workDate > t0) || (!t.workDate && t.deadlineDate && t.deadlineDate > t0));
    if (view === 'inbox') return M.isInbox(t);
    if (view === 'overdue') return M.isOverdue(t);
    if (view === 'all') return M.isOpen(t);
    if (view === 'done') return t.status === 'done' || (t.completions || []).length > 0;
    if (view === 'other') return t.status === 'deferred' || t.status === 'cancelled';
    return true;
  };
}

export function TasksPage({ query }) {
  useStore();
  const [view, setView] = useState(query.view || loadPref('taskView', 'today'));
  const [project, setProject] = useState(loadPref('taskProject', ''));
  const [ws, setWs] = useState(loadPref('taskWs', ''));
  const [prio, setPrio] = useState('');
  const [sort, setSort] = useState(loadPref('taskSort', 'schedule'));
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => { if (query.view) setView(query.view); }, [query.view]);
  useEffect(() => savePref('taskView', view), [view]);
  useEffect(() => savePref('taskSort', sort), [sort]);
  useEffect(() => savePref('taskProject', project), [project]);
  useEffect(() => savePref('taskWs', ws), [ws]);
  const t0 = today();
  const base = all('pmTasks');
  const counts = Object.fromEntries(['today', 'upcoming', 'inbox', 'overdue'].map((v) => [v, base.filter(viewFilter(v)).length]));
  let list = base.filter(viewFilter(view));
  if (project) list = list.filter((t) => (project === 'none' ? !t.projectId : t.projectId === project));
  if (ws) list = list.filter((t) => { const p = t.projectId && get('pmProjects', t.projectId); return p ? M.projectCategoryId(p) === ws : false; });
  if (prio) list = list.filter((t) => t.priority === prio);
  if (q.trim()) { const term = q.toLowerCase(); list = list.filter((t) => (t.title + ' ' + (t.notes || '') + ' ' + (t.subtasks || []).map((s) => s.title).join(' ')).toLowerCase().includes(term)); }
  list = view === 'done' ? [...list].sort((a, b) => (b.completedAt || b.lastCompletedAt || 0) - (a.completedAt || a.lastCompletedAt || 0)) : M.sortTasks(list, sort);
  const filtersOn = project || ws || prio;
  const manual = sort === 'manual' && ['today', 'inbox', 'all'].includes(view);
  const onDrop = ({ id, to, before, after }) => { if (to !== 'tasklist') return; patch('pmTasks', id, { order: orderBetween(after && get('pmTasks', after)?.order, before && get('pmTasks', before)?.order) }); };
  const add = () => {
    const title = draft.trim(); if (!title) return;
    M.newTask({ title, workDate: view === 'today' ? t0 : view === 'upcoming' ? addDays(t0, 1) : null, projectId: project && project !== 'none' ? project : null });
    setDraft('');
  };
  const groups = [];
  if (view === 'upcoming' && sort === 'schedule') {
    const by = {};
    list.forEach((t) => { const d = t.workDate || t.deadlineDate; (by[d] = by[d] || []).push(t); });
    Object.keys(by).sort().forEach((d) => groups.push({ label: relDay(d) + (diffDays(d, t0) > 1 ? ' · ' + fmtShort(d) : ''), items: by[d] }));
  } else groups.push({ label: null, items: list });
  const projects = M.liveProjects().filter((p) => !p.archived);

  return (
    <div class="page narrow">
      <PageHeader title="Tasks." actions={<button class="btn primary sm" onClick={() => openQuickAdd({ when: view === 'inbox' ? 'none' : view === 'upcoming' ? 'tomorrow' : 'today' })}><Icon name="plus" size={16} />Task</button>} />
      <div class="chips scroll">
        {MAIN_VIEWS.map((v) => <button class={'chip ' + (view === v.id ? 'on' : '')} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}{counts[v.id] > 0 && <span class="chip-count">{counts[v.id]}</span>}</button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow"><Icon name="search" size={17} /><input id="task-q" value={q} placeholder="Search tasks" onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (filtersOn ? 'dark' : 'soft')} aria-label="Filters" aria-expanded={filters} onClick={() => setFilters(!filters)}><Icon name="filter" size={18} /></button>
        <button class="icon-btn soft" aria-label="Sort" onClick={(e) => openMenu(e, [{ heading: 'Sort by' }, ...[['schedule', 'Work schedule'], ['deadline', 'Deadline'], ['project', 'Project'], ['manual', 'Manual (drag)']].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>
      </div>
      <div class="row gap-8 wrap">
        <button class="dropdown-pill sm" aria-haspopup="menu" onClick={(e) => categoryFilterMenu(e, ws || 'all', (v) => setWs(v === 'all' ? '' : v))}>{ws && <span class={'cat-dot t-' + M.categoryOf(ws).color} aria-hidden="true" />}{ws ? M.categoryOf(ws).name : 'All categories'}<Icon name="chevronDown" size={14} /></button>
        {ws && <button class="chip on sm" aria-label={'Clear ' + M.categoryOf(ws).name + ' filter'} onClick={() => setWs('')}>{M.categoryOf(ws).name}<Icon name="x" size={13} /></button>}
        <span class="grow" />
        <button class={'dropdown-pill sm' + (MORE_VIEWS.some((v) => v.id === view) ? ' on' : '')} aria-haspopup="menu" onClick={(e) => openMenu(e, MORE_VIEWS.map((v) => ({ label: v.label, icon: v.icon, active: view === v.id, onSelect: () => setView(v.id) })), { title: 'More views' })}>{MORE_VIEWS.find((v) => v.id === view)?.label || 'More'}<Icon name="chevronDown" size={14} /></button>
      </div>
      {filters && (
        <div class="panel">
          <div class="form">
            <div class="form-row three">
              <Field label="Project" htmlFor="tf-p"><Select id="tf-p" value={project} onChange={setProject} placeholder="Any" options={[{ id: 'none', label: 'No project' }, ...projects.map((p) => ({ id: p.id, label: p.name }))]} /></Field>
              <Field label="Category" htmlFor="tf-w"><Select id="tf-w" value={ws} onChange={setWs} placeholder="Any" options={M.categories().map((c) => ({ id: c.id, label: c.name }))} /></Field>
              <Field label="Priority" htmlFor="tf-pr"><Select id="tf-pr" value={prio} onChange={setPrio} placeholder="Any" options={[{ id: 'high', label: 'High' }, { id: 'normal', label: 'Normal' }]} /></Field>
            </div>
            {filtersOn && <button class="btn sm outline" style={{ alignSelf: 'flex-start' }} onClick={() => { setProject(''); setWs(''); setPrio(''); }}>Clear filters</button>}
          </div>
        </div>
      )}
      <section class="sheet-surface">
        {!['done', 'other', 'archived', 'overdue'].includes(view) && (
          <div class="inline-add">
            <Icon name="plus" size={18} />
            <input id="task-quick" value={draft} placeholder={view === 'inbox' ? 'Capture to Inbox' : view === 'upcoming' ? 'Add a task for tomorrow' : view === 'today' ? 'Add a task for today' : 'Add a task'} onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} />
            {draft.trim() && <button class="btn sm primary" onClick={add}>Add</button>}
          </div>
        )}
        {list.length === 0 ? (
          <Empty icon={view === 'inbox' ? 'inbox' : 'check'} title={filtersOn || q ? 'No tasks match' : { today: 'Nothing planned for today', inbox: 'Inbox is empty', overdue: 'Nothing overdue', upcoming: 'Nothing coming up' }[view] || 'No tasks here'}>
            {view === 'inbox' && !filtersOn ? 'Tasks without a schedule or deadline land here until you plan them.' : null}
          </Empty>
        ) : groups.map((g) => (
          <div>
            {g.label && <div class="group-label">{g.label}</div>}
            <div class="tlist" data-drop={manual ? 'tasklist' : undefined}>
              {g.items.map((t) => <TaskRow t={t} hideProject={!!project && project !== 'none'} dragProps={manual ? dragHandlers(t.id, onDrop, { accept: (k) => k === 'tasklist' }) : null} />)}
            </div>
          </div>
        ))}
      </section>
      {view === 'archived' && list.length > 0 && <button class="btn outline" style={{ alignSelf: 'flex-start' }} onClick={() => { list.forEach((t) => patch('pmTasks', t.id, { archived: false })); toast('Restored'); }}>Restore all archived</button>}
    </div>
  );
}

// =====================================================================
// TASK DETAIL
// =====================================================================
export function TaskDetail({ id }) {
  useStore();
  const t = get('pmTasks', id);
  const desktop = useMedia(DESKTOP_Q);
  const [more, setMore] = useState(false);
  const [stepDraft, setStepDraft] = useState('');
  const [, tick] = useState(0);
  const focusing = M.focusTask()?.id === id;
  useEffect(() => { if (!focusing) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [focusing]);
  if (!t || t.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/tasks')} /><Empty icon="tasks" title="This task is gone" action={<a class="btn primary sm" href="#/tasks">All tasks</a>}>It may be in Trash.</Empty></div>;
  const set = (ch) => M.patchTask(id, ch);
  const project = t.projectId && get('pmProjects', t.projectId);
  const sc = M.subtaskCount(t);
  const saveState = persist.status === 'error' ? 'Not saved' : persist.status === 'saving' ? 'Saving…' : 'Saved';
  const subs = [...(t.subtasks || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const setSub = (sid, ch) => set({ subtasks: subs.map((s) => (s.id === sid ? { ...s, ...ch } : s)) });
  const addStep = () => { const v = stepDraft.trim(); if (!v) return; set({ subtasks: [...subs, { id: uid(), title: v, done: false, order: subs.length }] }); setStepDraft(''); };
  const del = async () => { M.trashTask(id); toast('Moved to Trash', { action: { label: 'Undo', run: () => patch('pmTasks', id, { deletedAt: null }) } }); back('/tasks'); };
  const invoices = M.liveInvoices().filter((i) => !i.archived || i.id === t.invoiceId);
  const rec = t.recurrence || null;
  const listKey = 'steps-' + id;

  const Main = (
    <>
      <div class="field-pair">
        <Field label="Work schedule (optional)">
          <div class="dt-pair"><DateInput id="td-wd" value={t.workDate} onChange={(v) => set({ workDate: v || null, ...(v ? {} : { workTime: null }) })} /><TimeInput id="td-wt" value={t.workTime} onChange={(v) => set({ workTime: v || null, ...(v && !t.workDate ? { workDate: today() } : {}) })} /></div>
        </Field>
        <Field label="Deadline">
          <div class="dt-pair"><DateInput id="td-dd" value={t.deadlineDate} onChange={(v) => set({ deadlineDate: v || null, ...(v ? {} : { deadlineTime: null }) })} /><TimeInput id="td-dt" value={t.deadlineTime} onChange={(v) => set({ deadlineTime: v || null })} /></div>
        </Field>
      </div>
      <div class="field-pair">
        <Field label="Estimate (minutes)" htmlFor="td-est"><NumberInput id="td-est" value={t.estimateMinutes || ''} onChange={(v) => set({ estimateMinutes: v ? +v : null })} step={15} placeholder="e.g. 90" /></Field>
        <Field label="Status" htmlFor="td-st"><Select id="td-st" value={t.status === 'inbox' ? 'open' : t.status} onChange={(v) => { if (v === 'done') M.completeTask(id); else set({ status: v, completedAt: null }); }} options={M.TASK_STATUSES} /></Field>
      </div>
      <section class="block">
        <div class="block-head"><h2 class="block-title">Subtasks <span class="count">{sc.done}/{sc.total}</span></h2></div>
        <div class="steps" data-drop={listKey}>
          {subs.map((s) => (
            <div class={'step' + (s.done ? ' done' : '')} {...dragHandlers(s.id, ({ to, index }) => { if (to === listKey) set({ subtasks: moveInArray(subs, s.id, index).map((x, i) => ({ ...x, order: i })) }); }, { accept: (k) => k === listKey })}>
              <Check checked={s.done} onChange={(v) => setSub(s.id, { done: v })} label={(s.done ? 'Undo ' : 'Complete ') + s.title} />
              <input class="step-text" value={s.title} onInput={(e) => setSub(s.id, { title: e.currentTarget.value })} aria-label="Subtask" />
              <button class="icon-btn ghost xs" aria-label={'Remove ' + s.title} onClick={() => set({ subtasks: subs.filter((x) => x.id !== s.id) })}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div class="step-add"><Icon name="plus" size={16} /><input value={stepDraft} placeholder="Add step" onInput={(e) => setStepDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addStep(); } }} aria-label="Add step" />{stepDraft.trim() && <button class="btn xs primary" onClick={addStep}>Add</button>}</div>
      </section>
      <Field label="Notes" htmlFor="td-notes"><TextArea id="td-notes" value={t.notes} onInput={(v) => set({ notes: v })} placeholder="Context, references, what done looks like" minRows={3} /></Field>
      <div class="row gap-10 wrap" style={{ alignItems: 'center' }}>
        <button class="btn outline" onClick={() => openReschedule(t)}><Icon name="calendar" size={16} />Reschedule</button>
        {t.deadlineDate && <span class="muted" style={{ fontSize: 14 }}>Deadline stays {dateTimeShort(t.deadlineDate, t.deadlineTime)}.</span>}
      </div>
      <details class="more-details" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
        <summary>More details<Icon name="chevronDown" size={16} /></summary>
        <div class="form" style={{ marginTop: 12 }}>
          <div class="field-pair">
            <Field label="Priority"><Segmented options={[{ id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }]} value={t.priority || 'normal'} onChange={(v) => set({ priority: v })} /></Field>
            <Field label="Today"><button class={'btn ' + (t.pinnedOn === today() ? 'primary' : 'outline')} onClick={() => set({ pinnedOn: t.pinnedOn === today() ? null : today() })}><Icon name="pin" size={15} />{t.pinnedOn === today() ? 'Pinned to today' : 'Pin to today'}</button></Field>
          </div>
          <div class="field-pair">
            <Field label="Repeat" htmlFor="td-rep"><Select id="td-rep" value={rec?.freq || ''} onChange={(v) => set({ recurrence: v ? { freq: v, interval: rec?.interval || 1 } : null, ...(v && !t.workDate ? { workDate: today() } : {}) })} placeholder="Does not repeat" options={[{ id: 'daily', label: 'Daily' }, { id: 'weekdays', label: 'Weekdays' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }]} /></Field>
            <Field label="Invoice" htmlFor="td-inv"><Select id="td-inv" value={t.invoiceId || ''} onChange={(v) => set({ invoiceId: v || null })} placeholder="None" options={invoices.map((i) => ({ id: i.id, label: i.number + ' · ' + M.clientName(i.clientId) }))} /></Field>
          </div>
          {rec?.freq && <div class="field-hint">Completing moves the work schedule to the next date. No copies are made.</div>}
          <div class="muted" style={{ fontSize: 13 }}>Created {fmtFull(isoOf(t.createdAt))} · changed {fmtAgo(t.updatedAt)}{M.focusedMinutes(t) ? ' · worked ' + fmtMinutes(M.focusedMinutes(t)) : ''}</div>
          <div class="row gap-8 wrap">
            <button class="btn outline sm" onClick={() => { patch('pmTasks', id, { archived: !t.archived }); toast(t.archived ? 'Restored' : 'Archived'); }}><Icon name="archive" size={15} />{t.archived ? 'Unarchive' : 'Archive'}</button>
            <button class="btn danger-soft sm" onClick={del}><Icon name="trash" size={15} />Move to Trash</button>
          </div>
        </div>
      </details>
    </>
  );

  return (
    <div class="page narrow task-detail">
      <BackBar onBack={() => back('/tasks')} right={<span class={'save-chip ' + persist.status}><Icon name={persist.status === 'error' ? 'alert' : 'check'} size={14} />{saveState}</span>} />
      <textarea class="title-input" rows={1} value={t.title} aria-label="Task title" placeholder="Task title"
        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
        onInput={(e) => set({ title: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
      <div class="row gap-8 wrap">
        <button class={'pill clickable ' + (project ? 't-butter' : 't-plain')} onClick={() => pickProject({ onPick: (p) => set({ projectId: p ? p.id : null }) })}><Icon name="folder" size={15} />{project ? project.name : 'Link project'}</button>
        {project && <a class="pill clickable t-plain" href={'#/projects/' + project.id}>Open project<Icon name="arrowRight" size={13} /></a>}
        {M.isOverdue(t) && <span class="pill t-rose">Overdue</span>}
        {M.isBehind(t) && <span class="pill t-butter">Not done yet</span>}
        {t.status === 'done' && <span class="pill t-sage"><Icon name="check" size={13} />Done</span>}
      </div>
      <div class="form">{Main}</div>
      <div class={'action-bar' + (desktop ? ' inline' : '')}>
        {t.status === 'done' ? <button class="btn outline grow lg" onClick={() => M.reopenTask(id)}><Icon name="restore" size={16} />Reopen</button> : <>
          {focusing
            ? <button class="btn primary grow lg" onClick={() => { M.stopFocus(); toast('Paused'); }}><Icon name="pause" size={14} />Pause · <span class="tnum">{fmtDuration(Date.now() - t.focusStartedAt)}</span></button>
            : <button class="btn primary grow lg" onClick={() => M.startFocus(id)}><Icon name="play" size={15} />Start work</button>}
          <button class="btn outline grow lg" onClick={() => { M.completeTask(id); toast('Task done', { action: { label: 'Undo', run: () => M.reopenTask(id) } }); }}><Icon name="check" size={16} />Done</button>
        </>}
      </div>
    </div>
  );
}
export { navigate, confirmDialog, remove, whenLabel, workspaceLabel };
