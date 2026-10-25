// Shared data model, defaults, derived values and cross-record actions for the project manager.
import { get, all, put, patch, remove, uid } from './db.js';
import { today, addDays, diffDays, nextOccurrence, isoOf, monthKey, nowParts } from './date.js';

// ---------- constants ----------
export const TASK_STATUSES = [
  { id: 'open', label: 'To do' }, { id: 'in_progress', label: 'In progress' }, { id: 'done', label: 'Done' },
  { id: 'deferred', label: 'Deferred' }, { id: 'cancelled', label: 'Cancelled' },
];
export const OPEN_STATUSES = ['inbox', 'open', 'in_progress'];

export const STAGES = [
  { id: 'lead', label: 'Lead', tone: 'lavender' },
  { id: 'planned', label: 'Planned', tone: 'sage' },
  { id: 'in_progress', label: 'In progress', tone: 'butter' },
  { id: 'shooting', label: 'Shooting', tone: 'sage' },
  { id: 'editing', label: 'Editing', tone: 'butter' },
  { id: 'client_review', label: 'Waiting for feedback', tone: 'cyan' },
  { id: 'revision', label: 'Revision', tone: 'rose' },
  { id: 'approved', label: 'Approved', tone: 'cyan' },
  { id: 'delivered', label: 'Delivered', tone: 'lavender' },
  { id: 'completed', label: 'Completed', tone: 'plain' },
];
export const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[1];
export const stageIdx = (id) => STAGES.findIndex((s) => s.id === id);

// ---------- workflows ----------
// A project follows one of two simple flows. Existing projects (made before workflows) are video productions.
export const WORKFLOWS = [{ id: 'general', label: 'General' }, { id: 'video', label: 'Video production' }];
const WF_STAGES = {
  general: ['planned', 'in_progress', 'client_review', 'completed'],
  video: ['lead', 'planned', 'shooting', 'editing', 'client_review', 'revision', 'approved', 'delivered', 'completed'],
};
const GENERAL_LABELS = { client_review: 'Review', completed: 'Done' };
export const projectWorkflow = (p) => (p && WF_STAGES[p.workflow] ? p.workflow : 'video');
export const workflowLabel = (id) => (WORKFLOWS.find((w) => w.id === id) || WORKFLOWS[1]).label;
export const stageLabel = (id, wf = 'video') => (wf === 'general' && GENERAL_LABELS[id]) || stageOf(id).label;
export const stagesFor = (p) => WF_STAGES[projectWorkflow(p)].map((id) => ({ ...stageOf(id), label: stageLabel(id, projectWorkflow(p)) }));
export const projectStageLabel = (p) => stageLabel(p.stage, projectWorkflow(p));
// When a project switches flow, move its stage to the closest one in the new flow.
const TO_GENERAL = { lead: 'planned', shooting: 'in_progress', editing: 'in_progress', revision: 'in_progress', approved: 'client_review', delivered: 'completed' };
const TO_VIDEO = { in_progress: 'editing' };
export function workflowStage(stage, wf) {
  if (WF_STAGES[wf].includes(stage)) return stage;
  return (wf === 'general' ? TO_GENERAL : TO_VIDEO)[stage] || 'planned';
}

