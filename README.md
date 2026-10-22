# Vandenizar Projects

A personal project manager for in-house and freelance video work: what to work on now, what is waiting for feedback, and what is close to its deadline. Built with Preact + Vite and bundled into a single `index.html`, so it works offline and installs to the iPhone Home Screen.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
```

`dist/` is the whole site. Vercel builds it from `main` automatically.

## What is in it

- **Today**: one recommended task with Start work, today's priorities, items that need attention, quick capture.
- **Tasks**: Today, Upcoming, Inbox, Overdue, All open, Done, Deferred, Archived. Subtasks, estimates, focus sessions.
- **Work schedule vs deadline**: `workDate/workTime` is when you plan to work, `deadlineDate/deadlineTime` is the hard limit. Rescheduling never moves the deadline. Overdue only means a passed deadline.
- **Calendar**: day and week. Blocks come from the work schedule and estimate; deadlines show as banners. Drag to reschedule, drag the bottom edge to change the estimate.
- **Projects**: in-house and freelance, stages from lead to completed, next action, deliverables with their own status, feedback log that can become revision tasks, follow-up date, brief, notes and links.
- **Clients, invoices, payments, templates**: invoice status is derived (Draft, Sent, Partial, Paid, Overdue), numbers are never reused, sent invoices freeze recipient and issuer, voided payments stay in history. Invoice PDF via jsPDF loaded on first use.
- **More**: clients, invoices, templates, settings, trash.

Out of scope on purpose: content planning, personal money, habits, journal, goals, team features.

## Data

- Stored on the device in IndexedDB (`vandenizar-workspace`). New collections: `pmTasks`, `pmProjects`, `feedback`, plus `clients`, `invoices`, `payments`, `templates`, `meta`.
- Records from the old Workspace (`tasks`, `projects`, content, habits and so on) are kept untouched. `src/lib/migrate.js` copies old tasks, projects and settings into the new collections once, without changing the originals.
- Optional Supabase sign-in syncs everything through the `records` table (last write wins, newer unsynced local edits are kept).
- Settings → Backup & data has JSON export/import and removable sample data.

## Notifications

`supabase/functions/push-reminders` runs every minute from pg_cron and sends web push for scheduled work, task deadlines, project follow-ups and deadlines, and invoices that are due or overdue. On iPhone it only works from the Home Screen app.

## Rules worth knowing

- Dates are `YYYY-MM-DD` strings in Asia/Jakarta, never parsed as UTC (`src/lib/date.js`).
- Money is stored as integers (`src/lib/money.js`).
- `src/lib/db.js` is the only file that touches storage.
