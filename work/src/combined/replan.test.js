import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetForTests, put, get } from '../lib/db.js';
import { ensureDefaults } from '../content/model.js';
import { buildAgenda } from './agenda.js';
import { replanLate, undoReplan } from './replan.js';

const D = '2026-11-10';
const task = (o) => put('pmTasks', { status: 'open', title: 'T', workDate: null, workTime: null, deadlineDate: null, deadlineTime: null, projectId: null, ...o });
const post = (o) => put('cItems', { kind: 'ig', title: 'Post A', stage: 'edit', refs: [], finalUrl: '', scriptDate: null, filmDate: null, editDate: null, date: null, ...o });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
  resetForTests();
  ensureDefaults();
});
afterEach(() => vi.useRealTimers());

describe('replanLate', () => {
  it('keeps gaps', () => {
    task({ id: 'a', deadlineDate: '2026-11-05' });
    task({ id: 'b', deadlineDate: '2026-11-07', workDate: '2026-11-06' });
    task({ id: 'c', deadlineDate: '2026-11-08' });
    const r = replanLate(D);
    expect(r.count).toBe(3);
    expect(['a', 'b', 'c'].map((id) => get('pmTasks', id).deadlineDate)).toEqual(['2026-11-10', '2026-11-12', '2026-11-13']);
    expect(get('pmTasks', 'b').workDate).toBe('2026-11-11');
  });

  it('billable keeps deadline', () => {
    put('pmProjects', { id: 'p1', name: 'Client', billing: true, stage: 'shooting' });
    task({ id: 'a', deadlineDate: '2026-11-06', projectId: 'p1' });
    replanLate(D);
    const t = get('pmTasks', 'a');
    expect(t.deadlineDate).toBe('2026-11-06');
    expect(t.workDate).toBe(D);
    expect(buildAgenda({ date: D }).late).toHaveLength(0);
  });

  it('behind moves to today', () => {
    task({ id: 'a', workDate: '2026-11-08' });
    expect(replanLate(D).count).toBe(1);
    expect(get('pmTasks', 'a').workDate).toBe(D);
  });

  it('content moved', () => {
    post({ id: 'p', stage: 'script', title: 'P', date: '2026-11-12', filmDate: '2026-11-08' });
    const r = replanLate(D);
    expect(r.count).toBe(1);
    expect(get('cItems', 'p').filmDate).toBe(D);
  });

  it('filter work leaves content alone, filter content leaves work alone', () => {
    task({ id: 'a', deadlineDate: '2026-11-08' });
    post({ id: 'p', stage: 'script', title: 'P', date: '2026-11-12', filmDate: '2026-11-08' });
    replanLate(D, 'work');
    expect(get('pmTasks', 'a').deadlineDate).toBe(D);
    expect(get('cItems', 'p').filmDate).toBe('2026-11-08');
    task({ id: 'b', deadlineDate: '2026-11-08' });
    replanLate(D, 'content');
    expect(get('pmTasks', 'b').deadlineDate).toBe('2026-11-08');
    expect(get('cItems', 'p').filmDate).toBe(D);
  });

  it('undo restores all', () => {
    task({ id: 'a', deadlineDate: '2026-11-05' });
    task({ id: 'b', deadlineDate: '2026-11-07', workDate: '2026-11-06' });
    task({ id: 'c', workDate: '2026-11-08' });
    post({ id: 'p', stage: 'script', title: 'P', date: '2026-11-12', filmDate: '2026-11-08' });
    const seed = ['a', 'b', 'c'].map((id) => get('pmTasks', id));
    const seedP = get('cItems', 'p');
    const { snaps } = replanLate(D);
    expect(snaps.length).toBe(4);
    undoReplan(snaps);
    expect(['a', 'b', 'c'].map((id) => get('pmTasks', id))).toEqual(seed.map((s) => expect.objectContaining(s)));
    expect(get('cItems', 'p')).toEqual(expect.objectContaining(seedP));
  });

  it('nothing late is a no-op', () => {
    expect(replanLate(D)).toEqual({ snaps: [], count: 0 });
    task({ id: 'a', deadlineDate: '2026-11-05' });
    expect(replanLate(D).count).toBe(1);
    expect(replanLate(D)).toEqual({ snaps: [], count: 0 });
  });
});
