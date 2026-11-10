# work.vandenizar.com: design

Date: 2026-11-10
Status: draft, waiting for Denizar's review
Branch: `work-app`

## 1. Goal

One app for all of Denizar's work: in-house (Ainayya), freelance, content (Instagram and Threads) and personal tasks. It lives at `work.vandenizar.com` and is built from two existing apps in this repo:

- the project manager at the repo root (`src/`, live at project.vandenizar.com, Preact + JS)
- Content OS (`content-os/`, live at content.vandenizar.com, React + TS)

It looks like the project manager: Manrope Variable, warm-white canvas (`--bg #f7f6f2`), oversized light titles, flat pastel blocks, black primary controls, glass dock. Visual tokens are copied from `src/styles.css` unchanged.

Success means Denizar opens one app in the morning, sees everything due today from every area in one list, clears late items with one tap, and does not need to open the two old apps.

### Decisions already made

| Topic | Decision |
|---|---|
| Old apps | Stay live. The new app reads and writes the same Supabase tables. No data migration. |
| Navigation | Dock: Today, Work, Content, Calendar, More. |
| Today | One agenda for all areas, sorted by time, with area filter chips. |
| Late items | One Replan button. Gaps between items stay the same. Undo. Billable projects move work dates only, never client deadlines. |
| Build approach | Fork the project manager into `work/`. Port the Content OS logic. Redraw the content screens with the project manager's UI kit. |
| Out of scope | Money app and Let Me stay separate. |

### Not in v1

Daily email, ICS calendar feed, project templates, recurring tasks, Google Calendar changes. These are later phases.

## 2. Areas

An area is one of the existing project categories (`meta.pmCategories`: In-house, Freelance, Personal, Learning, plus any Denizar added) or the fixed area **Content**.

- A task's area is its project's category. A task without a project uses `settings.defaultCategory`.
- Every content stage task, post and Thread is in the Content area.
- Each area has one pastel tint used for its dot, chips and calendar blocks: category colors come from the category record; Content is always `peach` (the default categories already use butter, sage, cyan and lavender).
- Content is not stored as a category. It is added in code by `areas()` so the old project app never sees it.

## 3. Navigation

| Tab | Route | Contents |
|---|---|---|
| Today | `#/` | Combined agenda (section 5). |
| Work | `#/work/projects`, `#/work/tasks` | Segmented control `Projects · Tasks`. The old Projects and Tasks pages, moved as they are. Details stay at `#/projects/:id` and `#/tasks/:id`. |
| Content | `#/content/ig`, `#/content/threads` | Segmented control `Instagram · Threads`. Details at `#/post/:id`. |
| Calendar | `#/calendar` | Old calendar (day, week, month) plus content items. |
| More | `#/more` | Clients, Invoices, Resources, Settings, Trash. |

Desktop uses the same five items in the sidebar, plus Search, Settings and Trash in the footer as today.

### Add

One + button (in the page header on phone, `Add` in the sidebar on desktop, `n` key) opens a menu: Task, Event, Project, IG post, Thread. The last used choice is listed first. Deep links keep working: `#/?add=task`, `#/?add=search`, plus new `#/?add=post` and `#/?add=thread`.

### Route aliases

Old links and notification URLs must open the right screen:

| Incoming | Goes to |
|---|---|
| `#/today` | `#/` |
| `#/projects`, `#/tasks` (no id) | `#/work/projects`, `#/work/tasks` (query string kept) |
| `#/instagram` | `#/content/ig` |
| `#/threads` | `#/content/threads` |
| `#/resources` | `#/more/resources` |
| `#/post/:id` | Content post detail |

## 4. Daily workflow

1. Morning: open Today. If the Late bar shows, tap Replan.
2. Work down the agenda. Checking a work task completes it. Checking a content task moves its post to the next stage. Both show a toast with Undo.
3. New idea: + then Task (goes to Inbox) or IG post (goes to the Idea stage).
4. Sending a preview to a client: set the project stage to *Waiting for feedback*. Its follow-up date (default today + 2) puts it back on Today on that day.
5. End of week: Content to fill next week's slots, Work to review projects.

## 5. Today

Header, as in the project manager: greeting line, long date eyebrow, title `Start here.`, Add button. The existing sample-data note and `Overview` block stay.

### Filter chips

`All` plus one chip per area that has at least one item today. Choice is kept in `localStorage` (`vzw:todayFilter`), wrapped in try/catch.

### Late bar

Shown when there is at least one late item in the current filter. Collapsed by default:

`⚠ 6 late` · `Replan` · expand chevron

Expanded, it lists the late items (same row design as the agenda) and one help line: "Replan moves late items forward so the first one is today. Gaps stay the same."

### Agenda

Three groups, empty groups hidden:

