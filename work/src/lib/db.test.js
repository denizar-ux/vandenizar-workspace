import { resetForTests, put, get, all, patch, remove } from './db.js';
beforeEach(() => resetForTests());
it('stores content items next to work collections', () => {
  put('cItems', { id: 'p1', kind: 'ig', title: 'BTS' });
  put('pmTasks', { id: 't1', title: 'Export' });
  patch('cItems', 'p1', { stage: 'script' });
  expect(get('cItems', 'p1').stage).toBe('script');
  expect(all('pmTasks').map((t) => t.id)).toEqual(['t1']);
  remove('cItems', 'p1');
  expect(all('cItems').length).toBe(0);
});
