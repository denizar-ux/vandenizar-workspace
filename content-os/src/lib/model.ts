// Small domain layer: four Instagram slots per week, Threads drafts, an idea inbox.
import { all, get, put, patch, remove, uid, nowIso, tz, S, defaultSettings } from './store'
import { todayKey, weekStart, addDays } from './time'
import type { Item, SlotId, Stage } from './types'

export interface SlotMeta { id: SlotId; name: string; hint: string; day: number }
export const SLOTS: SlotMeta[] = [
  { id: 'work', name: 'Work post', hint: 'Senin pagi. BTS, proses, atau hasil kerja.', day: 0 },
  { id: 'shot', name: 'Shot vs Setup', hint: 'Hasil akhir dan cara bikinnya.', day: 2 },
  { id: 'story', name: 'Storytelling', hint: 'Satu post yang lebih niat. VO atau talking head.', day: 4 },
  { id: 'desk', name: 'Desk', hint: 'Yang ringan. Setup meja, suasana kerja.', day: 5 },
]
export const slotMeta = (id?: SlotId | null) => SLOTS.find((s) => s.id === id)

export const STAGES: { id: Stage; label: string; next: string }[] = [
  { id: 'idea', label: 'Ide', next: 'Mulai script' },
  { id: 'script', label: 'Script', next: 'Script beres' },
  { id: 'film', label: 'Rekam', next: 'Udah direkam' },
  { id: 'edit', label: 'Edit', next: 'Edit beres' },
  { id: 'ready', label: 'Siap', next: 'Udah upload' },
  { id: 'done', label: 'Upload', next: '' },
]
export const stageIndex = (s?: Stage) => Math.max(0, STAGES.findIndex((x) => x.id === (s || 'idea')))

export function ensureDefaults() {
  if (!S.settings.get('settings')) put('settings', defaultSettings())
}

export const thisWeek = () => weekStart(todayKey(tz()))

// ---------- Instagram ----------
export function weekItems(week: string): Item[] {
  return all('items').filter((i) => i.kind === 'ig' && i.week === week)
}
export function slotItem(week: string, slot: SlotId): Item | undefined {
  return weekItems(week).find((i) => i.slot === slot)
}
/** Unfinished post from an earlier week in this slot, so it can be carried over. */
export function leftover(week: string, slot: SlotId): Item | undefined {
  return all('items').filter((i) => i.kind === 'ig' && i.slot === slot && i.week && i.week < week && i.stage !== 'done')
    .sort((a, b) => (b.week! > a.week! ? 1 : -1))[0]
}

export function fillSlot(week: string, slot: SlotId, title: string, fromIdea?: Item): Item {
  const meta = slotMeta(slot)!
  const it = put('items', {
    id: uid(), kind: 'ig', week, slot, title: title.trim(), stage: 'idea', script: fromIdea?.text && fromIdea.text !== title ? fromIdea.text : '',
    caption: '', notes: '', date: addDays(week, meta.day), postedAt: null, createdAt: '', updatedAt: '',
  })
  if (fromIdea) remove('items', fromIdea.id)
  return it
}

export function moveToWeek(id: string, week: string) {
  const it = get('items', id); if (!it || !it.slot) return
  const meta = slotMeta(it.slot)!
  patch('items', id, { week, date: addDays(week, meta.day) })
}

export function setStage(id: string, stage: Stage) {
  patch('items', id, { stage, postedAt: stage === 'done' ? get('items', id)?.postedAt || nowIso() : null })
}
export function advance(id: string) {
  const it = get('items', id); if (!it) return
  const i = stageIndex(it.stage)
  if (i < STAGES.length - 1) setStage(id, STAGES[i + 1].id)
}

/** Clear a slot: the post goes back to the idea inbox so nothing is lost. */
export function clearSlot(id: string) {
  const it = get('items', id); if (!it) return
  const text = [it.title, it.script].filter((x) => x && x.trim()).join('\n\n')
  if (text.trim()) put('items', { id: uid(), kind: 'idea', text, createdAt: '', updatedAt: '' })
  remove('items', id)
}

// ---------- Threads ----------
export const threadDrafts = () => all('items').filter((i) => i.kind === 'thread' && !i.postedAt).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
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
  return l.length > 70 ? l.slice(0, 67).trimEnd() + '…' : l
}
