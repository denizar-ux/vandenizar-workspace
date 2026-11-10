import { render } from 'preact';
import './fonts.css';
import './styles.css';
import * as db from './lib/db.js';
import { initDb, get, put } from './lib/db.js';
import * as PM from './lib/model.js';
import * as CM from './content/model.js';
import { loadSampleData } from './lib/sample.js';
import { DEFAULT_SETTINGS, autoArchiveProjects } from './lib/model.js';
import { App } from './App.jsx';
import { initSync, onSync, sync, LOCAL } from './lib/sync.js';
import { dropPushSubscription } from './lib/push.js';
import { applyTheme, getTheme } from './pages/settings.jsx';

applyTheme(getTheme());
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getTheme())); } catch {}

async function boot() {
  await initDb();
  // Dev/local-build only: lets visual checks seed data. Not present in a normal production build.
  if (import.meta.env.DEV || import.meta.env.VITE_LOCAL === '1') window.__vzw = { db, PM, CM, loadSampleData };
  if (!get('meta', 'pmSettings')) put('meta', { ...DEFAULT_SETTINGS });
  const sweep = () => { try { autoArchiveProjects(); } catch (e) { console.error('auto-archive', e); } };
  sweep();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sweep(); });
  render(<App />, document.getElementById('app'));
  if (LOCAL) { dropPushSubscription(); return; }
  initSync().catch(() => {});
  // Run the auto-archive sweep once after the first sync completes.
  let last = '';
  onSync(() => { if (sync.status === 'synced' && last !== 'synced') { sweep(); } last = sync.status; });
}
boot();

// Offline support and installability when served from a real domain.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic|usercontent/.test(location.hostname)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
