import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, DateInput, TimeInput, Segmented, Empty, LinksEditor, Check } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, BackBar, AddBtn, Pill, StagePill, DeliverablePill, InvoicePill, TaskRow, stageMenu, dateTimeShort, whenLabel, workspaceLabel } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, fmtShort, isoOf, relDay, fmtFull } from '../lib/date.js';
import { fmtMoney } from '../lib/money.js';
import * as M from '../lib/model.js';
import { openClientSheet } from './clients.jsx';
import { createInvoiceAndOpen } from './invoices.jsx';
import { openSearch } from '../App.jsx';

const loadPref = (k, d) => { try { const v = localStorage.getItem('vz:pm:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem('vz:pm:' + k, JSON.stringify(v)); } catch {} };

export function ProjectsPage() {
  useStore();
  const [tab, setTab] = useState(loadPref('projTab', 'active'));
  const [ws, setWs] = useState(loadPref('projWs', 'all'));
  useEffect(() => savePref('projTab', tab), [tab]);
  useEffect(() => savePref('projWs', ws), [ws]);
  const all0 = M.liveProjects();
  const groups = {
    active: all0.filter((p) => !p.archived && p.stage !== 'completed'),
    completed: all0.filter((p) => !p.archived && p.stage === 'completed'),
    archived: all0.filter((p) => p.archived),
  };
  let list = groups[tab] || groups.active;
  if (ws !== 'all') list = list.filter((p) => p.workspace === ws);
  const dateKey = (p) => M.projectDate(p)?.date || '9999';
  list = [...list].sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || (b.updatedAt || 0) - (a.updatedAt || 0));
  return (
    <div class="page">
      <PageHeader title="Projects." actions={<div class="row gap-8"><button class="icon-btn ghost" aria-label="Search" onClick={() => openSearch()}><Icon name="search" size={22} /></button><AddBtn label="New project" onClick={() => openProjectSheet()} /></div>} />
      <Segmented class="full" options={[{ id: 'active', label: 'Active', count: groups.active.length }, { id: 'completed', label: 'Completed' }, { id: 'archived', label: 'Archived' }]} value={tab} onChange={setTab} />
      <div class="chips">
        {[['all', 'All'], ['in_house', 'In-house'], ['freelance', 'Freelance']].map(([id, label]) => <button class={'chip ' + (ws === id ? 'on' : '')} onClick={() => setWs(id)}>{label}</button>)}
      </div>
      {list.length ? <div class="pgrid">{list.map((p) => <ProjectCard p={p} />)}</div>
        : <Empty icon="folder" title={tab === 'active' ? 'No active projects' : tab === 'completed' ? 'Nothing completed yet' : 'No archived projects'} action={tab === 'active' && <button class="btn primary sm" onClick={() => openProjectSheet()}><Icon name="plus" size={15} />New project</button>}>{tab === 'active' ? 'Start one for each job: in-house campaign or freelance client.' : null}</Empty>}
      <div class="quiet-note center"><Icon name="info" size={14} />Project status follows its work stage.</div>
    </div>
  );
}

function ProjectCard({ p }) {
  const tone = M.stageOf(p.stage).tone;
  const d = M.projectDate(p);
  const next = M.nextActionTask(p);
  const who = p.clientId ? M.clientName(p.clientId) : '';
  const nextText = p.stage === 'client_review' ? (p.followUpDate ? 'Follow-up ' + relDay(p.followUpDate).toLowerCase() : 'Waiting on client') : next ? next.title : 'Add the next task';
  return (
    <a class={'pcard t-' + tone} href={'#/projects/' + p.id}>
      <div class="row between gap-8" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}><div class="pcard-title">{p.name || 'Untitled project'}</div><div class="pcard-sub">{[who, workspaceLabel(p.workspace)].filter(Boolean).join(' · ')}</div></div>
        <span class="circle-btn" aria-hidden="true"><Icon name="arrowRight" size={18} /></span>
      </div>
      <div class="row between gap-8 wrap">
        <StagePill stage={p.stage} sm />
        {d && <span class="pcard-date"><Icon name="calendar" size={15} />{d.label} {fmtShort(d.date)}</span>}
      </div>
      <div class="pcard-next"><span class="dot" />Next: <b>{nextText}</b></div>
    </a>
  );
}

// ---------- new project ----------
export function openProjectSheet(preset = {}) { openOverlay((close) => <ProjectSheet preset={preset} close={close} />, { kind: 'sheet' }); }
function ProjectSheet({ preset, close }) {
  useStore();
  const s = M.settings();
  const tpls = all('templates').filter((t) => t.kind === 'project' && !t.archived);
  const [p, setP] = useState({ name: '', workspace: preset.workspace || s.defaultWorkspace, clientId: preset.clientId || '', stage: 'planned', deadlineDate: '', shootDate: '', templateId: '' });
  const set = (ch) => setP({ ...p, ...ch });
  const clients = M.liveClients().filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  const save = () => {
    if (!p.name.trim()) return toast('Name the project first.', { tone: 'warn' });
    const tpl = tpls.find((x) => x.id === p.templateId);
    const applied = tpl ? M.applyProjectTemplate(tpl) : { deliverables: [], _tasks: [] };
    const pr = M.newProject({ name: p.name.trim(), workspace: p.workspace, clientId: p.clientId || null, stage: p.stage, deadlineDate: p.deadlineDate || null, shootDate: p.shootDate || null, deliverables: applied.deliverables });
    (applied._tasks || []).forEach((title, i) => M.newTask({ title, projectId: pr.id, order: Date.now() + i }));
    toast('Project created');
    close();
    navigate('/projects/' + pr.id);
  };
  return (
    <>
      <SheetHead title="New project" onClose={close} />
      <SheetBody><div class="form">
        <Field label="Project name" htmlFor="np-name"><TextInput id="np-name" value={p.name} onInput={(v) => set({ name: v })} placeholder="e.g. Raya lookbook" autoFocus onEnter={save} /></Field>
        <Field label="Workspace"><Segmented class="full" options={[{ id: 'in_house', label: 'In-house' }, { id: 'freelance', label: 'Freelance' }]} value={p.workspace} onChange={(v) => set({ workspace: v })} /></Field>
        <Field label="Client or brand" htmlFor="np-client">
          <div class="row gap-6">
            <div class="grow"><Select id="np-client" value={p.clientId} onChange={(v) => set({ clientId: v })} placeholder={clients.length ? 'Choose' : 'No clients yet'} options={clients.map((c) => ({ id: c.id, label: c.name }))} /></div>
            <button class="btn outline" onClick={() => openClientSheet(null, (c) => set({ clientId: c.id }))}><Icon name="plus" size={15} />New</button>
          </div>
        </Field>
        <div class="form-row">
          <Field label="Stage" htmlFor="np-stage"><Select id="np-stage" value={p.stage} onChange={(v) => set({ stage: v })} options={M.STAGES.map((x) => ({ id: x.id, label: x.label }))} /></Field>
          <Field label="Deadline" htmlFor="np-dl"><DateInput id="np-dl" value={p.deadlineDate} onChange={(v) => set({ deadlineDate: v })} /></Field>
        </div>
        <Field label="Shoot date (optional)" htmlFor="np-sh"><DateInput id="np-sh" value={p.shootDate} onChange={(v) => set({ shootDate: v })} /></Field>
        {tpls.length > 0 && <Field label="Start from template" htmlFor="np-tpl"><Select id="np-tpl" value={p.templateId} onChange={(v) => set({ templateId: v })} placeholder="No template" options={tpls.map((t) => ({ id: t.id, label: t.name }))} /></Field>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Create project</button></SheetFoot>
    </>
  );
}

// ---------- feedback ----------
export function openFeedbackSheet(p, opts = {}) { openOverlay((close) => <FeedbackSheet p={p} {...opts} close={close} />, { kind: 'sheet' }); }
function FeedbackSheet({ p, close, received }) {
  const [text, setText] = useState('');
  const [deliverableId, setDeliverableId] = useState('');
  const [source, setSource] = useState('client');
  const [makeTasks, setMakeTasks] = useState(true);
  const save = () => {
    const notes = text.split('\n').map((x) => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
    if (!notes.length) return toast('Write at least one note.', { tone: 'warn' });
    M.recordFeedback(p.id, notes, { deliverableId: deliverableId || null, source, makeTasks });
    toast(makeTasks ? notes.length + ' revision task' + (notes.length === 1 ? '' : 's') + ' added' : 'Feedback saved');
    close();
  };
  return (
    <>
      <SheetHead title={received ? 'Feedback received' : 'Record feedback'} sub={p.name} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Notes, one per line" htmlFor="fb-text"><TextArea id="fb-text" value={text} onInput={setText} placeholder={'Product color is too warm.\nShorten the intro by 2 seconds.'} minRows={4} autoFocus /></Field>
        <div class="form-row">
          <Field label="Deliverable" htmlFor="fb-dv"><Select id="fb-dv" value={deliverableId} onChange={setDeliverableId} placeholder="Whole project" options={(p.deliverables || []).map((d) => ({ id: d.id, label: d.title }))} /></Field>
          <Field label="From"><Segmented options={[{ id: 'client', label: 'Client' }, { id: 'internal', label: 'Internal' }]} value={source} onChange={setSource} /></Field>
        </div>
        <label class="check-line"><Check checked={makeTasks} onChange={setMakeTasks} label="Create a revision task for each note" /><span>Create a revision task for each note</span></label>
        {source === 'client' && <div class="field-hint">The project moves to Revision. Follow-up is cleared.</div>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Save feedback</button></SheetFoot>
    </>
  );
}

// =====================================================================
// PROJECT DETAIL
// =====================================================================
export function ProjectDetail({ id }) {
  useStore();
  const p = get('pmProjects', id);
  const desktop = useMedia(DESKTOP_Q);
  const [tab, setTab] = useState('work');
  useEffect(() => { if (p) M.touchRecent('project', id); }, [id]);
  if (!p || p.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/projects')} /><Empty icon="folder" title="Project not found" action={<a class="btn sm primary" href="#/projects">All projects</a>} /></div>;
  const set = (ch) => patch('pmProjects', id, ch);
  const money = M.projectMoney(id);
  const del = async () => {
    if (money.invoices.length) {
      if (await confirmDialog({ title: 'This project has invoices', body: 'Deleting it would orphan its billing history. Archive it instead?', confirmLabel: 'Archive project' })) { set({ archived: true }); toast('Archived'); }
      return;
    }
    if (await confirmDialog({ title: 'Delete ' + (p.name || 'this project') + '?', body: 'The project moves to Trash. Its tasks stay and lose the link.', confirmLabel: 'Delete', danger: true })) {
      M.projectTasks(id).forEach((t) => patch('pmTasks', t.id, { projectId: null }));
      set({ deletedAt: Date.now() });
      toast('Moved to Trash', { action: { label: 'Undo', run: () => set({ deletedAt: null }) } });
      back('/projects');
    }
  };
  const menu = (e) => openMenu(e, [
    { label: 'Add task', icon: 'plus', onSelect: () => M.newTask({ title: 'New task', projectId: id }) && toast('Task added') },
    { label: 'Record feedback', icon: 'chat', onSelect: () => openFeedbackSheet(p) },
    p.workspace === 'freelance' && { label: 'Create invoice', icon: 'file', onSelect: () => createInvoiceAndOpen({ projectId: id, clientId: p.clientId || '' }) },
    { divider: true },
    p.archived ? { label: 'Restore from archive', icon: 'restore', onSelect: () => set({ archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { set({ archived: true }); toast('Archived', { action: { label: 'Undo', run: () => set({ archived: false }) } }); } },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
  ], { title: p.name });
  const freelance = p.workspace === 'freelance';
  const eyebrow = [p.clientId ? M.clientName(p.clientId) : null, workspaceLabel(p.workspace)].filter(Boolean).join(' / ');
  const tabs = [{ id: 'work', label: 'Work' }, { id: 'brief', label: 'Brief & files' }, ...(freelance ? [{ id: 'billing', label: 'Billing' }] : [])];
  const cur = tabs.some((t) => t.id === tab) ? tab : 'work';
  return (
    <div class="page project-page">
      <BackBar onBack={() => back('/projects')} right={<button class="icon-btn ghost" aria-label="Project actions" onClick={menu}><Icon name="more" size={22} /></button>} />
      <div class="eyebrow">{eyebrow}{p.archived ? ' · Archived' : ''}</div>
      <textarea class="title-input" rows={1} value={p.name} aria-label="Project name" placeholder="Project name"
        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
        onInput={(e) => set({ name: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
      <div class="row between gap-10" style={{ alignItems: 'flex-end' }}>
        <button class={'pill clickable t-' + M.stageOf(p.stage).tone} onClick={(e) => stageMenu(e, p)}><Icon name="chat" size={15} />{M.stageOf(p.stage).label}<Icon name="chevronDown" size={14} /></button>
        <div class="deadline-mini"><Icon name="calendar" size={18} /><div><span>Deadline</span><b>{p.deadlineDate ? dateTimeShort(p.deadlineDate, p.deadlineTime) : 'None'}</b></div></div>
      </div>
      {desktop ? (
        <div class="two-col">
          <div class="stack"><WorkTab p={p} /></div>
          <div class="stack"><BriefTab p={p} compact />{freelance && <BillingTab p={p} money={money} />}</div>
        </div>
      ) : (
        <>
          <Segmented class="full" options={tabs} value={cur} onChange={setTab} />
          {cur === 'work' && <WorkTab p={p} />}
          {cur === 'brief' && <BriefTab p={p} />}
          {cur === 'billing' && <BillingTab p={p} money={money} />}
        </>
      )}
    </div>
  );
}

function StatusBanner({ p }) {
  const set = (ch) => patch('pmProjects', p.id, ch);
  const open = M.projectFeedback(p.id).filter((f) => !f.resolvedAt && f.source === 'client');
  if (p.stage === 'client_review') return (
    <div class="status-banner t-lavender">
      <Icon name="chat" size={20} />
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="sb-title">{p.previewSentAt ? 'Preview sent ' + fmtShort(isoOf(p.previewSentAt)) : 'Waiting for feedback'}</div>
        <label class="sb-sub row gap-6" for="fu-date">Follow-up: {p.followUpDate ? (p.followUpDate <= today() ? <b>{p.followUpDate < today() ? relDay(p.followUpDate) + ' (late)' : 'today'}</b> : relDay(p.followUpDate)) : 'not set'}
          <input id="fu-date" type="date" class="mini-date" value={p.followUpDate || ''} onChange={(e) => set({ followUpDate: e.currentTarget.value || null })} aria-label="Follow-up date" /></label>
      </div>
      <button class="btn primary sm" onClick={() => openFeedbackSheet(p, { received: true })}>Mark feedback received</button>
    </div>
  );
  if (p.stage === 'revision') return (
    <div class="status-banner t-rose">
      <Icon name="chat" size={20} />
      <div class="grow"><div class="sb-title">Revision requested</div><div class="sb-sub">{open.length ? open.length + ' open note' + (open.length === 1 ? '' : 's') : 'All notes handled'}</div></div>
      <button class="btn primary sm" onClick={() => { M.setStage(p.id, 'client_review'); toast('Sent back for review'); }}>Send new preview</button>
    </div>
  );
  return null;
}

function WorkTab({ p }) {
  const pr = M.projectProgress(p);
  const tasks = M.sortTasks(M.projectTasks(p.id), 'schedule');
  const openTasks = tasks.filter(M.isOpen);
  const doneTasks = tasks.filter((t) => !M.isOpen(t));
  const next = M.nextActionTask(p);
  const fb = M.projectFeedback(p.id);
  const [draft, setDraft] = useState('');
  const [dvDraft, setDvDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const addTask = () => { const v = draft.trim(); if (!v) return; M.newTask({ title: v, projectId: p.id }); setDraft(''); };
  const setDv = (did, ch) => patch('pmProjects', p.id, { deliverables: (p.deliverables || []).map((d) => (d.id === did ? { ...d, ...ch, updatedAt: Date.now() } : d)) });
  const addDv = () => { const v = dvDraft.trim(); if (!v) return; patch('pmProjects', p.id, { deliverables: [...(p.deliverables || []), { id: uid(), title: v, spec: '', status: 'not_started', feedback: '', updatedAt: Date.now() }] }); setDvDraft(''); };
  const dvMenu = (e, d) => openMenu(e, [
    { heading: 'Status' },
    ...M.DELIVERABLE_STATUSES.map((s) => ({ label: s.label, active: d.status === s.id, onSelect: () => setDv(d.id, { status: s.id }) })),
    { divider: true },
    { label: 'Record feedback on this', icon: 'chat', onSelect: () => openFeedbackSheet(p) },
    { label: 'Remove', icon: 'trash', danger: true, onSelect: () => patch('pmProjects', p.id, { deliverables: (p.deliverables || []).filter((x) => x.id !== d.id) }) },
  ], { title: d.title });
  return (
    <>
      <StatusBanner p={p} />
      <div class="progress-line">
        <span><b>{pr.tasksDone}</b> of {pr.tasksTotal} tasks done</span>
        <span><b>{pr.approved}</b> of {pr.deliverables} deliverable{pr.deliverables === 1 ? '' : 's'} approved</span>
      </div>
      {next && (
        <section class="next-card">
          <div class="row between gap-8"><div><div class="eyebrow">Next action</div><a class="next-title" href={'#/tasks/' + next.id}>{next.title}</a></div><a class="circle-btn" href={'#/tasks/' + next.id} aria-label="Open next action"><Icon name="arrowRight" size={18} /></a></div>
          <NextSteps t={next} />
          <div class="hero-facts">
            <div class="fact"><Icon name="calendar" size={18} /><div><span class="fact-label">Work schedule</span><span class="fact-value">{next.workDate ? whenLabel(next.workDate, next.workTime) : 'Not scheduled'}</span></div></div>
            <div class="fact"><Icon name="clock" size={18} /><div><span class="fact-label">Deadline</span><span class={'fact-value' + (M.isOverdue(next) ? ' bad' : '')}>{next.deadlineDate ? dateTimeShort(next.deadlineDate, next.deadlineTime) : 'None'}</span></div></div>
          </div>
        </section>
      )}
      <section class="block">
        <div class="block-head"><h2 class="block-title">Deliverables</h2></div>
        <div class="dlist">
          {(p.deliverables || []).map((d) => (
            <div class="drow">
              <span class="drow-ic"><Icon name="play" size={12} /></span>
              <input class="drow-title" value={d.title} onInput={(e) => setDv(d.id, { title: e.currentTarget.value })} aria-label="Deliverable" />
              <DeliverablePill status={d.status} onClick={(e) => dvMenu(e, d)} />
            </div>
          ))}
          <div class="step-add"><Icon name="plus" size={16} /><input value={dvDraft} placeholder="Add deliverable, e.g. Cutdown 15s" onInput={(e) => setDvDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDv(); } }} aria-label="Add deliverable" />{dvDraft.trim() && <button class="btn xs primary" onClick={addDv}>Add</button>}</div>
        </div>
      </section>
      <section class="block">
        <div class="block-head"><h2 class="block-title">Tasks <span class="count">{openTasks.length} open</span></h2></div>
        <div class="sheet-surface">
          <div class="inline-add"><Icon name="plus" size={18} /><input value={draft} placeholder="Add a task to this project" onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTask(); } }} aria-label="Add a task to this project" />{draft.trim() && <button class="btn sm primary" onClick={addTask}>Add</button>}</div>
          {openTasks.length ? <div class="tlist">{openTasks.map((t) => <TaskRow t={t} hideProject />)}</div> : <div class="quiet-note">No open tasks.</div>}
          {doneTasks.length > 0 && <button class="link-quiet" style={{ marginTop: 8 }} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {doneTasks.length} done</button>}
          {showDone && <div class="tlist">{doneTasks.map((t) => <TaskRow t={t} hideProject />)}</div>}
        </div>
      </section>
      <section class="block">
        <div class="block-head"><h2 class="block-title">Feedback</h2><button class="btn xs outline" onClick={() => openFeedbackSheet(p)}><Icon name="plus" size={14} />Record feedback</button></div>
        {fb.length ? <div class="fblist">{fb.map((f) => <FeedbackRow f={f} p={p} />)}</div> : <div class="quiet-note">Client and internal notes land here. Each one can become a revision task.</div>}
      </section>
    </>
  );
}
function NextSteps({ t }) {
  const subs = [...(t.subtasks || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!subs.length) return null;
  const set = (sid, ch) => M.patchTask(t.id, { subtasks: subs.map((s) => (s.id === sid ? { ...s, ...ch } : s)) });
  return (
    <div class="steps compact">
      <div class="muted" style={{ fontSize: 13 }}>{subs.filter((s) => s.done).length} of {subs.length} steps done</div>
      {subs.slice(0, 4).map((s) => <div class={'step' + (s.done ? ' done' : '')}><Check checked={s.done} onChange={(v) => set(s.id, { done: v })} label={s.title} /><span class="step-text">{s.title}</span></div>)}
    </div>
  );
}
function FeedbackRow({ f, p }) {
  const dv = f.deliverableId && (p.deliverables || []).find((d) => d.id === f.deliverableId);
  const task = f.taskId && get('pmTasks', f.taskId);
  return (
    <div class={'fbrow' + (f.resolvedAt ? ' resolved' : '')}>
      <Icon name="chat" size={18} />
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="fb-text">{f.text}</div>
        <div class="fb-meta">{f.source === 'client' ? 'Client' : 'Internal'}{dv ? ' · ' + dv.title : ''} · {fmtShort(isoOf(f.createdAt))}{task ? <> · <a href={'#/tasks/' + task.id}>{task.status === 'done' ? 'task done' : 'task open'}</a></> : ''}</div>
      </div>
      <div class="row gap-4">
        {!task && !f.resolvedAt && <button class="btn xs outline" onClick={() => { const t = M.createRevisionTask(f); toast('Revision task added', { action: { label: 'Open', run: () => navigate('/tasks/' + t.id) } }); }}>Make task</button>}
        <button class="icon-btn ghost sm" aria-label={f.resolvedAt ? 'Mark open' : 'Mark resolved'} title={f.resolvedAt ? 'Mark open' : 'Mark resolved'} onClick={() => patch('feedback', f.id, { resolvedAt: f.resolvedAt ? null : Date.now() })}><Icon name={f.resolvedAt ? 'restore' : 'check'} size={16} /></button>
        <button class="icon-btn ghost sm" aria-label="Delete note" onClick={() => { const copy = { ...f }; remove('feedback', f.id); toast('Note deleted', { action: { label: 'Undo', run: () => put('feedback', copy) } }); }}><Icon name="x" size={15} /></button>
      </div>
    </div>
  );
}

function BriefTab({ p, compact }) {
  const set = (ch) => patch('pmProjects', p.id, ch);
  const clients = M.liveClients().filter((c) => !c.archived || c.id === p.clientId);
  return (
    <>
      <section class="block">
        {compact && <div class="block-head"><h2 class="block-title">Brief & files</h2></div>}
        <div class="form">
          <Field label="Workspace"><Segmented class="full" options={[{ id: 'in_house', label: 'In-house' }, { id: 'freelance', label: 'Freelance' }]} value={p.workspace} onChange={(v) => set({ workspace: v })} /></Field>
          <Field label="Client or brand" htmlFor="pd-client">
            <div class="row gap-6">
              <div class="grow"><Select id="pd-client" value={p.clientId || ''} onChange={(v) => set({ clientId: v || null })} placeholder="None" options={clients.map((c) => ({ id: c.id, label: c.name }))} /></div>
              {p.clientId ? <a class="icon-btn soft" href={'#/clients/' + p.clientId} aria-label="Open client"><Icon name="users" size={18} /></a> : <button class="btn outline" onClick={() => openClientSheet(null, (c) => set({ clientId: c.id }))}><Icon name="plus" size={15} />New</button>}
            </div>
          </Field>
          <div class="form-row">
            <Field label="Start" htmlFor="pd-start"><DateInput id="pd-start" value={p.startDate} onChange={(v) => set({ startDate: v || null })} /></Field>
            <Field label="Shoot" htmlFor="pd-shoot"><DateInput id="pd-shoot" value={p.shootDate} onChange={(v) => set({ shootDate: v || null })} /></Field>
          </div>
          <Field label="Deadline"><div class="dt-pair"><DateInput id="pd-dl" value={p.deadlineDate} onChange={(v) => set({ deadlineDate: v || null, ...(v ? {} : { deadlineTime: null }) })} /><TimeInput id="pd-dlt" value={p.deadlineTime} onChange={(v) => set({ deadlineTime: v || null })} /></div></Field>
          <Field label="Brief" htmlFor="pd-brief"><TextArea id="pd-brief" value={p.brief} onInput={(v) => set({ brief: v })} placeholder="What the client wants, mood, must-have shots, specs" minRows={4} /></Field>
          <Field label="Notes" htmlFor="pd-notes"><TextArea id="pd-notes" value={p.notes} onInput={(v) => set({ notes: v })} placeholder="Anything else worth remembering" minRows={2} /></Field>
        </div>
      </section>
      <section class="block">
        <div class="block-head"><h2 class="block-title">References & files</h2></div>
        <LinksEditor links={p.links || []} onChange={(v) => set({ links: v })} types={M.LINK_TYPES} idPrefix="pd-ln" />
      </section>
    </>
  );
}

function BillingTab({ p, money }) {
  const cur = M.settings().defaultCurrency;
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">Billing</h2><button class="btn xs outline" onClick={() => createInvoiceAndOpen({ projectId: p.id, clientId: p.clientId || '' })}><Icon name="plus" size={14} />Invoice</button></div>
      <div class="sum-grid">
        <div><span>Invoiced</span><b class="tnum">{fmtMoney(money.invoiced, cur, { compact: true })}</b></div>
        <div><span>Received</span><b class="tnum">{fmtMoney(money.paid, cur, { compact: true })}</b></div>
        <div><span>Outstanding</span><b class="tnum">{fmtMoney(money.balance, cur, { compact: true })}</b></div>
      </div>
      {money.invoices.length ? <div class="list">{money.invoices.map((i) => { const c = M.calcInvoice(i); return <a class="list-row clickable" href={'#/invoices/' + i.id}><div class="row-main"><div class="row-title tnum">{i.number}</div><div class="row-meta">{fmtShort(i.date)} · {fmtMoney(c.total, i.currency)}{c.balance > 0 && c.status !== 'draft' ? ' · ' + fmtMoney(c.balance, i.currency) + ' due' : ''}</div></div><InvoicePill status={c.status} /></a>; })}</div>
        : <div class="quiet-note">No invoices yet. One made here fills in the client and project.</div>}
    </section>
  );
}
export { fmtFull, Pill };
