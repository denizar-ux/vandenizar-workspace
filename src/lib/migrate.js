// One-way, non-destructive move from the old Workspace records to the project manager.
// Old records are only read, never changed or deleted. Each converted id is remembered,
// so a task deleted here is not brought back on the next run. Ids are kept, so two devices
// converting the same record produce the same result and sync cleanly.
import { get, all, put, remove, uid } from './db.js';
import { addDays, today } from './date.js';
import * as M from './model.js';

const STAGE_MAP = { Lead: 'lead', Contacted: 'lead', Negotiation: 'lead', Booked: 'planned', Production: 'shooting', Editing: 'editing', Delivered: 'delivered', Paid: 'completed' };
const STATUS_MAP = { todo: 'open', in_progress: 'open', done: 'done', deferred: 'deferred', cancelled: 'cancelled' };

export function migrateLegacy() {
  const mig = get('meta', 'pmMigration') || { id: 'pmMigration', tasks: [], projects: [], settings: false };
  const seenT = new Set(mig.tasks || []), seenP = new Set(mig.projects || []);
  let changed = false;

  if (!mig.settings) {
    const old = get('meta', 'settings');
    if (old && !get('meta', 'pmSettings')) {
      put('meta', { ...M.DEFAULT_SETTINGS, name: old.name || M.DEFAULT_SETTINGS.name, weekStart: old.weekStart ?? 1, pushLead: old.pushLead ?? 0,
        business: { ...M.DEFAULT_SETTINGS.business, ...(old.business || {}) }, invoiceFormat: old.invoiceFormat || M.DEFAULT_SETTINGS.invoiceFormat,
        defaultCurrency: old.defaultCurrency || 'IDR', defaultTermsDays: old.defaultTermsDays ?? 14, defaultTermsText: old.defaultTermsText || M.DEFAULT_SETTINGS.defaultTermsText,
        paymentInstructions: old.paymentInstructions || '', id: 'pmSettings' });
    }
    if (old) { mig.settings = true; changed = true; }
  }

  for (const p of all('projects')) {
    if (seenP.has(p.id) || p.sample) continue;
    seenP.add(p.id); changed = true;
    if (p.deletedAt || get('pmProjects', p.id)) continue;
    put('pmProjects', {
      id: p.id, name: p.name || 'Untitled project', categoryId: 'freelance', workflow: 'video', billing: true, clientId: p.clientId || null, stage: STAGE_MAP[p.stage] || 'planned',
      startDate: p.startDate || null, shootDate: p.shootDate || null, deadlineDate: p.deadline || null, deadlineTime: null, nextActionTaskId: null,
      brief: '', notes: p.notes || '', links: (p.links || []).map((l) => ({ id: l.id || uid(), label: l.label || '', url: l.url || '', type: l.type === 'final' ? 'final' : l.type === 'drive' ? 'drive' : 'other' })),
      deliverables: (p.deliverables || []).map((d) => ({ id: d.id || uid(), title: d.text || '', spec: '', status: d.done ? 'delivered' : 'not_started', feedback: '', updatedAt: Date.now() })),
      followUpDate: null, previewSentAt: null, archived: !!p.archived, deletedAt: null, createdAt: p.createdAt, migratedFrom: 'workspace',
    }, { silent: true });
  }

  for (const t of all('tasks')) {
    if (seenT.has(t.id) || t.sample) continue;
    seenT.add(t.id); changed = true;
    if (t.deletedAt || get('pmTasks', t.id)) continue;
    const status = STATUS_MAP[t.status] || 'open';
    const hasDate = !!t.dueDate;
    put('pmTasks', {
      id: t.id, title: t.title || 'Untitled task', status: status === 'open' && !hasDate ? 'inbox' : status,
      workDate: t.dueDate || null, workTime: t.dueTime || null, deadlineDate: null, deadlineTime: null,
      estimateMinutes: +t.estimate || null, priority: t.priority === 'high' ? 'high' : 'normal',
      projectId: t.projectId || null, invoiceId: t.invoiceId || null,
      subtasks: (t.subtasks || []).map((s, i) => ({ id: s.id || uid(), title: s.text || '', done: !!s.done, order: i })),
      notes: [t.notes || '', t.category ? 'Category: ' + t.category : ''].filter(Boolean).join('\n'),
      order: t.order || Date.now(), archived: !!t.archived, deletedAt: null, completedAt: t.completedAt || null,
      recurrence: t.recurrence && t.recurrence.freq ? t.recurrence : null, pinnedOn: null, focusSessions: [], focusStartedAt: null,
      createdAt: t.createdAt, migratedFrom: 'workspace',
    }, { silent: true });
  }

  if (changed) put('meta', { ...mig, tasks: [...seenT], projects: [...seenP] });
}

