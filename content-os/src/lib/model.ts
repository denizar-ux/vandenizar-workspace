// Domain layer: weekly Instagram slots (customisable), Threads drafts, one idea inbox.
import { all, get, put, patch, remove, uid, nowIso, tz, S, settings, defaultSettings } from './store'
import { todayKey, weekStart, addDays, weekdayIndex, fmtDay } from './time'
import { DEFAULT_SLOTS, DEFAULT_PILLARS, DEFAULT_FORMATS } from './defaults'
import { SCHEMA_VERSION, type Item, type Slot, type Stage, type Tag } from './types'

// ---------- stages (fixed) ----------
export const STAGES: { id: Stage; label: string; next: string; doing: string }[] = [
  { id: 'idea', label: 'Idea', next: 'Start script', doing: 'Shape the idea' },
  { id: 'script', label: 'Script', next: 'Script done', doing: 'Write the script' },
  { id: 'film', label: 'Film', next: 'Filmed', doing: 'Film it' },
  { id: 'edit', label: 'Edit', next: 'Edit done', doing: 'Edit it' },
  { id: 'ready', label: 'Ready', next: 'Mark posted', doing: 'Post it' },
  { id: 'done', label: 'Posted', next: '', doing: 'Posted' },
]
export const stageIndex = (s?: Stage) => Math.max(0, STAGES.findIndex((x) => x.id === (s || 'idea')))
export const stageOf = (s?: Stage) => STAGES[stageIndex(s)]

// ---------- settings ----------
export function ensureDefaults() {
  const cur = S.settings.get('settings')
  if (!cur) { put('settings', defaultSettings()); return }
  const fix: any = {}
  if (!Array.isArray(cur.slots)) fix.slots = DEFAULT_SLOTS.map((x) => ({ ...x }))
  if (!Array.isArray(cur.pillars)) fix.pillars = DEFAULT_PILLARS.map((x) => ({ ...x }))
  if (!Array.isArray(cur.formats)) fix.formats = DEFAULT_FORMATS.map((x) => ({ ...x }))
  if (Object.keys(fix).length) put('settings', { ...cur, ...fix, schemaVersion: SCHEMA_VERSION })
  migrateIdeas()
}

/** The Ideas inbox was removed: old ideas become Instagram posts at the Idea stage, not scheduled. */
export function migrateIdeas() {
  for (const i of all('items').filter((x) => x.kind === 'idea')) {
    const text = (i.text || '').trim()
    const title = firstLine(text)
    put('items', { id: i.id, kind: 'ig', title, stage: 'idea', notes: text !== title ? text : '', hook: '', script: '', caption: '', refs: [], finalUrl: '',
      week: null, slot: null, date: null, scriptDate: null, filmDate: null, editDate: null, pillar: null, format: formats()[0]?.id ?? null, postedAt: null, createdAt: i.createdAt, updatedAt: '' })
  }
}

/** Slots in weekday order. */
export const slots = (): Slot[] => [...(settings().slots || DEFAULT_SLOTS)].sort((a, b) => a.day - b.day)
export const slotById = (id?: string | null) => (id ? (settings().slots || []).find((s) => s.id === id) : undefined)
export const pillars = (): Tag[] => settings().pillars || []
export const formats = (): Tag[] => settings().formats || []
export const pillarName = (id?: string | null) => pillars().find((p) => p.id === id)?.name
export const formatName = (id?: string | null) => formats().find((p) => p.id === id)?.name

function saveSettings(p: Partial<ReturnType<typeof settings>>) { put('settings', { ...settings(), ...p }) }

export function saveSlot(slot: Slot) {
  const list = settings().slots || []
  const i = list.findIndex((s) => s.id === slot.id)
  saveSettings({ slots: i < 0 ? [...list, slot] : list.map((s) => (s.id === slot.id ? slot : s)) })
  // keep planned dates of open posts in sync with the slot's day
  for (const it of all('items')) {
    if (it.kind === 'ig' && it.slot === slot.id && it.week && it.stage !== 'done' && it.date !== addDays(it.week, slot.day)) patch('items', it.id, { date: addDays(it.week, slot.day) })
  }
}
export function newSlot(): Slot {
  const used = new Set((settings().slots || []).map((s) => s.day))
  const day = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 0
  return { id: uid(), name: '', day, tint: 'peach', hint: '', pillar: null, format: formats()[0]?.id || null }
}
/** Remove a slot. Unposted posts in it stay, just unscheduled from the slot (their date is kept). */
export function deleteSlot(id: string) {
  saveSettings({ slots: (settings().slots || []).filter((s) => s.id !== id) })
  for (const it of all('items')) if (it.kind === 'ig' && it.slot === id && it.stage !== 'done') patch('items', it.id, { slot: null })
}

