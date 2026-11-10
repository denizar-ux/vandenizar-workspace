# work.vandenizar.com: design

Date: 2026-11-10
Status: draft v2, waiting for Denizar's review
Branch: `work-app`

## 1. Goal

One app for all of Denizar's work: in-house (Ainayya), freelance, content (Instagram and Threads) and personal tasks. It lives at `work.vandenizar.com` and is built from two existing apps in this repo:

- the project manager at the repo root (`src/`, live at project.vandenizar.com, Preact + JS)
- Content OS (`content-os/`, live at content.vandenizar.com, React + TS)

It looks like the project manager: Manrope Variable, warm-white canvas (`--bg #f7f6f2`), oversized light titles, flat pastel blocks, black primary controls, glass dock. Visual tokens are copied from `src/styles.css` unchanged. Section 10 adds a small visual polish on top.

Success means Denizar opens one app in the morning, sees everything due today from every area in one list, clears late items with one tap, and does not need the two old apps.

### Decisions already made

| Topic | Decision |
|---|---|
| Old apps | Stay online, but cloud sync is turned off. They keep the data already on each device. Their Supabase data is not deleted. Section 2. |
| Backup | Built sites and full source of both old apps saved as `vandenizar-old-apps-2026-11-10.zip` (commit `ab3525e`). |
| Work data | Starts clean in its own Supabase table. One data model and one sync engine for everything. Old data can be imported later from the old apps' JSON backups. |
| Navigation | Dock: Today, Work, Content, Calendar, More. |
| Today | One agenda for all areas, sorted by time, with area filter chips. |
| Late items | One Replan button. Gaps between items stay the same. Undo. Billable projects move work dates only, never client deadlines. |
| Build approach | Fork the project manager into `work/`. Port the Content OS logic onto the project manager's data layer. Redraw the content screens with the project manager's UI kit. |
| Visual polish | Pastel bento cards, project progress rows, chip counts, segmented progress, small status pills. Section 10. |
| Out of scope | Money app and Let Me stay separate. |

### Not in v1

Daily email, ICS calendar feed, project templates, recurring tasks, Google Calendar changes. These are later phases.

## 2. Old apps: sync off

Done before the new app is built, as its own small release.

### Content OS

- Build with `VITE_LOCAL=1` (mode already in the code: no login, data in the browser only). Set it as an environment variable on the Vercel project `vandenizar-content-os`.
- Local mode reads the same cache key (`vzc:data`), so whatever is on each device stays.
- Settings shows "Saved on this device. Cloud sync is off." in place of the account section.
- Push notifications stop for this app: the device subscription is removed on first load, and the pg_cron job `content-push` is unscheduled.

### Project manager

- New build flag `VITE_LOCAL=1`: `App` skips the login screen and renders the shell; `sync.js` never starts; the save label shows "Saved on this device".
- IndexedDB `vandenizar-workspace` stays as it is, so device data stays.
- Push: subscription removed on first load, pg_cron job for `push-reminders` unscheduled.
- Settings → Backup & data (JSON export) keeps working. This is how old data moves to work later.

### What is not touched

Tables `records`, `content_os_records`, `push_subscriptions`, `content_push_subscriptions` and their rows stay. The edge functions stay deployed but stop running on schedule.

### Before the switch

Denizar opens each old app once on every device he uses (iPhone, Mac) while sync is still on, so each device has the latest cloud copy. Then the local-only builds go live.

## 3. Areas

An area is one of the project categories (`meta.pmCategories`: In-house, Freelance, Personal, Learning, plus any Denizar adds) or the fixed area **Content**.

- A task's area is its project's category. A task without a project uses `settings.defaultCategory`.
- Every content stage task, post and Thread is in the Content area.
- Each area has one pastel tint for its dot, chips, icons and calendar blocks. Category colors come from the category record. Content is always `peach` (the default categories already use butter, sage, cyan and lavender).
- Content is not stored as a category. `areas()` adds it in code.

## 4. Navigation

| Tab | Route | Contents |
|---|---|---|
| Today | `#/` | Combined agenda (section 6). |
| Work | `#/work/projects`, `#/work/tasks` | Segmented control `Projects · Tasks`. The old Projects and Tasks pages. Details at `#/projects/:id` and `#/tasks/:id`. |
| Content | `#/content/ig`, `#/content/threads` | Segmented control `Instagram · Threads`. Details at `#/post/:id`. |
| Calendar | `#/calendar` | Old calendar (day, week, month) plus content items. |
| More | `#/more` | Clients, Invoices, Resources, Settings, Trash. |

Desktop uses the same five items in the sidebar, plus Search, Settings and Trash in the footer.

### Add