// ---------- categories ----------
// Categories group projects (In-house, Freelance, Personal...). Billing is a separate switch on each project.
export const CATEGORY_COLORS = ['butter', 'sage', 'cyan', 'lavender', 'peach', 'rose', 'plain'];
export const DEFAULT_CATEGORIES = [
  { id: 'in_house', name: 'In-house', color: 'butter', archived: false, order: 1 },
  { id: 'freelance', name: 'Freelance', color: 'sage', archived: false, order: 2 },
  { id: 'personal', name: 'Personal', color: 'cyan', archived: false, order: 3 },
  { id: 'learning', name: 'Learning', color: 'lavender', archived: false, order: 4 },
];
const catItems = () => get('meta', 'pmCategories')?.items || DEFAULT_CATEGORIES;
export const categories = ({ includeArchived = false } = {}) => [...catItems()].filter((c) => includeArchived || !c.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
export const categoryOf = (id) => catItems().find((c) => c.id === id) || { id: id || '', name: id ? 'Other' : 'No category', color: 'plain', archived: false };
export const projectCategoryId = (p) => (p && (p.categoryId || p.workspace)) || settings().defaultCategory;
export const projectCategory = (p) => categoryOf(projectCategoryId(p));
export const projectBilling = (p) => (p && typeof p.billing === 'boolean' ? p.billing : projectCategoryId(p) === 'freelance');
function saveCats(items) { put('meta', { id: 'pmCategories', items }); }
export function addCategory(name, color = 'plain') {
  const items = catItems();
  const c = { id: uid(), name: name.trim(), color, archived: false, order: Math.max(0, ...items.map((x) => x.order || 0)) + 1 };
  saveCats([...items, c]);
  return c;
}
export function updateCategory(id, ch) { saveCats(catItems().map((c) => (c.id === id ? { ...c, ...ch } : c))); }
export const categoryProjectCount = (id) => liveProjects().filter((p) => projectCategoryId(p) === id).length;

export const DELIVERABLE_STATUSES = [
  { id: 'not_started', label: 'Not started', tone: 'plain' },
  { id: 'in_progress', label: 'In progress', tone: 'butter' },
  { id: 'ready', label: 'Ready to send', tone: 'sage' },
  { id: 'sent', label: 'Sent', tone: 'cyan' },
  { id: 'waiting', label: 'Waiting for approval', tone: 'lavender' },
  { id: 'revision', label: 'Revision requested', tone: 'rose' },
  { id: 'approved', label: 'Approved', tone: 'sage' },
  { id: 'delivered', label: 'Delivered', tone: 'ink' },
];
export const deliverableStatus = (id) => DELIVERABLE_STATUSES.find((s) => s.id === id) || DELIVERABLE_STATUSES[0];
export const isApproved = (d) => d.status === 'approved' || d.status === 'delivered';

export const LINK_TYPES = [{ id: 'drive', label: 'Drive folder' }, { id: 'reference', label: 'Reference' }, { id: 'final', label: 'Final file' }, { id: 'other', label: 'Other' }];
export const PAYMENT_METHODS = ['Bank transfer', 'E-wallet', 'QRIS', 'Cash', 'PayPal', 'Other'];
export const PAYMENT_KINDS = ['Full payment', 'DP / deposit', 'Partial payment', 'Final payment'];

export const DEFAULT_SETTINGS = {
  id: 'pmSettings',
  name: 'Denizar',
  weekStart: 1,
  defaultCategory: 'freelance',
  defaultWorkflow: 'general',
  defaultEstimate: 0,
  reminderTime: '09:00',
  pushLead: 0,
  business: { name: 'Vandenizar', owner: 'Denizar', email: '', phone: '', address: 'Bekasi, Indonesia', website: '' },
  invoiceFormat: 'INV-{YYYY}-{####}',
  defaultCurrency: 'IDR',
  defaultTermsDays: 14,
  defaultTermsText: 'Payment due within 14 days of the invoice date. Final files are delivered after full payment.',
  paymentInstructions: '',
};

export function settings() {
  const s = get('meta', 'pmSettings');
  if (!s) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...s, defaultCategory: s.defaultCategory || s.defaultWorkspace || DEFAULT_SETTINGS.defaultCategory, business: { ...DEFAULT_SETTINGS.business, ...(s.business || {}) } };
}
export const setSettings = (ch) => put('meta', { ...settings(), ...(typeof ch === 'function' ? ch(settings()) : ch), id: 'pmSettings' });
export const meta = (id, fallback) => get('meta', id) || fallback;

// ---------- recent ----------
export function touchRecent(type, id) {
  const r = meta('recent', { id: 'recent', items: [] });
  const items = [{ type, id, at: Date.now() }, ...(r.items || []).filter((x) => !(x.type === type && x.id === id))].slice(0, 12);
  put('meta', { ...r, id: 'recent', items }, { silent: true });
}

// ---------- time helpers ----------
const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function nowStamp() { const n = nowParts(); return { date: n.date, min: n.hour * 60 + n.minute }; }
// Is (date, time) before now in WIB? A date without a time counts until the end of that day.
export function isPast(date, time) {
  if (!date) return false;
  const n = nowStamp();
  if (date !== n.date) return date < n.date;
  const m = toMin(time);
  return m != null && m < n.min;
}

