import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetForTests, put } from '../lib/db.js';
import { fmtDay } from '../lib/date.js';
import { ensureDefaults } from '../content/model.js';
import { buildAgenda } from './agenda.js';

const D = '2026-11-10';
const task = (o) => put('pmTasks', { status: 'open', title: 'T', workDate: null, workTime: null, deadlineDate: null, deadlineTime: null, projectId: null, ...o });
const post = (o) => put('cItems', { kind: 'ig', title: 'Post A', stage: 'edit', refs: [], finalUrl: '', scriptDate: null, filmDate: null, editDate: null, date: null, ...o });
const thread = (o) => put('cItems', { kind: 'thread', text: 'hello', date: null, time: null, postedAt: null, createdAt: '2026-11-01T00:00:00Z', ...o });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T05:00:00Z')); // 12:00 WIB
  resetForTests();
  ensureDefaults();
});
afterEach(() => vi.useRealTimers());

describe('buildAgenda', () => {
  it('groups timed items by time', () => {
    task({ id: 't1', title: 'Edit reel', workDate: D, workTime: '14:00' });
    thread({ id: 'th1', date: D, time: '09:30' });
    post({ id: 'p1', date: D });
    const a = buildAgenda({ date: D });
    expect(a.scheduled.map((i) => i.kind)).toEqual(['thread', 'task', 'post']);
    expect(a.scheduled[2].time).toBe('19:00');
  });

  it('deadline today without work date is anytime', () => {
    task({ id: 't1', deadlineDate: D, deadlineTime: '23:00' });
    const a = buildAgenda({ date: D });
    expect(a.anytime).toHaveLength(1);
    expect(a.anytime[0].sub).toContain('Deadline today');
    expect(a.late).toHaveLength(0);
  });

  it('behind task stays visible', () => {
    task({ id: 't1', workDate: '2026-11-09' });
    const a = buildAgenda({ date: D });
    expect(a.anytime[0].sub).toBe('Planned ' + fmtDay('2026-11-09'));
    expect(a.late).toHaveLength(0);
  });

  it('billable overdue scheduled today leaves late', () => {
    put('pmProjects', { id: 'pr1', name: 'Client job', billing: true, categoryId: 'freelance' });
    task({ id: 't1', projectId: 'pr1', deadlineDate: '2026-11-08', workDate: D });
    const a = buildAgenda({ date: D });
    expect(a.late).toHaveLength(0);
    expect(a.anytime[0]).toMatchObject({ kind: 'task', tone: 'bad', sub: 'Client deadline passed' });
  });

  it('non-billable overdue is late', () => {
    task({ id: 't1', deadlineDate: '2026-11-08', workDate: D });
    expect(buildAgenda({ date: D }).late.map((i) => i.key)).toEqual(['task:t1']);
  });

  it('content items without dates are skipped', () => {
    post({ id: 'p1', date: D });
    thread({ id: 'th1', time: '10:00' });
    let a;
    expect(() => { a = buildAgenda({ date: D }); }).not.toThrow();
    expect(a.scheduled.some((i) => i.kind === 'thread')).toBe(false);
    expect(a.scheduled.filter((i) => i.kind === 'post')).toHaveLength(1);
    expect(a.anytime.filter((i) => i.kind === 'ctask')).toHaveLength(0);
  });

  it('lists script/film/edit steps and no duplicate for a due post', () => {
    post({ id: 'p1', stage: 'script', scriptDate: D, filmDate: '2026-11-11', date: D });
    const a = buildAgenda({ date: D });
    expect(a.anytime.map((i) => i.key)).toEqual(['ctask:p1:script']);
    expect(a.scheduled.map((i) => i.key)).toEqual(['post:p1']);
  });

  it('filter and counts', () => {
    task({ id: 't1', workDate: D });
    post({ id: 'p1', date: D });
    thread({ id: 'th1', date: D });
    const all = buildAgenda({ date: D });
    const c = buildAgenda({ date: D, filter: 'content' });
    const flat = (a) => [...a.allDay, ...a.scheduled, ...a.anytime, ...a.late];
    expect(flat(c).every((i) => i.area.id === 'content')).toBe(true);
    expect(c.counts.content).toBe(flat(c).length);
    expect(c.counts).toEqual(all.counts);
    const w = buildAgenda({ date: D, filter: 'work' });
    expect(flat(w).map((i) => i.kind)).toEqual(['task']);
  });

  it('follow-up due', () => {
    put('pmProjects', { id: 'pr1', name: 'Reel', stage: 'client_review', followUpDate: '2026-11-09', categoryId: 'freelance' });
    const a = buildAgenda({ date: D });
    expect(a.anytime.filter((i) => i.kind === 'follow')).toHaveLength(1);
  });

  it('billable overdue with work date after today is hidden', () => {
    put('pmProjects', { id: 'pr1', name: 'Client job', billing: true, categoryId: 'freelance' });
    task({ id: 't1', projectId: 'pr1', deadlineDate: '2026-11-08', workDate: '2026-11-12' });
    const a = buildAgenda({ date: D });
    expect([...a.late, ...a.anytime, ...a.scheduled]).toHaveLength(0);
  });

  it('billable overdue with no work date is late', () => {
    put('pmProjects', { id: 'pr1', name: 'Client job', billing: true, categoryId: 'freelance' });
    task({ id: 't1', projectId: 'pr1', deadlineDate: '2026-11-08' });
    expect(buildAgenda({ date: D }).late.map((i) => i.key)).toEqual(['task:t1']);
  });

  it('project-less overdue task is non-billable and stays late', () => {
    task({ id: 't1', deadlineDate: '2026-11-08', workDate: '2026-11-12' });
    const a = buildAgenda({ date: D });
    expect(a.late.map((i) => i.key)).toEqual(['task:t1']);
    expect(a.anytime).toHaveLength(0);
  });

  it('timed task shows project, estimate and a future deadline note', () => {
    put('pmProjects', { id: 'pr1', name: 'Reel', categoryId: 'in_house', billing: false });
    task({ id: 't1', projectId: 'pr1', estimateMinutes: 90, workDate: D, workTime: '14:00', deadlineDate: '2026-11-13' });
    expect(buildAgenda({ date: D }).scheduled[0].sub).toBe('Reel · 1h 30m · Deadline ' + fmtDay('2026-11-13'));
  });

  it('event without end time shows only the start and keeps location', () => {
    put('pmEvents', { id: 'e1', title: 'Call', date: D, allDay: false, startTime: '09:00', location: 'Zoom' });
    expect(buildAgenda({ date: D }).scheduled[0].sub).toBe('09:00 · Zoom');
  });
});
