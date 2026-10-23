# Vandenizar Content OS

Denizar's content planner. Live at https://vandenizar-content-os.vercel.app (Vercel project `vandenizar-content-os`, root directory `content-os/`, deploys on every push to `main`).

## Screens
- **Today**: one "up next" card (Film today has Materials: references, hook, script; Post today has Open video + Copy caption) (late post, film today, post today, next post, or the next empty slot), this week's slots as tiles, latest Threads drafts, idea count.
- **Instagram**: posts in progress grouped Late / This week / Next week / Later / Not scheduled, plus Posted by month. Each card has its next-step button.
- **Post**: title, 6 stages (Idea, Script, Film, Edit, Ready, Posted), References (links with optional notes), Hook, Script, Caption (copy), Notes. Details: slot, post date, film date, final video link, pillar, format.
- **Threads**: drafts edited in place, Copy, Posted (undo), Posted tab. No target.
- **Ideas**: one inbox. Turn an idea into an Instagram post (pick a slot) or a Threads draft.
- **Calendar**: month view of post days, film days and empty slots.
- **Settings**: notifications (turn on per device, morning summary time, post reminder time), weekly slots (name, day, color, default pillar/format, reminder), pillars, formats, name, appearance, backup, sign out.

There is one way to create anything: the + button (phone header) or New (desktop sidebar).

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
