// Notices when a newer build is live and offers a one-tap update.
import { useEffect, useState } from 'preact/hooks';

/* global __BUILD__ */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
let latest = null;
const subs = new Set();

export async function checkForUpdate() {
  if (BUILD === 'dev' || location.protocol !== 'https:') return false;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return false;
    const v = await r.json();
    if (v && v.build && v.build !== BUILD) { latest = v.build; subs.forEach((f) => f()); return true; }
  } catch {}
  return false;
}

export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update().catch(() => {});
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
  } catch {}
  location.reload();
}

export function useUpdateAvailable() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    checkForUpdate();
    const vis = () => document.visibilityState === 'visible' && checkForUpdate();
    document.addEventListener('visibilitychange', vis);
    const i = setInterval(checkForUpdate, 10 * 60 * 1000);
    return () => { subs.delete(f); document.removeEventListener('visibilitychange', vis); clearInterval(i); };
  }, []);
  return latest;
}
