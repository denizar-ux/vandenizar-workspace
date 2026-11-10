import { describe, it, expect, beforeEach } from 'vitest';
import { resetForTests, all, get, put, exportAll } from '../lib/db.js';
import { detectBackup, previewImport, importBackup } from './importOld.js';
import pm from './fixtures/pm-export.json';
import cos from './fixtures/cos-export.json';

const MSG = 'This file is not a Vandenizar backup';
const clone = (x) => JSON.parse(JSON.stringify(x));
beforeEach(() => resetForTests());

describe('detectBackup', () => {
  it('recognises each source', () => {
    expect(detectBackup(pm)).toBe('pm');
    expect(detectBackup(cos)).toBe('cos');
    put('pmTasks', { id: 'x', title: 'x' });
    expect(detectBackup(exportAll())).toBe('work');
  });
  it('returns null for anything else', () => {
    for (const bad of [null, undefined, 'text', 42, [], {}, { app: 'other', data: {} }, { app: 'vandenizar-workspace' }]) expect(detectBackup(bad)).toBeNull();
  });
});

describe('previewImport', () => {
  it('counts the project manager file', () => {
    expect(previewImport(pm)).toEqual({ source: 'pm', counts: { tasks: 3, projects: 2, clients: 2, invoices: 1, posts: 0, threads: 0, links: 0 }, already: 0 });
  });
  it('counts the content file, legacy ideas as posts', () => {
    expect(previewImport(cos)).toEqual({ source: 'cos', counts: { tasks: 0, projects: 0, clients: 0, invoices: 0, posts: 3, threads: 1, links: 2 }, already: 0 });
  });
  it('throws the exact message for garbage', () => {
    expect(() => previewImport({ hello: 1 })).toThrow(MSG);
  });
});

describe('importBackup: project manager', () => {
  it('gives new ids, keeps links between records and marks the origin', async () => {
    const res = await importBackup(pm);
    expect(res).toEqual({ added: 11, skipped: 0 }); // 2 clients, 2 projects, 3 tasks, 1 event, 1 feedback, 1 invoice, 1 payment, no legacy, no meta
    const proj = all('pmProjects').find((p) => p.importedFrom === 'pm:pr1');
    const client = all('clients').find((c) => c.importedFrom === 'pm:cl1');
    const t1 = all('pmTasks').find((t) => t.importedFrom === 'pm:tk1');
    const t2 = all('pmTasks').find((t) => t.importedFrom === 'pm:tk2');
    const inv = all('invoices').find((i) => i.importedFrom === 'pm:in1');
    expect(proj.id).not.toBe('pr1');
    expect(proj.clientId).toBe(client.id);
    expect(proj.nextActionTaskId).toBe(t2.id);
    expect(t1.projectId).toBe(proj.id);
    expect(t2.invoiceId).toBe(inv.id);
    expect(inv.clientId).toBe(client.id);
    expect(inv.projectId).toBe(proj.id);
    expect(all('payments')[0].invoiceId).toBe(inv.id);
    expect(all('feedback')[0].projectId).toBe(proj.id);
    expect(all('feedback')[0].taskId).toBe(t2.id);
    expect(all('feedback')[0].deliverableId).toBe('dv1');
    expect(all('pmEvents')[0].projectId).toBe(proj.id);
    expect(proj.deliverables[0].id).toBe('dv1');
    expect(get('pmProjects', 'pr1')).toBeUndefined();
  });
  it('keeps a numeric createdAt and lets the store stamp a bad one', async () => {
    await importBackup(pm);
    expect(all('pmTasks').find((t) => t.importedFrom === 'pm:tk1').createdAt).toBe(1760003000000);
    expect(typeof all('pmTasks').find((t) => t.importedFrom === 'pm:tk3').createdAt).toBe('number');
    expect(all('pmTasks').find((t) => t.importedFrom === 'pm:tk3').createdAt).toBeGreaterThan(1760003200000);
  });
  it('ignores legacy collections', async () => {
    await importBackup(pm);
    expect(all('pmTasks').some((t) => t.title.startsWith('Legacy'))).toBe(false);
  });
  it('copies settings and categories only when none exist', async () => {
    await importBackup(pm);
    expect(get('meta', 'pmSettings').defaultCurrency).toBe('IDR');
    expect(get('meta', 'pmCategories').items[0].id).toBe('freelance');
    expect(get('meta', 'recent')).toBeUndefined();
    resetForTests();
    put('meta', { id: 'pmSettings', defaultCurrency: 'USD' });
    await importBackup(pm);
    expect(get('meta', 'pmSettings').defaultCurrency).toBe('USD');
  });
  it('a second import adds nothing and the preview says so', async () => {
    await importBackup(pm);
    expect(previewImport(pm).already).toBe(11);
    const again = await importBackup(pm);
    expect(again).toEqual({ added: 0, skipped: 11 });
    expect(all('pmTasks')).toHaveLength(3);
  });
  it('links new records to records imported earlier', async () => {
    const first = clone(pm);
    first.data.pmTasks = [];
    first.data.feedback = [];
    first.data.payments = [];
    await importBackup(first);
    const res = await importBackup(pm);
    expect(res.added).toBe(5); // 3 tasks, feedback, payment
    const proj = all('pmProjects').find((p) => p.importedFrom === 'pm:pr1');
    expect(all('pmTasks').find((t) => t.importedFrom === 'pm:tk1').projectId).toBe(proj.id);
    expect(all('pmProjects')).toHaveLength(2);
  });
  it('drops a reference to a record that is not in the file', async () => {
    const f = clone(pm);
    f.data.pmTasks = [{ id: 'orphan', title: 'Orphan', projectId: 'gone', invoiceId: 'gone' }];
    await importBackup(f);
    const t = all('pmTasks')[0];
    expect(t.projectId).toBeNull();
    expect(t.invoiceId).toBeNull();
  });
});