One + button (in the page header on phone, `Add` in the sidebar on desktop, `n` key) opens a menu: Task, Event, Project, IG post, Thread. The last used choice is listed first. Deep links: `#/?add=task`, `#/?add=search`, `#/?add=post`, `#/?add=thread`.

### Route aliases

| Incoming | Goes to |
|---|---|
| `#/today` | `#/` |
| `#/projects`, `#/tasks` (no id) | `#/work/projects`, `#/work/tasks` (query string kept) |
| `#/instagram` | `#/content/ig` |
| `#/threads` | `#/content/threads` |
| `#/resources` | `#/more/resources` |

## 5. Daily workflow

1. Morning: open Today. If the Late bar shows, tap Replan.
2. Work down the agenda. Checking a work task completes it. Checking a content task moves its post to the next stage. Both show a toast with Undo.
3. New idea: + then Task (goes to Inbox) or IG post (goes to the Idea stage).
4. Sending a preview to a client: set the project stage to *Waiting for feedback*. Its follow-up date (default today + 2) puts it back on Today on that day.
5. End of week: Content to fill next week's slots, Work to review projects.

## 6. Today

Header, as in the project manager: greeting line, long date eyebrow, title `Start here.`, Add button. The sample-data note stays.

### Summary cards

Replace the old `Overview` block with a bento row (section 10):

| Card | Tint | Content | Tap |
|---|---|---|---|
| Today | butter | Next 3 timed items: time + title | scrolls to Scheduled |
| To do | cyan | count of open items due today, icon | `#/work/tasks?view=today` |
| Waiting | lavender | count of projects waiting for feedback, icon | `#/work/projects?stage=client_review` |

Phone: Today card on the left at full height, the two count cards stacked on the right. Desktop: three cards in one row.

### Filter chips

`All` plus one chip per area with at least one item today, each with its count ("Freelance 4"). Choice kept in `localStorage` (`vzw:todayFilter`), wrapped in try/catch.

### Late bar

Shown when there is at least one late item in the current filter. Collapsed by default:

`⚠ 6 late` · `Replan` · expand chevron

Expanded, it lists the late items (agenda row design) and one help line: "Replan moves late items forward so the first one is today. Gaps stay the same."

### Agenda

Three groups, empty groups hidden:

1. **All day**: all-day events.
2. **Scheduled**: items with a time, sorted by time. Tasks with `workDate` today and `workTime`, timed events, Threads dated today with a time, and posts whose post date is today (at the post time setting, default 19:00).
3. **Anytime today**: everything due today without a time. Work tasks from `todayTasks()` that are not late and not timed, content stage tasks dated today (script, film, edit), untimed Threads dated today, and project follow-ups due today or earlier.

The label "Not scheduled" is removed. A task whose deadline is today and has no work date shows in Anytime today with the sub-line "Deadline today".

### Row design

`check · area dot · title · sub-line · optional quick actions`

| Kind | Title | Sub-line | Check does | Quick actions |
|---|---|---|---|---|
| Work task | task title | project · estimate · deadline note | `completeTask` | none |
| Event | event title | time range · location | no check | opens event |
| Content task | `Script:`/`Film:`/`Edit:` + post title | slot name | content `completeTask(id, taskDef)` | Open post |
| Post due | `Post:` + post title | slot · format | moves stage to Posted | Copy caption, Open video (when `finalUrl`) |
| Thread | first line of the text | `Threads` | `markPosted` | Copy |
| Follow-up | `Follow up:` + project name | client | opens project | none |

Tapping the row body opens the detail.

### Empty state

No items today: "A clear day." plus the next dated item from any area ("Next: Film Rumah Nenek ep Pink, Thu").

### Desktop right column

1. **Upcoming**: next 7 days, merging `deadlineItems()` and content post dates, sorted by date, area dot on each row.
2. **This week**: Instagram slot tiles for the current week. Tap opens the post, or creates one in an empty slot.

## 7. Work

The Projects and Tasks pages are copied from `src/pages/projects.jsx` and `src/pages/tasks.jsx` with these changes:

- Both sit under one page header with the segmented control `Projects · Tasks`.
- Project list rows use the progress row from section 10.
- The Tasks Overdue view gets the same Replan bar as Today, limited to work tasks.
- Category filter chips show counts. They list categories only, not Content.

Project detail, deliverables, feedback log, invoices, clients and payments keep their current behaviour.

## 8. Content

Logic is ported from `content-os/src/lib/model.ts` with the same rules. Screens are redrawn with the project manager's components (`block`, `prow`, pills, sheets, `title-input`).

### Instagram (`#/content/ig`)

