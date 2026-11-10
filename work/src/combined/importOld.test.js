import { describe, it, expect, beforeEach } from 'vitest';
import { resetForTests, all, get, put, exportAll } from '../lib/db.js';
import { DEFAULT_SETTINGS } from '../lib/model.js';
import { setNotify, slotById, pillarName, formatName, cSettings } from '../content/model.js';
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
    expect(previewImport(pm)).toEqual({ source: 'pm', counts: { tasks: 3, projects: 2, clients: 2, invoices: 1, posts: 0, threads: 0, links: 0 }, already: 0, settings: 'imported' });
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
    expect(res).toEqual({ added: 11, skipped: 0, settings: 'imported' }); // 2 clients, 2 projects, 3 tasks, 1 event, 1 feedback, 1 invoice, 1 payment, no legacy, no meta
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
  it('takes the backup settings field by field when this device still has the boot defaults', async () => {
    put('meta', { ...DEFAULT_SETTINGS }); // what main.jsx writes at boot
    const f = clone(pm);
    f.data.meta[0] = { id: 'pmSettings', defaultCategory: 'freelance', reminderTime: '07:30', weekStart: 0, invoiceFormat: 'STD-{####}', paymentInstructions: 'BCA 123', business: { name: 'Studio X', email: 'hi@x.co' } };
    expect(previewImport(f).settings).toBe('imported');
    const res = await importBackup(f);
    expect(res.settings).toBe('imported');
    const s = get('meta', 'pmSettings');
    expect(s).toMatchObject({ id: 'pmSettings', reminderTime: '07:30', weekStart: 0, invoiceFormat: 'STD-{####}', paymentInstructions: 'BCA 123', defaultCategory: 'freelance' });
    expect(s.business).toMatchObject({ name: 'Studio X', email: 'hi@x.co', address: DEFAULT_SETTINGS.business.address });
    expect(s.name).toBe(DEFAULT_SETTINGS.name);
  });
  it('keeps fields the user changed here and says so', async () => {
    put('meta', { ...DEFAULT_SETTINGS, reminderTime: '10:00', business: { ...DEFAULT_SETTINGS.business, name: 'Mine' } });
    const f = clone(pm);
    f.data.meta[0] = { id: 'pmSettings', reminderTime: '07:30', invoiceFormat: 'STD-{####}', business: { name: 'Theirs', email: 'hi@x.co' } };
    const res = await importBackup(f);
    expect(res.settings).toBe('imported'); // invoiceFormat and email came over
    const s = get('meta', 'pmSettings');
    expect(s.reminderTime).toBe('10:00');
    expect(s.business.name).toBe('Mine');
    expect(s.business.email).toBe('hi@x.co');
    expect(s.invoiceFormat).toBe('STD-{####}');
    const g = clone(pm);
    g.data.meta[0] = { id: 'pmSettings', reminderTime: '06:00' };
    expect((await importBackup(g)).settings).toBe('kept');
    expect(get('meta', 'pmSettings').reminderTime).toBe('10:00');
  });
  it('reports none when the backup has no settings', async () => {
    const f = clone(pm);
    f.data.meta = [];
    expect((await importBackup(f)).settings).toBe('none');
  });
  it('maps project categories by name to ones on this device', async () => {
    put('meta', { id: 'pmCategories', items: [
      { id: 'zzz', name: 'FREELANCE', color: 'rose', archived: false, order: 1 },
      { id: 'own', name: 'Studio', color: 'sage', archived: false, order: 2 },
    ] });
    await importBackup(pm);
    const proj = all('pmProjects').find((p) => p.importedFrom === 'pm:pr1'); // freelance
    expect(proj.categoryId).toBe('zzz');
    expect(get('meta', 'pmCategories').items).toHaveLength(2);
  });
  it('adds a category that does not exist here yet', async () => {
    put('meta', { id: 'pmCategories', items: [{ id: 'own', name: 'Studio', color: 'sage', archived: false, order: 1 }] });
    await importBackup(pm);
    const items = get('meta', 'pmCategories').items;
    const added = items.find((c) => c.name === 'Freelance');
    expect(added).toBeTruthy();
    expect(added.id).not.toBe('own');
    expect(all('pmProjects').find((p) => p.importedFrom === 'pm:pr1').categoryId).toBe(added.id);
    expect(all('pmProjects').find((p) => p.importedFrom === 'pm:pr2').categoryId).toBe('personal'); // not listed in the backup's categories: left as is
  });
  it('keeps default category ids that exist on both sides', async () => {
    await importBackup(pm);
    expect(all('pmProjects').find((p) => p.importedFrom === 'pm:pr1').categoryId).toBe('freelance');
    expect(all('pmProjects').find((p) => p.importedFrom === 'pm:pr2').categoryId).toBe('personal');
  });
  it('a second import adds nothing and the preview says so', async () => {
    await importBackup(pm);
    expect(previewImport(pm).already).toBe(11);
    const again = await importBackup(pm);
    expect(again).toEqual({ added: 0, skipped: 11, settings: 'kept' });
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
  it('writes settings to meta/cSettings when absent, keeps local entries with the same id', async () => {
    await importBackup(cos);
    const s = get('meta', 'cSettings');
    expect(s.slots[0].id).toBe('work');
    expect(s.pillars).toHaveLength(1);
    resetForTests();
    put('meta', { id: 'cSettings', slots: [{ id: 'work', name: 'Mine', day: 1 }], pillars: [], formats: [] });
    await importBackup(cos);
    expect(get('meta', 'cSettings').slots).toEqual([{ id: 'work', name: 'Mine', day: 1 }]); // same id: local kept
    expect(get('meta', 'cSettings').pillars).toHaveLength(1); // missing ids are added
  });
  it('merges slots, pillars and formats by id into existing content settings', async () => {
    setNotify({ postTime: '20:30' }); // cSettings now exists with defaults
    const f = clone(cos);
    f.data.settings[0].slots.push({ id: 'myslot', name: 'My slot', day: 3, tint: 'rose', hint: '', pillar: 'mypillar', format: 'myformat' });
    f.data.settings[0].pillars.push({ id: 'mypillar', name: 'My pillar' });
    f.data.settings[0].formats.push({ id: 'myformat', name: 'My format' });
    f.data.items[0].slot = 'myslot';
    await importBackup(f);
    const s = cSettings();
    expect(s.slots.map((x) => x.id)).toEqual(expect.arrayContaining(['work', 'shot', 'story', 'desk', 'myslot']));
    expect(s.slots.filter((x) => x.id === 'work')).toHaveLength(1);
    expect(s.slots.find((x) => x.id === 'work').name).toBe('Work post'); // local kept
    expect(s.pillars.some((x) => x.id === 'mypillar')).toBe(true);
    expect(s.formats.some((x) => x.id === 'myformat')).toBe(true);
    const imported = all('cItems').find((i) => i.importedFrom === 'cos:p1');
    expect(slotById(imported.slot).name).toBe('My slot');
    expect(pillarName('mypillar')).toBe('My pillar');
    expect(formatName('myformat')).toBe('My format');
    expect(s.notify.postTime).toBe('20:30'); // local notify untouched
  });
  it('fills notify times from the backup only while this device has the defaults', async () => {
    const f = clone(cos);
    f.data.settings[0].notify = { morning: false, morningTime: '06:00', postReminder: true, postTime: '18:00' };
    await importBackup(f);
    expect(get('meta', 'cSettings').notify).toMatchObject({ morningTime: '06:00', postTime: '18:00', morning: false });
    resetForTests();
    setNotify({ postTime: '20:30' });
    await importBackup(f);
    expect(get('meta', 'cSettings').notify.postTime).toBe('20:30');
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
  it('never overwrites a record or setting already on this device', async () => {
    put('pmTasks', { id: 'X', title: 'old' });
    put('meta', { id: 'pmSettings', defaultCurrency: 'old' });
    const snap = exportAll();
    put('pmTasks', { id: 'Y', title: 'only in file' });
    put('meta', { id: 'extra', v: 1 });
    const file = exportAll();
    resetForTests();
    put('pmTasks', { id: 'X', title: 'local' });
    put('meta', { id: 'pmSettings', defaultCurrency: 'local' });
    expect(previewImport(file).already).toBe(1);
    const res = await importBackup(file);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect(get('pmTasks', 'X').title).toBe('local');
    expect(get('pmTasks', 'Y').title).toBe('only in file');
    expect(get('meta', 'pmSettings').defaultCurrency).toBe('local');
    expect(get('meta', 'extra').v).toBe(1);
    expect(snap.app).toBe('vandenizar-work');
  });
  it('throws the exact message for garbage', async () => {
    await expect(importBackup({ nope: true })).rejects.toThrow(MSG);
    await expect(importBackup(null)).rejects.toThrow(MSG);
    await expect(importBackup('{"app":"x"}')).rejects.toThrow(MSG);
  });
});
