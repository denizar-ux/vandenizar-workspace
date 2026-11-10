# work.vandenizar.com Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `work.vandenizar.com`, one app for work and content built from the project manager and Content OS, and turn cloud sync off in the two old apps.

**Architecture:** `work/` is a copy of the project manager (Preact, single-file Vite build, IndexedDB via `lib/db.js`, Supabase sync). Content OS's domain logic is converted to JS and stored in the same data layer as new collections. Pure modules in `work/src/combined/` merge both domains for Today, Replan, routes and imports. One new Supabase table and one new edge function back it.

**Tech Stack:** Preact 10, Vite 5, vite-plugin-singlefile, @supabase/supabase-js 2, vitest + fake-indexeddb, Supabase Postgres + pg_cron + Deno edge functions, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-10-work-vandenizar-design.md` (v2, commit `d5c90ca`). Section numbers below (§) refer to it.

## Global Constraints

- Dates are `YYYY-MM-DD` strings in Asia/Jakarta, never parsed as UTC. Use `work/src/lib/date.js` (`today`, `addDays`, `diffDays`). Times are `HH:MM` WIB.
- `work/src/lib/db.js` is the only file that touches storage. Pages and `combined/` never import Supabase.
- UI copy is English, sentence case, straight quotes, plain hyphens.
- Visual tokens come from `src/styles.css` unchanged. New colors or fonts are not allowed. Content area tint is always `peach`.
- Supabase project `ngdsdkqimosiiqzdacci`, same URL and publishable key as `src/lib/sync.js`. Never print or commit secrets.
- New tables: `public.work_records`, `public.work_push_subscriptions`. Existing tables and their rows are never altered or deleted.
- Old Vercel projects `vandenizar-workspace` and `vandenizar-content-os` keep their domains.
- Every commit message ends with the two attribution lines from the session (`Co-Authored-By: ...`, `Claude-Session: ...`).

## Review Focus

1. **Work date passed, no deadline** (`isBehind` in `model.js`): today such a task vanishes from Today. Expected: it shows in Anytime today with sub-line "Planned <Mon 9 Nov>", and Replan moves its work date to today. Tests in Task 8 and Task 9.
2. **Billable task after Replan**: its deadline stays in the past, so it would stay in the Late bar forever. Expected: after Replan it leaves the Late bar and shows in Anytime today with sub-line "Client deadline passed" in `--bad`. Late = overdue and (not billable, or work date before today). Tests in Task 8 and Task 9.
3. **Nothing late / Replan pressed twice**: expected no change, `count` 0, no toast, Late bar hidden. Test in Task 9.
4. **Content items with missing dates** (post with only a post date, Thread with a time but no date): agenda must skip null dates and never throw. Test in Task 8.
5. **Same old backup imported twice**: expected the second import adds nothing and reports "Already imported". Each imported record stores `importedFrom: '<source>:<old id>'`. Test in Task 11.

---

## Phase A: old apps, sync off (§2)

### Task 1: Content OS local-only build

**Files:**
- Modify: `content-os/src/pages/Settings.tsx` (account section)
- Modify: `content-os/src/main.tsx` (local branch)
- Modify: `content-os/public/sw.js` (bump `VERSION`)

**Interfaces:**
- Consumes: existing `startLocal()`, `import.meta.env.VITE_LOCAL`, `disablePush()` from `content-os/src/lib/push.ts` (or its unsubscribe helper).
- Produces: nothing used by later tasks.

- [ ] **Step 1:** In the `VITE_LOCAL === '1'` branch of `main.tsx`, after `startLocal()`, call a new `dropPushSubscription(): Promise<void>` in `push.ts` that unsubscribes the browser `PushSubscription` if one exists. It must not call Supabase (no session in local mode).
- [ ] **Step 2:** In `Settings.tsx`, when `P.mode === 'local'`, replace the account and notification sections with one line: "Saved on this device. Cloud sync is off." Backup export stays.
- [ ] **Step 3:** Run `cd content-os && npm test && VITE_LOCAL=1 npm run build`. Expected: all tests pass, `dist/index.html` built.
- [ ] **Step 4:** Commit: `content-os: local-only mode shows sync-off note and drops push`.

### Task 2: Project manager local-only build

**Files:**
- Modify: `src/main.jsx`, `src/App.jsx`, `src/pages/settings.jsx`, `src/lib/push.js`, `public/sw.js` (bump version)

**Interfaces:**
- Produces: `export const LOCAL = import.meta.env.VITE_LOCAL === '1'` in `src/lib/sync.js`.

- [ ] **Step 1:** In `main.jsx`, when `LOCAL`, skip `initSync()` and the `onSync` hook, and call new `dropPushSubscription(): Promise<void>` from `push.js` (browser unsubscribe only, no Supabase call).
- [ ] **Step 2:** In `App.jsx`, when `LOCAL`, render `<Shell />` without waiting for `auth.ready` or `auth.user`.
- [ ] **Step 3:** In `settings.jsx`, `syncLabel()` returns "Saved on this device" when `LOCAL`. The Account and Notifications sections show "Saved on this device. Cloud sync is off." Backup & data stays.
- [ ] **Step 4:** Run `VITE_LOCAL=1 npm run build` at the repo root, then `npx vite preview` and open it in Chrome. Expected: the app opens straight to Today with no login, and adding a task survives a reload.
- [ ] **Step 5:** Commit: `project app: local-only mode without login or sync`.

### Task 3: Switch the old apps over (gated)

**Files:** none (Vercel env vars, Supabase cron).

- [ ] **Step 1:** Ask Denizar to open project.vandenizar.com and content.vandenizar.com once on every device while they are still synced (§2 "Before the switch"). Wait for his "done".
- [ ] **Step 2:** Set env var `VITE_LOCAL=1` (Production) on Vercel projects `vandenizar-workspace` and `vandenizar-content-os`. Merge Tasks 1-2 to `main`, wait for both deployments `READY`.
- [ ] **Step 3:** Run in SQL: `select cron.unschedule('push-reminders'); select cron.unschedule('content-push');` Then `select jobname from cron.job;` Expected: neither name listed.
- [ ] **Step 4:** Open both domains. Expected: no login screen, sync-off note in Settings, existing device data visible.

---

## Phase B: backend

### Task 4: Supabase tables for work

**Files:**
- Create: `supabase/migrations/20261110_work_tables.sql` (apply with `apply_migration`, name `work_tables`)

- [ ] **Step 1:** Write the migration:
  - `work_records`: same columns, defaults and nullability as `public.records` (`user_id uuid default auth.uid() not null`, `coll text not null`, `id text not null`, `data jsonb`, `deleted boolean default false not null`, `updated_at timestamptz default now() not null`), primary key `(user_id, coll, id)`, index `(user_id, updated_at)`, trigger `work_records_touch` before insert or update executing the existing `records_touch()`.
  - `work_push_subscriptions`: same columns, defaults, unique `endpoint` and `user_id` index as `public.push_subscriptions`.
  - RLS enabled on both, four policies each (select, insert, update, delete) with `(select auth.uid()) = user_id`, matching the existing ones.
- [ ] **Step 2:** Apply it. Verify: `select tablename from pg_tables where tablename like 'work_%';` returns both; `select count(*) from pg_policies where tablename like 'work_%';` returns `8`.
- [ ] **Step 3:** Run Supabase security advisors. Expected: no new warnings for `work_*`.
- [ ] **Step 4:** Commit the migration file: `supabase: work_records and work_push_subscriptions`.

---

## Phase C: work app logic

### Task 5: Scaffold `work/`

**Files:**
- Create: `work/` by copying `index.html`, `vite.config.js`, `vercel.json`, `package.json`, `public/`, `src/` from the repo root.
- Delete in the copy: `work/src/pages/templates.jsx` (not imported). Replace `work/src/lib/migrate.js` with `work/src/lib/sample.js` keeping only `loadSampleData`, `removeSampleData`, `hasSample`.
- Modify: `work/src/lib/db.js`, `work/src/lib/sync.js`, `work/public/manifest.webmanifest`, `work/package.json`, `work/src/main.jsx`
- Create: `work/vitest.config.js`, `work/src/lib/db.test.js`

**Interfaces:**
- Produces in `db.js`: `COLLECTIONS = ['pmEvents','pmTasks','pmProjects','feedback','clients','invoices','payments','cItems','meta']`, `DB_NAME = 'vandenizar-work'`, `DB_VERSION = 1`, new `export function resetForTests(): void` (clears all maps, dirty set, version; no IndexedDB).
- Produces in `sync.js`: table `work_records`, auth `storageKey: 'vzw:auth'`.

- [ ] **Step 1: Write the failing test** `db.test.js`:

```js
import { resetForTests, put, get, all, patch, remove } from './db.js';
beforeEach(() => resetForTests());
it('stores content items next to work collections', () => {
  put('cItems', { id: 'p1', kind: 'ig', title: 'BTS' });
  put('pmTasks', { id: 't1', title: 'Export' });
  patch('cItems', 'p1', { stage: 'script' });
  expect(get('cItems', 'p1').stage).toBe('script');
  expect(all('pmTasks').map((t) => t.id)).toEqual(['t1']);
  remove('cItems', 'p1');
  expect(all('cItems').length).toBe(0);
});
```

- [ ] **Step 2:** Add devDependencies `vitest`, `fake-indexeddb`, `jsdom`; script `"test": "vitest run"`; `vitest.config.js` with `environment: 'jsdom'`, `setupFiles: ['fake-indexeddb/auto']`. Run `cd work && npm install && npm test`. Expected: FAIL (`resetForTests` not exported).
- [ ] **Step 3:** Apply the `db.js` and `sync.js` changes above. `main.jsx` drops `migrateLegacy`. Manifest `name`/`short_name`: "Vandenizar Work" / "Work". `package.json` name `vandenizar-work`.
- [ ] **Step 4:** Run `npm test && npm run build`. Expected: PASS, `dist/index.html` built.
- [ ] **Step 5:** Commit: `work: scaffold from project manager with clean data layer`.

### Task 6: Content domain on the work data layer

**Files:**
- Create: `work/src/content/defaults.js`, `work/src/content/time.js`, `work/src/content/model.js`, `work/src/content/model.test.js`

**Interfaces:**
- Consumes: `get, all, put, patch, remove, uid, resetForTests` from `../lib/db.js`; `today, addDays` from `../lib/date.js`.
- Produces (same names and behaviour as `content-os/src/lib/model.ts`): `STAGES, stageIndex, stageOf, ensureDefaults, slots, slotById, pillars, formats, pillarName, formatName, saveSlot, newSlot, deleteSlot, saveTag, deleteTag, tagUsage, thisWeek, igItems, isLate, weekItems, slotItem, extraItems, weekProgress, createPost, schedule, isSlotFree, setStage, advance, duplicatePost, openGroups, postedItems, TASKS, taskOf, isTaskDone, completeTask, dateBounds, setStageDate, restoreSnaps, replanPost, replanThread, replanAll, dateConflicts, autoPlan, planBackwards, tasksOn, tasksBetween, overdueTasks, nextTaskAfter, nextTaskOf`, plus Threads/resources helpers the source exports (`threadsOn, overdueThreads, markPosted, createThread, createLink, normalizeUrl, firstLine`).
- Storage mapping: Content OS `items` → collection `cItems`; Content OS `settings` record → `get('meta','cSettings')` with `id: 'cSettings'`. Export `cSettings()` returning stored record merged over defaults. `migrateIdeas` is dropped (no legacy data). `today()` uses `lib/date.js` `today()`.
- `time.js` keeps only what `model.js` and the content pages use from `content-os/src/lib/time.ts` (`weekStart, weekdayIndex, fmtDay, weekRange, MONTHS, WEEKDAYS_S`), as JS.

- [ ] **Step 1:** Port `content-os/src/lib/model.test.ts` to `model.test.js`: same `describe`/`it` cases (17), imports changed to `../lib/db.js` (`resetForTests, get, all, put`) and `./model.js`, `get('items', id)` → `get('cItems', id)`, `settings()` → `M.cSettings()`. Drop only the case(s) that test `migrateIdeas`.
- [ ] **Step 2:** Run `npm test -- content`. Expected: FAIL (module missing).
- [ ] **Step 3:** Convert `model.ts`, `defaults.ts`, needed parts of `time.ts` to JS with the mapping above. Keep every rule (stage order, date bounds, replan gaps) identical.
- [ ] **Step 4:** Run `npm test`. Expected: all ported cases PASS.
- [ ] **Step 5:** Commit: `work: content domain on the shared data layer`.

### Task 7: Areas and progress

**Files:**
- Create: `work/src/combined/areas.js`, `work/src/combined/areas.test.js`

**Interfaces:**
- Consumes: `categories, categoryOf, projectCategoryId, settings, liveTasks` from `../lib/model.js`; `get, all` from `../lib/db.js`.
- Produces:
  - `CONTENT_AREA = { id: 'content', name: 'Content', color: 'peach' }`
  - `areas(): Area[]` — active categories in order, then `CONTENT_AREA`. `Area = { id, name, color }`.
  - `areaOfTask(task): Area` — project's category, else `settings().defaultCategory`.
  - `projectProgress(project): { done: number, total: number }` — done tasks + approved/delivered deliverables over all non-cancelled tasks + deliverables.
  - `segments(done, total, max = 10): { filled: number, count: number }` — `count = min(total, max)`, `filled = round(done / total * count)`; `{0,0}` when total is 0.

- [ ] **Step 1: Write the failing tests:** `areas()` ends with Content and skips archived categories; task without project gets the default category; `projectProgress` with 2/3 tasks done and 1 approved of 2 deliverables returns `{ done: 3, total: 5 }`; `segments(7, 10)` → `{ filled: 7, count: 10 }`, `segments(3, 30)` → `{ filled: 1, count: 10 }`, `segments(0, 0)` → `{ filled: 0, count: 0 }`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit: `work: areas and progress helpers`.

### Task 8: Agenda

**Files:**
- Create: `work/src/combined/agenda.js`, `work/src/combined/agenda.test.js`

**Interfaces:**
- Consumes: Task 7 `areaOfTask, CONTENT_AREA`; `liveTasks, isOpen, isOverdue, isBehind, projectBilling, eventsOn, liveProjects` from `../lib/model.js`; `tasksOn, overdueTasks, threadsOn, overdueThreads, igItems, cSettings, slotById` from `../content/model.js`.
- Produces: `buildAgenda({ date, filter = 'all' }): { allDay, scheduled, anytime, late, counts }`
  - `AgendaItem = { key, kind, area, time, title, sub, ref, actions, tone }`; `kind` ∈ `'task' | 'event' | 'ctask' | 'post' | 'thread' | 'follow'`; `ref` = `{ coll, id }` (+ `task` key for `ctask`); `actions` ⊆ `['copyCaption','openVideo','copy','openPost']`; `tone` = `'bad'` or undefined.
  - `counts`: `{ [areaId]: number }` over allDay + scheduled + anytime + late, before filtering.
  - Rules exactly as §6 Agenda and Row design, plus Review Focus 1, 2, 4:
    - late = `isOverdue(t)` and (not `projectBilling(project)` or `!t.workDate || t.workDate < date`); content late = `overdueTasks(date)` + `overdueThreads(date)`.
    - Post due today: `kind: 'post'`, `time = cSettings().notify?.postTime || '19:00'`.
    - `isBehind` tasks → anytime, sub "Planned " + `fmtDay(workDate)`.
    - Billable overdue with work date ≥ date → anytime, sub "Client deadline passed", `tone: 'bad'`.
    - Deadline today, no work date → anytime, sub includes "Deadline today".
    - Follow-ups: projects with `stage === 'client_review'` and `followUpDate <= date`.
    - `scheduled` sorted by `time`; `anytime` sorted: work tasks by deadline, then content, then follow-ups.
    - `filter` keeps items whose `area.id === filter`.

- [ ] **Step 1: Write the failing tests** (seed with `put`, pass `date: '2026-11-10'`):
  - `groups timed items by time`: task 14:00, thread 09:30, post due → scheduled order `['thread','task','post']`, post time `'19:00'`.
  - `deadline today without work date is anytime`: sub contains `'Deadline today'`.
  - `behind task stays visible`: workDate `'2026-11-09'`, no deadline → in anytime, sub `'Planned Mon, 9 Nov'` (match `fmtDay` output).
  - `billable overdue scheduled today leaves late`: billing project, deadline `'2026-11-08'`, workDate `'2026-11-10'` → not in late, in anytime with `tone: 'bad'`.
  - `content items without dates are skipped`: post with only `date`, thread with `time` and no `date` → no throw, thread absent.
  - `filter and counts`: filter `'content'` returns only content items; `counts.content` equals content total.
  - `follow-up due`: `client_review` project with followUpDate `'2026-11-09'` → one `follow` item.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit: `work: combined agenda`.

### Task 9: Replan

**Files:**
- Create: `work/src/combined/replan.js`, `work/src/combined/replan.test.js`

**Interfaces:**
- Consumes: Task 8 `buildAgenda` (for the late set under the current filter); `patchTask, projectBilling` from `../lib/model.js`; `replanAll, restoreSnaps` from `../content/model.js`; `patch` from `../lib/db.js`.
- Produces: `replanLate(date, filter = 'all'): { snaps: Snap[], count: number }`, `undoReplan(snaps): void`. `Snap = { coll, id, before: object }` (fields changed only).
  - Work late tasks: `shift = diffDays(date, earliestLateDeadline)`; non-billable: `deadlineDate += shift`, `workDate = workDate ? workDate + shift : null`, but never before `date`. Billable: deadline unchanged, `workDate = max(workDate, date)`.
  - `isBehind` tasks in the filter: `workDate = date`.
  - Content: `replanAll(date)` snaps wrapped as `{ coll: 'cItems', ... }` (only when filter is `'all'` or `'content'`).

- [ ] **Step 1: Write the failing tests:**
  - `keeps gaps`: deadlines `11-05`, `11-07`, `11-08` (non-billable) on date `11-10` → `11-10`, `11-12`, `11-13`; `count` 3.
  - `billable keeps deadline`: deadline `11-06`, no workDate → deadline `11-06`, workDate `11-10`; then `buildAgenda` late is empty.
  - `behind moves to today`.
  - `content moved`: late post with film date `11-08` → next step dated `11-10`.
  - `undo restores all`: after `undoReplan(snaps)` every touched record equals its seed.
  - `nothing late is a no-op`: `count` 0, `snaps` empty; second call after a replan also `count` 0.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit: `work: replan late items with undo`.

### Task 10: Routes and aliases

**Files:**
- Create: `work/src/combined/aliases.js`, `work/src/combined/aliases.test.js`
- Modify: `work/src/lib/router.js` (apply `resolveAlias` before setting `current`, with `replace`)

**Interfaces:**
- Produces: `resolveAlias(path: string, query: string): string | null` — returns the new full hash path, or `null` when no alias applies. Table exactly §4 "Route aliases".

- [ ] **Step 1: Write the failing tests:** one assertion per alias row in §4; `/tasks?view=today` → `/work/tasks?view=today`; `/tasks/abc` → `null`; `/` → `null`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement and wire into `router.js`. **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit: `work: route aliases`.

### Task 11: Backup export and old-app import

**Files:**
- Create: `work/src/combined/importOld.js`, `work/src/combined/importOld.test.js`
- Fixtures: `work/src/combined/fixtures/pm-export.json`, `work/src/combined/fixtures/cos-export.json` (small, hand-made in each old app's export shape: read `exportAll()` in `src/lib/db.js` and the backup code in `content-os/src/pages/Settings.tsx`)

**Interfaces:**
- Consumes: `exportAll, put, all, uid` from `../lib/db.js`.
- Produces:
  - `detectBackup(json): 'work' | 'pm' | 'cos' | null`
  - `previewImport(json): { source, counts: { tasks, projects, clients, invoices, posts, threads, links }, already: number }`
  - `importBackup(json): { added: number, skipped: number }` — `work` files restore with `importAll(json, { replace: false })`; `pm`/`cos` files add records with new ids, remap internal references (task→project, invoice→client, payment→invoice, deliverables), set `importedFrom: '<pm|cos>:<old id>'`, and skip any record whose `importedFrom` already exists. Content `items` → `cItems` (legacy `kind: 'idea'` → `ig` at stage `idea`); Content `settings` → `meta.cSettings` only if none exists. PM `meta.pmSettings`/`pmCategories` copied only if none exist.
- Error copy: unknown file → throw `Error('This file is not a Vandenizar backup')`.

- [ ] **Step 1: Write the failing tests:** detect each fixture; preview counts match fixture contents; import pm fixture keeps task→project links under new ids; importing the same file twice → second result `{ added: 0, skipped: n }` and `previewImport(...).already === n`; garbage JSON throws the exact message.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit: `work: backup import from old apps`.

---

## Phase D: work app UI

UI tasks have no unit tests. Each ends with `npm test && npm run build` passing and a visual check at 390×844 and 1440×900 in `npx vite preview` (sign in with Denizar's account, or `VITE_LOCAL=1` for a no-login preview), screenshots compared against §6-§10.

### Task 12: Visual polish components

**Files:**
- Create: `work/src/ui/polish.jsx` exporting `BentoCard({ tint, icon, label, value, children, href })`, `ProgressRow({ project })`, `SegBar({ done, total })`, `ChipCount({ label, count, on, onClick })`
- Modify: `work/src/ui/parts.jsx` (`StagePill` gets `size="sm"`), `work/src/styles.css` (append a `/* polish */` block)

- [ ] **Step 1:** Implement with the exact sizes in §10 (radius 24px, 36px icon circle, 32px weight-400 number, 44px project icon, 4px bars with 3px gaps, 24px pills at 12.5px weight 600). `ProgressRow` uses Task 7 `projectProgress`; `SegBar` uses `segments`.
- [ ] **Step 2:** Add a hidden dev route `#/dev/ui` rendering every component in every tint, for the visual check. Remove it in Task 21.
- [ ] **Step 3:** Build and check visually. Commit: `work: polish components`.

