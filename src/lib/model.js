// Shared data model, defaults, derived values and cross-module actions.
import { get, all, put, patch, remove, uid } from './db.js';
import { today, addDays, diffDays, startOfWeek, nextOccurrence, isoOf, monthKey } from './date.js';

// ---------- constants ----------
export const TASK_STATUSES = [
  { id: 'todo', label: 'To do' }, { id: 'in_progress', label: 'In progress' }, { id: 'done', label: 'Done' },
  { id: 'deferred', label: 'Deferred' }, { id: 'cancelled', label: 'Cancelled' },
];
export const PRIORITIES = [{ id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }, { id: 'low', label: 'Low' }, { id: 'none', label: 'None' }];
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };
export const CONTENT_STATUSES = [
  { id: 'idea', label: 'Idea' }, { id: 'scripting', label: 'Scripting' }, { id: 'filming', label: 'Filming' },
  { id: 'editing', label: 'Editing' }, { id: 'ready', label: 'Ready' }, { id: 'published', label: 'Uploaded' },
];
export const CONTENT_NEXT = {
  idea: { to: 'scripting', label: 'Start scripting' }, scripting: { to: 'filming', label: 'Script done, start filming' },
  filming: { to: 'editing', label: 'Footage done, start editing' }, editing: { to: 'ready', label: 'Mark ready' }, ready: { to: 'published', label: 'Mark uploaded' },
};
export const ACTIVE_CONTENT = ['scripting', 'filming', 'editing'];
// Older data used a single "in_progress" status; it maps to Scripting.
export const normalizeContentStatus = (s) => (s === 'in_progress' ? 'scripting' : M_STATUS_IDS.includes(s) ? s : 'idea');
const M_STATUS_IDS = ['idea', 'scripting', 'filming', 'editing', 'ready', 'published'];
export const contentStatusIdx = (s) => M_STATUS_IDS.indexOf(s);
export const STAGES = [
  { id: 'script', label: 'Script', verb: 'Write script' }, { id: 'shoot', label: 'Shoot', verb: 'Shoot' },
  { id: 'edit', label: 'Edit', verb: 'Edit' }, { id: 'ready', label: 'Ready', verb: 'Review' }, { id: 'upload', label: 'Upload', verb: 'Upload' },
];
export const PIPELINE = ['Lead', 'Contacted', 'Negotiation', 'Booked', 'Production', 'Editing', 'Delivered', 'Paid'];
export const PRE_PAYMENT_STAGES = PIPELINE.slice(0, 7);
export const ACTIVE_STAGES = ['Booked', 'Production', 'Editing', 'Delivered'];
export const LINK_TYPES = [{ id: 'reference', label: 'Reference' }, { id: 'final', label: 'Final video' }, { id: 'additional', label: 'Additional' }];
export const PAYMENT_METHODS = ['Bank transfer', 'E-wallet', 'QRIS', 'Cash', 'PayPal', 'Other'];
export const PAYMENT_KINDS = ['Full payment', 'DP / deposit', 'Partial payment', 'Final payment'];

export const DEFAULT_SETTINGS = {
  id: 'settings',
  name: 'Denizar',
  categories: ['Work', 'Freelance', 'Growth', 'Personal'],
  defaultCategory: 'Work',
  defaultPriority: 'none',
  weekStart: 1,
  weeklyGoalLimit: 3,
  reminders: { morning: { enabled: true, time: '07:00' }, evening: { enabled: true, time: '22:00' } },
  platforms: ['Instagram', 'Threads', 'TikTok'],
  pillars: ['Desk Setup', 'Videographer Life', 'Creator Thoughts', 'Gear', 'Affiliate'],
  formats: ['Voice Over', 'Talking Head', 'Photo', 'Music + Text'],
  checklistTemplate: ['Idea & script ready', 'Footage recorded', 'Edit video', 'Select cover', 'Add music', 'Final review', 'Upload / publish'],
  weeklyTarget: 4,
  threadsDaily: 7,
  threadsPillars: ['Fashion videographer', 'WFH desk setup', 'Affiliate desk'],
  boardView: 'kanban',
  pipelineView: 'kanban',
  business: { name: 'Vandenizar', owner: 'Denizar', email: '', phone: '', address: 'Bekasi, Indonesia', website: '' },
  invoiceFormat: 'INV-{YYYY}-{####}',
  defaultCurrency: 'IDR',
  defaultTermsDays: 14,
  defaultTermsText: 'Payment due within 14 days of the invoice date. Final files are delivered after full payment.',
  paymentInstructions: '',
  projectTypes: ['Fashion Campaign', 'Fashion Reel', 'Beauty Reel', 'Event Reel', 'Product Video', 'Brand Content'],
  defaultDeliverables: ['Main Video', 'Social Cut', 'Behind The Scenes', 'Photo Documentation'],
};