1. **All day**: all-day events.
2. **Scheduled**: items with a time, sorted by time. Tasks with `workDate` today and `workTime`, timed events, Threads with `date` today and `time`, and posts whose post date is today (at the post reminder time, `settings.notify.postTime`, default 19:00).
3. **Anytime today**: everything due today without a time. Work tasks from `todayTasks()` that are not late and not timed, content stage tasks dated today (script, film, edit), untimed Threads dated today, and project follow-ups due today or earlier.

The label "Not scheduled" is removed. A task whose deadline is today but has no work date shows in Anytime today with the sub-line "Deadline today".

### Row design

`check · area dot · title · sub-line · optional quick actions`

| Kind | Title | Sub-line | Check does | Quick actions |
|---|---|---|---|---|
| Work task | task title | project · estimate · deadline note | `completeTask` | none |
| Event | event title | time range · location | no check | opens event |
| Content task | `Script:`/`Film:`/`Edit:` + post title | slot name | `completeTask(id, taskDef)` from Content OS | Open post |
| Post due | `Post:` + post title | slot · format | moves stage to Posted | Copy caption, Open video (when `finalUrl`) |
| Thread | first line of the text | `Threads` | `markPosted` | Copy |
| Follow-up | `Follow up:` + project name | client | opens project | none |

Tapping the row body opens the detail.

### Empty state

No items today: "A clear day." plus the next dated item from any area ("Next: Film Rumah Nenek ep Pink, Thu").

### Desktop right column

1. **Upcoming**: next 7 days, merging `deadlineItems()` and content post dates, sorted by date, area dot on each row.
2. **This week**: Instagram slot tiles for the current week (same tile as Content), tap opens the post or creates one in the slot.

## 6. Work

The Projects and Tasks pages are copied from `src/pages/projects.jsx` and `src/pages/tasks.jsx` with only these changes:

- Both sit under one page header with the segmented control `Projects · Tasks`.
- The Tasks Overdue view gets the same Replan bar as Today, limited to work tasks.
- Category filter menus list categories only (not Content).

Project detail, deliverables, feedback log, invoices, clients and payments keep their current behaviour.

## 7. Content

Logic is ported from `content-os/src/lib/model.ts` without behaviour changes. Screens are redrawn with the project manager's components (`block`, `prow`, pills, sheets, `title-input`).

### Instagram (`#/content/ig`)

1. Week strip: slot tiles for the shown week, arrows to change week, "This week" reset. Past empty slots show "Nothing posted". Each tile shows slot name, tint, post title and stage.
2. In progress, grouped Late, This week, Next week, Later, Not scheduled (`openGroups`). Card: title, slot tint, stage pill, next-step button (`STAGES[n].next`, for example "Start script").
3. Posted, grouped by month, collapsed after the latest month.

### Post detail (`#/post/:id`)

Same fields and rules as Content OS, laid out like task detail:

- Big title input, stage segmented control (Idea, Script, Film, Edit, Ready, Posted).
- Schedule block: script, film, edit and post dates. Order rule script ≤ film ≤ edit ≤ post; a refused change shows its reason inline. Slot row. "Fill from post date" (3/2/1 days before). "Fix dates" when a slot move breaks the order.
- Blocks: References (link + note), Hook, Script, Caption (with Copy), Notes.
- Details: final video link, pillar, format.
- Menu: Duplicate, Delete (to trash, with Undo).

### Threads (`#/content/threads`)

Drafts edited in place, schedule chip (date + optional time), groups Scheduled and Not scheduled, Copy, Posted (with Undo), Posted tab.

### Resources (`#/more/resources`)

Name + link list from Content OS (`kind: 'link'`), add, edit, delete.

## 8. Calendar

The current calendar (`src/pages/calendar.jsx`) plus content:

- Script, film and edit tasks and post days show as all-day chips in `peach`, labelled like the Today rows.
- Timed Threads show as 15-minute blocks.
- Dragging a content chip to another day calls `setStageDate`. A refused move snaps back and shows the reason in a toast.
- Work items keep the area tint of their category.

## 9. Settings

One settings page with sections: General (name, week start, appearance), Categories, Content (slots, pillars, formats), Notifications, Business & invoices, Backup & data, Account. Fields and storage stay where they are today: work settings in `meta.pmSettings`, content settings in the Content OS `settings` record.

Backup exports one JSON file with two top-level keys, `work` and `content`, each in its old app's format. Import accepts the combined file and either old format.

## 10. Architecture

```
work/
  index.html, vite.config.js, vercel.json, package.json
  public/           sw.js, manifest.webmanifest (name "Vandenizar Work"), icons
  src/
    main.jsx, App.jsx, styles.css, fonts.css, fonts/
    lib/            copied from src/lib (db, sync, model, date, money, push, router, ...)
    content/        ported from content-os/src/lib (store.ts, model.ts, types.ts, time.ts, defaults.ts, supabase.ts)
    combined/       areas.js, agenda.js, replan.js, aliases.js, backup.js
    pages/          today, work, projects, tasks, calendar, clients, invoices, events, settings,
                    content-ig, content-post, content-threads, resources
    ui/             copied from src/ui, plus ContentRow, SlotTile, StagePill
```