### Task 13: Shell, Work tab, Add menu, More

**Files:**
- Modify: `work/src/App.jsx` (Dock, Sidebar, routes, `openQuickAdd`)
- Create: `work/src/pages/work.jsx` (`WorkPage({ tab, query })` with segmented `Projects · Tasks`, renders existing `ProjectsPage`/`TasksPage` bodies)
- Modify: `work/src/pages/projects.jsx` (list rows → `ProgressRow`; accept `query.stage` filter), `work/src/pages/tasks.jsx` (chip counts; Replan bar in Overdue view using Task 9 with filter limited to work), `work/src/pages/settings.jsx` (`MorePage` adds Resources)

**Interfaces:**
- Produces: `openAddMenu()` in `App.jsx` with items Task, Event, Project, IG post, Thread; last choice in `localStorage` key `vzw:lastAdd` (try/catch) listed first. Deep links `?add=post|thread` open the post/thread creators from Tasks 15/17 (stub to "Coming in Task 15" toast until then).
- Dock tabs: `today /`, `work /work/projects` (icon `folder`), `content /content/ig` (icon `image` or nearest in `Icon.jsx`), `calendar /calendar`, `more /more`.

- [ ] **Step 1:** Implement. **Step 2:** Build, visual check of dock, sidebar, Work segmented control, Add menu order after two uses. **Step 3:** Commit: `work: shell, work tab, add menu`.

