// Project board (kanban). Both project flows fold into the same four columns, so one board fits every project.
import * as M from '../lib/model.js';

export const COLUMNS = [
  { id: 'todo', label: 'Planned', tone: 'sage' },
  { id: 'doing', label: 'In progress', tone: 'butter' },
  { id: 'review', label: 'Review', tone: 'cyan' },
  { id: 'done', label: 'Done', tone: 'lavender' },
];

const COL_OF = {
  lead: 'todo', planned: 'todo',
  in_progress: 'doing', shooting: 'doing', editing: 'doing', revision: 'doing',
  client_review: 'review', approved: 'review',
  delivered: 'done', completed: 'done',
};
export const columnOf = (p) => COL_OF[p.stage] || 'todo';

// Stage a project takes when dropped in a column, in its own flow. Staying in the same column keeps the stage.
export function stageForColumn(p, col) {
  if (columnOf(p) === col) return p.stage;
  const video = M.projectWorkflow(p) === 'video';
  if (col === 'todo') return 'planned';
  if (col === 'doing') return video ? (M.stageIdx(p.stage) > M.stageIdx('shooting') ? 'editing' : 'shooting') : 'in_progress';
  if (col === 'review') return 'client_review';
  return video ? 'delivered' : 'completed';
}

// Projects shown on the board: everything not archived. Done shows the latest few only, so it never takes over.
export function boardColumns(projects, doneLimit = 8) {
  const out = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
  for (const p of projects) if (!p.archived) out[columnOf(p)].push(p);
  const key = (p) => M.projectDate(p)?.date || '9999';
  for (const id of ['todo', 'doing', 'review']) out[id].sort((a, b) => key(a).localeCompare(key(b)) || (b.updatedAt || 0) - (a.updatedAt || 0));
  out.done.sort((a, b) => (b.completedAt || b.updatedAt || 0) - (a.completedAt || a.updatedAt || 0));
  return { cols: out, doneMore: Math.max(0, out.done.length - doneLimit), doneShown: out.done.slice(0, doneLimit) };
}
