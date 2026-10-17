// UI language: English (default) or Indonesian. Strings are written in English in the code and wrapped in t();
// the Indonesian text lives in lang-id.js, keyed by the English string. Anything missing falls back to English.
// The choice is saved in settings (so it follows you across devices) and mirrored in localStorage for the first paint.
import { get } from './db.js';
import ID from './lang-id.js';

export const LANGS = [{ id: 'en', label: 'English' }, { id: 'id', label: 'Bahasa Indonesia' }];
let cached = (() => { try { return localStorage.getItem('vz:lang') || 'en'; } catch { return 'en'; } })();

export function lang() {
  const s = get('meta', 'settings');
  const l = s && (s.language === 'id' || s.language === 'en') ? s.language : cached;
  if (l !== cached) { cached = l; try { localStorage.setItem('vz:lang', l); } catch {} try { document.documentElement.lang = l; } catch {} }
  return l;
}
export const isID = () => lang() === 'id';
export const locale = () => (isID() ? 'id-ID' : 'en-GB');

// t('Hello {name}', { name }) -> translated, with {placeholders} filled in
export function t(en, vars) {
  let s = en;
  if (isID()) { const tr = ID[en]; if (tr != null) s = tr; }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
// Plural-aware: tn(3, '{n} task', '{n} tasks')
export function tn(n, one, many, vars) { return t(n === 1 ? one : many, { n, ...(vars || {}) }); }