export function saveTag(kind: 'pillars' | 'formats', tag: Tag) {
  const list = settings()[kind] || []
  const i = list.findIndex((t) => t.id === tag.id)
  saveSettings({ [kind]: i < 0 ? [...list, tag] : list.map((t) => (t.id === tag.id ? tag : t)) } as any)
}
export function deleteTag(kind: 'pillars' | 'formats', id: string) {
  saveSettings({ [kind]: (settings()[kind] || []).filter((t) => t.id !== id), slots: (settings().slots || []).map((s) => (kind === 'pillars' ? (s.pillar === id ? { ...s, pillar: null } : s) : (s.format === id ? { ...s, format: null } : s))) } as any)
  const field = kind === 'pillars' ? 'pillar' : 'format'
  for (const it of all('items')) if ((it as any)[field] === id) patch('items', it.id, { [field]: null } as any)
}
export function tagUsage(kind: 'pillars' | 'formats', id: string) {
  const field = kind === 'pillars' ? 'pillar' : 'format'
  return all('items').filter((i) => (i as any)[field] === id).length
}

// ---------- time ----------
export const today = () => todayKey(tz())
export const thisWeek = () => weekStart(today())

// ---------- Instagram ----------
export const igItems = () => all('items').filter((i) => i.kind === 'ig')
export const isLate = (i: Item, t = today()) => i.kind === 'ig' && i.stage !== 'done' && !!i.date && i.date < t

export function weekItems(week: string): Item[] {
  return igItems().filter((i) => i.week === week)
}
export function slotItem(week: string, slot: string): Item | undefined {
  const xs = weekItems(week).filter((i) => i.slot === slot)
  return xs.find((i) => i.stage !== 'done') || xs[0]
}
/** Posts planned in the week that are not tied to a current slot. */
export function extraItems(week: string): Item[] {
  const ids = new Set(slots().map((s) => s.id))
  return weekItems(week).filter((i) => !i.slot || !ids.has(i.slot)).sort(byDate)
}
export function weekProgress(week: string) {
  const ss = slots()
  const posted = ss.filter((s) => slotItem(week, s.id)?.stage === 'done').length + extraItems(week).filter((i) => i.stage === 'done').length
  return { posted, total: ss.length + extraItems(week).length }
}

const byDate = (a: Item, b: Item) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : (a.createdAt < b.createdAt ? -1 : 1)

export interface NewPost { title: string; week?: string | null; slot?: string | null; notes?: string }
export function createPost({ title, week = null, slot = null, notes = '' }: NewPost): Item {
  const s = slotById(slot)
  const it = put('items', {
    id: uid(), kind: 'ig', title: title.trim(), stage: 'idea', refs: [], finalUrl: '',
    week: s && week ? week : null, slot: s && week ? s.id : null, date: s && week ? addDays(week, s.day) : null, scriptDate: null, filmDate: null, editDate: null,
    hook: '', script: '', caption: '', notes,
    pillar: s?.pillar ?? null, format: s?.format ?? formats()[0]?.id ?? null, postedAt: null, createdAt: '', updatedAt: '',
  })
  autoPlan(it.id)
  return get('items', it.id)!
}

/** Put a post into a slot of a week (or unschedule with slot = null). */
export function schedule(id: string, week: string | null, slot: string | null) {
  const s = slotById(slot)
  if (!s || !week) { patch('items', id, { week: null, slot: null, date: null }); return }
  const it = get('items', id)
  patch('items', id, { week, slot: s.id, date: addDays(week, s.day), pillar: it?.pillar ?? s.pillar ?? null })
  autoPlan(id)
}
/** The slot a post date belongs to: the free slot on that weekday, else the current slot if it is free that week. */
function slotForDate(it: Item, date: string): string | null {
  const week = weekStart(date)
  const match = slots().find((s) => s.day === weekdayIndex(date) && isSlotFree(week, s.id, it.id))
  if (match) return match.id
  if (it.slot && slotById(it.slot) && (week === it.week || isSlotFree(week, it.slot, it.id))) return it.slot
  return null
}
/** Set the post date by hand; the slot follows the weekday when one fits. */
function applyPostDate(id: string, date: string | null) {
  const it = get('items', id); if (!it) return
  if (!date) { patch('items', id, { date: null, week: null, slot: null }); return }
  patch('items', id, { date, week: weekStart(date), slot: slotForDate(it, date) })
}
export function isSlotFree(week: string, slot: string, exceptId?: string) {
  const it = slotItem(week, slot)
  return !it || it.id === exceptId
}

