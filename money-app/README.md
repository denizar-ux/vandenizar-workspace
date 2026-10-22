# Vandenizar Money

Personal money tracker, separate from the Workspace. Published as a claude.ai artifact:
https://claude.ai/artifact/Hx9qR3uSi4rppmbHCroATj

- Data lives in the artifact's own database (`claude.use('db')`), collections `mAccounts`, `mTx`, `mCats`, `mBills`, `mDebts`, `meta`. See `src/lib/store.js`.
- Reuses the Workspace UI kit, dates, i18n and styles from `../src` (see `vite.config.js`); `db.js` and `model.js` are swapped for `store.js` / `model-lite.js`.
- Build: `npx vite build --config money-app/vite.config.js && node money-app/finish.mjs`, then republish `money-app/dist/index.html` to the artifact URL.
- Quick links: `<artifact url>#expense`, `#income`, `#transfer`.
