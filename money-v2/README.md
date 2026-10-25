# Vandenizar Money v2

Replaces the v1 Money app at the same artifact URL (https://claude.ai/artifact/Hx9qR3uSi4rppmbHCroATj).
Content OS look (React 18 + TS + Vite, single file). Data: the artifact's own db (capabilities `db`, `downloads`).

Build and publish: `npm install && npm run build`, then republish `dist/index.html` to the artifact URL.
Tests: `npm test`.

Collections: mAccounts, mTx, mCats, mBudgets (week/month/custom, per category or total), mRecur (recurring + subscriptions; auto-log or remind; tx ids `r_<id>_<date>`), mDebts, meta/money.
