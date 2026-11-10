// Content domain: weekly Instagram slots (customisable), Threads drafts, resource links.
// Ported from Content OS onto the shared data layer: items live in `cItems`, settings in meta/cSettings.
import { all, get, put, patch, remove, uid } from '../lib/db.js'
import { today as jakartaToday, addDays } from '../lib/date.js'
import { weekStart, weekdayIndex, fmtDay } from './time.js'
import { DEFAULT_SLOTS, DEFAULT_PILLARS, DEFAULT_FORMATS, SCHEMA_VERSION } from './defaults.js'

/**
 * @typedef {{ id: string, name: string }} Tag
 * @typedef {{ id: string, name: string, day: number, tint: string, hint?: string, pillar?: string|null, format?: string|null }} Slot
 *   day: 0 = Monday ... 6 = Sunday
 * @typedef {'idea'|'script'|'film'|'edit'|'ready'|'done'} Stage
 * @typedef {{
 *   id: string, kind: 'ig'|'thread'|'link', createdAt: number, updatedAt: number,
 *   week?: string|null, slot?: string|null, title?: string, stage?: Stage,
 *   hook?: string, script?: string, caption?: string, notes?: string,
 *   date?: string|null, scriptDate?: string|null, filmDate?: string|null, editDate?: string|null,
 *   pillar?: string|null, format?: string|null, refs?: { id: string, url: string, note?: string }[], finalUrl?: string,
 *   text?: string, time?: string|null, url?: string, postedAt?: string|null,
 * }} Item
 */

const nowIso = () => new Date().toISOString()

// ---------- stages (fixed) ----------
export const STAGES = [
  { id: 'idea', label: 'Idea', next: 'Start script', doing: 'Shape the idea' },
  { id: 'script', label: 'Script', next: 'Script done', doing: 'Write the script' },
  { id: 'film', label: 'Film', next: 'Filmed', doing: 'Film it' },
  { id: 'edit', label: 'Edit', next: 'Edit done', doing: 'Edit it' },
  { id: 'ready', label: 'Ready', next: 'Mark posted', doing: 'Post it' },
  { id: 'done', label: 'Posted', next: '', doing: 'Posted' },
]
export const stageIndex = (s) => Math.max(0, STAGES.findIndex((x) => x.id === (s || 'idea')))
export const stageOf = (s) => STAGES[stageIndex(s)]

// ---------- settings ----------
const SETTINGS_ID = 'cSettings'
const defaultSettings = () => ({
  id: SETTINGS_ID, schemaVersion: SCHEMA_VERSION,
  slots: DEFAULT_SLOTS.map((x) => ({ ...x })), pillars: DEFAULT_PILLARS.map((x) => ({ ...x })), formats: DEFAULT_FORMATS.map((x) => ({ ...x })),
})
/** Stored content settings merged over the defaults. */
export const cSettings = () => ({ ...defaultSettings(), ...(get('meta', SETTINGS_ID) || {}) })

export function ensureDefaults() {
  const cur = get('meta', SETTINGS_ID)
  if (!cur) { put('meta', defaultSettings()); return }
  const fix = {}
  if (!Array.isArray(cur.slots)) fix.slots = DEFAULT_SLOTS.map((x) => ({ ...x }))
  if (!Array.isArray(cur.pillars)) fix.pillars = DEFAULT_PILLARS.map((x) => ({ ...x }))
  if (!Array.isArray(cur.formats)) fix.formats = DEFAULT_FORMATS.map((x) => ({ ...x }))
  if (Object.keys(fix).length) put('meta', { ...cur, ...fix, schemaVersion: SCHEMA_VERSION })
}

/** Slots in weekday order. */
export const slots = () => [...(cSettings().slots || DEFAULT_SLOTS)].sort((a, b) => a.day - b.day)
export const slotById = (id) => (id ? (cSettings().slots || []).find((s) => s.id === id) : undefined)
export const pillars = () => cSettings().pillars || []
export const formats = () => cSettings().formats || []
export const pillarName = (id) => pillars().find((p) => p.id === id)?.name
export const formatName = (id) => formats().find((p) => p.id === id)?.name

function saveSettings(p) { put('meta', { ...cSettings(), ...p }) }