// ---------- tasks ----------
export const liveTasks = () => all('pmTasks').filter((t) => !t.deletedAt && !t.archived);
export const isOpen = (t) => !!t && !t.deletedAt && !t.archived && OPEN_STATUSES.includes(t.status);
export const isDone = (t) => t && t.status === 'done';
export const isOverdue = (t) => isOpen(t) && !!t.deadlineDate && isPast(t.deadlineDate, t.deadlineTime);
// Work schedule passed but the hard deadline has not: "Not done yet", never "overdue".
export const isBehind = (t) => isOpen(t) && !!t.workDate && !isOverdue(t) && (t.workDate < today() || (t.workDate === today() && t.workTime && isPast(t.workDate, t.workTime) && t.status !== 'in_progress'));
export const isInbox = (t) => isOpen(t) && !t.workDate && !t.deadlineDate && !t.pinnedOn;

export function newTask(p = {}) {
  const s = settings();
  const t = {
    id: uid(), title: '', status: 'open', workDate: null, workTime: null, deadlineDate: null, deadlineTime: null,
    estimateMinutes: s.defaultEstimate || null, priority: 'normal', projectId: null, invoiceId: null, subtasks: [], notes: '',
    order: Date.now(), archived: false, deletedAt: null, completedAt: null, pinnedOn: null, recurrence: null,
    focusSessions: [], focusStartedAt: null, ...p,
  };
  if (!t.workDate && !t.deadlineDate && !t.pinnedOn && t.status === 'open') t.status = 'inbox';
  return put('pmTasks', t);
}
// Keep the inbox/open status in step with whether the task has a date.
export function patchTask(id, ch) {
  const cur = get('pmTasks', id);
  if (!cur) return null;
  const n = { ...cur, ...ch };
  if (OPEN_STATUSES.includes(n.status) && n.status !== 'in_progress') n.status = (n.workDate || n.deadlineDate || n.pinnedOn) ? 'open' : 'inbox';
  return patch('pmTasks', id, { ...ch, status: n.status });
}
export function completeTask(id) {
  const t = get('pmTasks', id);
  if (!t) return;
  const now = Date.now();
  const sessions = t.focusSessions || [];
  if (t.recurrence && t.recurrence.freq) {
    const from = t.workDate || today();
    let next = nextOccurrence(t.recurrence, from);
    while (next && diffDays(next, today()) < 0) next = nextOccurrence(t.recurrence, next);
    patch('pmTasks', id, { workDate: next, status: 'open', completions: [...(t.completions || []), { date: from, at: now }], lastCompletedAt: now, focusSessions: sessions, focusStartedAt: null, subtasks: (t.subtasks || []).map((s) => ({ ...s, done: false })) });
  } else {
    patch('pmTasks', id, { status: 'done', completedAt: now, focusSessions: sessions, focusStartedAt: null });
  }
  if (meta('focus', {}).taskId === id) put('meta', { id: 'focus', taskId: null });
}
export function reopenTask(id) { const t = get('pmTasks', id); if (!t) return; patch('pmTasks', id, { status: t.workDate || t.deadlineDate ? 'open' : 'inbox', completedAt: null }); }
export function trashTask(id) { patch('pmTasks', id, { deletedAt: Date.now() }); for (const p of all('pmProjects')) if (p.nextActionTaskId === id) patch('pmProjects', p.id, { nextActionTaskId: null }); }

// Rescheduling only ever touches the work schedule. The deadline stays.
export function rescheduleWork(id, workDate, workTime = null) { patchTask(id, { workDate: workDate || null, workTime: workDate ? workTime || null : null, status: get('pmTasks', id)?.status === 'deferred' ? 'open' : get('pmTasks', id)?.status }); }

const sortKey = (d, t) => (d ? d + (t || '99:99') : '9999');
export function sortTasks(list, by = 'schedule') {
  const arr = [...list];
  const prio = (t) => (t.priority === 'high' ? 0 : 1);
  if (by === 'manual') arr.sort((a, b) => (a.order || 0) - (b.order || 0));
  else if (by === 'deadline') arr.sort((a, b) => sortKey(a.deadlineDate, a.deadlineTime).localeCompare(sortKey(b.deadlineDate, b.deadlineTime)) || prio(a) - prio(b));
  else if (by === 'project') arr.sort((a, b) => projectName(a.projectId).localeCompare(projectName(b.projectId)) || sortKey(a.workDate, a.workTime).localeCompare(sortKey(b.workDate, b.workTime)));
  else arr.sort((a, b) => (a.status === 'in_progress' ? -1 : 0) - (b.status === 'in_progress' ? -1 : 0) || sortKey(a.workDate, a.workTime).localeCompare(sortKey(b.workDate, b.workTime)) || prio(a) - prio(b) || sortKey(a.deadlineDate, a.deadlineTime).localeCompare(sortKey(b.deadlineDate, b.deadlineTime)) || (a.order || 0) - (b.order || 0));
  return arr;
}
export const subtaskCount = (t) => ({ done: (t.subtasks || []).filter((s) => s.done).length, total: (t.subtasks || []).length });

