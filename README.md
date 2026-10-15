# Vandenizar Creator Workspace

One web app for the Daily System, Content OS and Freelance OS. Built with Preact + Vite, bundled into a single `index.html` so it works offline and installs to the iPhone home screen.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
```

`dist/` is the whole site: `index.html`, `manifest.webmanifest`, `sw.js` and `icons/`. Upload that folder to any static host (Vercel, Netlify, GitHub Pages). HTTPS is needed for the offline cache and for "Add to Home Screen" to open full screen.

## PDF

Invoice PDFs are drawn with jsPDF 2.5.1, loaded from cdnjs the first time you export (then cached for offline use by the service worker). This keeps the app itself small.

## Data

- Everything is stored on the device in IndexedDB (database `vandenizar-workspace`), one object store per record type: tasks, goals, days (main priority + key tasks per date), dailyReviews, weeklyReviews, contents, resources, clients, projects, invoices, payments, templates, activity, meta (settings, counters, focus, recent).
- If IndexedDB is unavailable it falls back to localStorage, and shows a banner if neither works.
- Settings → Your data has Export / Import backup (JSON). The installed home-screen app has its own storage, separate from Safari tabs.
- `src/lib/db.js` is the only file that touches storage. Swapping it for Supabase/Firebase later keeps the rest of the app unchanged.

## Rules worth knowing

- Dates are plain `YYYY-MM-DD` strings in Asia/Jakarta and are never parsed as UTC (`src/lib/date.js`).
- Money is stored as integer minor units (IDR has none), so totals never drift (`src/lib/money.js`).
- Invoice status is derived, never typed: Draft → Sent → Partial / Paid, and Overdue when the due date has passed with a balance left. Payments are separate records; voiding keeps them for the audit trail.
- Invoice numbers are reserved when created and never reused, even after a delete.
- Sent invoices freeze the recipient and your business details at send time.
- Recurring tasks move to their next date when completed. No copies are created.
- Reminders show inside the app at the set times. Lock-screen push needs a server, so Settings offers a calendar file (.ics) for reliable phone alerts.

## Files

```
src/lib/      db.js (storage), model.js (shared logic), date.js, money.js, dnd.js (drag and drop), router.js
src/ui/       kit.jsx (form controls, checklist, links, rich text), overlay.jsx (sheets, menus, toasts), parts.jsx (task rows, task editor), Icon.jsx
src/pages/    daily.jsx, content.jsx, freelance.jsx (incl. invoice PDF), settings.jsx (settings, trash, reminders, sample data)
public/       manifest, service worker, icons
```