export function setStage(id: string, stage: Stage) {
  patch('items', id, { stage, postedAt: stage === 'done' ? get('items', id)?.postedAt || nowIso() : null })
}
export function advance(id: string): Stage | undefined {
  const it = get('items', id); if (!it) return
  const i = stageIndex(it.stage)
  if (i < STAGES.length - 1) { setStage(id, STAGES[i + 1].id); return STAGES[i + 1].id }
}

export function duplicatePost(id: string): Item | undefined {
  const it = get('items', id); if (!it) return
  return put('items', { ...it, id: uid(), title: (it.title || '') + ' (copy)', stage: 'idea', week: null, slot: null, date: null, scriptDate: null, filmDate: null, editDate: null, finalUrl: '', postedAt: null, createdAt: '', updatedAt: '' })
}

export type Group = { key: string; label: string; items: Item[] }
/** Open posts grouped for the Instagram list. */
export function openGroups(t = today()): Group[] {
  const wk = weekStart(t), next = addDays(wk, 7)
  const open = igItems().filter((i) => i.stage !== 'done').sort(byDate)
  const g: Group[] = [
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
export type DateField = 'scriptDate' | 'filmDate' | 'editDate' | 'date'
export interface TaskDef { key: 'script' | 'film' | 'edit' | 'post'; field: DateField; label: string; todo: string; done: string; idx: number }
/** idx = the stage index this task finishes; finishing it moves the post to the next stage. */
export const TASKS: TaskDef[] = [
  { key: 'script', field: 'scriptDate', label: 'Script', todo: 'Write the script', done: 'Script done', idx: 1 },
  { key: 'film', field: 'filmDate', label: 'Film', todo: 'Film it', done: 'Filmed', idx: 2 },
  { key: 'edit', field: 'editDate', label: 'Edit', todo: 'Edit it', done: 'Edit done', idx: 3 },
  { key: 'post', field: 'date', label: 'Post', todo: 'Post it', done: 'Posted', idx: 4 },
]
export const taskOf = (k: TaskDef['key']) => TASKS.find((t) => t.key === k)!
export const isTaskDone = (it: Item, t: TaskDef) => stageIndex(it.stage) > t.idx

/** Finish a task: the post moves past that stage. Returns the previous stage for undo. */
export function completeTask(id: string, t: TaskDef): Stage | undefined {
  const it = get('items', id); if (!it || isTaskDone(it, t)) return
  const prev = it.stage || 'idea'
  setStage(id, STAGES[t.idx + 1].id)
  return prev
}

/** Allowed range for a stage date: after every earlier stage date, before every later one. */
export function dateBounds(it: Item, field: DateField): { min?: string; max?: string } {
  const i = TASKS.findIndex((t) => t.field === field)
  const before = TASKS.slice(0, i).map((t) => it[t.field]).filter(Boolean) as string[]
  const after = TASKS.slice(i + 1).map((t) => it[t.field]).filter(Boolean) as string[]
  return { min: before.length ? before.sort()[before.length - 1] : undefined, max: after.length ? after.sort()[0] : undefined }
}

/** Set a stage date. Refuses dates that break script <= film <= edit <= post and says why. */
export function setStageDate(id: string, field: DateField, value: string | null): { ok: true } | { ok: false; error: string } {
  const it = get('items', id); if (!it) return { ok: false, error: 'Post not found' }
  if (value) {
    const t = TASKS.find((x) => x.field === field)!
    const i = TASKS.indexOf(t)
    for (const e of TASKS.slice(0, i)) { const d = it[e.field]; if (d && d > value) return { ok: false, error: `${t.label} can't be before ${e.label} (${fmtDay(d)}).` } }
    for (const l of TASKS.slice(i + 1)) { const d = it[l.field]; if (d && d < value) return { ok: false, error: `${t.label} can't be after ${l.label} (${fmtDay(d)}).` } }
  }
  if (field === 'date') applyPostDate(id, value)
  else patch('items', id, { [field]: value } as any)
  return { ok: true }
}

/** Dates that are out of order (can happen when a post is moved to an earlier slot). */
export function dateConflicts(it: Item): string[] {
  const out: string[] = []
  for (let i = 0; i < TASKS.length; i++) for (let j = i + 1; j < TASKS.length; j++) {
    const a = it[TASKS[i].field], b = it[TASKS[j].field]
    if (a && b && a > b) out.push(`${TASKS[i].label} (${fmtDay(a)}) is after ${TASKS[j].label} (${fmtDay(b)})`)
  }
  return out
}

/** Quiet default for new or moved posts: fill only EMPTY script/film/edit dates at 3/2/1 days before the post,
 *  skip any that would land in the past, never break the order, never touch stages already done. */
export function autoPlan(id: string, t = today()) {
  const it = get('items', id); if (!it || !it.date) return
  const p: Partial<Item> = {}
  let next = it.date
  for (const [field, off] of [['editDate', 1], ['filmDate', 2], ['scriptDate', 3]] as [DateField, number][]) {
    const task = TASKS.find((x) => x.field === field)!
    const cur = it[field]
    if (cur) { next = cur < next ? cur : next; continue }
    if (isTaskDone(it, task)) continue
    const d = addDays(it.date, -off)
    if (d < t || d > next) continue
    ;(p as any)[field] = d
    next = d
  }
  if (Object.keys(p).length) patch('items', id, p)
}

/** Fill script/film/edit backwards from the post date (3, 2, 1 days before), never before today,
 *  skipping stages already done and keeping dates that already fit. */
export function planBackwards(id: string, t = today()) {
  const it = get('items', id); if (!it || !it.date) return
  const p: Partial<Item> = {}
  let next = it.date
  for (const [field, off] of [['editDate', 1], ['filmDate', 2], ['scriptDate', 3]] as [DateField, number][]) {
    const task = TASKS.find((x) => x.field === field)!
    const cur = it[field]
    if (isTaskDone(it, task)) { if (cur && cur > next) (p as any)[field] = next; else if (cur) next = cur; continue }
    if (cur && cur <= next && cur >= t) { next = cur; continue }
    let d = addDays(it.date, -off)
    if (d < t) d = t
    if (d > next) d = next
    ;(p as any)[field] = d
    next = d
  }
  if (Object.keys(p).length) patch('items', id, p)
}

export interface DayTask { it: Item; task: TaskDef; date: string; done: boolean }
function allTasks(): DayTask[] {
  const out: DayTask[] = []
  for (const it of igItems()) for (const task of TASKS) { const d = it[task.field]; if (d) out.push({ it, task, date: d, done: isTaskDone(it, task) }) }
  return out
}
const taskSort = (a: DayTask, b: DayTask) => (a.done === b.done ? 0 : a.done ? 1 : -1) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.task.idx - b.task.idx || ((a.it.title || '') < (b.it.title || '') ? -1 : 1)
/** Everything dated on a day: script, film, edit and post tasks. Undone first. */
export const tasksOn = (d: string) => allTasks().filter((x) => x.date === d).sort(taskSort)
export const tasksBetween = (a: string, b: string) => allTasks().filter((x) => x.date >= a && x.date <= b)
/** Dated tasks before today that are not done. */
export const overdueTasks = (t = today()) => allTasks().filter((x) => x.date < t && !x.done).sort(taskSort)
/** The next undone dated task after a day. */
export const nextTaskAfter = (t = today()) => allTasks().filter((x) => x.date > t && !x.done).sort(taskSort)[0]
/** The next undone dated task of one post (for cards). */
export function nextTaskOf(it: Item): DayTask | undefined {
  return TASKS.filter((t) => !isTaskDone(it, t) && it[t.field]).map((t) => ({ it, task: t, date: it[t.field] as string, done: false }))[0]
}

// ---------- Threads ----------
export const THREADS_LIMIT = 500
const threadKey = (t: Item) => (t.date ? t.date + ' ' + (t.time || '99:99') : '9999') + t.createdAt
/** Drafts: scheduled ones first by date and time, then the rest newest first. */
export const threadDrafts = () => {
  const d = all('items').filter((i) => i.kind === 'thread' && !i.postedAt)
  return [...d.filter((x) => x.date).sort((a, b) => (threadKey(a) < threadKey(b) ? -1 : 1)), ...d.filter((x) => !x.date).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))]
}
export const threadPosted = () => all('items').filter((i) => i.kind === 'thread' && i.postedAt).sort((a, b) => (b.postedAt! > a.postedAt! ? 1 : -1))
export function addThread(text: string, date: string | null = null, time: string | null = null): Item | null {
  if (!text.trim()) return null
  return put('items', { id: uid(), kind: 'thread', text: text.trim(), date, time: date ? time : null, postedAt: null, createdAt: '', updatedAt: '' })
}
export function scheduleThread(id: string, date: string | null, time: string | null) {
  patch('items', id, { date, time: date ? time : null })
}
export const markPosted = (id: string, posted: boolean) => patch('items', id, { postedAt: posted ? nowIso() : null })
/** Threads planned for a day (posted ones last). */
export const threadsOn = (d: string) => all('items').filter((i) => i.kind === 'thread' && i.date === d).sort((a, b) => (!!a.postedAt === !!b.postedAt ? (threadKey(a) < threadKey(b) ? -1 : 1) : a.postedAt ? 1 : -1))
export const overdueThreads = (t = today()) => all('items').filter((i) => i.kind === 'thread' && !i.postedAt && i.date && i.date < t).sort((a, b) => (threadKey(a) < threadKey(b) ? -1 : 1))