// Tasks for Today: scheduled for today, pinned for today, deadline today, plus overdue deadlines.
export function todayTasks() {
  const t0 = today();
  return liveTasks().filter((t) => isOpen(t) && (t.workDate === t0 || t.pinnedOn === t0 || t.deadlineDate === t0 || isOverdue(t)));
}
// The one task to work on now. Order: overdue deadline, in progress today, next scheduled today, pinned, project next action.
export function recommendedTask() {
  const t0 = today();
  const open = liveTasks().filter(isOpen);
  const overdue = sortTasks(open.filter(isOverdue), 'deadline');
  if (overdue.length) return { task: overdue[0], reason: 'overdue' };
  const prog = open.filter((t) => t.status === 'in_progress' && (t.workDate === t0 || t.pinnedOn === t0));
  if (prog.length) return { task: prog[0], reason: 'in_progress' };
  const n = nowStamp();
  const sched = sortTasks(open.filter((t) => t.workDate === t0), 'schedule');
  const upcoming = sched.find((t) => !t.workTime || toMin(t.workTime) + (t.estimateMinutes || 60) > n.min);
  if (upcoming || sched.length) return { task: upcoming || sched[0], reason: 'scheduled' };
  const pinned = open.filter((t) => t.pinnedOn === t0);
  if (pinned.length) return { task: sortTasks(pinned)[0], reason: 'pinned' };
  const actions = liveProjects().filter((p) => !p.archived && p.stage !== 'completed').map((p) => ({ p, t: nextActionTask(p) })).filter((x) => x.t)
    .sort((a, b) => sortKey(a.p.deadlineDate, a.p.deadlineTime).localeCompare(sortKey(b.p.deadlineDate, b.p.deadlineTime)));
  if (actions.length) return { task: actions[0].t, reason: 'next_action' };
  return null;
}

