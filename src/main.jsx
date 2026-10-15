import { render } from 'preact';
import './fonts.css';
import './styles.css';
import { initDb, get, put, all } from './lib/db.js';
import { DEFAULT_SETTINGS } from './lib/model.js';
import { App } from './App.jsx';
import { initSync } from './lib/sync.js';
import { applyTheme, getTheme } from './pages/settings.jsx';

applyTheme(getTheme());

async function boot() {
  await initDb();
  if (!get('meta', 'settings')) put('meta', { ...DEFAULT_SETTINGS });
  // one-time migration: old single "In Progress" content status becomes Scripting
  for (const c of all('contents')) if (c.status === 'in_progress') put('contents', { ...c, status: 'scripting' }, { silent: true });
  render(<App />, document.getElementById('app'));
  initSync().catch(() => {});
}
boot();

// Offline support and installability when served from a real domain.
// (Service workers are unavailable inside sandboxed previews; that is expected.)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic|usercontent/.test(location.hostname)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