describe('importBackup: content', () => {
  it('moves items to cItems, turns legacy ideas into ig posts at the idea stage', async () => {
    const res = await importBackup(cos);
    expect(res).toEqual({ added: 6, skipped: 0 });
    const items = all('cItems');
    expect(items).toHaveLength(6);
    const idea = items.find((i) => i.importedFrom === 'cos:p3');
    expect(idea.kind).toBe('ig');
    expect(idea.stage).toBe('idea');
    const p1 = items.find((i) => i.importedFrom === 'cos:p1');
    expect(p1.id).not.toBe('p1');
    expect(p1.slot).toBe('work');
    expect(p1.refs[0].id).toBe('r1');
    expect(typeof p1.createdAt).toBe('number');
    expect(items.filter((i) => i.kind === 'link')).toHaveLength(2);
  });
  it('writes settings to meta/cSettings only when absent', async () => {
    await importBackup(cos);
    const s = get('meta', 'cSettings');
    expect(s.slots[0].id).toBe('work');
    expect(s.pillars).toHaveLength(1);
    resetForTests();
    put('meta', { id: 'cSettings', slots: [], pillars: [], formats: [] });
    await importBackup(cos);
    expect(get('meta', 'cSettings').slots).toEqual([]);
  });
  it('a second import adds nothing', async () => {
    await importBackup(cos);
    expect(previewImport(cos).already).toBe(6);
    expect(await importBackup(cos)).toEqual({ added: 0, skipped: 6 });
    expect(all('cItems')).toHaveLength(6);
  });
});

describe('importBackup: work backup and garbage', () => {
  it('restores a work backup without wiping what is there', async () => {
    put('pmTasks', { id: 'a', title: 'A' });
    const snap = exportAll();
    resetForTests();
    put('pmTasks', { id: 'b', title: 'B' });
    const res = await importBackup(snap);
    expect(res.added).toBe(1);
    expect(all('pmTasks').map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
  it('throws the exact message for garbage', async () => {
    await expect(importBackup({ nope: true })).rejects.toThrow(MSG);
    await expect(importBackup(null)).rejects.toThrow(MSG);
    await expect(importBackup('{"app":"x"}')).rejects.toThrow(MSG);
  });
});