1. Week strip: slot tiles for the shown week, arrows to change week, "This week" reset. Past empty slots show "Nothing posted". Each tile: slot name, tint, post title, stage pill.
2. In progress, grouped Late, This week, Next week, Later, Not scheduled. Card: title, slot tint, stage pill, segmented stage progress (section 10), next-step button (for example "Start script").
3. Posted, grouped by month, collapsed after the latest month.

### Post detail (`#/post/:id`)

Same fields and rules as Content OS, laid out like task detail:

- Big title input, stage pill, stage segmented control (Idea, Script, Film, Edit, Ready, Posted).
- Schedule block: script, film, edit and post dates. Order rule script ≤ film ≤ edit ≤ post. A refused change shows its reason inline. Slot row. "Fill from post date" (3/2/1 days before). "Fix dates" when a slot move breaks the order.
- Blocks: References (link + note), Hook, Script, Caption (with Copy), Notes.
- Details: final video link, pillar, format.
- Menu: Duplicate, Delete (to trash, with Undo).

### Threads (`#/content/threads`)

Drafts edited in place, schedule chip (date + optional time), groups Scheduled and Not scheduled, Copy, Posted (with Undo), Posted tab.

### Resources (`#/more/resources`)

Name + link list, add, edit, delete.

## 9. Calendar

The current calendar (`src/pages/calendar.jsx`) plus content:

- Script, film and edit tasks and post days show as all-day chips in `peach`, labelled like the Today rows.
- Timed Threads show as 15-minute blocks.
- Dragging a content chip to another day sets that stage date. A refused move snaps back and shows the reason in a toast.
- Work items keep the tint of their category.

## 10. Visual polish

Small additions in the same style. No new colors or fonts; tints come from the existing pastel tokens.

| Element | Where | Spec |
|---|---|---|
| Bento cards | Today summary | `--radius-lg` (24px), flat pastel fill, 16px padding, icon in a 36px white circle top-left, label 13px muted, number 32px weight 400. |
| Project progress row | Work → Projects, project pickers | 44px round icon in the category tint with the project's first letter (or emoji if set), name 15.5px weight 550, sub-line stage + next action, thin 4px progress bar in the category tint with `done/total` on the right. Progress = done tasks + approved deliverables over their total. Hidden when total is 0. |
| Chip counts | Today chips, Tasks category chips | Count in a small pill inside the chip. Active chip: black with white text, count pill white with black text (like the reference "Design 20"). |
| Segmented progress | Post cards, tasks with subtasks, projects with deliverables | Up to 10 short bars, 4px high, 3px gap. Filled bars `--ink`, empty `--line-strong`. Label `7/10` at the end. |
| Status pill | Project stage, post stage, invoice status | 24px high, 10px side padding, tint fill, 12.5px weight 600. Reuses `StagePill`, sized down. |

Not taken from the reference: member avatars, comment and link counts, the activity donut, priority pills.

## 11. Settings

One settings page with sections: General (name, week start, appearance), Categories, Content (slots, pillars, formats), Notifications, Business & invoices, Backup & data, Account.

### Backup & data

- Export: one JSON file of all work collections.
- Import accepts this file, a project manager export, or a Content OS export. Old-app imports add records with new ids and never overwrite. The import screen shows counts before confirming ("38 tasks, 6 projects, 12 posts").

## 12. Architecture

```
work/
  index.html, vite.config.js, vercel.json, package.json
  public/           sw.js, manifest.webmanifest (name "Vandenizar Work"), icons
  src/
    main.jsx, App.jsx, styles.css, fonts.css, fonts/
    lib/            copied from src/lib (db, sync, model, date, money, push, router, ...)
    content/        model.js, defaults.js, time.js: ported from content-os/src/lib
    combined/       areas.js, agenda.js, replan.js, aliases.js, importOld.js
    pages/          today, work, projects, tasks, calendar, clients, invoices, events, settings,
                    content-ig, content-post, content-threads, resources
    ui/             copied from src/ui, plus ContentRow, SlotTile, BentoCard, ProgressRow, SegBar
```

### One data layer

- Content OS's own store (`store.ts`) and Supabase client are not ported. Content records live in the project manager's data layer (`lib/db.js`) as new collections:
  - `cItems`: posts, Threads and resources (`kind`: `ig` | `thread` | `link`), same fields as Content OS `Item`.
  - `meta.cSettings`: slots, pillars, formats, notify times.