// ---------- Resources ----------
export const links = () => all('items').filter((i) => i.kind === 'link').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
export function addLink(name: string, url: string): Item | null {
  const u = normalizeUrl(url); if (!u) return null
  return put('items', { id: uid(), kind: 'link', title: name.trim() || linkLabel(u), url: u, createdAt: '', updatedAt: '' })
}
export function updateLink(id: string, name: string, url: string): boolean {
  const u = normalizeUrl(url); if (!u) return false
  patch('items', id, { title: name.trim() || linkLabel(u), url: u }); return true
}

export const firstLine = (t = '') => {
  const l = t.trim().split('\n')[0].trim()
  return l.length > 80 ? l.slice(0, 77).trimEnd() + '…' : l
}

// ---------- links ----------
/** Accepts "instagram.com/reel/x" or a full URL; returns a safe http(s) URL or null. */
export function normalizeUrl(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.toString() : null } catch { return null }
}
const SITES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'Pinterest'], [/(^|\.)drive\.google\.com$/, 'Google Drive'], [/(^|\.)docs\.google\.com$/, 'Google Docs'],
  [/(^|\.)(photos\.app\.goo\.gl|photos\.google\.com)$/, 'Google Photos'], [/(^|\.)icloud\.com$/, 'iCloud'], [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)frame\.io$/, 'Frame.io'], [/(^|\.)(threads\.net|threads\.com)$/, 'Threads'], [/(^|\.)(x\.com|twitter\.com)$/, 'X'], [/(^|\.)dropbox\.com$/, 'Dropbox'],
]
export function linkLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    for (const [re, name] of SITES) if (re.test(h)) return name
    return h
  } catch { return url }
}
export function addRef(id: string, url: string, note = '') {
  const it = get('items', id); if (!it) return null
  const u = normalizeUrl(url); if (!u) return null
  const ref = { id: uid(), url: u, note: note.trim() }
  patch('items', id, { refs: [...(it.refs || []), ref] })
  return ref
}
export function updateRef(id: string, refId: string, p: { note?: string }) {
  const it = get('items', id); if (!it) return
  patch('items', id, { refs: (it.refs || []).map((r) => (r.id === refId ? { ...r, ...p } : r)) })
}
export function removeRef(id: string, refId: string) {
  const it = get('items', id); if (!it) return
  patch('items', id, { refs: (it.refs || []).filter((r) => r.id !== refId) })
}

// ---------- notifications ----------
export const DEFAULT_NOTIFY = { morning: true, morningTime: '08:00', postReminder: true, postTime: '19:00' }
export const notifyPrefs = () => ({ ...DEFAULT_NOTIFY, ...(settings().notify || {}) })
export function setNotify(p: Partial<typeof DEFAULT_NOTIFY>) { put('settings', { ...settings(), notify: { ...notifyPrefs(), ...p } }) }
