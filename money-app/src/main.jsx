import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import '../../src/fonts.css';
import '../../src/styles.css';
import './money-styles.css';
import './money-app.css';
import { useRoute, navigate } from '../../src/lib/router.js';
import { Overlays, Toasts, useMedia } from '../../src/ui/overlay.jsx';
import { Icon } from '../../src/ui/Icon.jsx';
import { initStore, useStore, store } from './lib/store.js';
import { t } from '../../src/lib/i18n.js';
import * as $ from './lib/money-data.js';
import { MoneyOverview, MoneyHistory, MoneyBudget, MoneyAccounts, MoneyDebts, MoneyInsights, MoneySettingsPage, openTx } from './pages/money.jsx';

window.__MZ_ID__ = 'Hx9qR3uSi4rppmbHCroATj';
// Links like <artifact url>#expense open straight into a form.
const START = (() => { try { const h = location.hash.replace(/^#\/?/, ''); return ['expense', 'income', 'transfer'].includes(h) ? h : ''; } catch { return ''; } })();
if (START || !/^#\/money/.test(location.hash)) { try { history.replaceState(null, '', '#/money'); } catch {} }

function App() {
  useStore();
  const r = useRoute();
  const sub = r.parts[0] === 'money' ? r.parts[1] || '' : '';
  const q = r.query;
  useEffect(() => {
    if (!START) return;
    const go = () => { if ($.hasMoneySetup()) openTx({ type: START }); };
    if (store.ready) go(); else { const id = setInterval(() => { if (store.ready) { clearInterval(id); go(); } }, 200); return () => clearInterval(id); }
  }, []);
  const page = sub === 'history' ? <MoneyHistory query={q} /> : sub === 'budget' ? <MoneyBudget query={q} /> : sub === 'accounts' ? <MoneyAccounts query={q} />
    : sub === 'debts' ? <MoneyDebts query={q} /> : sub === 'insights' ? <MoneyInsights query={q} /> : sub === 'settings' ? <MoneySettingsPage /> : <MoneyOverview />;
  return (
    <div class="app mz-app">
      <div class="glow" aria-hidden="true" />
      <main class="main" id="main"><div class="page-shell">{page}</div></main>
      {$.hasMoneySetup() && sub !== 'settings' && (
        <button class="mz-fab" aria-label={t('New transaction')} onClick={() => openTx({ type: 'expense' })}><Icon name="plus" size={26} stroke={2.4} /></button>
      )}
      <Overlays />
      <Toasts />
    </div>
  );
}

render(<App />, document.getElementById('app'));
initStore();
