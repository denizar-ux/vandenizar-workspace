// Domain layer: weekly Instagram slots (customisable), Threads drafts, one idea inbox.
import { all, get, put, patch, remove, uid, nowIso, tz, S, settings, defaultSettings } from './store'
import { todayKey, weekStart, addDays } from './time'
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

export interface NewPost { title: string; week?: string | null; slot?: string | null; fromIdea?: Item }
export function createPost({ title, week = null, slot = null, fromIdea }: NewPost): Item {
  const s = slotById(slot)
  const it = put('items', {
    id: uid(), kind: 'ig', title: title.trim(), stage: 'idea',
    week: s && week ? week : null, slot: s && week ? s.id : null, date: s && week ? addDays(week, s.day) : null, filmDate: null,
    hook: '', script: '', caption: '', notes: fromIdea?.text && fromIdea.text.trim() !== title.trim() ? fromIdea.text.trim() : '',
    pillar: s?.pillar ?? null, format: s?.format ?? formats()[0]?.id ?? null, postedAt: null, createdAt: '', updatedAt: '',
  })
  if (fromIdea) remove('items', fromIdea.id)
  return it
}

/** Put a post into a slot of a week (or unschedule with slot = null). */
export function schedule(id: string, week: string | null, slot: string | null) {
  const s = slotById(slot)
  if (!s || !week) { patch('items', id, { week: null, slot: null, date: null }); return }
  const it = get('items', id)
  patch('items', id, { week, slot: s.id, date: addDays(week, s.day), pillar: it?.pillar ?? s.pillar ?? null })
}
/** Set a custom post date; the post keeps its slot only if the date stays in the slot's week. */
export function setPostDate(id: string, date: string | null) {
  const it = get('items', id); if (!it) return
  if (!date) { patch('items', id, { date: null, week: null, slot: null }); return }
  const week = weekStart(date)
  const keep = !!it.slot && (week === it.week || isSlotFree(week, it.slot, id))
  patch('items', id, { date, week, slot: keep ? it.slot : null })
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

/** Send a post back to the idea inbox so nothing is lost. */
export function backToIdeas(id: string): Item | undefined {
  const it = get('items', id); if (!it) return
  const text = [it.title, it.hook, it.script, it.notes].filter((x) => x && x.trim()).join('\n\n')
  const idea = text.trim() ? put('items', { id: uid(), kind: 'idea', text, createdAt: '', updatedAt: '' }) : undefined
  remove('items', id)
  return idea
}

export function duplicatePost(id: string): Item | undefined {
  const it = get('items', id); if (!it) return
  return put('items', { ...it, id: uid(), title: (it.title || '') + ' (copy)', stage: 'idea', week: null, slot: null, date: null, filmDate: null, postedAt: null, createdAt: '', updatedAt: '' })
}

export type Group = { key: string; label: string; items: Item[] }
/** Open posts grouped for the Instagram list. */
export function openGroups(t = today()): Group[] {
  const wk = weekStart(t), next = addDays(wk, 7)
  const open = igItems().filter((i) => i.stage !== 'done').sort(byDate)
  const g: Group[] = [
    { key: 'late', label: 'Late', items: open.filter((i) => isLate(i, t)) },
    { key: 'week', label: 'This week', items: open.filter((i) => !isLate(i, t) && i.date && i.date < next) },
    { key: 'next', label: 'Next week', items: open.filter((i) => i.date && i.date >= next && i.date < addDays(next, 7)) },
    { key: 'later', label: 'Later', items: open.filter((i) => i.date && i.date >= addDays(next, 7)) },
    { key: 'none', label: 'Not scheduled', items: open.filter((i) => !i.date) },
  ]
  return g.filter((x) => x.items.length)
}
export const postedItems = () => igItems().filter((i) => i.stage === 'done').sort((a, b) => ((b.postedAt || b.date || '') > (a.postedAt || a.date || '') ? 1 : -1))

// ---------- Today: the one thing to do next ----------
export type UpNext =
  | { type: 'late' | 'film' | 'post' | 'next'; item: Item; more: number }
  | { type: 'empty'; slot: Slot; date: string; week: string }
  | { type: 'clear'; posted: number }

export function upNext(t = today()): UpNext {
  const open = igItems().filter((i) => i.stage !== 'done')
  const late = open.filter((i) => isLate(i, t)).sort(byDate)
  if (late.length) return { type: 'late', item: late[0], more: late.length - 1 }
  const film = open.filter((i) => i.filmDate === t && stageIndex(i.stage) <= stageIndex('film')).sort(byDate)
  if (film.length) return { type: 'film', item: film[0], more: 0 }
  const post = open.filter((i) => i.date === t).sort(byDate)
  if (post.length) return { type: 'post', item: post[0], more: 0 }
  const wk = weekStart(t), end = addDays(wk, 6)
  const upcoming = open.filter((i) => i.date && i.date > t && i.date <= end).sort(byDate)
  // an empty slot that comes before the next planned post needs attention first
  const empty = slots().map((s) => ({ s, date: addDays(wk, s.day) })).filter((x) => x.date >= t && !slotItem(wk, x.s.id))
  if (empty.length && (!upcoming.length || empty[0].date <= upcoming[0].date!)) return { type: 'empty', slot: empty[0].s, date: empty[0].date, week: wk }
  if (upcoming.length) return { type: 'next', item: upcoming[0], more: 0 }
  return { type: 'clear', posted: weekProgress(wk).posted }
}

// ---------- Threads ----------
export const THREADS_LIMIT = 500
export const threadDrafts = () => all('items').filter((i) => i.kind === 'thread' && !i.postedAt).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
export const threadPosted = () => all('items').filter((i) => i.kind === 'thread' && i.postedAt).sort((a, b) => (b.postedAt! > a.postedAt! ? 1 : -1))
export function addThread(text: string): Item | null {
  if (!text.trim()) return null
  return put('items', { id: uid(), kind: 'thread', text: text.trim(), postedAt: null, createdAt: '', updatedAt: '' })
}
export const markPosted = (id: string, posted: boolean) => patch('items', id, { postedAt: posted ? nowIso() : null })

// ---------- Ideas ----------
export const ideas = () => all('items').filter((i) => i.kind === 'idea').sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
export function addIdea(text: string): Item | null {
  if (!text.trim()) return null
  return put('items', { id: uid(), kind: 'idea', text: text.trim(), createdAt: '', updatedAt: '' })
}
export function ideaToThread(id: string): Item | null {
  const it = get('items', id); if (!it) return null
  const t = addThread(it.text || '')
  remove('items', id)
  return t
}

export const firstLine = (t = '') => {
  const l = t.trim().split('\n')[0].trim()
  return l.length > 80 ? l.slice(0, 77).trimEnd() + '…' : l
}
