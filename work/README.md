# vandenizar work

Personal work app for projects, tasks, content and threads. Preact + Vite, installable as a PWA.

## Run

```
cd work
npm install
npm run dev      # dev server
npm test         # vitest
npm run build    # production build to dist/
```

Set `VITE_LOCAL=1` to preview local-only, without Supabase sign-in or sync.

## Data

Data lives in IndexedDB (database `vandenizar-work`) and syncs to the Supabase table `work_records`. The migration is in `supabase/migrations/20261110000000_work_tables.sql`.

## Notifications

Push notifications are sent by the Supabase edge function `work-push`. Device subscriptions are stored in `work_push_subscriptions`.

## Deploy

Vercel project `vandenizar-work`, root directory `work/`, build command `npm run build`, output `dist`.
