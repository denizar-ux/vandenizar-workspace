import { useEffect, useState } from 'preact/hooks';

// Hash routes like #/content/item/abc. Works inside iframes and installed home-screen apps.
let current = parse();
const subs = new Set();
const stack = []; // our own back stack, so in-app Back works in a home-screen app with no browser chrome
function parse() {
  const raw = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  const parts = (p || '').split('/').filter(Boolean).map(decodeURIComponent);
  return { path: '/' + parts.join('/'), full: '/' + (p || '') + (q ? '?' + q : ''), parts, query: Object.fromEntries(new URLSearchParams(q || '')) };
}
function emit() {
  const next = parse();
  if (stack.length && stack[stack.length - 1] === next.full) stack.pop(); // browser back
  current = next;
  subs.forEach((f) => f(current));
  try { window.scrollTo(0, 0); } catch {}
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', emit);

export function navigate(path, { replace = false } = {}) {
  if (current.full === path) return;
  if (!replace) stack.push(current.full);
  if (stack.length > 50) stack.shift();
  const target = '#' + path;
  try {
    if (replace) { history.replaceState(null, '', target); emit(); }
    else location.hash = target;
  } catch { location.hash = target; }
}
export function back(fallback = '/') {
  const prev = stack.pop();
  const target = prev && prev !== current.full ? prev : fallback;
  try { history.replaceState(null, '', '#' + target); emit(); } catch { location.hash = '#' + target; }
}
export const canGoBack = () => stack.length > 0;
export function useRoute() {
  const [r, set] = useState(current);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return r;
}
export const route = () => current;
