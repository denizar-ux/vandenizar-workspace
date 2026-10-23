# Vandenizar Content OS

Denizar's content planner. Live at https://vandenizar-content-os.vercel.app (Vercel project `vandenizar-content-os`, root directory `content-os/`, deploys on every push to `main`).

## Screens
- **Today**: only what is dated today: every script, film, edit and post task, each with a check (moves the post to the next stage, undo). Post rows have Open video and Copy caption. Threads scheduled today appear too (Copy, check = posted). Header shows the WIB time. Overdue tasks fold into one bar. Nothing today shows the next dated task.
- **Instagram**: this week's slots as tiles (week arrows; past empty slots show "Nothing posted"), then posts in progress grouped Late / This week / Next week / Later / Not scheduled, plus Posted by month. Each card has its next-step button.
- **Post**: title, 6 stages (Idea, Script, Film, Edit, Ready, Posted), References (links with optional notes), Hook, Script, Caption (copy), Notes. Schedule: Script, Film, Edit and Post dates (must stay in that order; refused with a reason otherwise), slot row, "Fill from post date" (3/2/1 days before) and "Fix dates" when a slot move breaks the order. Details: final video link, pillar, format.
- **Threads**: drafts edited in place, schedule chip (date + optional WIB time), grouped Scheduled / Not scheduled, Copy, Posted (undo), Posted tab. No target.
- **Resources**: name + link list of things opened often (Drive, Raindrop, other web apps). Ideas inbox was removed: Instagram ideas are posts at the Idea stage, Threads ideas are drafts; old ideas migrate on load.
- **Calendar**: month view of every script/film/edit/post task, scheduled Threads and empty slots.
- **Settings**: notifications (turn on per device, morning summary time, post reminder time), weekly slots (name, day, color, default pillar/format, reminder), pillars, formats, name, appearance, backup, sign out.

There is one way to create anything: the + button (phone header) or New (desktop sidebar): Instagram, Threads or Resource. Tabs: Today, Instagram, Threads, Calendar, Resources. All times are WIB.

## Data
- One record type `items` (`kind`: ig | thread | idea) and one `settings` record (slots, pillars, formats). Schema version 3; older settings are upgraded on load.
- Sync: Supabase table `public.content_os_records`, local-first with an offline outbox (`src/lib/store.ts`).

## Dev
- `npm test` runs the model and sync tests.
- `VITE_LOCAL=1 npx vite build` builds a version without login (data in the browser only) for previews.
- Bump `VERSION` in `public/sw.js` on each release.

## Notifications
- Device subscriptions: `public.content_push_subscriptions` (separate from the Workspace's `push_subscriptions`, so each app only gets its own reminders).
- Edge function `content-push` (`supabase/functions/content-push`), run every minute by pg_cron job `content-push`. Reuses `push_config` (VAPID keys, cron secret) and `push_sent` (keys prefixed `cos:`).
- Sends: morning summary (default 08:00 WIB, only on days with a shoot or a post) and "Time to post" for each post due today (default 19:00 WIB). Times live in `settings.notify`.
- iPhone: works only from the Home Screen app (iOS 16.4+).
