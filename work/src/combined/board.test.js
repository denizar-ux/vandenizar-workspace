import { describe, it, expect } from 'vitest';
import { columnOf, stageForColumn, boardColumns } from './board.js';

const g = (stage) => ({ id: stage, stage, workflow: 'general' });
const v = (stage) => ({ id: stage, stage, workflow: 'video' });

describe('board', () => {
  it('folds both flows into four columns', () => {
    expect(['planned', 'in_progress', 'client_review', 'completed'].map((s) => columnOf(g(s)))).toEqual(['todo', 'doing', 'review', 'done']);
    expect(['lead', 'shooting', 'editing', 'revision', 'approved', 'delivered'].map((s) => columnOf(v(s)))).toEqual(['todo', 'doing', 'doing', 'doing', 'review', 'done']);
  });
  it('picks a stage in the project own flow', () => {
    expect(stageForColumn(g('planned'), 'doing')).toBe('in_progress');
    expect(stageForColumn(g('in_progress'), 'done')).toBe('completed');
    expect(stageForColumn(v('planned'), 'doing')).toBe('shooting');
    expect(stageForColumn(v('client_review'), 'doing')).toBe('editing');
    expect(stageForColumn(v('editing'), 'done')).toBe('delivered');
    expect(stageForColumn(v('editing'), 'doing')).toBe('editing');
  });
  it('leaves archived projects out', () => {
    const { cols } = boardColumns([g('planned'), { ...g('in_progress'), archived: true }]);
    expect(cols.todo).toHaveLength(1);
    expect(cols.doing).toHaveLength(0);
  });
});