### Task 14: Today

**Files:**
- Modify: `work/src/pages/today.jsx`
- Create: `work/src/ui/agendaRow.jsx` (`AgendaRow({ item })` renders any `AgendaItem`: check behaviour and quick actions per §6 Row design)

**Interfaces:**
- Consumes: Task 8 `buildAgenda`, Task 9 `replanLate/undoReplan`, Task 12 `BentoCard/ChipCount`, content `completeTask, setStage, markPosted, taskOf`, `completeTask/reopenTask` from `lib/model.js`, `toast`.

- [ ] **Step 1:** Header as now; bento row (§6 Summary cards, phone layout: Today card left full height, two count cards stacked right); chips from `counts` (hide zero, `vzw:todayFilter`); Late bar (collapsed, Replan → toast "Moved N items" with Undo; hidden when no late); groups All day / Scheduled / Anytime today; empty state with next dated item; desktop right column Upcoming 7 days + This week slot tiles (tiles from Task 15's `SlotTile`; render placeholder until Task 15).
- [ ] **Step 2:** Seed sample data (`loadSampleData` + a few posts), visual check both widths, check: tick a content task → stage advances + Undo works; Copy caption copies.
- [ ] **Step 3:** Commit: `work: combined Today`.

### Task 15: Content → Instagram

**Files:**
- Create: `work/src/pages/content-ig.jsx` (`ContentPage({ tab })` with segmented `Instagram · Threads`; Instagram body), `work/src/ui/slotTile.jsx` (`SlotTile({ week, slot })`)

- [ ] **Step 1:** Week strip with arrows and "This week"; groups from `openGroups()`; card with slot tint, `StagePill sm`, `SegBar` (done = stage index, total = 5), next-step button calling `advance`; Posted by month (latest open, older collapsed). Empty slot tile tap → `createPost({ week, slot })` and open it.
- [ ] **Step 2:** Visual check; create, advance and post one item. Commit: `work: content instagram`.

### Task 16: Post detail

**Files:**
- Create: `work/src/pages/content-post.jsx` (`PostDetail({ id })`, route `#/post/:id`)

- [ ] **Step 1:** Layout per §8 Post detail. Date inputs call `setStageDate`; on `{ ok: false, error }` show `error` inline under the field. "Fill from post date" → `planBackwards`; "Fix dates" shown when `dateConflicts(it).length`. Caption Copy → clipboard + toast "Caption copied". Menu: Duplicate (`duplicatePost`, navigate), Delete (remove + Undo toast).
- [ ] **Step 2:** Visual check; try an out-of-order date and see the reason. Commit: `work: post detail`.

### Task 17: Threads and Resources

**Files:**
- Create: `work/src/pages/content-threads.jsx`, `work/src/pages/resources.jsx` (route `#/more/resources`)

- [ ] **Step 1:** Threads per §8 (inline edit, schedule chip, Scheduled / Not scheduled, Copy, Posted with Undo, Posted tab). Resources: name + link list, add/edit/delete, links open in a new tab via `normalizeUrl`.
- [ ] **Step 2:** Visual check. Commit: `work: threads and resources`.

### Task 18: Calendar with content

**Files:**
- Modify: `work/src/pages/calendar.jsx`

- [ ] **Step 1:** Add content stage tasks and post days as all-day chips (`peach`, labels as Today rows) from `tasksBetween(start, end)`; timed Threads as 15-minute blocks. Drag of a content chip → `setStageDate`; on refusal, snap back and toast the error. Work blocks use their category tint.
- [ ] **Step 2:** Visual check in day, week, month. Commit: `work: calendar shows content`.

### Task 19: Settings

**Files:**
- Modify: `work/src/pages/settings.jsx`

- [ ] **Step 1:** Sections in order: General, Categories, Content (slots: name, day, tint, default pillar/format; pillars; formats — using `saveSlot/newSlot/deleteSlot/saveTag/deleteTag/tagUsage`), Notifications (Task 20 hooks), Business & invoices, Backup & data, Account.
- [ ] **Step 2:** Backup & data: Export (work JSON, file name `vandenizar-work-YYYY-MM-DD.json`); Import → file picker → `previewImport` sheet with counts and "Already imported" when `already > 0` → Confirm → `importBackup` → toast "Imported N items".
- [ ] **Step 3:** Import both fixtures from Task 11 in the browser; check counts and links. Commit: `work: merged settings with import`.

### Task 20: Notifications

**Files:**
- Modify: `work/src/lib/push.js` (table `work_push_subscriptions`), `work/public/sw.js` (`notificationclick` passes the hash through `resolveAlias` logic inlined; bump `VERSION`)
- Create: `supabase/functions/work-push/index.ts`
- Modify: `work/src/pages/settings.jsx` (Notifications section)

**Interfaces:**
- Consumes: `push_config` (VAPID keys, cron secret), `push_sent`, `work_records`, `work_push_subscriptions`.
- `work-push` = `push-reminders` + `content-push` merged: read `work_records` colls `pmTasks, pmProjects, meta, invoices, payments, clients, cItems`; content settings from `meta` row id `cSettings`; keys prefixed `w:` (`w:work:…`, `w:dl1h:…`, `w:dlday:…`, `w:follow:…`, `w:inv:…`, `w:am:<date>`, `w:post:<id>:<date>`, `w:th:<id>:<date>`). Morning summary only when the day has a shoot (film task), post or deadline. URLs: `#/tasks/:id`, `#/projects/:id`, `#/invoices/:id`, `#/post/:id`, `#/`. Test send path for a signed-in user, as in the old functions. Each user is processed in its own try/catch; 404/410 subscriptions are deleted.

- [ ] **Step 1:** Implement function, deploy with `deploy_edge_function` (`verify_jwt: false`, same as the old ones; it checks the cron secret or user JWT itself).
- [ ] **Step 2:** Schedule: `select cron.schedule('work-push', '* * * * *', $$ ... $$)` copying the `net.http_post` command of the old `push-reminders` job with the URL changed to `/functions/v1/work-push`.
- [ ] **Step 3:** Settings → Notifications: turn on per device, work reminder time (`pmSettings.reminderTime`), morning summary time and post time (`cSettings.notify`), Test button.
- [ ] **Step 4:** On the iPhone Home Screen app: turn on, press Test. Expected: one notification, tap opens the right screen. Check `select count(*) from cron.job where jobname='work-push'` = 1.
- [ ] **Step 5:** Commit: `work: push notifications via work-push`.

### Task 21: Deploy and review

**Files:**
- Modify: `work/README.md` (create: what it is, run, data, notifications), remove `#/dev/ui`

- [ ] **Step 1:** Create Vercel project `vandenizar-work`, root `work`, build `npm run build`, output `dist`, production branch `main`. Push branch `work-app`, wait for the preview `READY`.
- [ ] **Step 2:** Manual QA from §14 on the preview: 390px and desktop, sign in, create task / post / Thread, check on a second device, Replan + Undo, import an old backup.
- [ ] **Step 3:** Send Denizar the preview link. Wait for approval.
- [ ] **Step 4:** Add domain `work.vandenizar.com` to the project; add Cloudflare DNS `CNAME work → cname.vercel-dns.com`, DNS only (via Chrome on his Cloudflare account, with his OK). Verify `get_project_domain` shows verified.
- [ ] **Step 5:** Merge `work-app` into `main`. Confirm the old projects' latest deployments are still `READY` and unchanged.
