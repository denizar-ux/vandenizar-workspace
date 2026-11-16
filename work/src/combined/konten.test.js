import { describe, it, expect, beforeEach } from 'vitest';
import { resetForTests, get, all } from '../lib/db.js';
import { createKonten, planKonten, kontenProjectId, kontenTaskId } from './konten.js';
import { categories } from '../lib/model.js';

beforeEach(() => resetForTests());

describe('planKonten', () => {
  it('plans back from the posting date', () => {
    expect(planKonten('2026-11-30', '2026-11-16')).toEqual({ script: '2026-11-26', shoot: '2026-11-27', edit: '2026-11-29', post: '2026-11-30' });
  });
  it('moves steps that would be in the past up to today', () => {
    expect(planKonten('2026-11-18', '2026-11-16')).toEqual({ script: '2026-11-16', shoot: '2026-11-16', edit: '2026-11-17', post: '2026-11-18' });
  });
  it('a post date in the past keeps everything on that date', () => {
    expect(planKonten('2026-11-10', '2026-11-16')).toEqual({ script: '2026-11-10', shoot: '2026-11-10', edit: '2026-11-10', post: '2026-11-10' });
  });
});

describe('createKonten', () => {
  it('makes a Konten project with four timed tasks and adds the category', () => {
    const p = createKonten({ title: 'Setup meja', postDate: '2026-11-30', from: '2026-11-16' });
    expect(p).toMatchObject({ name: 'Setup meja', categoryId: 'konten', billing: false, deadlineDate: '2026-11-30' });
    expect(categories().some((c) => c.id === 'konten')).toBe(true);
    const tasks = all('pmTasks').filter((t) => t.projectId === p.id).sort((a, b) => a.order - b.order);
    expect(tasks.map((t) => [t.title, t.workDate, t.workTime])).toEqual([
      ['Script: Setup meja', '2026-11-26', '09:00'], ['Shoot: Setup meja', '2026-11-27', '09:00'],
      ['Edit: Setup meja', '2026-11-29', '09:00'], ['Post: Setup meja', '2026-11-30', '19:00'],
    ]);
  });
  it('is idempotent for a Studio post and uses fixed ids', () => {
    createKonten({ title: 'A', postDate: '2026-11-30', studioId: 'abc', from: '2026-11-16' });
    createKonten({ title: 'A changed', postDate: '2026-12-05', studioId: 'abc', from: '2026-11-16' });
    expect(get('pmProjects', kontenProjectId('abc')).name).toBe('A');
    expect(all('pmTasks')).toHaveLength(4);
    expect(get('pmTasks', kontenTaskId('abc', 'post')).workDate).toBe('2026-11-30');
  });
});
