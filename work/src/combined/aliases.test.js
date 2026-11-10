import { describe, it, expect } from 'vitest';
import { resolveAlias } from './aliases.js';

describe('resolveAlias', () => {
  it('maps each old route to its new home', () => {
    expect(resolveAlias('/today', '')).toBe('/');
    expect(resolveAlias('/projects', '')).toBe('/work/projects');
    expect(resolveAlias('/tasks', '')).toBe('/work/tasks');
    expect(resolveAlias('/instagram', '')).toBe('/content/ig');
    expect(resolveAlias('/threads', '')).toBe('/content/threads');
    expect(resolveAlias('/resources', '')).toBe('/more/resources');
  });
  it('keeps the query string', () => {
    expect(resolveAlias('/tasks', 'view=today')).toBe('/work/tasks?view=today');
    expect(resolveAlias('/projects', '?stage=client_review')).toBe('/work/projects?stage=client_review');
  });
  it('leaves everything else alone', () => {
    expect(resolveAlias('/tasks/abc', '')).toBeNull();
    expect(resolveAlias('/projects/abc', '')).toBeNull();
    expect(resolveAlias('/', '')).toBeNull();
    expect(resolveAlias('/work/tasks', '')).toBeNull();
    expect(resolveAlias('/calendar', '')).toBeNull();
  });
});