- `content/model.js` is `content-os/src/lib/model.ts` converted to JS, calling `get/all/put/patch/remove` from `lib/db.js`.
- `lib/db.js` stays the only file that touches storage. Pages never call Supabase.
- `combined/` modules read through `lib/model.js` and `content/model.js` only.
- `agenda.js` exports `buildAgenda({ date, filter })`, a pure function returning `{ allDay, scheduled, anytime, late }`. Each item: `{ key, kind, area, time, title, sub, ref, actions }`.
- `replan.js` exports `replanLate(date, filter)` returning `{ snaps, count }`, and `undoReplan(snaps)`.

### Storage and sync

- IndexedDB database `vandenizar-work`.
- New Supabase table `public.work_records`, same shape as `records`: `user_id uuid`, `coll text`, `id text`, `data jsonb`, `deleted bool`, `updated_at timestamptz`. Primary key `(user_id, coll, id)`. RLS: each user reads and writes only their own rows. Index on `(user_id, updated_at)`. `updated_at` set by trigger, as on `records`.
- `lib/sync.js` copied, pointed at `work_records`, auth storage key `vzw:auth`. Same rules: local-first, last write wins, newer unsynced local edits kept.
- Same Supabase project and publishable key as before. Denizar signs in with the same account.

### Replan rules

For `date` = today, within the current Today filter:

- **Work tasks** that are late (deadline passed, not done): shift = days between the earliest late deadline and today. Each task's deadline and work date move by that shift, so gaps stay the same.
- **Exception**: tasks in a project with billing on keep their deadline. Only their work date moves, to today if it is empty or in the past.
- **Content**: the ported `replanAll(date)` rules: each late post moves forward so its next step is today, gaps between its stage dates kept. Late Threads move to today.
- One toast: "Moved 6 items. Undo". Undo restores every snapshot.

### Notifications

- New table `public.work_push_subscriptions` (same columns as `push_subscriptions`, RLS own rows).
- New edge function `work-push`, run every minute by a new pg_cron job. It merges the logic of `push-reminders` and `content-push`, reads `work_records`, and reuses `push_config` and `push_sent` with keys prefixed `w:`. It sends: scheduled work, deadlines (1 hour before and on the day), project follow-ups, invoices due or overdue, morning summary (only on days with a shoot, post or deadline), and "Time to post".
- Notification URLs use work routes (`#/tasks/:id`, `#/post/:id`, `#/projects/:id`, `#/`).
- Settings → Notifications: turn on per device, work reminder time, morning summary time, post time.

## 13. Error handling

- One sync engine, so one save indicator, as in the project manager.
- Offline: the app opens and edits; the outbox pushes when the connection returns.
- A content date change that breaks the stage order is refused with the reason.
- Missing `meta.cSettings`: defaults from `content/defaults.js` are created on first load.
- Import of an unknown file shows "This file is not a Vandenizar backup" and changes nothing.
- `work-push` failing for one user does not stop the others; expired subscriptions (404/410) are deleted, as in the old functions.

## 14. Testing

- Add vitest to `work/` with `fake-indexeddb`.
- Port `content-os/src/lib/model.test.ts` to the new data layer. Same cases must pass.
- New tests:
  - `agenda.test`: grouping, time sort, filter and counts, "Deadline today" sub-line, follow-ups, post due at post time.
  - `replan.test`: gaps kept, billable tasks keep their deadline, content order kept, undo restores all.
  - `aliases.test`: every alias in section 4.
  - `importOld.test`: project manager export and Content OS export import with new ids, counts correct, no overwrite.
  - `progress.test`: project progress and segmented bar counts.
- Manual check before the domain goes live: `npm run build`, Vercel preview, phone width (390px) and desktop, sign in, create a task, a post and a Thread, check them on a second device, test one push notification on the iPhone Home Screen app.

## 15. Deploy

Order:

1. Old apps sync off (section 2): build flags, Vercel env vars, unschedule `push-reminders` and `content-push` cron jobs.
2. Supabase migration: `work_records`, `work_push_subscriptions`, RLS, trigger, index.
3. Edge function `work-push` + pg_cron job.
4. New Vercel project `vandenizar-work`, root directory `work/`, build `npm run build`, output `dist`, production branch `main`. Preview from branch `work-app`.
5. Add `work.vandenizar.com` to the project. In Cloudflare DNS add `CNAME work → cname.vercel-dns.com` (DNS only).
6. Merge to `main` after Denizar approves the preview.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Old apps lose cloud data on a device that never synced the latest copy | Section 2 "Before the switch". Cloud rows are kept, so sync can be turned back on. |
| Old data needed in work | Import from old-app JSON exports (section 11). |
| Content logic changes while being converted from TS to JS | Ported model tests must pass with the same cases. |
| A stray old notification arrives after the switch | Old cron jobs unscheduled and old subscriptions removed in step 1. |
| Old apps change later and drift from `work/` | After launch, new features go only into `work/`. |
