import { describe, it, expect, beforeEach } from 'vitest';
import { resetForTests, put } from '../lib/db.js';
import { areas, areaOfTask, projectProgress, segments, CONTENT_AREA } from './areas.js';

beforeEach(() => resetForTests());

describe('areas', () => {
  it('ends with Content and skips archived categories', () => {
    put('meta', { id: 'pmCategories', items: [
      { id: 'a', name: 'A', color: 'sage', archived: false, order: 1 },
      { id: 'b', name: 'B', color: 'rose', archived: true, order: 2 },
      { id: 'c', name: 'C', color: 'cyan', archived: false, order: 3 },
    ] });
    const list = areas();
    expect(list.map((a) => a.id)).toEqual(['a', 'c', 'content']);
    expect(list[list.length - 1]).toEqual(CONTENT_AREA);
  });

  it('gives a task without a project the default category', () => {
    put('meta', { id: 'pmSettings', defaultCategory: 'personal' });
    expect(areaOfTask({ id: 't1', projectId: null }).id).toBe('personal');
  });

  it('uses the project category', () => {
    put('pmProjects', { id: 'p1', name: 'P', categoryId: 'in_house' });
    expect(areaOfTask({ id: 't1', projectId: 'p1' }).id).toBe('in_house');
  });
});

describe('projectProgress', () => {
  it('counts done tasks and approved deliverables, ignoring cancelled', () => {
    const p = put('pmProjects', { id: 'p1', name: 'P', deliverables: [{ id: 'd1', status: 'approved' }, { id: 'd2', status: 'in_progress' }] });
    put('pmTasks', { id: 't1', projectId: 'p1', status: 'done' });
    put('pmTasks', { id: 't2', projectId: 'p1', status: 'done' });
    put('pmTasks', { id: 't3', projectId: 'p1', status: 'open' });
    put('pmTasks', { id: 't4', projectId: 'p1', status: 'cancelled' });
    expect(projectProgress(p)).toEqual({ done: 3, total: 5 });
  });
});

describe('segments', () => {
  it('fills proportionally and caps the count', () => {
    expect(segments(7, 10)).toEqual({ filled: 7, count: 10 });
    expect(segments(3, 30)).toEqual({ filled: 1, count: 10 });
    expect(segments(0, 0)).toEqual({ filled: 0, count: 0 });
  });
});
