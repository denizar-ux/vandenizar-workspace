import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, Chips, Segmented, Progress, Empty, ChecklistEditor, LinksEditor, MoneyInput, NumberInput, TagInput, copyText } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, SubNav, FREELANCE_NAV, InvoiceBadge, StageBadge, STAGE_COLOR, STAGE_TONE, BackBar, openTaskSheet, TaskRow, fmtAgo } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, addDays, diffDays, relDay, fmtDay, fmtShort, fmtFull, fmtMonth, fmtMonthShort, addMonths, startOfMonth, monthKey, isoOf, fmtTimestamp } from '../lib/date.js';
import { fmtMoney, CURRENCIES } from '../lib/money.js';
import { dragHandlers, orderBetween } from '../lib/dnd.js';
import * as M from '../lib/model.js';
import { loadJsPdf, saveFile, saveMessage } from '../lib/files.js';

const CUR_OPTS = Object.keys(CURRENCIES);
function loadPref(k, d) { try { const v = localStorage.getItem('vz:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem('vz:' + k, JSON.stringify(v)); } catch {} }
const NewProjectBtn = ({ stage, label = 'New project' }) => <button class="btn primary" onClick={() => openProjectSheet({ stage })}><Icon name="plus" size={18} />{label}</button>;
function projectDate(p) {
  if (p.shootDate && M.stageIdx(p.stage) <= M.stageIdx('Production')) return { label: 'Shoot', date: p.shootDate };
  if (p.deadline && M.stageIdx(p.stage) < M.stageIdx('Delivered')) return { label: 'Due', date: p.deadline };
  if (p.shootDate) return { label: 'Shoot', date: p.shootDate };
  return null;
}

// =====================================================================
// SHEETS: client, project, payment, templates
// =====================================================================
export function openClientSheet(id, onSaved) { openOverlay((close) => <ClientSheet id={id} onSaved={onSaved} close={close} />, { kind: 'sheet' }); }
function ClientSheet({ id, onSaved, close }) {
  const ex = id ? get('clients', id) : null;
  const [c, setC] = useState(() => ex ? { ...ex } : { name: '', pic: '', email: '', phone: '', address: '', notes: '' });
  const set = (ch) => setC({ ...c, ...ch });
  const save = () => {
    const name = c.name.trim();
    if (!name) return toast('Add the client or brand name.', { tone: 'warn' });
    const dup = M.liveClients().find((x) => x.name.trim().toLowerCase() === name.toLowerCase() && x.id !== ex?.id);
    if (dup && !ex) { toast(`${dup.name} already exists, using that one.`); close(); onSaved ? onSaved(dup) : navigate('/freelance/clients/' + dup.id); return; }
    const saved = put('clients', { ...c, name, id: ex?.id || uid(), archived: ex?.archived || false });
    if (!ex) M.logActivity(`Client ${name} added`, { refType: 'client', refId: saved.id });
    toast(ex ? 'Client saved' : 'Client added');
    close();
    if (onSaved) onSaved(saved); else if (!ex) navigate('/freelance/clients/' + saved.id);
  };
  return (
    <>
      <SheetHead title={ex ? 'Edit client' : 'New client'} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Client / company" htmlFor="cl-name"><TextInput id="cl-name" value={c.name} onInput={(v) => set({ name: v })} placeholder="e.g. Ainayya" autoFocus={!ex} /></Field>
        <Field label="PIC / contact person" htmlFor="cl-pic"><TextInput id="cl-pic" value={c.pic} onInput={(v) => set({ pic: v })} placeholder="Name of your contact" /></Field>
        <div class="form-row">
          <Field label="Email" htmlFor="cl-email"><TextInput id="cl-email" type="email" inputMode="email" value={c.email} onInput={(v) => set({ email: v })} /></Field>
          <Field label="Phone / WhatsApp" htmlFor="cl-phone"><TextInput id="cl-phone" type="tel" inputMode="tel" value={c.phone} onInput={(v) => set({ phone: v })} placeholder="08…" /></Field>
        </div>
        <Field label="Billing address (optional)" htmlFor="cl-addr"><TextArea id="cl-addr" value={c.address} onInput={(v) => set({ address: v })} minRows={2} /></Field>
        <Field label="Notes" htmlFor="cl-notes"><TextArea id="cl-notes" value={c.notes} onInput={(v) => set({ notes: v })} placeholder="Preferences, brand guidelines, how they like to work" /></Field>
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{ex ? 'Save' : 'Add client'}</button></SheetFoot>
    </>
  );
}

export function openProjectSheet(preset = {}) { openOverlay((close) => <ProjectSheet preset={preset} close={close} />, { kind: 'sheet' }); }
function ProjectSheet({ preset, close }) {
  useStore();
  const s = M.settings();
  const tpls = all('templates').filter((t) => t.kind === 'project' && !t.archived);
  const [p, setP] = useState({ name: '', clientId: preset.clientId || '', type: '', fee: 0, currency: s.defaultCurrency, stage: preset.stage || 'Lead', shootDate: '', deadline: '', location: '', templateId: '' });
  const set = (ch) => setP({ ...p, ...ch });
  const applyTpl = (tid) => {
    const t = tpls.find((x) => x.id === tid);
    if (!t) return set({ templateId: '' });
    set({ templateId: tid, type: t.data?.type || p.type, fee: t.data?.fee || p.fee, currency: t.data?.currency || p.currency });
  };
  const save = () => {
    if (!p.name.trim()) return toast('Name the project first.', { tone: 'warn' });
    if (!p.clientId) return toast('Pick a client. Every project belongs to one.', { tone: 'warn' });
    const tpl = tpls.find((x) => x.id === p.templateId);
    const applied = tpl ? M.applyProjectTemplate(tpl) : { deliverables: s.defaultDeliverables.map((text) => ({ id: uid(), text, done: false })), _tasks: [] };
    const { templateId, ...rest } = p;
    const pr = M.newProject({ ...rest, name: p.name.trim(), deliverables: applied.deliverables });
    (applied._tasks || []).forEach((title, i) => M.newTask({ title, projectId: pr.id, category: 'Freelance', order: Date.now() + i }));
    toast('Project created');
    close();
    navigate('/freelance/projects/' + pr.id);
  };
  const clients = M.liveClients().filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  const types = [...new Set([...s.projectTypes, ...(p.type && !s.projectTypes.includes(p.type) ? [p.type] : [])])];
  return (
    <>
      <SheetHead title="New project" onClose={close} />
      <SheetBody><div class="form">
        {tpls.length > 0 && <Field label="Start from template" htmlFor="pj-tpl"><Select id="pj-tpl" value={p.templateId} onChange={applyTpl} placeholder="No template" options={tpls.map((t) => ({ id: t.id, label: t.name }))} /></Field>}
        <Field label="Project name" htmlFor="pj-name"><TextInput id="pj-name" value={p.name} onInput={(v) => set({ name: v })} placeholder="e.g. Raya campaign film" autoFocus /></Field>
        <Field label="Client" htmlFor="pj-client">
          <div class="row gap-6">
            <div class="grow"><Select id="pj-client" value={p.clientId} onChange={(v) => set({ clientId: v })} placeholder={clients.length ? 'Choose client' : 'No clients yet'} options={clients.map((c) => ({ id: c.id, label: c.name }))} /></div>
            <button class="btn soft" onClick={() => openClientSheet(null, (c) => set({ clientId: c.id }))}><Icon name="plus" size={16} />New</button>
          </div>
        </Field>
        <div class="form-row">
          <Field label="Type" htmlFor="pj-type"><Select id="pj-type" value={p.type} onChange={(v) => set({ type: v })} placeholder="Choose type" options={types} /></Field>
          <Field label="Stage" htmlFor="pj-stage"><Select id="pj-stage" value={p.stage} onChange={(v) => set({ stage: v })} options={M.PIPELINE} /></Field>
        </div>
        <div class="form-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 96px' }}>
          <Field label="Fee (estimate or confirmed)" htmlFor="pj-fee"><MoneyInput id="pj-fee" value={p.fee} currency={p.currency} onChange={(v) => set({ fee: v })} /></Field>
          <Field label="Currency" htmlFor="pj-cur"><Select id="pj-cur" value={p.currency} onChange={(v) => set({ currency: v })} options={CUR_OPTS} /></Field>
        </div>
        <div class="form-row">
          <Field label="Shoot date" htmlFor="pj-shoot"><DateInput id="pj-shoot" value={p.shootDate} onChange={(v) => set({ shootDate: v })} /></Field>
          <Field label="Delivery deadline" htmlFor="pj-dl"><DateInput id="pj-dl" value={p.deadline} onChange={(v) => set({ deadline: v })} /></Field>
        </div>
        <Field label="Location" htmlFor="pj-loc"><TextInput id="pj-loc" value={p.location} onInput={(v) => set({ location: v })} placeholder="Studio, city" /></Field>
        <div class="field-hint">{p.templateId ? 'Template deliverables and tasks are copied in. Editing the template later will not change this project.' : `Starts with your default deliverables: ${s.defaultDeliverables.join(', ')}.`}</div>
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Create project</button></SheetFoot>
    </>
  );
}

function openPaymentSheet(inv, payment) { openOverlay((close) => <PaymentSheet inv={inv} payment={payment} close={close} />, { kind: 'sheet' }); }
function PaymentSheet({ inv, payment, close }) {
  const c = M.calcInvoice(inv);
  const maxAllowed = c.balance + (payment ? payment.amount : 0);
  const first = !payment && c.paid === 0;
  const [p, setP] = useState(() => payment ? { ...payment } : { amount: maxAllowed, date: today(), method: 'Bank transfer', kind: first ? 'Full payment' : 'Final payment', reference: '', notes: '' });
  const set = (ch) => setP({ ...p, ...ch });
  const save = () => {
    const amt = Math.round(+p.amount || 0);
    if (amt <= 0) return toast('Enter an amount above zero.', { tone: 'warn' });
    if (amt > maxAllowed) return toast(`That's more than the ${fmtMoney(maxAllowed, inv.currency)} still owed.`, { tone: 'warn' });
    if (!p.date) return toast('Add the date you received it.', { tone: 'warn' });
    if (payment) {
      put('payments', { ...payment, ...p, amount: amt, history: [...(payment.history || []), { at: Date.now(), before: { amount: payment.amount, date: payment.date, method: payment.method, kind: payment.kind } }] });
      M.logActivity(`Payment edited on ${inv.number}`, { refType: 'invoice', refId: inv.id, projectId: inv.projectId });
      toast('Payment updated');
    } else {
      M.recordPayment(inv, { ...p, amount: amt });
      const after = M.calcInvoice(get('invoices', inv.id));
      toast(after.status === 'paid' ? 'Paid in full' : `Recorded. ${fmtMoney(after.balance, inv.currency)} left.`);
    }
    close();
  };
  const dpAmount = Math.round(c.total / 2);
  return (
    <>
      <SheetHead title={payment ? 'Edit payment' : 'Record payment'} sub={`${inv.number} · ${fmtMoney(c.balance, inv.currency)} outstanding`} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Type"><Chips options={M.PAYMENT_KINDS} value={p.kind} onChange={(v) => set({ kind: v, ...(v === 'Full payment' || v === 'Final payment' ? { amount: maxAllowed } : v === 'DP / deposit' && !payment ? { amount: Math.min(maxAllowed, dpAmount) } : {}) })} /></Field>
        <Field label="Amount" htmlFor="pay-amt" hint={!payment && c.paid === 0 ? `50% DP would be ${fmtMoney(dpAmount, inv.currency)}` : null}><MoneyInput id="pay-amt" value={p.amount} currency={inv.currency} onChange={(v) => set({ amount: v })} /></Field>
        <div class="form-row">
          <Field label="Date received" htmlFor="pay-date"><DateInput id="pay-date" value={p.date} onChange={(v) => set({ date: v })} clearable={false} /></Field>
          <Field label="Method" htmlFor="pay-method"><Select id="pay-method" value={p.method} onChange={(v) => set({ method: v })} options={M.PAYMENT_METHODS} /></Field>
        </div>
        <Field label="Reference / transaction note" htmlFor="pay-ref"><TextInput id="pay-ref" value={p.reference} onInput={(v) => set({ reference: v })} placeholder="Transfer ID, bank, sender" /></Field>
        <Field label="Notes" htmlFor="pay-notes"><TextArea id="pay-notes" value={p.notes} onInput={(v) => set({ notes: v })} minRows={1} /></Field>
        {!inv.sentAt && <div class="banner info"><Icon name="info" size={18} /><div>This invoice is still a draft. Recording a payment marks it as sent.</div></div>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{payment ? 'Save' : 'Record payment'}</button></SheetFoot>
    </>
  );
}

// =====================================================================
// OVERVIEW
// =====================================================================
export function FreelanceOverview() {
  useStore();
  const s = M.settings();
  const t0 = today();
  const [month, setMonth] = useState(monthKey(t0));
  const cur = s.defaultCurrency;
  const f = M.finance(cur, month);
  const projects = M.liveProjects().filter((p) => !p.archived);
  const active = projects.filter((p) => M.ACTIVE_STAGES.includes(p.stage));
  const counts = Object.fromEntries(M.PIPELINE.map((st) => [st, projects.filter((p) => p.stage === st).length]));
  const total = projects.length || 1;
  const upcoming = M.freelanceAgenda(t0, addDays(t0, 14), true);
  const invs = M.liveInvoices().filter((i) => !i.archived);
  const attention = [];
  invs.forEach((i) => { const c = M.calcInvoice(i); if (c.status === 'overdue') attention.push({ icon: 'alert', tone: 't-red', title: `${i.number} is overdue`, sub: `${M.clientName(i.clientId)} · ${fmtMoney(c.balance, i.currency)} unpaid since ${fmtShort(i.dueDate)}`, path: '/freelance/invoices/' + i.id }); else if (c.status === 'draft') attention.push({ icon: 'file', tone: 't-grey', title: `${i.number} is still a draft`, sub: `${M.clientName(i.clientId)} · ${fmtMoney(c.total, i.currency)}`, path: '/freelance/invoices/' + i.id }); });
  projects.forEach((p) => {
    const m = M.projectMoney(p.id);
    if (p.stage === 'Delivered' && !m.invoices.some((i) => i.sentAt)) attention.push({ icon: 'file', tone: 't-orange', title: `${p.name} delivered, no invoice sent`, sub: M.clientName(p.clientId), path: '/freelance/projects/' + p.id });
    if (['Contacted', 'Negotiation'].includes(p.stage) && Date.now() - (p.stageChangedAt || p.updatedAt) > 5 * 86400000) attention.push({ icon: 'clock', tone: 't-yellow', title: `${p.name} waiting on ${M.clientName(p.clientId)}`, sub: `${p.stage} for ${Math.floor((Date.now() - (p.stageChangedAt || p.updatedAt)) / 86400000)} days. Time to follow up?`, path: '/freelance/projects/' + p.id });
  });
  const activity = all('activity').slice().sort((a, b) => b.at - a.at).slice(0, 8);
  const mIso = month + '-01';
  return (
    <div class="page">
      <SubNav items={FREELANCE_NAV} active="overview" />
      <PageHeader eyebrow="Freelance OS" title={<>What needs <em>attention</em></>} actions={<NewProjectBtn />} />
      <div class="row gap-8">
        <button class="icon-btn soft sm" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(mIso, -1)))}><Icon name="chevronLeft" size={18} /></button>
        <div style={{ fontWeight: 800, minWidth: 130, textAlign: 'center' }}>{fmtMonth(mIso)}</div>
        <button class="icon-btn soft sm" aria-label="Next month" onClick={() => setMonth(monthKey(addMonths(mIso, 1)))}><Icon name="chevronRight" size={18} /></button>
        {month !== monthKey(t0) && <button class="btn xs soft" onClick={() => setMonth(monthKey(t0))}>This month</button>}
      </div>
      <div class="stats five">
        <a class="stat" href="#/freelance/projects?view=active"><span class="stat-label">Active projects</span><span class="stat-value">{active.length}<span class="muted" style={{ fontSize: 14 }}> / {projects.length}</span></span><span class="stat-sub">Booked to delivered</span></a>
        <a class="stat" href="#/freelance/pipeline"><span class="stat-label">Pipeline value</span><span class="stat-value">{fmtMoney(f.pipeline, cur, { compact: true })}</span><span class="stat-sub">Fees still to collect</span></a>
        <a class="stat" href="#/freelance/finance"><span class="stat-label">Received</span><span class="stat-value">{fmtMoney(f.receivedMonth, cur, { compact: true })}</span><span class="stat-sub">{fmtMonthShort(mIso)} payments</span></a>
        <a class="stat" href="#/freelance/invoices?status=open"><span class="stat-label">Outstanding</span><span class="stat-value">{fmtMoney(f.outstanding, cur, { compact: true })}</span><span class="stat-sub">Unpaid invoices</span></a>
        <a class={'stat ' + (f.overdue ? 'warn' : '')} href="#/freelance/invoices?status=overdue"><span class="stat-label">Overdue</span><span class="stat-value">{fmtMoney(f.overdue, cur, { compact: true })}</span><span class="stat-sub">Past due date</span></a>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Pipeline <span class="count">{projects.length} projects</span></div><a class="section-link" href="#/freelance/pipeline">Open pipeline</a></div>
        <div class="stagebar">{M.PIPELINE.map((st) => counts[st] ? <span style={{ width: (counts[st] / total) * 100 + '%', background: STAGE_COLOR[st] }} title={`${st}: ${counts[st]}`} /> : null)}{!projects.length && <span style={{ width: '100%', background: 'var(--surface-3)' }} />}</div>
        <div class="stage-legend">{M.PIPELINE.map((st) => <a href={'#/freelance/pipeline'}><span class="cat-dot" style={{ background: STAGE_COLOR[st] }} />{st}<b>{counts[st]}</b></a>)}</div>
      </div>
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Needs attention <span class="count">{attention.length}</span></div></div>
            {attention.length ? <div class="list">{attention.slice(0, 8).map((a) => (
              <a class="list-row clickable" href={'#' + a.path}><span class={'mini-ic ' + a.tone}><Icon name={a.icon} size={16} /></span><div class="row-main"><div class="row-title">{a.title}</div><div class="row-meta">{a.sub}</div></div><Icon name="chevronRight" size={16} class="muted" /></a>
            ))}</div> : <Empty icon="check" title="Nothing waiting on you">Overdue invoices, unsent drafts and quiet leads show up here.</Empty>}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Next 14 days</div></div>
            {upcoming.length ? <div class="list">{upcoming.map((u) => (
              <a class="list-row clickable" href={'#' + (u.kind === 'invoice' ? '/freelance/invoices/' + u.invoice.id : '/freelance/projects/' + u.project.id)}>
                <div class="col" style={{ width: 46, alignItems: 'center', flex: 'none' }}><span class="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{fmtMonthShort(u.date)}</span><span style={{ fontWeight: 800, fontSize: 20 }} class="tnum">{+u.date.slice(8)}</span></div>
                <div class="row-main"><div class="row-title">{u.kind === 'invoice' ? `${u.invoice.number} payment` : u.project.name}</div><div class="row-meta">{u.label} · {u.kind === 'invoice' ? `${M.clientName(u.invoice.clientId)} · ${fmtMoney(u.calc.balance, u.invoice.currency)}` : M.clientName(u.project.clientId)}</div></div>
                {u.overdue ? <span class="badge sm t-red">Late</span> : <span class="badge sm">{relDay(u.date)}</span>}
              </a>
            ))}</div> : <div class="muted" style={{ fontSize: 14 }}>No shoots, deliveries or invoice due dates in the next two weeks.</div>}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Recent activity</div></div>
            {activity.length ? <div class="timeline">{activity.map((a) => <div class="tl-item"><div><div>{a.text}{a.amount ? ` · ${fmtMoney(a.amount, a.currency)}` : ''}</div><div class="tl-time">{fmtAgo(a.at)}</div></div></div>)}</div> : <div class="muted" style={{ fontSize: 14 }}>Stage changes, invoices and payments are logged here.</div>}
          </div>
          <div class="card soft">
            <div class="card-title" style={{ marginBottom: 8 }}>Quick actions</div>
            <div class="row gap-8 wrap">
              <button class="btn sm" onClick={() => openProjectSheet()}><Icon name="briefcase" size={15} />Project</button>
              <button class="btn sm" onClick={() => openClientSheet()}><Icon name="users" size={15} />Client</button>
              <button class="btn sm" onClick={() => createInvoiceAndOpen({})}><Icon name="file" size={15} />Invoice</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PIPELINE
// =====================================================================
function moveProjectDrop({ id, to, before, after }) {
  if (!M.PIPELINE.includes(to)) return;
  const prev = after && get('projects', after), nxt = before && get('projects', before);
  M.moveProject(id, to, orderBetween(prev?.order, nxt?.order));
}
function ProjectCard({ p }) {
  const d = projectDate(p);
  return (
    <div class="kcard" onClick={() => navigate('/freelance/projects/' + p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('/freelance/projects/' + p.id)}>
      <div class="kcard-title">{p.name}</div>
      <div class="kcard-desc">{M.clientName(p.clientId)}{p.type ? ' · ' + p.type : ''}</div>
      <div class="kcard-foot">
        <span class="amount" style={{ color: 'var(--ink)' }}>{p.fee ? fmtMoney(p.fee, p.currency, { compact: true }) : 'No fee yet'}</span>
        {d && <span class={'badge sm ' + (diffDays(d.date, today()) < 0 && M.stageIdx(p.stage) < M.stageIdx('Delivered') ? 't-red' : 't-accent')} style={{ marginLeft: 'auto' }}>{d.label} {relDay(d.date)}</span>}
      </div>
      <button class="icon-btn ghost xs kcard-more" aria-label="Project actions" onClick={(e) => projectMenu(e, p)}><Icon name="more" size={16} /></button>
    </div>
  );
}
function projectMenu(e, p) {
  openMenu(e, [
    { label: 'Open project', icon: 'edit', onSelect: () => navigate('/freelance/projects/' + p.id) },
    { heading: 'Move to stage' },
    ...M.PIPELINE.map((st) => ({ label: st, active: p.stage === st, onSelect: () => { M.moveProject(p.id, st); toast('Moved to ' + st); } })),
    { divider: true },
    { label: 'Create invoice', icon: 'file', onSelect: () => createInvoiceAndOpen({ projectId: p.id }) },
    p.archived ? { label: 'Restore', icon: 'restore', onSelect: () => patch('projects', p.id, { archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { patch('projects', p.id, { archived: true }); toast('Archived', { action: { label: 'Undo', run: () => patch('projects', p.id, { archived: false }) } }); } },
  ], { title: p.name });
}

export function PipelinePage() {
  useStore();
  const s = M.settings();
  const desktop = useMedia(DESKTOP_Q);
  const view = s.pipelineView || 'kanban';
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [client, setClient] = useState('');
  const [stageTab, setStageTab] = useState(loadPref('pipeStage', 'Lead'));
  const [sort, setSort] = useState('stage');
  const [filters, setFilters] = useState(false);
  useEffect(() => savePref('pipeStage', stageTab), [stageTab]);
  let list = M.liveProjects().filter((p) => !p.archived);
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter((p) => [p.name, M.clientName(p.clientId), p.type, p.location, (p.tags || []).join(' ')].some((x) => (x || '').toLowerCase().includes(t))); }
  if (type) list = list.filter((p) => p.type === type);
  if (client) list = list.filter((p) => p.clientId === client);
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const colSum = (st) => list.filter((p) => p.stage === st).reduce((a, p) => a + ((p.currency || 'IDR') === s.defaultCurrency ? +p.fee || 0 : 0), 0);
  return (
    <div class="page">
      <SubNav items={FREELANCE_NAV} active="pipeline" />
      <PageHeader title="Pipeline" actions={<>
        <Segmented options={[{ id: 'kanban', label: 'Kanban', icon: 'kanban' }, { id: 'list', label: 'List', icon: 'list' }]} value={view} onChange={(v) => M.setSettings({ pipelineView: v })} />
        <NewProjectBtn stage={view === 'kanban' && !desktop ? stageTab : 'Lead'} />
      </>} />
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="pipe-q" value={q} placeholder="Search projects or clients" onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (type || client ? 'dark' : '')} aria-label="Filters" onClick={() => setFilters(!filters)}><Icon name="filter" size={18} /></button>
        {view === 'list' && <button class="icon-btn" aria-label="Sort" onClick={(e) => openMenu(e, [{ heading: 'Sort by' }, ...[['stage', 'Stage'], ['fee', 'Fee, highest first'], ['date', 'Next date'], ['updated', 'Last updated'], ['name', 'Name A–Z']].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>}
      </div>
      {filters && <div class="card tight"><div class="form-row">
        <Field label="Type" htmlFor="pf-type"><Select id="pf-type" value={type} onChange={setType} placeholder="Any" options={s.projectTypes} /></Field>
        <Field label="Client" htmlFor="pf-client"><Select id="pf-client" value={client} onChange={setClient} placeholder="Any" options={M.liveClients().map((c) => ({ id: c.id, label: c.name }))} /></Field>
      </div></div>}
      {view === 'kanban' ? (desktop ? (
        <div class="board" data-scroll-x>
          {M.PIPELINE.map((st) => {
            const items = list.filter((p) => p.stage === st).sort(byOrder);
            return (
              <div class="col-k narrow">
                <div class="col-head"><div class="col-name"><span class="cat-dot" style={{ background: STAGE_COLOR[st] }} />{st}<span class="col-count">{items.length}</span></div><button class="icon-btn ghost xs" aria-label={'Add to ' + st} onClick={() => openProjectSheet({ stage: st })}><Icon name="plus" size={16} /></button></div>
                <div class="col-sum">{fmtMoney(colSum(st), s.defaultCurrency, { compact: true })}</div>
                <div class="col-list" data-drop={st} data-scroll-y>
                  {items.map((p) => <div {...dragHandlers(p.id, moveProjectDrop)}><ProjectCard p={p} /></div>)}
                  {!items.length && <div class="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: '18px 8px' }}>Drop here</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div class="status-tabs"><div class="seg" style={{ width: '100%' }}>{M.PIPELINE.map((st) => <button class={'seg-btn ' + (stageTab === st ? 'on' : '')} onClick={() => setStageTab(st)}>{st}<span class="seg-count">{list.filter((p) => p.stage === st).length}</span></button>)}</div></div>
          <div class="row between" style={{ padding: '0 4px' }}><span class="muted" style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(colSum(stageTab), s.defaultCurrency)}</span><button class="btn xs soft" onClick={() => openProjectSheet({ stage: stageTab })}><Icon name="plus" size={14} />Add to {stageTab}</button></div>
          <div class="col gap-8" data-drop={stageTab}>
            {list.filter((p) => p.stage === stageTab).sort(byOrder).map((p) => <div {...dragHandlers(p.id, moveProjectDrop, { accept: (k) => k === stageTab })}><ProjectCard p={p} /></div>)}
          </div>
          {!list.some((p) => p.stage === stageTab) && <div class="card"><Empty icon="briefcase" title={`Nothing in ${stageTab}`} /></div>}
          <div class="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Use ••• on a card to move it to another stage.</div>
        </>
      )) : <ProjectTable list={list} sort={sort} desktop={desktop} />}
    </div>
  );
}

function ProjectTable({ list, sort, desktop }) {
  const sorted = [...list].sort((a, b) => {
    if (sort === 'fee') return (+b.fee || 0) - (+a.fee || 0);
    if (sort === 'date') return (projectDate(a)?.date || '9999').localeCompare(projectDate(b)?.date || '9999');
    if (sort === 'updated') return b.updatedAt - a.updatedAt;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return M.stageIdx(a.stage) - M.stageIdx(b.stage) || (a.order || 0) - (b.order || 0);
  });
  if (!sorted.length) return <div class="card"><Empty icon="briefcase" title="No projects here" action={<NewProjectBtn />} /></div>;
  const stageSel = (p) => <select class={'inline-select ' + (STAGE_TONE[p.stage] || '')} value={p.stage} onClick={(e) => e.stopPropagation()} onChange={(e) => { M.moveProject(p.id, e.currentTarget.value); toast('Moved to ' + e.currentTarget.value); }} aria-label="Stage">{M.PIPELINE.map((s) => <option>{s}</option>)}</select>;
  if (desktop) return (
    <div class="card flush"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Project</th><th>Client</th><th>Stage</th><th>Type</th><th class="num">Fee</th><th>Next date</th><th /></tr></thead>
      <tbody>{sorted.map((p) => { const d = projectDate(p); return (
        <tr class="clickable" onClick={() => navigate('/freelance/projects/' + p.id)}>
          <td style={{ fontWeight: 800 }}>{p.name}{p.archived && <span class="badge sm" style={{ marginLeft: 6 }}>Archived</span>}</td>
          <td class="muted">{M.clientName(p.clientId)}</td><td>{stageSel(p)}</td><td class="muted">{p.type}</td>
          <td class="num">{p.fee ? fmtMoney(p.fee, p.currency) : '—'}</td><td class="muted">{d ? `${d.label} ${fmtShort(d.date)}` : '—'}</td>
          <td><button class="icon-btn ghost sm" aria-label="Actions" onClick={(e) => projectMenu(e, p)}><Icon name="more" /></button></td>
        </tr>); })}</tbody>
    </table></div></div>
  );
  return (
    <div class="card"><div class="list">{sorted.map((p) => { const d = projectDate(p); return (
      <div class="list-row clickable" onClick={() => navigate('/freelance/projects/' + p.id)}>
        <div class="row-main"><div class="row-title">{p.name}</div><div class="row-meta">{M.clientName(p.clientId)}{p.fee ? ' · ' + fmtMoney(p.fee, p.currency, { compact: true }) : ''}{d ? ` · ${d.label} ${relDay(d.date)}` : ''}</div></div>
        {stageSel(p)}
      </div>); })}</div></div>
  );
}

// =====================================================================
// PROJECTS
// =====================================================================
export function ProjectsPage({ query }) {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const [view, setView] = useState(query.view || 'all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('updated');
  useEffect(() => { if (query.view) setView(query.view); }, [query.view]);
  const base = M.liveProjects();
  const groups = {
    all: base.filter((p) => !p.archived),
    leads: base.filter((p) => !p.archived && ['Lead', 'Contacted', 'Negotiation'].includes(p.stage)),
    active: base.filter((p) => !p.archived && M.ACTIVE_STAGES.includes(p.stage)),
    completed: base.filter((p) => !p.archived && p.stage === 'Paid'),
    archived: base.filter((p) => p.archived),
  };
  let list = groups[view] || groups.all;
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter((p) => [p.name, M.clientName(p.clientId), p.type, p.location, (p.tags || []).join(' ')].some((x) => (x || '').toLowerCase().includes(t))); }
  return (
    <div class="page">
      <SubNav items={FREELANCE_NAV} active="projects" />
      <PageHeader title="Projects" actions={<NewProjectBtn />} />
      <div class="chips scroll">
        {[['all', 'All'], ['leads', 'Leads'], ['active', 'Active'], ['completed', 'Completed'], ['archived', 'Archived']].map(([id, label]) => <button class={'chip ' + (view === id ? 'on' : '')} onClick={() => setView(id)}>{label}<span class="chip-count">{groups[id].length}</span></button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="proj-q" value={q} placeholder="Search projects" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <button class="icon-btn" aria-label="Sort" onClick={(e) => openMenu(e, [{ heading: 'Sort by' }, ...[['updated', 'Last updated'], ['stage', 'Stage'], ['fee', 'Fee, highest first'], ['date', 'Next date'], ['name', 'Name A–Z']].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>
      </div>
      <ProjectTable list={list} sort={sort} desktop={desktop} />
    </div>
  );
}

export function ProjectDetail({ id }) {
  useStore();
  const p = get('projects', id);
  const s = M.settings();
  useEffect(() => { if (p) M.touchRecent('project', id); }, [id]);
  if (!p || p.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/freelance/projects')} /><div class="card"><Empty icon="briefcase" title="Project not found" action={<a class="btn sm primary" href="#/freelance/projects">All projects</a>} /></div></div>;
  const set = (ch, note) => patch('projects', id, note ? { ...ch, history: [...(p.history || []), { at: Date.now(), text: note }] } : ch);
  const client = get('clients', p.clientId);
  const money = M.projectMoney(id);
  const tasks = M.sortTasks(all('tasks').filter((t) => t.projectId === id && !t.deletedAt && !t.archived));
  const types = [...new Set([...s.projectTypes, ...(p.type && !s.projectTypes.includes(p.type) ? [p.type] : [])])];
  const clients = M.liveClients().filter((c) => !c.archived || c.id === p.clientId);
  const delivered = (p.deliverables || []).filter((d) => d.done).length;
  const del = async () => {
    if (money.invoices.length) { if (await confirmDialog({ title: 'This project has invoices', body: 'Deleting it would orphan financial history. Archive it instead? Everything stays available for reports.', confirmLabel: 'Archive project' })) { set({ archived: true }, 'Archived'); toast('Archived'); } return; }
    if (await confirmDialog({ title: `Delete ${p.name}?`, body: 'This removes the project for good. Linked tasks stay but lose the link.', confirmLabel: 'Delete', danger: true })) {
      all('tasks').filter((t) => t.projectId === id).forEach((t) => patch('tasks', t.id, { projectId: '' }));
      remove('projects', id);
      M.logActivity(`Project ${p.name} deleted`, { refType: 'project' });
      toast('Project deleted');
      back('/freelance/projects');
    }
  };
  const Info = (
    <div class="card">
      <div class="form">
        <Field label="Client" htmlFor="pd-client">
          <div class="row gap-6">
            <div class="grow"><Select id="pd-client" value={p.clientId} onChange={async (v) => {
              const sent = money.invoices.filter((i) => i.sentAt).length;
              if (sent && !(await confirmDialog({ title: 'Change the client?', body: `${sent} sent invoice(s) keep the original recipient on file. New and draft invoices will use the new client.`, confirmLabel: 'Change client' }))) return;
              set({ clientId: v }, `Client changed to ${M.clientName(v)}`);
            }} options={clients.map((c) => ({ id: c.id, label: c.name + (c.archived ? ' (archived)' : '') }))} /></div>
            {client && <a class="icon-btn soft" href={'#/freelance/clients/' + client.id} aria-label="Open client"><Icon name="users" size={18} /></a>}
          </div>
        </Field>
        <div class="form-row">
          <Field label="PIC on this project" htmlFor="pd-pic"><TextInput id="pd-pic" value={p.pic} onInput={(v) => set({ pic: v })} placeholder={client?.pic || 'Contact name'} /></Field>
          <Field label="Contact" htmlFor="pd-contact"><TextInput id="pd-contact" value={p.contact} onInput={(v) => set({ contact: v })} placeholder={client?.phone || 'Phone or email'} /></Field>
        </div>
        <div class="form-row">
          <Field label="Type" htmlFor="pd-type"><Select id="pd-type" value={p.type} onChange={(v) => set({ type: v })} placeholder="Choose type" options={types} /></Field>
          <Field label="Location" htmlFor="pd-loc"><TextInput id="pd-loc" value={p.location} onInput={(v) => set({ location: v })} /></Field>
        </div>
        <div class="form-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 96px' }}>
          <Field label="Fee" htmlFor="pd-fee"><MoneyInput id="pd-fee" value={p.fee} currency={p.currency} onChange={(v) => set({ fee: v })} /></Field>
          <Field label="Currency" htmlFor="pd-cur"><Select id="pd-cur" value={p.currency} onChange={(v) => set({ currency: v })} options={CUR_OPTS} /></Field>
        </div>
        <div class="form-row three">
          <Field label="Start" htmlFor="pd-start"><DateInput id="pd-start" value={p.startDate} onChange={(v) => set({ startDate: v })} /></Field>
          <Field label="Shoot" htmlFor="pd-shoot"><DateInput id="pd-shoot" value={p.shootDate} onChange={(v) => set({ shootDate: v }, v ? `Shoot date set to ${fmtShort(v)}` : 'Shoot date cleared')} /></Field>
          <Field label="Deadline" htmlFor="pd-dl"><DateInput id="pd-dl" value={p.deadline} onChange={(v) => set({ deadline: v }, v ? `Deadline set to ${fmtShort(v)}` : 'Deadline cleared')} /></Field>
        </div>
        <Field label="Tags" htmlFor="pd-tags"><TagInput id="pd-tags" value={p.tags || []} onChange={(v) => set({ tags: v })} placeholder="Add tag, press Enter" /></Field>
      </div>
    </div>
  );
  const Invoices = (
    <div class="card">
      <div class="card-head"><div class="card-title">Invoices <span class="count">{money.invoices.length}</span></div><button class="btn xs soft" onClick={() => createInvoiceAndOpen({ projectId: id })}><Icon name="plus" size={14} />Invoice</button></div>
      {money.invoices.length ? <>
        <div class="list">{money.invoices.map((i) => { const c = M.calcInvoice(i); return <a class="list-row clickable" href={'#/freelance/invoices/' + i.id}><div class="row-main"><div class="row-title">{i.number}</div><div class="row-meta">{fmtShort(i.date)} · {fmtMoney(c.total, i.currency)}{c.balance > 0 && c.status !== 'draft' ? ` · ${fmtMoney(c.balance, i.currency)} due` : ''}</div></div><InvoiceBadge status={c.status} sm /></a>; })}</div>
        <div class="totals" style={{ marginTop: 10 }}>
          <div class="tr"><span class="muted">Invoiced</span><span>{fmtMoney(money.invoiced, p.currency)}</span></div>
          <div class="tr"><span class="muted">Received</span><span>{fmtMoney(money.paid, p.currency)}</span></div>
          <div class="tr bal"><span>Outstanding</span><span>{fmtMoney(money.balance, p.currency)}</span></div>
        </div>
      </> : <div class="muted" style={{ fontSize: 14 }}>No invoices yet. Creating one here fills in the client and project for you.</div>}
    </div>
  );
  return (
    <div class="page">
      <BackBar onBack={() => back('/freelance/pipeline')} right={<button class="icon-btn" aria-label="Project actions" onClick={(e) => openMenu(e, [
        { label: 'Create invoice', icon: 'file', onSelect: () => createInvoiceAndOpen({ projectId: id }) },
        { label: 'Add follow-up task', icon: 'tasks', onSelect: () => openTaskSheet(null, { projectId: id, category: 'Freelance', dueDate: today(), title: `Follow up ${M.clientName(p.clientId)} on ${p.name}` }) },
        p.archived ? { label: 'Restore from archive', icon: 'restore', onSelect: () => { set({ archived: false }, 'Restored'); toast('Restored'); } } : { label: 'Archive', icon: 'archive', onSelect: () => { set({ archived: true }, 'Archived'); toast('Archived', { action: { label: 'Undo', run: () => set({ archived: false }) } }); } },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
      ])}><Icon name="more" /></button>} />
      <div class="editor-head">
        <div class="row gap-8 wrap"><span class="eyebrow">Project</span><StageBadge stage={p.stage} sm />{p.archived && <span class="badge sm">Archived</span>}</div>
        <textarea class="input title-input" id="pd-name" rows={1} value={p.name} aria-label="Project name" onInput={(e) => set({ name: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} style={{ resize: 'none', overflow: 'hidden' }} />
        <div class="muted">{M.clientName(p.clientId)}{p.fee ? ' · ' + fmtMoney(p.fee, p.currency) : ''}</div>
        <div class="stepper" role="group" aria-label="Pipeline stage">{M.PIPELINE.map((st, i) => <button class={st === p.stage ? 'on' : i < M.stageIdx(p.stage) ? 'past' : ''} onClick={() => { M.moveProject(id, st); }}>{st}</button>)}</div>
      </div>
      <div class="two-col">
        <div class="stack">
          {Info}
          <div class="card">
            <div class="card-head"><div class="card-title">Deliverables <span class="count">{delivered}/{(p.deliverables || []).length}</span></div></div>
            <ChecklistEditor items={p.deliverables || []} onChange={(v) => set({ deliverables: v })} placeholder="Add deliverable, e.g. 15s cutdown" idPrefix="pd-dv" />
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Tasks & next actions <span class="count">{tasks.length}</span></div><button class="btn xs soft" onClick={() => openTaskSheet(null, { projectId: id, category: 'Freelance', dueDate: today() })}><Icon name="plus" size={14} />Task</button></div>
            {tasks.length ? <div class="list">{tasks.map((t) => <TaskRow t={t} />)}</div> : <div class="muted" style={{ fontSize: 14 }}>Add the next step: send moodboard, confirm call time, deliver first cut.</div>}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Notes</div></div>
            <TextArea id="pd-notes" value={p.notes} onInput={(v) => set({ notes: v })} placeholder="Brief, references, client feedback" minRows={4} />
          </div>
        </div>
        <div class="stack">
          {Invoices}
          <div class="card">
            <div class="card-head"><div class="card-title">Links</div></div>
            <LinksEditor links={p.links || []} onChange={(v) => set({ links: v })} types={[{ id: 'drive', label: 'Google Drive' }, { id: 'shotlist', label: 'Shotlist / reference' }, { id: 'final', label: 'Final delivery' }, { id: 'other', label: 'Other' }]} idPrefix="pd-ln" />
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">History</div></div>
            <div class="timeline">{[...(p.history || [])].reverse().slice(0, 15).map((h) => <div class="tl-item"><div><div>{h.text}</div><div class="tl-time">{fmtTimestamp(h.at)}</div></div></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// CLIENTS
// =====================================================================
export function ClientsPage() {
  useStore();
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  const cur = M.settings().defaultCurrency;
  let list = M.liveClients().filter((c) => !!c.archived === arch);
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter((c) => [c.name, c.pic, c.email, c.phone].some((x) => (x || '').toLowerCase().includes(t))); }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div class="page narrow">
      <SubNav items={FREELANCE_NAV} active="clients" />
      <PageHeader title="Clients" actions={<button class="btn primary" onClick={() => openClientSheet()}><Icon name="plus" size={18} />New client</button>} />
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="cl-q" value={q} placeholder="Search name, PIC, email, phone" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <Segmented options={[{ id: false, label: 'Active' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} />
      </div>
      <div class="card">
        {list.length ? <div class="list">{list.map((c) => { const m = M.clientMoney(c.id); return (
          <a class="list-row clickable" href={'#/freelance/clients/' + c.id}>
            <span class="avatar" style={{ width: 40, height: 40, fontSize: 15, boxShadow: 'none', background: 'var(--t-orange-bg)', color: 'var(--t-orange)' }}>{(c.name.replace(/^Sample · /, '')[0] || '?').toUpperCase()}</span>
            <div class="row-main"><div class="row-title">{c.name}</div><div class="row-meta">{c.pic || 'No PIC'} · {m.projects.length} project{m.projects.length === 1 ? '' : 's'}</div></div>
            <div class="col" style={{ alignItems: 'flex-end' }}><span class="amount" style={{ fontSize: 14 }}>{fmtMoney(m.value, cur, { compact: true })}</span>{m.outstanding > 0 && <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 700 }}>{fmtMoney(m.outstanding, cur, { compact: true })} due</span>}</div>
          </a>); })}</div> : <Empty icon="users" title={arch ? 'No archived clients' : q ? 'No clients match' : 'No clients yet'} action={!arch && !q && <button class="btn sm primary" onClick={() => openClientSheet()}>Add a client</button>} />}
      </div>
    </div>
  );
}

export function ClientDetail({ id }) {
  useStore();
  const c = get('clients', id);
  useEffect(() => { if (c) M.touchRecent('client', id); }, [id]);
  if (!c || c.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/freelance/clients')} /><div class="card"><Empty icon="users" title="Client not found" /></div></div>;
  const m = M.clientMoney(id);
  const cur = M.settings().defaultCurrency;
  const del = async () => {
    if (m.projects.length || m.invoices.length) { if (await confirmDialog({ title: 'This client has history', body: `${m.projects.length} project(s) and ${m.invoices.length} invoice(s) reference ${c.name}. Archive instead, so reports stay correct?`, confirmLabel: 'Archive client' })) { patch('clients', id, { archived: true }); toast('Archived'); } return; }
    if (await confirmDialog({ title: `Delete ${c.name}?`, body: 'This client has no projects or invoices. This cannot be undone.', confirmLabel: 'Delete', danger: true })) { remove('clients', id); toast('Client deleted'); back('/freelance/clients'); }
  };
  return (
    <div class="page">
      <BackBar onBack={() => back('/freelance/clients')} right={<>
        <button class="btn sm soft" onClick={() => openClientSheet(id)}><Icon name="edit" size={15} />Edit</button>
        <button class="icon-btn" aria-label="Client actions" onClick={(e) => openMenu(e, [
          { label: 'New project', icon: 'briefcase', onSelect: () => openProjectSheet({ clientId: id }) },
          { label: 'New invoice', icon: 'file', onSelect: () => createInvoiceAndOpen({ clientId: id }) },
          c.archived ? { label: 'Restore', icon: 'restore', onSelect: () => patch('clients', id, { archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { patch('clients', id, { archived: true }); toast('Archived'); } },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
        ])}><Icon name="more" /></button>
      </>} />
      <PageHeader eyebrow={c.archived ? 'Client · archived' : 'Client'} title={c.name} />
      <div class="stats">
        <div class="stat"><span class="stat-label">Projects</span><span class="stat-value">{m.projects.length}</span></div>
        <div class="stat"><span class="stat-label">Total project value</span><span class="stat-value">{fmtMoney(m.value, cur, { compact: true })}</span></div>
        <div class="stat"><span class="stat-label">Received</span><span class="stat-value">{fmtMoney(m.paid, cur, { compact: true })}</span></div>
        <div class={'stat ' + (m.outstanding ? 'warn' : '')}><span class="stat-label">Outstanding</span><span class="stat-value">{fmtMoney(m.outstanding, cur, { compact: true })}</span></div>
      </div>
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Projects</div><button class="btn xs soft" onClick={() => openProjectSheet({ clientId: id })}><Icon name="plus" size={14} />Project</button></div>
            {m.projects.length ? <div class="list">{m.projects.sort((a, b) => b.createdAt - a.createdAt).map((p) => <a class="list-row clickable" href={'#/freelance/projects/' + p.id}><div class="row-main"><div class="row-title">{p.name}</div><div class="row-meta">{p.type}{p.fee ? ' · ' + fmtMoney(p.fee, p.currency) : ''}{p.archived ? ' · Archived' : ''}</div></div><StageBadge stage={p.stage} sm /></a>)}</div> : <div class="muted" style={{ fontSize: 14 }}>No projects yet.</div>}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Invoices</div><button class="btn xs soft" onClick={() => createInvoiceAndOpen({ clientId: id })}><Icon name="plus" size={14} />Invoice</button></div>
            {m.invoices.length ? <div class="list">{m.invoices.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((i) => { const k = M.calcInvoice(i); return <a class="list-row clickable" href={'#/freelance/invoices/' + i.id}><div class="row-main"><div class="row-title">{i.number}</div><div class="row-meta">{fmtShort(i.date)} · {fmtMoney(k.total, i.currency)}</div></div><InvoiceBadge status={k.status} sm /></a>; })}</div> : <div class="muted" style={{ fontSize: 14 }}>No invoices yet.</div>}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Contact</div></div>
            <dl class="kv">
              <dt>PIC</dt><dd>{c.pic || '—'}</dd>
              <dt>Email</dt><dd>{c.email ? <span class="row gap-6">{c.email}<button class="icon-btn ghost xs" aria-label="Copy email" onClick={() => copyText(c.email, 'Email copied')}><Icon name="copy" size={13} /></button></span> : '—'}</dd>
              <dt>Phone</dt><dd>{c.phone ? <span class="row gap-6 wrap"><span style={{ whiteSpace: 'nowrap' }}>{c.phone}</span><button class="icon-btn ghost xs" aria-label="Copy phone" onClick={() => copyText(c.phone, 'Number copied')}><Icon name="copy" size={13} /></button>{/^[\d+\s-]+$/.test(c.phone) && <a class="btn xs soft" href={'https://wa.me/' + c.phone.replace(/\D/g, '').replace(/^0/, '62')} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</span> : '—'}</dd>
              <dt>Address</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.address || '—'}</dd>
              <dt>Added</dt><dd>{fmtFull(isoOf(c.createdAt))}</dd>
            </dl>
          </div>
          {c.notes && <div class="card"><div class="card-head"><div class="card-title">Notes</div></div><div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{c.notes}</div></div>}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// INVOICES
// =====================================================================
export function createInvoiceAndOpen(preset) {
  const inv = M.newInvoice(preset);
  navigate('/freelance/invoices/' + inv.id);
  return inv;
}

export function InvoicesPage({ query }) {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const [filter, setFilter] = useState(query.status || 'all');
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  useEffect(() => { if (query.status) setFilter(query.status); }, [query.status]);
  const cur = M.settings().defaultCurrency;
  const f = M.finance(cur);
  const rows = M.liveInvoices().filter((i) => !!i.archived === arch).map((i) => ({ i, c: M.calcInvoice(i) }));
  const count = (st) => rows.filter((r) => (st === 'open' ? r.c.balance > 0 && r.c.status !== 'draft' : r.c.status === st)).length;
  let list = filter === 'all' ? rows : rows.filter((r) => (filter === 'open' ? r.c.balance > 0 && r.c.status !== 'draft' : r.c.status === filter));
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter(({ i }) => [i.number, M.clientName(i.clientId), get('projects', i.projectId)?.name].some((x) => (x || '').toLowerCase().includes(t))); }
  list.sort((a, b) => (b.i.date || '').localeCompare(a.i.date || '') || b.i.number.localeCompare(a.i.number));
  return (
    <div class="page">
      <SubNav items={FREELANCE_NAV} active="invoices" />
      <PageHeader title="Invoices" actions={<button class="btn primary" onClick={() => createInvoiceAndOpen({})}><Icon name="plus" size={18} />New invoice</button>} />
      <div class="stats">
        <div class="stat"><span class="stat-label">Total invoiced</span><span class="stat-value">{fmtMoney(f.totalInvoiced, cur, { compact: true })}</span></div>
        <div class="stat"><span class="stat-label">Received</span><span class="stat-value">{fmtMoney(f.receivedAll, cur, { compact: true })}</span></div>
        <div class="stat"><span class="stat-label">Outstanding</span><span class="stat-value">{fmtMoney(f.outstanding, cur, { compact: true })}</span></div>
        <div class={'stat ' + (f.overdue ? 'warn' : '')}><span class="stat-label">Overdue</span><span class="stat-value">{fmtMoney(f.overdue, cur, { compact: true })}</span></div>
      </div>
      <div class="chips scroll">
        {[['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['partial', 'Partial'], ['paid', 'Paid'], ['overdue', 'Overdue'], ['open', 'Unpaid']].map(([id, label]) => <button class={'chip ' + (filter === id ? 'on' : '')} onClick={() => setFilter(id)}>{label}{id !== 'all' && <span class="chip-count">{count(id)}</span>}</button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="inv-q" value={q} placeholder="Search number, client, project" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <Segmented options={[{ id: false, label: 'Current' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} />
      </div>
      {!list.length ? <div class="card"><Empty icon="file" title="No invoices here" action={!arch && <button class="btn sm primary" onClick={() => createInvoiceAndOpen({})}>Create invoice</button>} /></div> : desktop ? (
        <div class="card flush"><div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Number</th><th>Client</th><th>Project</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
          <tbody>{list.map(({ i, c }) => (
            <tr class="clickable" onClick={() => navigate('/freelance/invoices/' + i.id)}>
              <td style={{ fontWeight: 800 }} class="tnum">{i.number}</td><td>{M.clientName(i.clientId)}</td><td class="muted">{get('projects', i.projectId)?.name || '—'}</td>
              <td class="muted">{fmtShort(i.date)}</td><td class={c.status === 'overdue' ? '' : 'muted'} style={c.status === 'overdue' ? { color: 'var(--bad)', fontWeight: 700 } : null}>{fmtShort(i.dueDate)}</td>
              <td class="num">{fmtMoney(c.total, i.currency)}</td><td class="num" style={{ fontWeight: 800 }}>{c.status === 'draft' ? '—' : fmtMoney(Math.max(0, c.balance), i.currency)}</td><td><InvoiceBadge status={c.status} sm /></td>
            </tr>))}</tbody>
        </table></div></div>
      ) : (
        <div class="card"><div class="list">{list.map(({ i, c }) => (
          <a class="list-row clickable" href={'#/freelance/invoices/' + i.id}>
            <div class="row-main"><div class="row-title tnum">{i.number}</div><div class="row-meta">{M.clientName(i.clientId)} · due {fmtShort(i.dueDate)}</div></div>
            <div class="col" style={{ alignItems: 'flex-end', gap: 4 }}><span class="amount">{fmtMoney(c.status === 'draft' || c.status === 'paid' ? c.total : c.balance, i.currency, { compact: true })}</span><InvoiceBadge status={c.status} sm /></div>
          </a>))}</div></div>
      )}
    </div>
  );
}

export function InvoiceEditor({ id }) {
  useStore();
  const inv = get('invoices', id);
  const s = M.settings();
  useEffect(() => { if (inv) M.touchRecent('invoice', id); }, [id]);
  const [numDraft, setNumDraft] = useState(inv?.number || '');
  useEffect(() => { setNumDraft(inv?.number || ''); }, [inv?.number]);
  if (!inv || inv.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/freelance/invoices')} /><div class="card"><Empty icon="file" title="Invoice not found" /></div></div>;
  const c = M.calcInvoice(inv);
  const set = (ch) => {
    const n = { ...inv, ...ch };
    if (ch.clientId !== undefined && !inv.sentAt) n.clientSnapshot = M.clientSnapshot(ch.clientId);
    patch('invoices', id, n);
  };
  const setItem = (iid, ch) => set({ items: inv.items.map((it) => (it.id === iid ? { ...it, ...ch } : it)) });
  const project = get('projects', inv.projectId);
  const clients = M.liveClients().filter((x) => !x.archived || x.id === inv.clientId);
  const projects = M.liveProjects().filter((p) => (!p.archived || p.id === inv.projectId) && (!inv.clientId || p.clientId === inv.clientId));
  const itemTpls = all('templates').filter((t) => t.kind === 'items' && !t.archived);
  const termTpls = all('templates').filter((t) => t.kind === 'terms' && !t.archived);
  const payments = all('payments').filter((p) => p.invoiceId === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const commitNumber = () => {
    const n = numDraft.trim();
    if (!n || n === inv.number) return setNumDraft(inv.number);
    if (M.numberTaken(n, id)) { toast(`${n} is already used. Invoice numbers are never reused.`, { tone: 'warn' }); return setNumDraft(inv.number); }
    M.reserveInvoiceNumber(n);
    set({ number: n });
  };
  const del = async () => {
    const pc = payments.length;
    if (!(await confirmDialog({ title: `Delete ${inv.number}?`, body: pc ? `This also deletes ${pc} payment record(s) and removes them from Finance. Archiving keeps the history instead.` : 'This cannot be undone. The number stays reserved so it is never reused.', confirmLabel: 'Delete invoice', danger: true }))) return;
    payments.forEach((p) => remove('payments', p.id));
    all('tasks').filter((t) => t.invoiceId === id).forEach((t) => patch('tasks', t.id, { invoiceId: '' }));
    remove('invoices', id);
    M.logActivity(`Invoice ${inv.number} deleted`, { refType: 'invoice' });
    toast('Invoice deleted');
    back('/freelance/invoices');
  };
  const duplicate = () => {
    const { num, key, seq } = M.nextInvoiceNumber();
    M.reserveInvoiceNumber(num, key, seq);
    const d = put('invoices', { ...inv, id: uid(), number: num, date: today(), dueDate: addDays(today(), +inv.termsDays || s.defaultTermsDays), sentAt: null, archived: false, items: inv.items.map((it) => ({ ...it, id: uid() })), clientSnapshot: M.clientSnapshot(inv.clientId), issuer: null, createdAt: undefined });
    M.logActivity(`Invoice ${num} duplicated from ${inv.number}`, { refType: 'invoice', refId: d.id, projectId: d.projectId });
    toast('Duplicated as ' + num);
    navigate('/freelance/invoices/' + d.id);
  };
  const locked = !!inv.sentAt;
  return (
    <div class="page">
      <BackBar onBack={() => back('/freelance/invoices')} right={<button class="icon-btn" aria-label="Invoice actions" onClick={(e) => openMenu(e, [
        { label: 'Preview', icon: 'file', onSelect: () => openPreview(inv) },
        { label: 'Download PDF', icon: 'download', onSelect: () => downloadPdf(inv) },
        { label: 'Duplicate', icon: 'copy', onSelect: duplicate },
        { label: 'Add follow-up task', icon: 'tasks', onSelect: () => openTaskSheet(null, { title: `Follow up ${inv.number} with ${M.clientName(inv.clientId)}`, invoiceId: id, projectId: inv.projectId || '', category: 'Freelance', dueDate: today() }) },
        inv.sentAt && c.paid === 0 && { label: 'Move back to draft', icon: 'restore', onSelect: () => set({ sentAt: null }) },
        inv.archived ? { label: 'Restore from archive', icon: 'restore', onSelect: () => set({ archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { set({ archived: true }); toast('Archived. Still counted in Finance history.'); } },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
      ])}><Icon name="more" /></button>} />
      <div class="editor-head">
        <div class="row gap-8 wrap"><span class="eyebrow">Invoice</span><InvoiceBadge status={c.status} sm />{inv.archived && <span class="badge sm">Archived</span>}</div>
        <h1 class="ph-title tnum" style={{ fontSize: 34 }}>{inv.number}</h1>
        <div class="row gap-8 wrap">
          {c.status === 'draft' && <button class="btn primary" onClick={() => { M.markSent(inv); toast('Marked as sent. Recipient details are now locked in.'); }}><Icon name="send" size={16} />Mark sent</button>}
          {c.status !== 'draft' && c.balance > 0 && <button class="btn primary" onClick={() => openPaymentSheet(inv)}><Icon name="money" size={16} />Record payment</button>}
          {c.status !== 'draft' && c.balance > 0 && <button class="btn soft" onClick={() => { M.recordPayment(inv, { amount: c.balance, date: today(), method: 'Bank transfer', kind: c.paid ? 'Final payment' : 'Full payment' }); toast('Marked paid'); }}><Icon name="check" size={16} />Mark paid</button>}
          <button class="btn soft" onClick={() => openPreview(inv)}><Icon name="file" size={16} />Preview</button>
          <button class="btn soft" onClick={() => downloadPdf(inv)}><Icon name="download" size={16} />PDF</button>
        </div>
      </div>
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="form">
              <Field label="Invoice number" htmlFor="inv-number" hint="Filled in automatically. Type your own if you need to, or tap Auto for the next number. Numbers already used are blocked.">
                <div class="row gap-6">
                  <input class="input tnum grow" id="inv-number" value={numDraft} onInput={(e) => setNumDraft(e.currentTarget.value)} onBlur={commitNumber} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                  <button class="btn soft" title="Use the next automatic number" onClick={() => { const { num, key, seq } = M.nextInvoiceNumber(); M.reserveInvoiceNumber(num, key, seq); set({ number: num }); setNumDraft(num); toast('Number set to ' + num); }}>Auto</button>
                </div>
              </Field>
              <div class="form-row">
                <Field label="Client" htmlFor="inv-client"><Select id="inv-client" value={inv.clientId} onChange={(v) => set({ clientId: v, projectId: get('projects', inv.projectId)?.clientId === v ? inv.projectId : '' })} placeholder="Choose client" options={clients.map((x) => ({ id: x.id, label: x.name }))} /></Field>
                <Field label="Project (optional)" htmlFor="inv-project"><Select id="inv-project" value={inv.projectId} onChange={(v) => { const p = get('projects', v); set({ projectId: v, ...(p && !inv.clientId ? { clientId: p.clientId } : {}) }); }} placeholder="None" options={projects.map((p) => ({ id: p.id, label: p.name }))} /></Field>
              </div>
              {locked && <div class="field-hint">Sent on {fmtShort(isoOf(inv.sentAt))}. The recipient shown on the PDF stays as it was when sent: {M.invoiceRecipient(inv)?.name || '—'}.</div>}
              <div class="form-row three">
                <Field label="Invoice date" htmlFor="inv-date"><DateInput id="inv-date" value={inv.date} clearable={false} onChange={(v) => set({ date: v, dueDate: addDays(v, +inv.termsDays || 0) })} /></Field>
                <Field label="Terms (days)" htmlFor="inv-terms"><NumberInput id="inv-terms" value={inv.termsDays} onChange={(v) => set({ termsDays: v, dueDate: addDays(inv.date, +v || 0) })} /></Field>
                <Field label="Due date" htmlFor="inv-due"><DateInput id="inv-due" value={inv.dueDate} clearable={false} onChange={(v) => set({ dueDate: v })} /></Field>
              </div>
              <Field label="Currency" htmlFor="inv-cur"><Select id="inv-cur" value={inv.currency} onChange={(v) => set({ currency: v })} options={CUR_OPTS} /></Field>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Line items</div>{itemTpls.length > 0 && <button class="btn xs soft" onClick={(e) => openMenu(e, itemTpls.map((t) => ({ label: t.name, onSelect: () => { set({ items: [...inv.items.filter((it) => it.desc || it.rate), ...(t.data?.items || []).map((x) => ({ ...x, id: uid() }))] }); toast('Preset added'); } })))}>Add preset</button>}</div>
            <div class="inv-items">
              {inv.items.map((it, n) => (
                <div class="inv-item">
                  <span class="muted tnum" style={{ fontWeight: 800, paddingTop: 10 }}>{n + 1}</span>
                  <div class="inv-item-fields">
                    <input class="input mini" id={'ii-d-' + it.id} value={it.desc} placeholder="Description" onInput={(e) => setItem(it.id, { desc: e.currentTarget.value })} aria-label="Description" />
                    <div class="inv-item-nums">
                      <input class="input mini tnum" id={'ii-q-' + it.id} type="number" inputMode="decimal" min="0" step="0.5" value={it.qty} onInput={(e) => setItem(it.id, { qty: e.currentTarget.value === '' ? '' : Math.max(0, +e.currentTarget.value) })} aria-label="Quantity" />
                      <MoneyInput id={'ii-r-' + it.id} value={it.rate} currency={inv.currency} onChange={(v) => setItem(it.id, { rate: v })} />
                      <span class="inv-amount">{fmtMoney(Math.round((+it.qty || 0) * (+it.rate || 0)), inv.currency)}</span>
                    </div>
                  </div>
                  <button class="icon-btn ghost sm" aria-label="Remove item" disabled={inv.items.length <= 1} onClick={() => set({ items: inv.items.filter((x) => x.id !== it.id) })}><Icon name="x" size={15} /></button>
                </div>
              ))}
            </div>
            <button class="btn sm soft" style={{ marginTop: 10 }} onClick={() => set({ items: [...inv.items, { id: uid(), desc: '', qty: 1, rate: 0 }] })}><Icon name="plus" size={15} />Add item</button>
            <hr class="div" style={{ margin: '16px 0 12px' }} />
            <div class="form-row" style={{ marginBottom: 12 }}>
              <Field label="Discount" htmlFor="inv-dtype"><Select id="inv-dtype" value={inv.discountType} onChange={(v) => set({ discountType: v, discountValue: 0 })} options={[{ id: 'none', label: 'No discount' }, { id: 'percent', label: 'Percent' }, { id: 'amount', label: 'Fixed amount' }]} /></Field>
              {inv.discountType === 'percent' && <Field label="Percent" htmlFor="inv-dval"><NumberInput id="inv-dval" value={inv.discountValue} onChange={(v) => set({ discountValue: Math.min(100, Math.max(0, +v || 0)) })} step={1} /></Field>}
              {inv.discountType === 'amount' && <Field label="Amount" htmlFor="inv-dval"><MoneyInput id="inv-dval" value={inv.discountValue} currency={inv.currency} onChange={(v) => set({ discountValue: Math.max(0, v) })} /></Field>}
            </div>
            <div class="totals">
              <div class="tr"><span class="muted">Subtotal</span><span>{fmtMoney(c.subtotal, inv.currency)}</span></div>
              {c.discount > 0 && <div class="tr"><span class="muted">Discount{inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}</span><span>− {fmtMoney(c.discount, inv.currency)}</span></div>}
              <div class="tr big"><span>Total</span><span>{fmtMoney(c.total, inv.currency)}</span></div>
              <div class="tr"><span class="muted">Paid</span><span>{fmtMoney(c.paid, inv.currency)}</span></div>
              <div class="tr bal"><span>Balance due</span><span>{fmtMoney(Math.max(0, c.balance), inv.currency)}</span></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Terms, notes & payment details</div>{termTpls.length > 0 && <button class="btn xs soft" onClick={(e) => openMenu(e, termTpls.map((t) => ({ label: t.name, onSelect: () => set({ terms: t.data?.terms ?? inv.terms, notes: t.data?.notes ?? inv.notes }) })))}>Use template</button>}</div>
            <div class="form">
              <Field label="Payment instructions" htmlFor="inv-pay" hint={!inv.paymentInstructions && !s.paymentInstructions ? 'Tip: save your bank details once in Settings → Freelance.' : null}><TextArea id="inv-pay" value={inv.paymentInstructions} onInput={(v) => set({ paymentInstructions: v })} placeholder="Bank, account name and number" /></Field>
              <Field label="Terms" htmlFor="inv-termtext"><TextArea id="inv-termtext" value={inv.terms} onInput={(v) => set({ terms: v })} /></Field>
              <Field label="Notes" htmlFor="inv-notes"><TextArea id="inv-notes" value={inv.notes} onInput={(v) => set({ notes: v })} placeholder="Thank-you note, PO number, scope reminder" /></Field>
            </div>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Payments <span class="count">{payments.filter((p) => !p.voided).length}</span></div>{c.balance > 0 && <button class="btn xs soft" onClick={() => openPaymentSheet(inv)}><Icon name="plus" size={14} />Payment</button>}</div>
            {payments.length ? <div class="list">{payments.map((p) => (
              <div class="list-row" style={p.voided ? { opacity: 0.5 } : null}>
                <span class={'mini-ic ' + (p.voided ? 't-grey' : 't-green')}><Icon name="money" size={16} /></span>
                <div class="row-main"><div class="row-title" style={p.voided ? { textDecoration: 'line-through' } : null}>{fmtMoney(p.amount, inv.currency)}</div><div class="row-meta">{p.kind || 'Payment'} · {fmtShort(p.date)} · {p.method}{p.reference ? ' · ' + p.reference : ''}{p.voided ? ' · Voided' : ''}</div></div>
                <button class="icon-btn ghost sm" aria-label="Payment actions" onClick={(e) => openMenu(e, p.voided ? [
                  { label: 'Restore payment', icon: 'restore', onSelect: () => { if (p.amount > c.balance) return toast('Restoring would overpay this invoice.', { tone: 'warn' }); patch('payments', p.id, { voided: false, voidedAt: null }); toast('Payment restored'); } },
                ] : [
                  { label: 'Edit', icon: 'edit', onSelect: () => openPaymentSheet(inv, p) },
                  { label: 'Void payment', icon: 'x', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Void this payment?', body: `${fmtMoney(p.amount, inv.currency)} will stop counting toward this invoice and Finance. The record stays for your audit trail.`, confirmLabel: 'Void', danger: true })) { patch('payments', p.id, { voided: true, voidedAt: Date.now() }); M.logActivity(`Payment voided on ${inv.number}`, { refType: 'invoice', refId: id }); toast('Payment voided'); } } },
                ])}><Icon name="more" /></button>
              </div>))}</div> : <div class="muted" style={{ fontSize: 14 }}>{c.status === 'draft' ? 'Mark the invoice as sent, then record DP, partial or full payments here.' : 'No payments yet.'}</div>}
          </div>
          {project && <a class="card" href={'#/freelance/projects/' + project.id} style={{ textDecoration: 'none' }}><div class="eyebrow">Project</div><div class="card-title" style={{ marginTop: 4 }}>{project.name}</div><div class="row-meta" style={{ marginTop: 4 }}>{project.stage} · {M.clientName(project.clientId)}</div></a>}
          <div class="card soft"><div class="muted" style={{ fontSize: 12.5 }}>Created {fmtFull(isoOf(inv.createdAt))}{inv.sentAt ? ` · Sent ${fmtFull(isoOf(inv.sentAt))}` : ''}. Changes save automatically.</div></div>
        </div>
      </div>
    </div>
  );
}

// ---------- preview & PDF ----------
function openPreview(inv) { openOverlay((close) => <PreviewSheet id={inv.id} close={close} />, { kind: 'sheet', wide: true }); }
function PreviewSheet({ id, close }) {
  const inv = get('invoices', id);
  const c = M.calcInvoice(inv);
  const from = M.invoiceIssuer(inv);
  const to = M.invoiceRecipient(inv) || {};
  const project = inv.projectSnapshot?.name || get('projects', inv.projectId)?.name;
  const m = (v) => fmtMoney(v, inv.currency);
  return (
    <>
      <SheetHead title="Preview" sub="This is what the PDF contains" onClose={close} right={<button class="btn sm primary" onClick={() => downloadPdf(inv)}><Icon name="download" size={15} />PDF</button>} />
      <SheetBody>
        <div class="paper">
          <div style={{ height: 4, background: '#2f6bff', borderRadius: 2, margin: '-14px 0 22px' }} />
          <div class="row between" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>{from.name}</div><div class="muted" style={{ whiteSpace: 'pre-wrap' }}>{[from.owner, from.address, from.email, from.phone, from.website].filter(Boolean).join('\n')}</div></div>
            <div style={{ textAlign: 'right' }}><h1>Invoice</h1><div style={{ fontWeight: 800 }}>{inv.number}</div><div class="muted">Date: {fmtFull(inv.date)}</div><div class="muted">Due: {fmtFull(inv.dueDate)}</div></div>
          </div>
          <div class="paper-grid">
            <div><div class="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>Bill to</div><div style={{ fontWeight: 800 }}>{to.name || '—'}</div><div class="muted" style={{ whiteSpace: 'pre-wrap' }}>{[to.pic, to.email, to.phone, to.address].filter(Boolean).join('\n')}</div></div>
            {project && <div><div class="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>Project</div><div style={{ fontWeight: 800 }}>{project}</div></div>}
          </div>
          <table>
            <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>{c.items.map((it) => <tr><td style={{ whiteSpace: 'pre-wrap' }}>{it.desc || '—'}</td><td class="num">{it.qty}</td><td class="num">{m(it.rate)}</td><td class="num">{m(it.amount)}</td></tr>)}</tbody>
          </table>
          <div style={{ marginLeft: 'auto', maxWidth: 300, marginTop: 14 }} class="totals">
            <div class="tr"><span class="muted">Subtotal</span><span>{m(c.subtotal)}</span></div>
            {c.discount > 0 && <div class="tr"><span class="muted">Discount</span><span>− {m(c.discount)}</span></div>}
            <div class="tr big"><span>Total</span><span>{m(c.total)}</span></div>
            {c.paid > 0 && <div class="tr"><span class="muted">Paid</span><span>− {m(c.paid)}</span></div>}
            <div class="tr" style={{ fontWeight: 800, color: '#d9430f', fontSize: 16 }}><span>Balance due</span><span>{m(Math.max(0, c.balance))}</span></div>
          </div>
          {c.payments.length > 0 && <div style={{ marginTop: 18 }}><div class="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>Payments received</div>{c.payments.map((p) => <div class="row between"><span>{fmtFull(p.date)} · {p.kind || p.method}</span><span class="tnum">{m(p.amount)}</span></div>)}</div>}
          {[['Payment instructions', inv.paymentInstructions], ['Terms', inv.terms], ['Notes', inv.notes]].filter(([, v]) => v).map(([k, v]) => <div style={{ marginTop: 16 }}><div class="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>{k}</div><div style={{ whiteSpace: 'pre-wrap' }}>{v}</div></div>)}
        </div>
      </SheetBody>
    </>
  );
}

export { loadJsPdf };
export async function buildInvoicePdf(inv) {
  const jsPDF = await loadJsPdf();
  const c = M.calcInvoice(inv);
  const from = M.invoiceIssuer(inv);
  const to = M.invoiceRecipient(inv) || {};
  const project = inv.projectSnapshot?.name || get('projects', inv.projectId)?.name;
  const m = (v) => fmtMoney(v, inv.currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 18, R = W - 18;
  const ink = [20, 22, 28], muted = [116, 130, 151], line = [227, 231, 238], accent = [47, 107, 255];
  let y = 18;
  doc.setFillColor(...accent); doc.rect(L, 12, R - L, 1.2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink);
  doc.text(from.name || 'Invoice', L, y + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  let fy = y + 14;
  for (const l of [from.owner, from.address, from.email, from.phone, from.website].filter(Boolean)) for (const part of doc.splitTextToSize(String(l), 85)) { doc.text(part, L, fy); fy += 4.4; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(...ink);
  doc.text('INVOICE', R, y + 9, { align: 'right' });
  doc.setFontSize(11); doc.text(inv.number, R, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text(`Invoice date: ${fmtFull(inv.date)}`, R, y + 22, { align: 'right' });
  doc.text(`Due date: ${fmtFull(inv.dueDate)}`, R, y + 26.5, { align: 'right' });
  y = Math.max(fy, y + 32) + 6;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text('BILL TO', L, y);
  if (project) doc.text('PROJECT', 112, y);
  y += 5;
  doc.setFontSize(10.5); doc.setTextColor(...ink); doc.text(to.name || '-', L, y);
  if (project) doc.text(doc.splitTextToSize(project, 80), 112, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  let ty = y + 5;
  for (const l of [to.pic, to.email, to.phone, to.address].filter(Boolean)) for (const part of doc.splitTextToSize(String(l), 85)) { doc.text(part, L, ty); ty += 4.4; }
  y = ty + 8;
  const cols = { d: L, q: 122, r: 152, a: R };
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...muted);
    doc.text('DESCRIPTION', cols.d, y); doc.text('QTY', cols.q, y, { align: 'right' }); doc.text('RATE', cols.r + 12, y, { align: 'right' }); doc.text('AMOUNT', cols.a, y, { align: 'right' });
    y += 2.5; doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 5.5;
  };
  const pageBreak = (need) => { if (y + need > 275) { doc.addPage(); y = 20; head(); } };
  head();
  doc.setFontSize(9.5);
  for (const it of c.items) {
    const lines = doc.splitTextToSize(it.desc || '-', 95);
    pageBreak(lines.length * 4.6 + 4);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink);
    doc.text(lines, cols.d, y);
    doc.text(String(it.qty), cols.q, y, { align: 'right' });
    doc.text(m(it.rate), cols.r + 12, y, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.text(m(it.amount), cols.a, y, { align: 'right' });
    y += lines.length * 4.6 + 2; doc.setDrawColor(238, 240, 244); doc.line(L, y, R, y); y += 5;
  }
  pageBreak(40);
  const row = (label, val, bold, color) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5); doc.setTextColor(...(color || (bold ? ink : muted))); doc.text(label, 132, y); doc.setTextColor(...(color || ink)); doc.text(val, R, y, { align: 'right' }); y += bold ? 7 : 5.5; };
  y += 2;
  row('Subtotal', m(c.subtotal));
  if (c.discount > 0) row(`Discount${inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}`, '- ' + m(c.discount));
  doc.setDrawColor(...line); doc.line(132, y - 2.5, R, y - 2.5); y += 2;
  row('Total', m(c.total), true);
  if (c.paid > 0) row('Paid', '- ' + m(c.paid));
  row('Balance due', m(Math.max(0, c.balance)), true, [217, 67, 15]);
  y += 4;
  const block = (title, text) => {
    if (!text) return;
    const lines = doc.splitTextToSize(String(text), R - L);
    pageBreak(lines.length * 4.4 + 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(title.toUpperCase(), L, y); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text(lines, L, y); y += lines.length * 4.4 + 5;
  };
  if (c.payments.length) block('Payments received', c.payments.map((p) => `${fmtFull(p.date)}  ·  ${p.kind || 'Payment'}  ·  ${p.method}${p.reference ? '  ·  ' + p.reference : ''}  ·  ${m(p.amount)}`).join('\n'));
  block('Payment instructions', inv.paymentInstructions);
  block('Terms', inv.terms);
  block('Notes', inv.notes);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(`${inv.number}  ·  Page ${i} of ${pages}`, R, 288, { align: 'right' }); doc.text(from.name || '', L, 288); }
  return doc;
}
async function downloadPdf(inv) {
  try {
    const doc = await buildInvoicePdf(inv);
    const name = `${inv.number}${M.clientName(inv.clientId) !== 'No client' ? ' - ' + M.clientName(inv.clientId) : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    const r = await saveFile(name, doc.output('blob'), 'application/pdf');
    const [msg, tone] = saveMessage(r, 'PDF saved: ' + name);
    toast(msg, { tone, duration: tone ? 5000 : 2600 });
  } catch (e) { toast('Could not create the PDF: ' + e.message, { tone: 'warn' }); }
}

// =====================================================================
// FINANCE
// =====================================================================
export function FinancePage() {
  useStore();
  const s = M.settings();
  const t0 = today();
  const curs = [...new Set([s.defaultCurrency, ...M.liveInvoices().map((i) => i.currency || 'IDR')])];
  const [cur, setCur] = useState(s.defaultCurrency);
  const [month, setMonth] = useState(monthKey(t0));
  const [showArch, setShowArch] = useState(true);
  const f = M.finance(cur, month);
  const mIso = month + '-01';
  const months = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(mIso, i - 5)));
  const max = Math.max(1, ...months.map((k) => f.byMonth[k] || 0));
  const pays = all('payments').filter((p) => { const i = get('invoices', p.invoiceId); return i && !i.deletedAt && (i.currency || 'IDR') === cur && (showArch || !i.archived); }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthPays = pays.filter((p) => monthKey(p.date || '') === month);
  return (
    <div class="page">
      <SubNav items={FREELANCE_NAV} active="finance" />
      <PageHeader title="Finance" actions={curs.length > 1 && <Segmented options={curs.map((c) => ({ id: c, label: c }))} value={cur} onChange={setCur} />}>
        <div class="muted" style={{ marginTop: 6 }}>Freelance money only, from invoices and recorded payments. Personal budget lives elsewhere.</div>
      </PageHeader>
      <div class="row gap-8">
        <button class="icon-btn soft sm" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(mIso, -1)))}><Icon name="chevronLeft" size={18} /></button>
        <div style={{ fontWeight: 800, minWidth: 130, textAlign: 'center' }}>{fmtMonth(mIso)}</div>
        <button class="icon-btn soft sm" aria-label="Next month" onClick={() => setMonth(monthKey(addMonths(mIso, 1)))}><Icon name="chevronRight" size={18} /></button>
      </div>
      <div class="stats five">
        <div class="stat"><span class="stat-label">Received in {fmtMonthShort(mIso)}</span><span class="stat-value">{fmtMoney(f.receivedMonth, cur, { compact: true })}</span><span class="stat-sub">{monthPays.filter((p) => !p.voided).length} payment(s)</span></div>
        <div class="stat"><span class="stat-label">Invoiced in {fmtMonthShort(mIso)}</span><span class="stat-value">{fmtMoney(f.invoicedMonth, cur, { compact: true })}</span><span class="stat-sub">By invoice date</span></div>
        <div class="stat"><span class="stat-label">Outstanding</span><span class="stat-value">{fmtMoney(f.outstanding, cur, { compact: true })}</span><span class="stat-sub">All unpaid balances</span></div>
        <div class={'stat ' + (f.overdue ? 'warn' : '')}><span class="stat-label">Overdue</span><span class="stat-value">{fmtMoney(f.overdue, cur, { compact: true })}</span><span class="stat-sub">Past due date</span></div>
        <div class="stat"><span class="stat-label">Pipeline value</span><span class="stat-value">{fmtMoney(f.pipeline, cur, { compact: true })}</span><span class="stat-sub">Open projects, not revenue</span></div>
      </div>
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Revenue received</div><span class="muted" style={{ fontSize: 13 }}>All time {fmtMoney(f.receivedAll, cur, { compact: true })}</span></div>
            <div class="bars" role="img" aria-label="Revenue received for the last six months">
              {months.map((k) => { const v = f.byMonth[k] || 0; return (
                <div class={'bar ' + (k === month ? 'cur' : '')}><span class="bar-val">{v ? fmtMoney(v, cur, { compact: true }).replace(/^\S+\s/, '') : ''}</span><div class="bar-fill" style={{ height: (v / max) * 100 + '%' }} /><span class="bar-label">{fmtMonthShort(k + '-01')}</span></div>
              ); })}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Payment history</div><label class="row gap-6" style={{ fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={showArch} onChange={(e) => setShowArch(e.currentTarget.checked)} />Include archived</label></div>
            {pays.length ? <div class="list">{pays.slice(0, 40).map((p) => { const i = get('invoices', p.invoiceId); return (
              <a class="list-row clickable" href={'#/freelance/invoices/' + i.id} style={p.voided ? { opacity: 0.5 } : null}>
                <span class={'mini-ic ' + (p.voided ? 't-grey' : 't-green')}><Icon name="money" size={16} /></span>
                <div class="row-main"><div class="row-title">{M.clientName(i.clientId)}</div><div class="row-meta">{fmtShort(p.date)} · {i.number} · {p.kind || p.method}{p.voided ? ' · Voided' : ''}</div></div>
                <span class="amount" style={p.voided ? { textDecoration: 'line-through' } : null}>{fmtMoney(p.amount, cur)}</span>
              </a>); })}</div> : <div class="muted" style={{ fontSize: 14 }}>No payments recorded yet.</div>}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">Invoice history</div><a class="section-link" href="#/freelance/invoices">All invoices</a></div>
            <div class="list">{M.liveInvoices().filter((i) => (i.currency || 'IDR') === cur && (showArch || !i.archived)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12).map((i) => { const c = M.calcInvoice(i); return <a class="list-row clickable" href={'#/freelance/invoices/' + i.id}><div class="row-main"><div class="row-title tnum">{i.number}</div><div class="row-meta">{M.clientName(i.clientId)} · {fmtShort(i.date)}{i.archived ? ' · Archived' : ''}</div></div><div class="col" style={{ alignItems: 'flex-end', gap: 4 }}><span class="amount" style={{ fontSize: 13.5 }}>{fmtMoney(c.total, cur, { compact: true })}</span><InvoiceBadge status={c.status} sm /></div></a>; })}</div>
          </div>
          <div class="card soft"><div style={{ fontSize: 13 }} class="muted"><b style={{ color: 'var(--ink)' }}>How these numbers work.</b> Received counts recorded payments by the date you got them, so a DP and a final payment each count once. Outstanding and overdue use unpaid balances of sent invoices. Pipeline value is what is still left to collect on projects from Lead to Delivered (fee minus payments already in), and is never added to revenue.</div></div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// TEMPLATES
// =====================================================================
const TPL_KINDS = [{ id: 'project', label: 'Projects' }, { id: 'items', label: 'Line items' }, { id: 'terms', label: 'Terms & notes' }];
export function TemplatesPage() {
  useStore();
  const [kind, setKind] = useState('project');
  const [arch, setArch] = useState(false);
  const list = all('templates').filter((t) => t.kind === kind && !!t.archived === arch).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div class="page narrow">
      <SubNav items={FREELANCE_NAV} active="templates" />
      <PageHeader title="Templates" actions={<button class="btn primary" onClick={() => openTemplateSheet(null, kind)}><Icon name="plus" size={18} />New template</button>}>
        <div class="muted" style={{ marginTop: 6 }}>Applying a template copies its values. Editing a template never changes past projects or invoices.</div>
      </PageHeader>
      <div class="row gap-8 wrap"><Segmented options={TPL_KINDS} value={kind} onChange={setKind} /><Segmented options={[{ id: false, label: 'Active' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} /></div>
      <div class="card">
        {list.length ? <div class="list">{list.map((t) => (
          <div class="list-row clickable" onClick={() => openTemplateSheet(t.id)}>
            <span class="mini-ic t-violet"><Icon name="template" size={16} /></span>
            <div class="row-main"><div class="row-title">{t.name}</div><div class="row-meta">{kind === 'project' ? [t.data?.type, t.data?.fee ? fmtMoney(t.data.fee, t.data.currency) : '', `${(t.data?.deliverables || []).length} deliverables`, `${(t.data?.tasks || []).length} tasks`].filter(Boolean).join(' · ') : kind === 'items' ? `${(t.data?.items || []).length} item(s)` : (t.data?.terms || '').slice(0, 70)}</div></div>
            <button class="icon-btn ghost sm" aria-label="Template actions" onClick={(e) => openMenu(e, [
              { label: 'Edit', icon: 'edit', onSelect: () => openTemplateSheet(t.id) },
              { label: 'Duplicate', icon: 'copy', onSelect: () => { put('templates', { ...JSON.parse(JSON.stringify(t)), id: uid(), name: t.name + ' (copy)', createdAt: undefined }); toast('Duplicated'); } },
              t.archived ? { label: 'Restore', icon: 'restore', onSelect: () => patch('templates', t.id, { archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => patch('templates', t.id, { archived: true }) },
              { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: `Delete “${t.name}”?`, body: 'Projects and invoices made from it are not affected.', confirmLabel: 'Delete', danger: true })) { remove('templates', t.id); toast('Template deleted'); } } },
            ])}><Icon name="more" /></button>
          </div>))}</div> : <Empty icon="template" title={arch ? 'Nothing archived' : 'No templates yet'} action={!arch && <button class="btn sm primary" onClick={() => openTemplateSheet(null, kind)}>Create one</button>}>{!arch && kind === 'project' ? 'Save a standard setup, like a fashion campaign with its usual deliverables and tasks.' : null}</Empty>}
      </div>
    </div>
  );
}
function openTemplateSheet(id, kind) { openOverlay((close) => <TemplateSheet id={id} kind={kind} close={close} />, { kind: 'sheet' }); }
function TemplateSheet({ id, kind, close }) {
  const s = M.settings();
  const ex = id ? get('templates', id) : null;
  const k = ex?.kind || kind;
  const [t, setT] = useState(() => ex ? JSON.parse(JSON.stringify(ex)) : { name: '', kind: k, archived: false, data: k === 'project' ? { type: '', fee: 0, currency: s.defaultCurrency, deliverables: [...s.defaultDeliverables], tasks: [] } : k === 'items' ? { currency: s.defaultCurrency, items: [{ id: uid(), desc: '', qty: 1, rate: 0 }] } : { terms: s.defaultTermsText, notes: '' } });
  const setD = (ch) => setT({ ...t, data: { ...t.data, ...ch } });
  const save = () => { if (!t.name.trim()) return toast('Name the template.', { tone: 'warn' }); put('templates', { ...t, id: ex?.id || uid(), name: t.name.trim() }); toast('Template saved'); close(); };
  const toItems = (arr) => arr.map((text) => ({ id: uid(), text, done: false }));
  return (
    <>
      <SheetHead title={ex ? 'Edit template' : 'New template'} sub={TPL_KINDS.find((x) => x.id === k).label} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Template name" htmlFor="tp-name"><TextInput id="tp-name" value={t.name} onInput={(v) => setT({ ...t, name: v })} placeholder={k === 'project' ? 'e.g. Fashion campaign, half day' : k === 'items' ? 'e.g. Reel package' : 'e.g. 50% DP terms'} autoFocus={!ex} /></Field>
        {k === 'project' && <>
          <div class="form-row">
            <Field label="Project type" htmlFor="tp-type"><Select id="tp-type" value={t.data.type} onChange={(v) => setD({ type: v })} placeholder="None" options={s.projectTypes} /></Field>
            <Field label="Default fee" htmlFor="tp-fee"><MoneyInput id="tp-fee" value={t.data.fee} currency={t.data.currency} onChange={(v) => setD({ fee: v })} /></Field>
          </div>
          <Field label="Deliverables"><ChecklistEditor items={toItems(t.data.deliverables || [])} onChange={(v) => setD({ deliverables: v.map((x) => x.text) })} showProgress={false} placeholder="Add deliverable" idPrefix="tp-dv" /></Field>
          <Field label="Tasks created with the project"><ChecklistEditor items={toItems(t.data.tasks || [])} onChange={(v) => setD({ tasks: v.map((x) => x.text) })} showProgress={false} placeholder="e.g. Send moodboard" idPrefix="tp-tk" /></Field>
        </>}
        {k === 'items' && <>
          <Field label="Currency" htmlFor="tp-cur"><Select id="tp-cur" value={t.data.currency} onChange={(v) => setD({ currency: v })} options={CUR_OPTS} /></Field>
          {t.data.items.map((it) => (
            <div class="inv-item" style={{ gridTemplateColumns: 'minmax(0,1fr) 34px' }}>
              <div class="inv-item-fields" style={{ gridTemplateColumns: '1fr' }}>
                <input class="input mini" value={it.desc} placeholder="Description" onInput={(e) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, desc: e.currentTarget.value } : x)) })} aria-label="Description" />
                <div class="inv-item-nums" style={{ gridTemplateColumns: '70px minmax(0,1fr)' }}>
                  <input class="input mini" type="number" min="0" value={it.qty} onInput={(e) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, qty: +e.currentTarget.value || 0 } : x)) })} aria-label="Quantity" />
                  <MoneyInput value={it.rate} currency={t.data.currency} onChange={(v) => setD({ items: t.data.items.map((x) => (x.id === it.id ? { ...x, rate: v } : x)) })} />
                </div>
              </div>
              <button class="icon-btn ghost sm" aria-label="Remove" onClick={() => setD({ items: t.data.items.filter((x) => x.id !== it.id) })}><Icon name="x" size={15} /></button>
            </div>
          ))}
          <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ items: [...t.data.items, { id: uid(), desc: '', qty: 1, rate: 0 }] })}><Icon name="plus" size={15} />Add item</button>
        </>}
        {k === 'terms' && <>
          <Field label="Terms" htmlFor="tp-terms"><TextArea id="tp-terms" value={t.data.terms} onInput={(v) => setD({ terms: v })} /></Field>
          <Field label="Notes" htmlFor="tp-notes"><TextArea id="tp-notes" value={t.data.notes} onInput={(v) => setD({ notes: v })} /></Field>
        </>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>Save template</button></SheetFoot>
    </>
  );
}