export function saveSlot(slot) {
  const list = cSettings().slots || []
  const i = list.findIndex((s) => s.id === slot.id)
  saveSettings({ slots: i < 0 ? [...list, slot] : list.map((s) => (s.id === slot.id ? slot : s)) })
  // keep planned dates of open posts in sync with the slot's day
  for (const it of all('cItems')) {
    if (it.kind === 'ig' && it.slot === slot.id && it.week && it.stage !== 'done' && it.date !== addDays(it.week, slot.day)) patch('cItems', it.id, { date: addDays(it.week, slot.day) })
  }
}
export function newSlot() {
  const used = new Set((cSettings().slots || []).map((s) => s.day))
  const day = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 0
  return { id: uid(), name: '', day, tint: 'peach', hint: '', pillar: null, format: formats()[0]?.id || null }
}
/** Remove a slot. Unposted posts in it stay, just unscheduled from the slot (their date is kept). */
export function deleteSlot(id) {
  saveSettings({ slots: (cSettings().slots || []).filter((s) => s.id !== id) })
  for (const it of all('cItems')) if (it.kind === 'ig' && it.slot === id && it.stage !== 'done') patch('cItems', it.id, { slot: null })
}

export function saveTag(kind, tag) {
  const list = cSettings()[kind] || []
  const i = list.findIndex((t) => t.id === tag.id)
  saveSettings({ [kind]: i < 0 ? [...list, tag] : list.map((t) => (t.id === tag.id ? tag : t)) })
}
export function deleteTag(kind, id) {
  const s = cSettings()
  saveSettings({ [kind]: (s[kind] || []).filter((t) => t.id !== id), slots: (s.slots || []).map((sl) => (kind === 'pillars' ? (sl.pillar === id ? { ...sl, pillar: null } : sl) : (sl.format === id ? { ...sl, format: null } : sl))) })
  const field = kind === 'pillars' ? 'pillar' : 'format'
  for (const it of all('cItems')) if (it[field] === id) patch('cItems', it.id, { [field]: null })
}
export function tagUsage(kind, id) {
  const field = kind === 'pillars' ? 'pillar' : 'format'
  return liveItems().filter((i) => i[field] === id).length
}

// ---------- time ----------
export const today = () => jakartaToday()
export const thisWeek = () => weekStart(today())

/** Every content item that is not in the trash. All content reads go through this. */
export const liveItems = () => all('cItems').filter((i) => !i.deletedAt)
/** Move an item to the trash (restore with restoreItem). */
export const trashItem = (id) => patch('cItems', id, { deletedAt: Date.now() })
/** A post that nothing was typed or planned into yet. */
export const isBlankPost = (it) => !!it && it.kind === 'ig' && !(it.title || '').trim() && !it.date && !it.slot && !it.week && !it.scriptDate && !it.filmDate && !it.editDate
  && !(it.hook || '').trim() && !(it.script || '').trim() && !(it.caption || '').trim() && !(it.notes || '').trim() && !(it.finalUrl || '').trim() && !(it.refs || []).length && (it.stage || 'idea') === 'idea'
/** Posts made by the Add button in this session; one that is still blank when you leave it is dropped. */
const freshBlanks = new Set()
export const markFreshBlank = (id) => { freshBlanks.add(id) }
export function dropIfBlank(id) {
  if (!freshBlanks.delete(id)) return false
  const it = get('cItems', id)
  if (it && it.deletedAt) return false // already in the trash: leave it so Undo can restore it
  if (!isBlankPost(it)) return false
  remove('cItems', id)
  return true
}
export const restoreItem = (id) => patch('cItems', id, { deletedAt: null })

// ---------- Instagram ----------
export const igItems = () => liveItems().filter((i) => i.kind === 'ig')
export const isLate = (i, t = today()) => i.kind === 'ig' && i.stage !== 'done' && !!i.date && i.date < t

export function weekItems(week) {
  return igItems().filter((i) => i.week === week)
}
export function slotItem(week, slot) {
  const xs = weekItems(week).filter((i) => i.slot === slot)
  return xs.find((i) => i.stage !== 'done') || xs[0]
}
/** Posts planned in the week that are not tied to a current slot. */
export function extraItems(week) {
  const ids = new Set(slots().map((s) => s.id))
  return weekItems(week).filter((i) => !i.slot || !ids.has(i.slot)).sort(byDate)
}
export function weekProgress(week) {
  const ss = slots()
  const posted = ss.filter((s) => slotItem(week, s.id)?.stage === 'done').length + extraItems(week).filter((i) => i.stage === 'done').length
  return { posted, total: ss.length + extraItems(week).length }
}

