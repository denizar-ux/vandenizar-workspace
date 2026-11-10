// Areas group everything on Today: each work category plus Content. Progress helpers for project cards.
import { categories, categoryOf, projectCategoryId, settings, liveTasks, isApproved } from '../lib/model.js';
import { get } from '../lib/db.js';

export const CONTENT_AREA = { id: 'content', name: 'Content', color: 'peach' };

const toArea = (c) => ({ id: c.id, name: c.name, color: c.color });
export const areas = () => [...categories().map(toArea), CONTENT_AREA];

export function areaOfTask(task) {
  const project = task && task.projectId ? get('pmProjects', task.projectId) : null;
  return toArea(categoryOf(project ? projectCategoryId(project) : settings().defaultCategory));
}

export function projectProgress(project) {
  const tasks = liveTasks().filter((t) => t.projectId === project.id && t.status !== 'cancelled');
  const dv = project.deliverables || [];
  return {
    done: tasks.filter((t) => t.status === 'done').length + dv.filter(isApproved).length,
    total: tasks.length + dv.length,
  };
}

export function segments(done, total, max = 10) {
  if (!total) return { filled: 0, count: 0 };
  const count = Math.min(total, max);
  return { filled: Math.round((done / total) * count), count };
}