### Boundaries

- `src/lib/db.js` is still the only file that touches the work storage. `src/content/store.ts` is the only file that touches the content storage. Pages never call Supabase.
- `combined/` modules read both stores through their public functions only (`M.todayTasks`, `C.tasksOn`, and so on). They do not import `db.js` or `store.ts` internals.
- `agenda.js` exports `buildAgenda({ date, filter })`, a pure function that returns `{ allDay, scheduled, anytime, late }`. Each item: `{ key, kind, area, time, title, sub, ref, actions }`.
- `replan.js` exports `replanLate(date)` returning `{ snaps, count }` and `undoReplan(snaps)`.

### React to Preact

`store.ts` uses React's `useSyncExternalStore`. It is replaced with `preact/compat`'s version, or a small `useVersion` hook built on `preact/hooks`. No other Content OS code depends on React. `lucide-react` is not used: icons come from `src/ui/Icon.jsx`.

### Data and sync

- Same Supabase project and publishable key as both old apps. One sign-in. The work engine uses auth storage key `vzw:auth` and the content engine reuses the same client instead of creating a second one.
- Work data: IndexedDB database `vandenizar-work` (new name, so no clash with old caches if the origin is ever shared), synced to `public.records` exactly like the project manager.
- Content data: local cache and outbox under keys `vzw:c:data`, `vzw:c:outbox`, `vzw:c:cursor`, synced to `public.content_os_records` exactly like Content OS.
- No table, column, RLS or edge function changes.
- Conflicts follow the old rules (last write wins, newer unsynced local edits kept). Editing the same record in an old app and in work at the same moment keeps the later edit.

### Replan rules

For `date` = today, in the current Today filter:

- **Work tasks** that are late (deadline passed, not done): sort by deadline. Shift = days between the earliest late deadline and today. Each task's deadline and work date move by that shift, so gaps stay the same.
- **Exception**: tasks in a project with billing on keep their deadline. Only their work date moves, to today if it is empty or in the past.
- **Content**: `replanAll(date)` from Content OS, unchanged.
- One toast: "Moved 6 items. Undo". Undo restores every snapshot from both stores.

### Notifications

- One service worker (`work/public/sw.js`), copied from the project manager with the route aliases applied in `notificationclick`.
- Turning notifications on upserts the same push subscription into `push_subscriptions` and `content_push_subscriptions`. Turning off deletes it from both.
- Settings → Notifications holds both apps' options: work reminder time and lead (`meta.pmSettings`), content morning summary and post time (`settings.notify`).
- Settings shows one line: "Turn off notifications in the old apps on this phone to avoid getting each reminder twice."

## 11. Error handling

- One save indicator in the sidebar and Settings → Account. It shows the worse state of the two engines (error > offline > syncing > synced).
- If only content sync fails: Work keeps working; Content pages and the content rows on Today show a small note "Content not synced. Retry".
- Both engines are local-first, so the app opens and edits offline. The outboxes push when the connection returns.
- A content date change that breaks the stage order is refused with the reason, same as Content OS.
- If the content settings record is missing, defaults from `content/defaults.ts` are created, same as Content OS.

## 12. Testing

- Add vitest to `work/`.
- Port `content-os/src/lib/model.test.ts` and `sync.test.ts`; they must pass unchanged apart from import paths.
- New tests:
  - `agenda.test`: grouping, time sort, filter, "Deadline today" sub-line, follow-ups, post due at post time.
  - `replan.test`: gaps kept, billable tasks keep their deadline, content items moved, undo restores all.
  - `aliases.test`: every alias in section 3.
  - `backup.test`: combined export round-trips; old single-app files import.
- Manual check before the domain goes live: `npm run build`, Vercel preview, phone width (390px) and desktop, sign in, compare one task and one post edited in work against project.vandenizar.com and content.vandenizar.com.

## 13. Deploy

1. New Vercel project `vandenizar-work`, root directory `work/`, build `npm run build`, output `dist`, production branch `main`.
2. Preview deployment from branch `work-app` for review.
3. Add `work.vandenizar.com` to the project. In Cloudflare DNS add `CNAME work → cname.vercel-dns.com` (DNS only, not proxied).
4. Merge to `main` after Denizar approves the preview.

The old Vercel projects (`vandenizar-workspace`, `vandenizar-content-os`) and their domains are not changed.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Two sync engines in one app drift apart or fight over auth | One Supabase client shared by both, boundaries in section 10, sync tests ported. |
| Duplicate notifications while old apps are still installed | Settings note; Denizar turns them off in the old apps. |
| Old apps change later and the copy in `work/` falls behind | After launch, new features go only into `work/`. Old apps get bug fixes only. |
| Content Today rows and work rows look different | One row component (`ContentRow` extends `prow`) used by both. |
