# Vandenizar Content OS

Denizar's content planner. Live at https://vandenizar-content-os.vercel.app (Vercel project `vandenizar-content-os`, root directory `content-os/`, deploys on every push to `main`).

## Screens
- **Today**: one "up next" card (late post, film today, post today, next post, or the next empty slot), this week's slots as tiles, latest Threads drafts, idea count.
- **Instagram**: posts in progress grouped Late / This week / Next week / Later / Not scheduled, plus Posted by month. Each card has its next-step button.
- **Post**: title, 6 stages (Idea, Script, Film, Edit, Ready, Posted), Hook, Script, Caption (copy), Notes. Details: slot, post date, film date, pillar, format.
- **Threads**: drafts edited in place, Copy, Posted (undo), Posted tab. No target.
- **Ideas**: one inbox. Turn an idea into an Instagram post (pick a slot) or a Threads draft.
- **Calendar**: month view of post days, film days and empty slots.
- **Settings**: weekly slots (name, day, color, default pillar/format, reminder), pillars, formats, name, appearance, backup, sign out.

There is one way to create anything: the + button (phone header) or New (desktop sidebar).

## Data
- One record type `items` (`kind`: ig | thread | idea) and one `settings` record (slots, pillars, formats). Schema version 3; older settings are upgraded on load.
- Sync: Supabase table `public.content_os_records`, local-first with an offline outbox (`src/lib/store.ts`).

## Dev
- `npm test` runs the model and sync tests.
- `VITE_LOCAL=1 npx vite build` builds a version without login (data in the browser only) for previews.
- Bump `VERSION` in `public/sw.js` on each release.
