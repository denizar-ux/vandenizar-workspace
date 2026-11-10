import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveAlias } from './aliases.js';

// public/sw.js keeps its own copy of the alias table (a service worker cannot import app modules).
const table = (file) => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const body = /const ALIASES = \{([\s\S]*?)\};/.exec(src)[1];
  return Object.fromEntries([...body.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
};

describe('sw.js alias table', () => {
  it('equals the table in aliases.js', () => {
    const sw = table('../../public/sw.js');
    expect(Object.keys(sw).length).toBeGreaterThan(0);
    expect(sw).toEqual(table('./aliases.js'));
    for (const [from, to] of Object.entries(sw)) expect(resolveAlias(from)).toBe(to);
  });
});
