// Replan: move everything that fell behind forward, keep the gaps, one Undo.
import { get, patch } from '../lib/db.js';
import { addDays, diffDays } from '../lib/date.js';
import { liveTasks, isOpen, patchTask, projectBilling } from '../lib/model.js';
import { replanAll, restoreSnaps } from '../content/model.js';
import { areaOfTask } from './areas.js';
import { buildAgenda, isBehindOn, inFilter } from './agenda.js';

const maxDate = (a, b) => (a && a > b ? a : b);

/** Fields of `after` that differ from `before`, as their previous values. */
function changedBefore(before, after) {
  const out = {};
  for (const k of Object.keys(after)) if (before[k] !== after[k]) out[k] = before[k] ?? null;
  return out;
}

function applyTask(id, ch, snaps) {
  const before = get('pmTasks', id);
  patchTask(id, ch);
  const prev = changedBefore(before, get('pmTasks', id));
  if (Object.keys(prev).length) snaps.push({ coll: 'pmTasks', id, before: prev });
}

export function replanLate(date, filter = 'all') {
  const snaps = [];
  const withContent = filter === 'all' || filter === 'content';

  if (filter !== 'content') {
    const late = buildAgenda({ date, filter }).late.filter((i) => i.ref.coll === 'pmTasks').map((i) => get('pmTasks', i.ref.id)).filter(Boolean);
    const isBillable = (t) => { const p = t.projectId ? get('pmProjects', t.projectId) : null; return !!p && projectBilling(p); };
    const movable = late.filter((t) => !isBillable(t));
    const earliest = movable.map((t) => t.deadlineDate).sort()[0];
    const shift = earliest ? Math.max(0, diffDays(date, earliest)) : 0;
    const done = new Set();
    for (const t of late) {
      done.add(t.id);
      if (isBillable(t)) applyTask(t.id, { workDate: maxDate(t.workDate, date) }, snaps);
      else applyTask(t.id, { deadlineDate: maxDate(addDays(t.deadlineDate, shift), date), workDate: t.workDate ? maxDate(addDays(t.workDate, shift), date) : null }, snaps);
    }
    for (const t of liveTasks().filter(isOpen)) {
      if (done.has(t.id) || !isBehindOn(t, date) || !inFilter(areaOfTask(t), filter)) continue;
      applyTask(t.id, { workDate: date }, snaps);
    }
  }

  if (withContent) {
    for (const { id, ...old } of replanAll(date)) {
      const cur = get('cItems', id);
      const before = {};
      for (const k of Object.keys(old)) if (cur?.[k] !== old[k]) before[k] = old[k];
      if (Object.keys(before).length) snaps.push({ coll: 'cItems', id, before });
    }
  }
  return { snaps, count: snaps.length };
}

export function undoReplan(snaps) {
  for (const s of snaps) if (s.coll === 'pmTasks') patch('pmTasks', s.id, s.before);
  restoreSnaps(snaps.filter((s) => s.coll === 'cItems').map((s) => ({ id: s.id, ...s.before })));
}