export function settings() {
  const s = get('meta', 'settings');
  if (!s) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...s, business: { ...DEFAULT_SETTINGS.business, ...(s.business || {}) }, reminders: { ...DEFAULT_SETTINGS.reminders, ...(s.reminders || {}) } };
}
export const setSettings = (ch) => put('meta', { ...settings(), ...(typeof ch === 'function' ? ch(settings()) : ch), id: 'settings' });
export const meta = (id, fallback) => get('meta', id) || fallback;

// ---------- activity ----------
export function logActivity(text, ref = {}) {
  put('activity', { id: uid(), at: Date.now(), text, ...ref });
  const items = all('activity');
  if (items.length > 400) items.slice().sort((a, b) => a.at - b.at).slice(0, items.length - 400).forEach((a) => remove('activity', a.id));
}

// ---------- recent ----------
export function touchRecent(type, id) {
  const r = meta('recent', { id: 'recent', items: [] });
  const items = [{ type, id, at: Date.now() }, ...r.items.filter((x) => !(x.type === type && x.id === id))].slice(0, 12);
  put('meta', { ...r, items }, { silent: true });
}

// ---------- tasks ----------
export const isOpen = (t) => t && !t.deletedAt && !t.archived && (t.status === 'todo' || t.status === 'in_progress');
export const liveTasks = () => all('tasks').filter((t) => !t.deletedAt && !t.archived);
export function newTask(p = {}) {
  const s = settings();
  const t = { id: uid(), title: '', notes: '', category: s.defaultCategory, status: 'todo', priority: s.defaultPriority, dueDate: '', dueTime: '', estimate: 0, recurrence: null, goalId: '', contentId: '', projectId: '', invoiceId: '', order: Date.now(), completions: [], completedAt: null, focusSessions: [], ...p };
  return put('tasks', t);
}
export function completeTask(id) {
  const t = get('tasks', id);
  if (!t) return;
  const now = Date.now();
  const sessions = closeFocus(t, now);
  if (t.recurrence && t.recurrence.freq) {
    const from = t.dueDate || today();
    let next = nextOccurrence(t.recurrence, from);
    while (next && diffDays(next, today()) < 0) next = nextOccurrence(t.recurrence, next); // skip missed occurrences
    const endOk = !t.recurrence.until || diffDays(next, t.recurrence.until) <= 0;
    patch('tasks', id, { completions: [...(t.completions || []), { date: from, at: now }], dueDate: endOk ? next : t.dueDate, status: endOk ? 'todo' : 'done', completedAt: endOk ? t.completedAt : now, lastCompletedAt: now, focusSessions: sessions, focusStartedAt: null });
  } else {
    patch('tasks', id, { status: 'done', completedAt: now, focusSessions: sessions, focusStartedAt: null });
  }
  if (meta('focus', {}).taskId === id) put('meta', { id: 'focus', taskId: null });
}
export function reopenTask(id) { patch('tasks', id, { status: 'todo', completedAt: null }); }
function closeFocus(t, now) {
  const s = [...(t.focusSessions || [])];
  if (t.focusStartedAt) s.push({ start: t.focusStartedAt, end: now });
  return s;
}
export function startFocus(id) {
  const cur = meta('focus', {}).taskId;
  if (cur && cur !== id) stopFocus();
  const t = get('tasks', id);
  if (!t) return;
  patch('tasks', id, { status: 'in_progress', focusStartedAt: Date.now() });
  put('meta', { id: 'focus', taskId: id });
}
export function stopFocus() {
  const id = meta('focus', {}).taskId;
  const t = get('tasks', id);
  if (t) patch('tasks', id, { focusSessions: closeFocus(t, Date.now()), focusStartedAt: null });
  put('meta', { id: 'focus', taskId: null });
}
export function deferTask(id, days = 1) {
  const t = get('tasks', id);
  if (!t) return;
  const base = t.dueDate && diffDays(t.dueDate, today()) > 0 ? t.dueDate : today();
  patch('tasks', id, { dueDate: addDays(base, days), status: t.status === 'in_progress' ? 'todo' : t.status });
}
export function trashTask(id) { patch('tasks', id, { deletedAt: Date.now() }); unpinFromDays(id); }
function unpinFromDays(id) {
  for (const d of all('days')) if (d.mainTaskId === id || (d.keyTaskIds || []).includes(id)) put('days', { ...d, mainTaskId: d.mainTaskId === id ? '' : d.mainTaskId, keyTaskIds: (d.keyTaskIds || []).filter((x) => x !== id) });
}
export const taskDoneOn = (t, iso) => (t.completedAt && isoOf(t.completedAt) === iso) || (t.completions || []).some((c) => isoOf(c.at) === iso);
export function sortTasks(list, by = 'smart') {
  const arr = [...list];
  const due = (t) => (t.dueDate ? t.dueDate + (t.dueTime || '99:99') : '9999');
  if (by === 'smart') arr.sort((a, b) => (a.status === 'in_progress' ? -1 : 0) - (b.status === 'in_progress' ? -1 : 0) || due(a).localeCompare(due(b)) || PRIORITY_RANK[a.priority || 'none'] - PRIORITY_RANK[b.priority || 'none'] || (a.order || 0) - (b.order || 0));
  else if (by === 'due') arr.sort((a, b) => due(a).localeCompare(due(b)));
  else if (by === 'priority') arr.sort((a, b) => PRIORITY_RANK[a.priority || 'none'] - PRIORITY_RANK[b.priority || 'none'] || due(a).localeCompare(due(b)));
  else if (by === 'manual') arr.sort((a, b) => (a.order || 0) - (b.order || 0));
  else if (by === 'created') arr.sort((a, b) => b.createdAt - a.createdAt);
  else if (by === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
  return arr;
}

// ---------- day plan ----------
export const dayPlan = (iso) => get('days', iso) || { id: iso, mainTaskId: '', keyTaskIds: [] };
export function setDayPlan(iso, ch) { put('days', { ...dayPlan(iso), ...ch, id: iso }); }
export function validPlan(iso) {
  const p = dayPlan(iso);
  const ok = (id) => { const t = get('tasks', id); return t && !t.deletedAt && !t.archived && t.status !== 'cancelled'; };
  return { main: ok(p.mainTaskId) ? get('tasks', p.mainTaskId) : null, keys: (p.keyTaskIds || []).filter(ok).map((id) => get('tasks', id)) };
}

// ---------- goals ----------
export function goalProgress(g) {
  if (g.method === 'numeric') {
    const target = +g.target || 0, current = +g.current || 0;
    return { pct: target ? Math.min(100, Math.round((current / target) * 100)) : 0, label: `${current} / ${target}${g.unit ? ' ' + g.unit : ''}` };
  }
  if (g.method === 'manual') return { pct: Math.max(0, Math.min(100, +g.manual || 0)), label: `${+g.manual || 0}%` };
  const linked = all('tasks').filter((t) => t.goalId === g.id && !t.deletedAt);
  const ids = new Set();
  let done = 0;
  for (const t of linked) {
    if (ids.has(t.id)) continue; ids.add(t.id);
    const inPeriod = (ts) => ts && (!g.startDate || isoOf(ts) >= g.startDate) && (!g.endDate || isoOf(ts) <= g.endDate);
    if (t.status === 'done' || (t.completions || []).some((c) => inPeriod(c.at))) done++;
  }
  const total = ids.size;
  return { pct: total ? Math.round((done / total) * 100) : 0, label: total ? `${done} of ${total} tasks` : 'No tasks linked', done, total };
}
export const activeGoals = () => all('goals').filter((g) => g.status === 'active' && !g.deletedAt);

// ---------- content ----------
export const liveContents = () => all('contents').filter((c) => !c.deletedAt);
export function newContent(p = {}) {
  const s = settings();
  const statusItems = liveContents().filter((c) => c.status === (p.status || 'idea'));
  const c = {
    id: uid(), title: 'Untitled content', description: '', status: 'idea', platforms: [s.platforms[0]].filter(Boolean), pillar: '', format: '', cover: '',
    hook: '', script: '', shotlist: [], caption: '', links: [], notes: '',
    checklist: s.checklistTemplate.map((text) => ({ id: uid(), text, done: false })),
    schedule: { script: {}, shoot: {}, edit: {}, ready: {}, upload: {} }, stageDone: {},
    order: statusItems.length ? Math.min(...statusItems.map((x) => x.order || 0)) - 1 : 0, publishedAt: null, ...p,
  };
  return put('contents', c);
}
export function setContentStatus(id, status) {
  const c = get('contents', id);
  if (!c || c.status === status) return;
  const inCol = liveContents().filter((x) => x.status === status && x.id !== id);
  const ch = { status, order: inCol.length ? Math.max(...inCol.map((x) => x.order || 0)) + 1 : 0 };
  if (status === 'published') ch.publishedAt = c.publishedAt || Date.now();
  else ch.publishedAt = null;
  patch('contents', id, ch);
}
export function duplicateContent(id) {
  const c = get('contents', id);
  if (!c) return null;
  const copy = JSON.parse(JSON.stringify(c));
  delete copy.createdAt; delete copy.deletedAt; delete copy.versions;
  copy.id = uid();
  copy.title = c.title + ' (copy)';
  copy.order = (c.order || 0) + 0.5;
  copy.publishedAt = c.status === 'published' ? Date.now() : null;
  copy.shotlist = (copy.shotlist || []).map((s) => ({ ...s, id: uid() }));
  copy.checklist = (copy.checklist || []).map((s) => ({ ...s, id: uid() }));
  copy.links = (copy.links || []).map((s) => ({ ...s, id: uid() }));
  return put('contents', copy);
}
const STAGE_IDX = { script: 0, shoot: 1, edit: 2, ready: 3, upload: 4 };
// Which production stages a status implies are finished (script=0, shoot=1, edit=2, ready=3, upload=4)
const STATUS_IMPLIES = { idea: -1, scripting: -1, filming: 0, editing: 1, ready: 2, published: 4 };
const STAGE_NEXT_STATUS = { script: 'filming', shoot: 'editing', edit: 'ready', ready: 'ready', upload: 'published' };
export const stageIsDone = (c, stage) => !!(c.stageDone && c.stageDone[stage]) || STAGE_IDX[stage] <= STATUS_IMPLIES[c.status];
export function completeStage(c, stage) {
  const stageDone = { ...(c.stageDone || {}), [stage]: true };
  patch('contents', c.id, { stageDone });
  // Finishing a stage moves the status forward (never backward)
  const to = STAGE_NEXT_STATUS[stage];
  if (contentStatusIdx(to) > contentStatusIdx(c.status)) setContentStatus(c.id, to);
}
export function uncompleteStage(c, stage) { patch('contents', c.id, { stageDone: { ...(c.stageDone || {}), [stage]: false } }); }
// Content actions due on or before a date and not done yet
export function contentActions(uptoIso = today()) {
  const out = [];
  for (const c of liveContents()) {
    if (c.status === 'published') continue;
    for (const st of STAGES) {
      const d = c.schedule?.[st.id]?.date;
      if (!d || diffDays(d, uptoIso) > 0 || stageIsDone(c, st.id)) continue;
      out.push({ content: c, stage: st, date: d, time: c.schedule[st.id].time || '', overdue: diffDays(d, today()) < 0 });
    }
  }
  return out.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}
export function upcomingUploads(from = today(), days = 14) {
  return liveContents().filter((c) => c.schedule?.upload?.date && c.status !== 'published' && diffDays(c.schedule.upload.date, from) >= 0 && diffDays(c.schedule.upload.date, from) < days)
    .sort((a, b) => (a.schedule.upload.date + (a.schedule.upload.time || '')).localeCompare(b.schedule.upload.date + (b.schedule.upload.time || '')));
}
export function publishedInWeek(weekStartIso) {
  const end = addDays(weekStartIso, 6);
  return liveContents().filter((c) => {
    if (c.status !== 'published') return false;
    const d = c.publishedAt ? isoOf(c.publishedAt) : c.schedule?.upload?.date;
    return d && d >= weekStartIso && d <= end;
  });
}
export function priorityContent() {
  const list = liveContents();
  const prog = list.filter((c) => ACTIVE_CONTENT.includes(c.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  if (prog.length) return prog[0];
  const ready = list.filter((c) => c.status === 'ready').sort((a, b) => (a.schedule?.upload?.date || '9999').localeCompare(b.schedule?.upload?.date || '9999'));
  if (ready.length) return ready[0];
  return list.filter((c) => c.status === 'idea').sort((a, b) => (a.order || 0) - (b.order || 0))[0] || null;
}

// ---------- freelance ----------
export const liveClients = () => all('clients').filter((c) => !c.deletedAt);
export const liveProjects = () => all('projects').filter((p) => !p.deletedAt);
export const liveInvoices = () => all('invoices').filter((i) => !i.deletedAt);
export const invoicePayments = (invId) => all('payments').filter((p) => p.invoiceId === invId && !p.voided);
export const stageIdx = (s) => PIPELINE.indexOf(s);

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
  put('meta', { ...c, seq: { ...(c.seq || {}), ...(key ? { [key]: Math.max(seq || 0, c.seq?.[key] || 0) } : {}) }, used: [...new Set([...(c.used || []), num])] });
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
  const project = p.projectId ? get('projects', p.projectId) : null;
  const clientId = p.clientId || project?.clientId || '';
  const date = today();
  const inv = {
    id: uid(), number: num, clientId, projectId: project?.id || '', date, dueDate: addDays(date, +s.defaultTermsDays || 14), termsDays: +s.defaultTermsDays || 14,
    currency: project?.currency || s.defaultCurrency, items: project ? [{ id: uid(), desc: project.name + (project.type ? ` (${project.type})` : ''), qty: 1, rate: +project.fee || 0 }] : [{ id: uid(), desc: '', qty: 1, rate: 0 }],
    discountType: 'none', discountValue: 0, notes: '', terms: s.defaultTermsText, paymentInstructions: s.paymentInstructions,
    sentAt: null, archived: false, clientSnapshot: clientSnapshot(clientId), projectSnapshot: project ? { name: project.name } : null, issuer: null, ...p,
  };
  const saved = put('invoices', inv);
  logActivity(`Invoice ${num} created`, { refType: 'invoice', refId: saved.id, projectId: saved.projectId });
  return saved;
}
// Before an invoice is sent, recipient details follow the client record. Once sent, they are frozen.
export function invoiceRecipient(inv) { return inv.sentAt ? inv.clientSnapshot || clientSnapshot(inv.clientId) : clientSnapshot(inv.clientId) || inv.clientSnapshot; }
export function invoiceIssuer(inv) { return inv.sentAt && inv.issuer ? inv.issuer : settings().business; }
export function markSent(inv) {
  patch('invoices', inv.id, { sentAt: Date.now(), clientSnapshot: clientSnapshot(inv.clientId) || inv.clientSnapshot, issuer: { ...settings().business }, projectSnapshot: inv.projectId ? { name: get('projects', inv.projectId)?.name || '' } : null });
  logActivity(`Invoice ${inv.number} marked sent`, { refType: 'invoice', refId: inv.id, projectId: inv.projectId });
}
export function recordPayment(inv, p) {
  if (!inv.sentAt) markSent(inv);
  const pay = put('payments', { id: uid(), invoiceId: inv.id, amount: Math.round(p.amount), date: p.date, method: p.method, kind: p.kind, reference: p.reference || '', notes: p.notes || '', voided: false, history: [] });
  const after = calcInvoice(get('invoices', inv.id));
  logActivity(`Payment received for ${inv.number}${p.kind ? ` (${p.kind})` : ''}`, { refType: 'invoice', refId: inv.id, projectId: inv.projectId, amount: pay.amount, currency: inv.currency });
  if (after.status === 'paid' && inv.projectId) {
    const pr = get('projects', inv.projectId);
    const allPaid = liveInvoices().filter((i) => i.projectId === pr?.id && i.sentAt).every((i) => calcInvoice(i).balance <= 0);
    if (pr && allPaid && stageIdx(pr.stage) >= stageIdx('Delivered') && pr.stage !== 'Paid') moveProject(pr.id, 'Paid');
  }
  return pay;
}
export function moveProject(id, stage, order) {
  const pr = get('projects', id);
  if (!pr) return;
  const ch = { stage };
  if (order != null) ch.order = order;
  else if (pr.stage !== stage) { const col = liveProjects().filter((p) => p.stage === stage && p.id !== id); ch.order = col.length ? Math.max(...col.map((p) => p.order || 0)) + 1 : 0; }
  if (pr.stage !== stage) {
    ch.history = [...(pr.history || []), { at: Date.now(), text: `Stage: ${pr.stage} → ${stage}` }];
    ch.stageChangedAt = Date.now();
    logActivity(`${pr.name} moved to ${stage}`, { refType: 'project', refId: id, projectId: id, stage });
  }
  patch('projects', id, ch);
}
export function newProject(p = {}) {
  const s = settings();
  const stage = p.stage || 'Lead';
  const col = liveProjects().filter((x) => x.stage === stage);
  const pr = put('projects', {
    id: uid(), name: '', clientId: '', pic: '', contact: '', type: '', fee: 0, currency: s.defaultCurrency, shootDate: '', startDate: '', deadline: '', location: '',
    stage, order: col.length ? Math.max(...col.map((x) => x.order || 0)) + 1 : 0, tags: [], deliverables: [], notes: '', links: [], archived: false, history: [{ at: Date.now(), text: `Created in ${stage}` }], ...p,
  });
  logActivity(`Project ${pr.name} created`, { refType: 'project', refId: pr.id, projectId: pr.id });
  return pr;
}
export function projectMoney(prId) {
  const invs = liveInvoices().filter((i) => i.projectId === prId);
  let invoiced = 0, paid = 0, balance = 0;
  for (const i of invs) { const c = calcInvoice(i); if (c.status !== 'draft') { invoiced += c.total; balance += Math.max(0, c.balance); } paid += c.paid; }
  return { invoices: invs, invoiced, paid, balance };
}
export function clientMoney(clientId) {
  const prs = liveProjects().filter((p) => p.clientId === clientId);
  const invs = liveInvoices().filter((i) => i.clientId === clientId);
  let value = prs.reduce((s, p) => s + (+p.fee || 0), 0), invoiced = 0, paid = 0, outstanding = 0;
  for (const i of invs) { const c = calcInvoice(i); if (c.status !== 'draft') { invoiced += c.total; outstanding += Math.max(0, c.balance); } paid += c.paid; }
  return { projects: prs, invoices: invs, value, invoiced, paid, outstanding };
}
// Finance numbers. Currency: only invoices/payments in `currency` are summed.
export function finance(currency = settings().defaultCurrency, month = monthKey(today())) {
  const invs = liveInvoices().filter((i) => (i.currency || 'IDR') === currency);
  let totalInvoiced = 0, outstanding = 0, overdue = 0, invoicedMonth = 0, receivedAll = 0, receivedMonth = 0;
  const byMonth = {};
  for (const i of invs) {
    const c = calcInvoice(i);
    if (c.status !== 'draft') {
      totalInvoiced += c.total;
      if (i.date && monthKey(i.date) === month) invoicedMonth += c.total;
      if (c.balance > 0) { outstanding += c.balance; if (c.status === 'overdue') overdue += c.balance; }
    }
    for (const p of c.payments) {
      receivedAll += p.amount;
      const mk = monthKey(p.date || isoOf(p.createdAt));
      byMonth[mk] = (byMonth[mk] || 0) + p.amount;
      if (mk === month) receivedMonth += p.amount;
    }
  }
  // Pipeline value: fees still to be collected on open projects (fee minus payments already received for that project).
  const pipeline = liveProjects().filter((p) => !p.archived && PRE_PAYMENT_STAGES.includes(p.stage) && (p.currency || 'IDR') === currency).reduce((s, p) => s + Math.max(0, (+p.fee || 0) - projectMoney(p.id).paid), 0);
  return { totalInvoiced, outstanding, overdue, invoicedMonth, receivedAll, receivedMonth, pipeline, byMonth };
}
// Freelance items due on a date (or overdue when `includeOverdue`)
export function freelanceAgenda(fromIso, toIso, includeOverdue = false) {
  const out = [];
  const t = today();
  const inRange = (d) => d && d >= fromIso && d <= toIso;
  for (const p of liveProjects()) {
    if (p.archived) continue;
    if (inRange(p.shootDate) && stageIdx(p.stage) <= stageIdx('Production')) out.push({ kind: 'shoot', label: 'Shoot', date: p.shootDate, project: p, overdue: false });
    if (p.deadline && stageIdx(p.stage) < stageIdx('Delivered')) {
      if (inRange(p.deadline)) out.push({ kind: 'deadline', label: 'Delivery', date: p.deadline, project: p, overdue: false });
      else if (includeOverdue && diffDays(p.deadline, t) < 0) out.push({ kind: 'deadline', label: 'Delivery overdue', date: p.deadline, project: p, overdue: true });
    }
  }
  for (const i of liveInvoices()) {
    if (i.archived) continue;
    const c = calcInvoice(i);
    if (c.status === 'draft' || c.balance <= 0) continue;
    if (inRange(i.dueDate)) out.push({ kind: 'invoice', label: 'Invoice due', date: i.dueDate, invoice: i, calc: c, overdue: false });
    else if (includeOverdue && c.status === 'overdue') out.push({ kind: 'invoice', label: 'Payment overdue', date: i.dueDate, invoice: i, calc: c, overdue: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const clientName = (id) => get('clients', id)?.name || 'No client';

// ---------- templates ----------
export function applyProjectTemplate(tpl) {
  const d = tpl.data || {};
  return { type: d.type || '', fee: +d.fee || 0, deliverables: (d.deliverables || []).map((text) => ({ id: uid(), text, done: false })), _tasks: d.tasks || [] };
}

// ---------- weekly ----------
export const weekStartOf = (iso = today()) => startOfWeek(iso, settings().weekStart);

// ---------- Threads queue ----------
export const THREADS_LIMIT = 500;
export const liveThreads = () => all('threads').filter((t) => !t.deletedAt);
export const threadsOn = (iso) => liveThreads().filter((t) => t.date === iso).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.order || 0) - (b.order || 0));
export const threadIdeas = () => liveThreads().filter((t) => !t.date && t.status !== 'posted').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export function newThread(p = {}) {
  return put('threads', { id: uid(), text: '', date: '', time: '', pillar: '', status: 'draft', postedAt: null, order: Date.now(), ...p });
}
export const markThreadPosted = (id, on = true) => patch('threads', id, { status: on ? 'posted' : 'draft', postedAt: on ? Date.now() : null });