const byDate = (a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : (a.createdAt < b.createdAt ? -1 : 1)

/** @param {{ title: string, week?: string|null, slot?: string|null, notes?: string, date?: string|null }} p */
export function createPost({ title = '', week = null, slot = null, notes = '', date = null }) {
  if (date && !slot) {
    const p = createPost({ title, notes })
    setStageDate(p.id, 'date', date)
    const s = slotById(get('cItems', p.id)?.slot)
    if (s) patch('cItems', p.id, { pillar: s.pillar ?? null, format: s.format ?? p.format ?? null })
    return get('cItems', p.id)
  }
  const s = slotById(slot)
  const it = put('cItems', {
    id: uid(), kind: 'ig', title: title.trim(), stage: 'idea', refs: [], finalUrl: '',
    week: s && week ? week : null, slot: s && week ? s.id : null, date: s && week ? addDays(week, s.day) : null, scriptDate: null, filmDate: null, editDate: null,
    hook: '', script: '', caption: '', notes,
    pillar: s?.pillar ?? null, format: s?.format ?? formats()[0]?.id ?? null, postedAt: null,
  })
  autoPlan(it.id)
  return get('cItems', it.id)
}

/** Put a post into a slot of a week (or unschedule with slot = null). */
export function schedule(id, week, slot) {
  const s = slotById(slot)
  if (!s || !week) { patch('cItems', id, { week: null, slot: null, date: null }); return }
  const it = get('cItems', id)
  patch('cItems', id, { week, slot: s.id, date: addDays(week, s.day), pillar: it?.pillar ?? s.pillar ?? null })
  autoPlan(id)
}
/** The slot a post date belongs to: the free slot on that weekday, else the current slot if it is free that week. */
function slotForDate(it, date) {
  const week = weekStart(date)
  const match = slots().find((s) => s.day === weekdayIndex(date) && isSlotFree(week, s.id, it.id))
  if (match) return match.id
  if (it.slot && slotById(it.slot) && (week === it.week || isSlotFree(week, it.slot, it.id))) return it.slot
  return null
}
/** Set the post date by hand; the slot follows the weekday when one fits. */
function applyPostDate(id, date) {
  const it = get('cItems', id); if (!it) return
  if (!date) { patch('cItems', id, { date: null, week: null, slot: null }); return }
  patch('cItems', id, { date, week: weekStart(date), slot: slotForDate(it, date) })
}
export function isSlotFree(week, slot, exceptId) {
  const it = slotItem(week, slot)
  return !it || it.id === exceptId
}

export function setStage(id, stage) {
  patch('cItems', id, { stage, postedAt: stage === 'done' ? get('cItems', id)?.postedAt || nowIso() : null })
}
export function advance(id) {
  const it = get('cItems', id); if (!it) return
  const i = stageIndex(it.stage)
  if (i < STAGES.length - 1) { setStage(id, STAGES[i + 1].id); return STAGES[i + 1].id }
}

export function duplicatePost(id) {
  const it = get('cItems', id); if (!it) return
  // createdAt/updatedAt are left out so put() stamps the copy as new
  const { createdAt, updatedAt, ...rest } = it
  return put('cItems', { ...rest, id: uid(), title: (it.title || '') + ' (copy)', stage: 'idea', week: null, slot: null, date: null, scriptDate: null, filmDate: null, editDate: null, finalUrl: '', postedAt: null })
}

/** Open posts grouped for the Instagram list. */
export function openGroups(t = today()) {
  const wk = weekStart(t), next = addDays(wk, 7)
  const open = igItems().filter((i) => i.stage !== 'done').sort(byDate)
  const g = [
    { key: 'late', label: 'Late', items: open.filter((i) => isLate(i, t)) },
    { key: 'week', label: 'Posting this week', items: open.filter((i) => !isLate(i, t) && i.date && i.date < next) },
    { key: 'next', label: 'Posting next week', items: open.filter((i) => i.date && i.date >= next && i.date < addDays(next, 7)) },
    { key: 'later', label: 'Posting later', items: open.filter((i) => i.date && i.date >= addDays(next, 7)) },
    { key: 'none', label: 'Not scheduled', items: open.filter((i) => !i.date) },
  ]
  return g.filter((x) => x.items.length)
}
export const postedItems = () => igItems().filter((i) => i.stage === 'done').sort((a, b) => ((b.postedAt || b.date || '') > (a.postedAt || a.date || '') ? 1 : -1))

// ---------- schedule: one date per stage ----------
/** idx = the stage index this task finishes; finishing it moves the post to the next stage. */
export const TASKS = [
  { key: 'script', field: 'scriptDate', label: 'Script', todo: 'Write the script', done: 'Script done', idx: 1 },
  { key: 'film', field: 'filmDate', label: 'Film', todo: 'Film it', done: 'Filmed', idx: 2 },
  { key: 'edit', field: 'editDate', label: 'Edit', todo: 'Edit it', done: 'Edit done', idx: 3 },
  { key: 'post', field: 'date', label: 'Post', todo: 'Post it', done: 'Posted', idx: 4 },
]
export const taskOf = (k) => TASKS.find((t) => t.key === k)
export const isTaskDone = (it, t) => stageIndex(it.stage) > t.idx

/** Finish a task: the post moves past that stage. Returns the previous stage for undo. */
export function completeTask(id, t) {
  const it = get('cItems', id); if (!it || isTaskDone(it, t)) return
  const prev = it.stage || 'idea'
  setStage(id, STAGES[t.idx + 1].id)
  return prev
}

/** Allowed range for a stage date: after every earlier stage date, before every later one. */
export function dateBounds(it, field) {
  const i = TASKS.findIndex((t) => t.field === field)
  const before = TASKS.slice(0, i).map((t) => it[t.field]).filter(Boolean)
  const after = TASKS.slice(i + 1).map((t) => it[t.field]).filter(Boolean)
  return { min: before.length ? before.sort()[before.length - 1] : undefined, max: after.length ? after.sort()[0] : undefined }
}

/** Set a stage date. Refuses dates that break script <= film <= edit <= post and says why.
 *  @returns {{ ok: true } | { ok: false, error: string }} */
export function setStageDate(id, field, value) {
  const it = get('cItems', id); if (!it) return { ok: false, error: 'Post not found' }
  if (value) {
    const t = TASKS.find((x) => x.field === field)
    const i = TASKS.indexOf(t)
    for (const e of TASKS.slice(0, i)) { const d = it[e.field]; if (d && d > value) return { ok: false, error: `${t.label} can't be before ${e.label} (${fmtDay(d)}).` } }
    for (const l of TASKS.slice(i + 1)) { const d = it[l.field]; if (d && d < value) return { ok: false, error: `${t.label} can't be after ${l.label} (${fmtDay(d)}).` } }
  }
  if (field === 'date') { applyPostDate(id, value); if (value) autoPlan(id) }
  else patch('cItems', id, { [field]: value })
  return { ok: true }
}

// ---------- catching up ----------
const daysFrom = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
const snapOf = (it) => ({ id: it.id, week: it.week ?? null, slot: it.slot ?? null, date: it.date ?? null, scriptDate: it.scriptDate ?? null, filmDate: it.filmDate ?? null, editDate: it.editDate ?? null, time: it.time ?? null })
/** Put items back exactly as they were before a replan. */
export function restoreSnaps(snaps) { for (const { id, ...p } of snaps) patch('cItems', id, p) }

/** A post that fell behind: shift every unfinished, dated step by the same number of days so the
 *  earliest late one lands on today. Spacing and order stay the same; the slot follows the new post day. */
export function replanPost(id, t = today()) {
  const it = get('cItems', id); if (!it || it.kind !== 'ig' || it.stage === 'done') return null
  const open = TASKS.filter((k) => !isTaskDone(it, k) && it[k.field])
  const late = open.map((k) => it[k.field]).filter((d) => d < t).sort()
  if (!late.length) return null
  const snap = snapOf(it)
  const delta = daysFrom(late[0], t)
  const p = {}
  for (const k of open) if (k.field !== 'date') p[k.field] = addDays(it[k.field], delta)
  if (Object.keys(p).length) patch('cItems', id, p)
  if (open.some((k) => k.field === 'date')) applyPostDate(id, addDays(it.date, delta))
  return snap
}

/** A Threads draft that missed its day moves to today (time kept). */
export function replanThread(id, t = today()) {
  const it = get('cItems', id); if (!it || it.kind !== 'thread' || it.postedAt || !it.date || it.date >= t) return null
  const snap = snapOf(it)
  patch('cItems', id, { date: t })
  return snap
}

/** Replan everything that is late. Returns snapshots for undo. */
export function replanAll(t = today()) {
  const out = []
  const ids = new Set(overdueTasks(t).map((x) => x.it.id))
  for (const id of ids) { const s = replanPost(id, t); if (s) out.push(s) }
  for (const th of overdueThreads(t)) { const s = replanThread(th.id, t); if (s) out.push(s) }
  return out
}

/** Dates that are out of order (can happen when a post is moved to an earlier slot). */
export function dateConflicts(it) {
  const out = []
  for (let i = 0; i < TASKS.length; i++) for (let j = i + 1; j < TASKS.length; j++) {
    const a = it[TASKS[i].field], b = it[TASKS[j].field]
    if (a && b && a > b) out.push(`${TASKS[i].label} (${fmtDay(a)}) is after ${TASKS[j].label} (${fmtDay(b)})`)
  }
  return out
}

/** Quiet default for new or moved posts: fill only EMPTY script/film/edit dates at 3/2/1 days before the post,
 *  skip any that would land in the past, never break the order, never touch stages already done. */
export function autoPlan(id, t = today()) {
  const it = get('cItems', id); if (!it || !it.date) return
  const p = {}
  let next = it.date
  for (const [field, off] of [['editDate', 1], ['filmDate', 2], ['scriptDate', 3]]) {
    const task = TASKS.find((x) => x.field === field)
    const cur = it[field]
    if (cur) { next = cur < next ? cur : next; continue }
    if (isTaskDone(it, task)) continue
    const d = addDays(it.date, -off)
    if (d < t || d > next) continue
    p[field] = d
    next = d
  }
  if (Object.keys(p).length) patch('cItems', id, p)
}

/** Fill script/film/edit backwards from the post date (3, 2, 1 days before), never before today,
 *  skipping stages already done and keeping dates that already fit. */
export function planBackwards(id, t = today()) {
  const it = get('cItems', id); if (!it || !it.date) return
  const p = {}
  let next = it.date
  for (const [field, off] of [['editDate', 1], ['filmDate', 2], ['scriptDate', 3]]) {
    const task = TASKS.find((x) => x.field === field)
    const cur = it[field]
    if (isTaskDone(it, task)) { if (cur && cur > next) p[field] = next; else if (cur) next = cur; continue }
    if (cur && cur <= next && cur >= t) { next = cur; continue }
    let d = addDays(it.date, -off)
    if (d < t) d = t
    if (d > next) d = next
    p[field] = d
    next = d
  }
  if (Object.keys(p).length) patch('cItems', id, p)
}

function allTasks() {
  const out = []
  for (const it of igItems()) for (const task of TASKS) { const d = it[task.field]; if (d) out.push({ it, task, date: d, done: isTaskDone(it, task) }) }
  return out
}
const taskSort = (a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.task.idx - b.task.idx || ((a.it.title || '') < (b.it.title || '') ? -1 : 1)
/** Everything dated on a day: script, film, edit and post tasks. Undone first. */
export const tasksOn = (d) => allTasks().filter((x) => x.date === d).sort(taskSort)
export const tasksBetween = (a, b) => allTasks().filter((x) => x.date >= a && x.date <= b)
/** Dated tasks before today that are not done. */
export const overdueTasks = (t = today()) => allTasks().filter((x) => x.date < t && !x.done).sort(taskSort)
/** The next undone dated task after a day. */
export const nextTaskAfter = (t = today()) => allTasks().filter((x) => x.date > t && !x.done).sort(taskSort)[0]
/** The next undone dated task of one post (for cards). */
export function nextTaskOf(it) {
  return TASKS.filter((t) => !isTaskDone(it, t) && it[t.field]).map((t) => ({ it, task: t, date: it[t.field], done: false }))[0]
}

// ---------- Threads ----------
export const THREADS_LIMIT = 500
const threadKey = (t) => (t.date ? t.date + ' ' + (t.time || '99:99') : '9999') + t.createdAt
/** Drafts: scheduled ones first by date and time, then the rest newest first. */
export const threadDrafts = () => {
  const d = liveItems().filter((i) => i.kind === 'thread' && !i.postedAt)
  return [...d.filter((x) => x.date).sort((a, b) => (threadKey(a) < threadKey(b) ? -1 : 1)), ...d.filter((x) => !x.date).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))]
}
export const threadPosted = () => liveItems().filter((i) => i.kind === 'thread' && i.postedAt).sort((a, b) => (b.postedAt > a.postedAt ? 1 : -1))
export function addThread(text, date = null, time = null) {
  if (!text.trim()) return null
  return put('cItems', { id: uid(), kind: 'thread', text: text.trim(), date, time: date ? time : null, postedAt: null })
}
export function scheduleThread(id, date, time) {
  patch('cItems', id, { date, time: date ? time : null })
}
export const markPosted = (id, posted) => patch('cItems', id, { postedAt: posted ? nowIso() : null })
/** Threads planned for a day (posted ones last). */
export const threadsOn = (d) => liveItems().filter((i) => i.kind === 'thread' && i.date === d).sort((a, b) => (!!a.postedAt === !!b.postedAt ? (threadKey(a) < threadKey(b) ? -1 : 1) : a.postedAt ? 1 : -1))
export const overdueThreads = (t = today()) => liveItems().filter((i) => i.kind === 'thread' && !i.postedAt && i.date && i.date < t).sort((a, b) => (threadKey(a) < threadKey(b) ? -1 : 1))

