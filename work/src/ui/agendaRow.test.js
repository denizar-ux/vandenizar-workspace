import { describe, it, expect, beforeEach } from 'vitest';
import { resetForTests, get } from '../lib/db.js';
import { today } from '../lib/date.js';
import * as C from '../content/model.js';
import * as M from '../lib/model.js';
import { checkItem } from './agendaRow.jsx';
import { buildAgenda } from '../combined/agenda.js';

beforeEach(() => { resetForTests(); C.ensureDefaults(); });

describe('checkItem', () => {
  it('checking a content task advances the post stage', () => {
    const t0 = today();
    const p = C.createPost({ title: 'Film day' });
    C.setStage(p.id, 'film');
    C.setStageDate(p.id, 'filmDate', t0);
    const item = buildAgenda({ date: t0, filter: 'all' }).anytime.find((i) => i.kind === 'ctask');
    expect(item).toBeTruthy();
    checkItem(item);
    expect(get('cItems', p.id).stage).toBe('edit');
  });

  it('checking a post due today marks it posted; a thread marks posted', () => {
    const t0 = today();
    const p = C.createPost({ title: 'Due post' });
    C.setStage(p.id, 'ready');
    C.setStageDate(p.id, 'date', t0);
    const post = buildAgenda({ date: t0, filter: 'all' }).scheduled.find((i) => i.kind === 'post');
    checkItem(post);
    expect(get('cItems', p.id).stage).toBe('done');
    const th = C.addThread('hello thread', t0, '09:00');
    const item = buildAgenda({ date: t0, filter: 'all' }).scheduled.find((i) => i.kind === 'thread');
    checkItem(item);
    expect(get('cItems', th.id).postedAt).toBeTruthy();
  });

  it('checking a work task completes it', () => {
    const t = M.newTask({ title: 'Do it', workDate: today() });
    const item = buildAgenda({ date: today(), filter: 'all' }).anytime.find((i) => i.kind === 'task');
    checkItem(item);
    expect(get('pmTasks', t.id).status).toBe('done');
  });
});