// ---------- projects ----------
export const liveProjects = () => all('pmProjects').filter((p) => !p.deletedAt);
export const projectName = (id) => (id && get('pmProjects', id)?.name) || '';
export function newProject(p = {}) {
  const s = settings();
  const categoryId = p.categoryId || p.workspace || s.defaultCategory;
  return put('pmProjects', {
    id: uid(), name: '', categoryId, workflow: s.defaultWorkflow || 'general', billing: categoryId === 'freelance', clientId: null, stage: 'planned', startDate: null, shootDate: null, deadlineDate: null, deadlineTime: null,
    nextActionTaskId: null, brief: '', notes: '', links: [], deliverables: [], followUpDate: null, previewSentAt: null, archived: false, deletedAt: null, ...p,
  });
}
export const projectTasks = (pid) => liveTasks().filter((t) => t.projectId === pid);
export function nextActionTask(p) {
  const chosen = p.nextActionTaskId && get('pmTasks', p.nextActionTaskId);
  if (chosen && isOpen(chosen)) return chosen;
  return sortTasks(projectTasks(p.id).filter(isOpen), 'schedule')[0] || null;
}
export function projectProgress(p) {
  const ts = projectTasks(p.id).filter((t) => t.status !== 'cancelled');
  const dv = p.deliverables || [];
  return { tasksDone: ts.filter(isDone).length, tasksTotal: ts.length, approved: dv.filter(isApproved).length, deliverables: dv.length };
}
// The next date worth showing on a project card.
export function projectDate(p) {
  if (p.stage === 'client_review' && p.followUpDate) return { label: 'Follow-up', date: p.followUpDate };
  if (p.shootDate && stageIdx(p.stage) <= stageIdx('shooting') && p.shootDate >= today()) return { label: 'Shoot', date: p.shootDate };
  if (p.deadlineDate && stageIdx(p.stage) < stageIdx('delivered')) return { label: 'Deadline', date: p.deadlineDate, time: p.deadlineTime };
  return null;
}
export function setWorkflow(id, wf) {
  const p = get('pmProjects', id);
  if (!p) return;
  patch('pmProjects', id, { workflow: wf, stage: workflowStage(p.stage, wf) });
}
export function setStage(id, stage) {
  const p = get('pmProjects', id);
  if (!p || p.stage === stage) return;
  const ch = { stage };
  if (stage === 'client_review') { ch.previewSentAt = Date.now(); if (!p.followUpDate) ch.followUpDate = addDays(today(), 2); }
  patch('pmProjects', id, ch);
}
export const projectFeedback = (pid) => all('feedback').filter((f) => f.projectId === pid && !f.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
// Feedback arrived: log each note, move the project to Revision, optionally create revision tasks.
export function recordFeedback(pid, notes, { deliverableId = null, source = 'client', makeTasks = true } = {}) {
  const p = get('pmProjects', pid);
  const made = [];
  for (const text of notes) {
    const f = put('feedback', { id: uid(), projectId: pid, deliverableId, text, source, resolvedAt: null, taskId: null });
    if (makeTasks) { const t = createRevisionTask(f); made.push(t); }
  }
  if (p && source === 'client') {
    patch('pmProjects', pid, { stage: 'revision', followUpDate: null, feedbackAt: Date.now() });
    if (deliverableId) patch('pmProjects', pid, { deliverables: (get('pmProjects', pid).deliverables || []).map((d) => (d.id === deliverableId ? { ...d, status: 'revision', updatedAt: Date.now() } : d)) });
  }
  return made;
}
export function createRevisionTask(f) {
  const t = newTask({ title: 'Revise: ' + f.text, projectId: f.projectId, workDate: today(), notes: 'From feedback: ' + f.text });
  patch('feedback', f.id, { taskId: t.id });
  return t;
}

// ---------- attention ----------
export function attentionItems() {
  const t0 = today();
  const out = [];
  for (const t of sortTasks(liveTasks().filter(isOverdue), 'deadline')) out.push({ kind: 'overdue', tone: 'rose', title: t.title, sub: 'Deadline passed · ' + (projectName(t.projectId) || 'No project'), path: '/tasks/' + t.id, icon: 'flag' });
  for (const p of liveProjects().filter((x) => !x.archived)) {
    if (p.stage === 'client_review') out.push({ kind: 'waiting', tone: 'lavender', title: 'Waiting for feedback', sub: p.name + (p.followUpDate ? (p.followUpDate <= t0 ? ' · follow up today' : ' · follow-up ' + p.followUpDate) : ''), path: '/projects/' + p.id, icon: 'chat', due: p.followUpDate && p.followUpDate <= t0 });
    const open = projectFeedback(p.id).filter((f) => !f.resolvedAt && f.source === 'client');
    if (p.stage === 'revision' && open.length) out.push({ kind: 'revision', tone: 'rose', title: 'Revision received', sub: p.name + ' · ' + open.length + ' note' + (open.length === 1 ? '' : 's'), path: '/projects/' + p.id, icon: 'chat' });
  }
  for (const i of liveInvoices().filter((x) => !x.archived)) { const c = calcInvoice(i); if (c.status === 'overdue') out.push({ kind: 'invoice', tone: 'butter', title: i.number + ' is overdue', sub: clientName(i.clientId), path: '/invoices/' + i.id, icon: 'file' }); }
  return out;
}

// ---------- clients, invoices, payments ----------
export const liveClients = () => all('clients').filter((c) => !c.deletedAt);
export const liveInvoices = () => all('invoices').filter((i) => !i.deletedAt);
export const invoicePayments = (invId) => all('payments').filter((p) => p.invoiceId === invId && !p.voided);
export const clientName = (id) => get('clients', id)?.name || 'No client';

export function calcInvoice(inv) {
  const items = (inv.items || []).map((it) => ({ ...it, amount: Math.round((+it.qty || 0) * (+it.rate || 0)) }));
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  let discount = 0;
  if (inv.discountType === 'percent') discount = Math.round((subtotal * Math.min(100, Math.max(0, +inv.discountValue || 0))) / 100);
  else if (inv.discountType === 'amount') discount = Math.min(subtotal, Math.max(0, Math.round(+inv.discountValue || 0)));
  const total = subtotal - discount;
  const pays = inv.id ? invoicePayments(inv.id) : [];
  const paid = pays.reduce((s, p) => s + (Math.round(+p.amount) || 0), 0);
  const balance = total - paid;
  let status;
  if (!inv.sentAt && paid === 0) status = 'draft';
  else if (total > 0 && balance <= 0) status = 'paid';
  else if (inv.dueDate && diffDays(inv.dueDate, today()) < 0 && balance > 0) status = 'overdue';
  else if (paid > 0) status = 'partial';
  else status = 'sent';
  return { items, subtotal, discount, total, paid, balance, status, payments: pays };
}
export const INVOICE_STATUS = { draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', overdue: 'Overdue' };
export const INVOICE_TONE = { draft: 'plain', sent: 'cyan', partial: 'butter', paid: 'sage', overdue: 'rose' };

export function formatInvoiceNumber(fmt, seq, iso = today()) {
  const [y, m] = iso.split('-');
  return (fmt || 'INV-{YYYY}-{####}').replace('{YYYY}', y).replace('{YY}', y.slice(2)).replace('{MM}', m).replace(/\{(#+)\}/, (_, h) => String(seq).padStart(h.length, '0'));
}
export function nextInvoiceNumber(iso = today()) {
  const s = settings();
  const c = meta('counters', { id: 'counters', seq: {}, used: [] });
  const key = formatInvoiceNumber(s.invoiceFormat, 0, iso).replace(/0+$/, '') || 'default';
  const used = new Set([...(c.used || []), ...all('invoices').map((i) => i.number)]);
  let seq = (c.seq?.[key] || 0) + 1;
  let num = formatInvoiceNumber(s.invoiceFormat, seq, iso);
  while (used.has(num)) { seq++; num = formatInvoiceNumber(s.invoiceFormat, seq, iso); }
  return { num, key, seq };
}
export function reserveInvoiceNumber(num, key, seq) {
  const c = meta('counters', { id: 'counters', seq: {}, used: [] });
  put('meta', { ...c, id: 'counters', seq: { ...(c.seq || {}), ...(key ? { [key]: Math.max(seq || 0, c.seq?.[key] || 0) } : {}) }, used: [...new Set([...(c.used || []), num])] });
}
export function numberTaken(num, exceptId) {
  const cur = get('invoices', exceptId);
  if (cur && cur.number === num) return false;
  return all('invoices').some((i) => i.number === num && i.id !== exceptId) || (meta('counters', {}).used || []).includes(num);
}
export function clientSnapshot(clientId) {
  const c = get('clients', clientId);
  return c ? { name: c.name, pic: c.pic || '', email: c.email || '', phone: c.phone || '', address: c.address || '' } : null;
}
export function newInvoice(p = {}) {
  const s = settings();
  const { num, key, seq } = nextInvoiceNumber();
  reserveInvoiceNumber(num, key, seq);
  const project = p.projectId ? get('pmProjects', p.projectId) : null;
  const clientId = p.clientId || project?.clientId || '';
  const date = today();
  return put('invoices', {
    id: uid(), number: num, clientId, projectId: project?.id || '', date, dueDate: addDays(date, +s.defaultTermsDays || 14), termsDays: +s.defaultTermsDays || 14,
    currency: s.defaultCurrency, items: [{ id: uid(), desc: project ? project.name : '', qty: 1, rate: 0 }],
    discountType: 'none', discountValue: 0, notes: '', terms: s.defaultTermsText, paymentInstructions: s.paymentInstructions,
    sentAt: null, archived: false, clientSnapshot: clientSnapshot(clientId), projectSnapshot: project ? { name: project.name } : null, issuer: null, ...p,
  });
}
export function invoiceRecipient(inv) { return inv.sentAt ? inv.clientSnapshot || clientSnapshot(inv.clientId) : clientSnapshot(inv.clientId) || inv.clientSnapshot; }
export function invoiceIssuer(inv) { return inv.sentAt && inv.issuer ? inv.issuer : settings().business; }
export function markSent(inv) {
  patch('invoices', inv.id, { sentAt: Date.now(), clientSnapshot: clientSnapshot(inv.clientId) || inv.clientSnapshot, issuer: { ...settings().business }, projectSnapshot: inv.projectId ? { name: get('pmProjects', inv.projectId)?.name || '' } : null });
}
export function recordPayment(inv, p) {
  if (!inv.sentAt) markSent(inv);
  return put('payments', { id: uid(), invoiceId: inv.id, amount: Math.round(p.amount), date: p.date, method: p.method, kind: p.kind, reference: p.reference || '', notes: p.notes || '', voided: false, history: [] });
}
export function projectMoney(pid) {
  const invs = liveInvoices().filter((i) => i.projectId === pid);
  let invoiced = 0, paid = 0, balance = 0;
  for (const i of invs) { const c = calcInvoice(i); if (c.status !== 'draft') { invoiced += c.total; balance += Math.max(0, c.balance); } paid += c.paid; }
  return { invoices: invs, invoiced, paid, balance };
}
export function clientMoney(cid) {
  const invs = liveInvoices().filter((i) => i.clientId === cid);
  let invoiced = 0, paid = 0, outstanding = 0;
  for (const i of invs) { const c = calcInvoice(i); if (c.status !== 'draft') { invoiced += c.total; outstanding += Math.max(0, c.balance); } paid += c.paid; }
  return { projects: liveProjects().filter((p) => p.clientId === cid), invoices: invs, invoiced, paid, outstanding };
}
export function invoiceSummary(currency = settings().defaultCurrency) {
  let invoiced = 0, received = 0, outstanding = 0, overdue = 0;
  for (const i of liveInvoices().filter((x) => (x.currency || 'IDR') === currency)) {
    const c = calcInvoice(i);
    if (c.status !== 'draft') { invoiced += c.total; if (c.balance > 0) { outstanding += c.balance; if (c.status === 'overdue') overdue += c.balance; } }
    received += c.paid;
  }
  return { invoiced, received, outstanding, overdue };
}

// ---------- calendar ----------
export function unscheduledTasks() { return sortTasks(liveTasks().filter((t) => isOpen(t) && !t.workDate), 'deadline'); }
export function nextDeadlineSoon(days = 2) {
  const t0 = today();
  const items = [
    ...liveTasks().filter((t) => isOpen(t) && t.deadlineDate && t.deadlineDate >= t0 && diffDays(t.deadlineDate, t0) <= days).map((t) => ({ date: t.deadlineDate, title: t.title, path: '/tasks/' + t.id })),
    ...liveProjects().filter((p) => !p.archived && p.deadlineDate && stageIdx(p.stage) < stageIdx('delivered') && p.deadlineDate >= t0 && diffDays(p.deadlineDate, t0) <= days).map((p) => ({ date: p.deadlineDate, title: p.name, path: '/projects/' + p.id })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
export { monthKey, isoOf };

// Events occupy time; they never enter task completion or focus tracking.
export const liveEvents = () => all('pmEvents').filter(e => !e.deletedAt);
export const eventsOn = (date) => liveEvents().filter(e => e.date === date).sort((a,b) => (a.allDay ? '' : a.startTime).localeCompare(b.allDay ? '' : b.startTime));
export function saveEvent(input) {
 const e = {...input, title: (input.title || '').trim()};
 if (!e.title || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw new Error('Add an event name and date.');
 if (!e.allDay && (!/^\d{2}:\d{2}$/.test(e.startTime || '') || !/^\d{2}:\d{2}$/.test(e.endTime || '') || e.endTime <= e.startTime)) throw new Error('End time must be after start time on the same day.');
 return put('pmEvents', {...e, id:e.id || uid(), deletedAt:null});
}
export const trashEvent = (id) => patch('pmEvents',id,{deletedAt:Date.now()});
export const restoreEvent = (id) => patch('pmEvents',id,{deletedAt:null});
export function deadlineItems() {
 const last = addDays(today(), 7);
 return [...liveTasks().filter(t=>isOpen(t)&&t.deadlineDate&&t.deadlineDate<=last).map(t=>({id:t.id,title:t.title,date:t.deadlineDate,path:'/tasks/'+t.id})), ...liveProjects().filter(p=>!p.archived&&p.stage!=='completed'&&p.deadlineDate&&p.deadlineDate<=last).map(p=>({id:p.id,title:p.name,date:p.deadlineDate,path:'/projects/'+p.id}))].sort((a,b)=>a.date.localeCompare(b.date));
}