// ---------- Resources ----------
export const links = () => liveItems().filter((i) => i.kind === 'link').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
export function addLink(name, url) {
  const u = normalizeUrl(url); if (!u) return null
  return put('cItems', { id: uid(), kind: 'link', title: name.trim() || linkLabel(u), url: u })
}
export function updateLink(id, name, url) {
  const u = normalizeUrl(url); if (!u) return false
  patch('cItems', id, { title: name.trim() || linkLabel(u), url: u }); return true
}

export const firstLine = (t = '') => {
  const l = t.trim().split('\n')[0].trim()
  return l.length > 80 ? l.slice(0, 77).trimEnd() + '…' : l
}

// ---------- links ----------
/** Accepts "instagram.com/reel/x" or a full URL; returns a safe http(s) URL or null. */
export function normalizeUrl(raw) {
  let s = raw.trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.toString() : null } catch { return null }
}
const SITES = [
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'Pinterest'], [/(^|\.)drive\.google\.com$/, 'Google Drive'], [/(^|\.)docs\.google\.com$/, 'Google Docs'],
  [/(^|\.)(photos\.app\.goo\.gl|photos\.google\.com)$/, 'Google Photos'], [/(^|\.)icloud\.com$/, 'iCloud'], [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)frame\.io$/, 'Frame.io'], [/(^|\.)(threads\.net|threads\.com)$/, 'Threads'], [/(^|\.)(x\.com|twitter\.com)$/, 'X'], [/(^|\.)dropbox\.com$/, 'Dropbox'],
]
export function linkLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    for (const [re, name] of SITES) if (re.test(h)) return name
    return h
  } catch { return url }
}
export function addRef(id, url, note = '') {
  const it = get('cItems', id); if (!it) return null
  const u = normalizeUrl(url); if (!u) return null
  const ref = { id: uid(), url: u, note: note.trim() }
  patch('cItems', id, { refs: [...(it.refs || []), ref] })
  return ref
}
export function updateRef(id, refId, p) {
  const it = get('cItems', id); if (!it) return
  patch('cItems', id, { refs: (it.refs || []).map((r) => (r.id === refId ? { ...r, ...p } : r)) })
}
export function removeRef(id, refId) {
  const it = get('cItems', id); if (!it) return
  patch('cItems', id, { refs: (it.refs || []).filter((r) => r.id !== refId) })
}

// ---------- notifications ----------
export const DEFAULT_NOTIFY = { morning: true, morningTime: '08:00', postReminder: true, postTime: '19:00' }
export const notifyPrefs = () => ({ ...DEFAULT_NOTIFY, ...(cSettings().notify || {}) })
export function setNotify(p) { put('meta', { ...cSettings(), notify: { ...notifyPrefs(), ...p } }) }