// ---------- sample data ----------
const S = { sample: true };
export function loadSampleData() {
  const t0 = today();
  const d = (n) => addDays(t0, n);
  const ainayya = put('clients', { id: uid(), name: 'Ainayya', pic: 'Brand team', email: '', phone: '', address: '', notes: 'In-house brand.', archived: false, ...S });
  const wardah = put('clients', { id: uid(), name: 'Wardah', pic: 'Rara', email: 'rara@example.com', phone: '0812000111', address: 'Jakarta', notes: 'Prefers previews as private Drive links.', archived: false, ...S });
  const dv = (title, status) => ({ id: uid(), title, spec: '', status, feedback: '', updatedAt: Date.now() });
  const raya = M.newProject({ name: 'Raya lookbook', categoryId: 'in_house', workflow: 'video', billing: false, clientId: ainayya.id, stage: 'editing', shootDate: d(-6), deadlineDate: d(3), deadlineTime: '17:00', brief: 'Lookbook film for the Raya collection. Warm daylight, slow movement, fabric close-ups.', deliverables: [dv('Hero film · 60s', 'in_progress'), dv('Cutdown · 15s', 'not_started'), dv('Vertical teaser', 'not_started')], ...S });
  const serum = M.newProject({ name: 'Serum launch', categoryId: 'freelance', workflow: 'video', billing: true, clientId: wardah.id, stage: 'client_review', deadlineDate: d(1), deadlineTime: '17:00', previewSentAt: Date.now() - 86400000, followUpDate: t0, brief: 'Product film for the serum launch. 60s hero, 15s cutdown.', deliverables: [dv('Hero film · 60s', 'waiting'), dv('Cutdown · 15s', 'revision'), dv('Vertical teaser', 'approved')], links: [{ id: uid(), label: 'Preview v2', url: 'https://drive.google.com', type: 'drive' }], ...S });
  const store = M.newProject({ name: 'Store opening', categoryId: 'in_house', workflow: 'video', billing: false, clientId: ainayya.id, stage: 'planned', shootDate: d(5), deadlineDate: d(9), ...S });
  const site = M.newProject({ name: 'Website portfolio', categoryId: 'personal', workflow: 'general', billing: false, stage: 'in_progress', deadlineDate: d(7), brief: 'A portfolio site to show recent fashion and beauty work.', deliverables: [dv('Homepage design (desktop)', 'not_started'), dv('Homepage design (mobile)', 'not_started')], ...S });
  const draftHome = M.newTask({ title: 'Draft homepage', projectId: site.id, workDate: d(1), workTime: '16:00', estimateMinutes: 90, subtasks: [{ id: uid(), title: 'Page structure', done: true, order: 0 }, { id: uid(), title: 'Write intro', done: true, order: 1 }, { id: uid(), title: 'Pick work', done: false, order: 2 }], ...S });
  M.newProject({ name: 'Color workflow', categoryId: 'learning', workflow: 'general', billing: false, stage: 'planned', brief: 'Learn a color pipeline that keeps brand colors consistent across platforms.', ...S });
  const final = M.newTask({ title: 'Final cut lookbook', projectId: raya.id, workDate: t0, workTime: '10:00', deadlineDate: d(3), deadlineTime: '17:00', estimateMinutes: 90, priority: 'high', subtasks: [{ id: uid(), title: 'Pick footage', done: true, order: 0 }, { id: uid(), title: 'Sound design', done: false, order: 1 }, { id: uid(), title: 'Export preview', done: false, order: 2 }], notes: 'Keep the fabric colors true to the reference.', ...S });
  M.newTask({ title: 'Send serum preview', projectId: serum.id, workDate: t0, workTime: '13:00', estimateMinutes: 30, ...S });
  const shot = M.newTask({ title: 'Tidy up shot list', projectId: store.id, workDate: t0, workTime: '15:00', estimateMinutes: 30, ...S });
  M.newTask({ title: 'Fix product color', projectId: serum.id, workDate: d(1), workTime: '10:00', deadlineDate: d(1), deadlineTime: '17:00', estimateMinutes: 60, ...S });
  M.newTask({ title: 'Export v3', projectId: serum.id, workDate: d(1), workTime: '13:00', estimateMinutes: 30, ...S });
  M.newTask({ title: 'Book studio for store opening', projectId: store.id, ...S });
  M.newTask({ title: 'Back up SSD to HDD', estimateMinutes: 20, ...S });
  put('pmProjects', { ...get('pmProjects', raya.id), nextActionTaskId: final.id });
  put('pmProjects', { ...get('pmProjects', store.id), nextActionTaskId: shot.id });
  put('feedback', { id: uid(), projectId: serum.id, deliverableId: null, text: 'Product color is too warm.', source: 'client', resolvedAt: null, taskId: null, ...S });
  const inv = M.newInvoice({ projectId: serum.id, clientId: wardah.id, date: d(-10), dueDate: d(4), items: [{ id: uid(), desc: 'Serum launch film, shoot and edit', qty: 1, rate: 9000000 }], ...S });
  M.markSent(get('invoices', inv.id));
  const pay = M.recordPayment(get('invoices', inv.id), { amount: 4500000, date: d(-8), method: 'Bank transfer', kind: 'DP / deposit', reference: 'BCA' });
  put('payments', { ...pay, ...S });
  put('templates', { id: uid(), kind: 'project', name: 'Product film', archived: false, data: { categoryId: 'freelance', workflow: 'video', billing: true, deliverables: ['Hero film · 60s', 'Cutdown · 15s', 'Vertical teaser'], tasks: ['Send moodboard', 'Confirm shoot date', 'Send preview v1'] }, ...S });
  put('templates', { id: uid(), kind: 'terms', name: '50% DP terms', archived: false, data: { terms: '50% down payment to book the date. Remaining 50% due within 7 days of delivery.', notes: 'Thank you for working with me.' }, ...S });
  put('pmProjects', { ...get('pmProjects', site.id), nextActionTaskId: draftHome.id });
  M.touchRecent('project', raya.id);
}
export function removeSampleData() {
  for (const coll of ['pmTasks', 'pmProjects', 'feedback', 'clients', 'invoices', 'payments', 'templates']) all(coll).filter((r) => r.sample).forEach((r) => remove(coll, r.id));
  all('payments').filter((p) => !get('invoices', p.invoiceId)).forEach((p) => remove('payments', p.id));
}
export const hasSample = () => ['pmTasks', 'pmProjects', 'clients'].some((c) => all(c).some((r) => r.sample));
