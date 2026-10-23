// Domain logic. Everything reads from / writes to the store; derived values are never stored.
import { S, all, get, put, patch, remove, uid, nowIso, settings, tz, defaultSettings } from './store'
import type {
  Content, Task, Idea, ScriptSection, ThreadPost, Template, Format, Channel, Activity, Lifecycle,
  BatchSession, Resource, ReadinessItem, Shot, Status, Review, Coll,
} from './types'
import { BUILTIN_TEMPLATES, READINESS_BY_FORMAT } from './templates'
import { todayKey, dateKey, addDays } from './time'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

// ---------------- defaults ----------------
export function ensureDefaults() {
  if (!S.settings.get('settings')) put('settings', defaultSettings())
  for (const t of BUILTIN_TEMPLATES) if (!S.templates.has(t.id)) put('templates', { ...t }, { touch: false })
}

// ---------------- queries ----------------
export const isLive = (x: { lifecycle: Lifecycle }) => x.lifecycle === 'active'

export function sectionsOf(contentId: string): ScriptSection[] {
  return all('sections').filter((s) => s.contentId === contentId).sort(byOrder)
}
export function postsOf(contentId: string): ThreadPost[] {
  return all('posts').filter((p) => p.contentId === contentId).sort(byOrder)
}
export function tasksOf(contentId: string): Task[] {
  return all('tasks').filter((t) => t.contentId === contentId && !t.parentTaskId).sort(byOrder)
}
export function subtasksOf(taskId: string): Task[] {
  return all('tasks').filter((t) => t.parentTaskId === taskId).sort(byOrder)
}
export function shotsOf(contentId: string): Shot[] {
  return all('shots').filter((s) => s.contentId === contentId).sort(byOrder)
}
export function readinessOf(contentId: string): ReadinessItem[] {
  return all('readiness').filter((r) => r.contentId === contentId).sort(byOrder)
}
export function resourcesOf(contentId: string): Resource[] {
  return all('links').filter((l) => l.contentId === contentId)
    .map((l) => get('resources', l.resourceId)).filter((r): r is Resource => !!r && r.lifecycle !== 'deleted')
}
export function contentsUsing(resourceId: string): Content[] {
  return all('links').filter((l) => l.resourceId === resourceId).map((l) => get('contents', l.contentId)).filter((c): c is Content => !!c)
}
export function reviewOf(contentId: string): Review | undefined {
  return all('reviews').find((r) => r.contentId === contentId)
}
export function derivativesOf(contentId: string): Content[] {
  return all('contents').filter((c) => (c.sourceContentId === contentId || c.variantOfId === contentId) && c.lifecycle !== 'deleted')
}

/** Is the task visible (task lifecycle + parent content lifecycle)? */
export function taskLive(t: Task): boolean {
  if (t.lifecycle !== 'active') return false
  if (t.contentId) { const c = get('contents', t.contentId); return !!c && c.lifecycle === 'active' }
  return true
}

export function progress(contentId: string) {
  const ts = tasksOf(contentId)
  return { done: ts.filter((t) => t.status === 'done').length, total: ts.length }
}

/** Effective work block: batch schedule wins, subtasks inherit the parent block. */
export function effectiveSchedule(t: Task): { start: string; end: string; batch?: BatchSession } | null {
  const base = t.parentTaskId ? get('tasks', t.parentTaskId) || t : t
  if (base.batchId) {
    const b = get('batches', base.batchId)
    if (b) return { start: b.startAt, end: b.endAt, batch: b }
  }
  if (base.plannedStart) {
    const end = base.plannedEnd || new Date(new Date(base.plannedStart).getTime() + (base.estimateMinutes || 30) * 60000).toISOString()
    return { start: base.plannedStart, end }
  }
  return null
}

export function nextTask(contentId: string): Task | undefined {
  return tasksOf(contentId).find((t) => t.status !== 'done')
}

/** Task is overdue: its due date ended (date-only deadline ends at local midnight) or its work block ended. */
export function isTaskOverdue(t: Task, now = new Date()): boolean {
  if (t.status === 'done') return false
  const z = tz()
  if (t.dueDate && t.dueDate < todayKey(z, now)) return true
  const sch = effectiveSchedule(t)
  if (!t.dueDate && sch && new Date(sch.end).getTime() < now.getTime()) return true
  return false
}

export function isTaskToday(t: Task, now = new Date()): boolean {
  const z = tz(), today = todayKey(z, now)
  if (t.dueDate === today) return true
  const sch = effectiveSchedule(t)
  return !!sch && dateKey(sch.start, z) === today
}

export type TimeFilter = 'all' | 15 | 30 | 60
export type ActFilter = 'all' | 'write' | 'record' | 'edit'

export interface NextAction {
  content?: Content
  task?: Task
  label: string
  estimate?: number | null
  reason: 'pinned' | 'overdue' | 'today' | 'recent' | 'write'
}

function taskMatches(t: Task, tf: TimeFilter, af: ActFilter) {
  if (af !== 'all' && t.activity !== af) return false
  if (tf === 'all') return true
  return t.estimateMinutes != null && t.estimateMinutes <= tf
}

function dueSortKey(t: Task): number {
  const sch = effectiveSchedule(t)
  const times: number[] = []
  if (t.dueDate) times.push(Date.parse(t.dueDate + 'T23:59:59Z'))
  if (sch) times.push(Date.parse(sch.start))
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER
}

const cmpTasks = (a: Task, b: Task) => dueSortKey(a) - dueSortKey(b) || (b.updatedAt > a.updatedAt ? 1 : -1)

export function candidateTasks(): Task[] {
  return all('tasks').filter((t) => !t.parentTaskId && t.status !== 'done' && taskLive(t) && (!t.contentId || get('contents', t.contentId)!.status !== 'published'))
}

export function pickNextAction(tf: TimeFilter, af: ActFilter, now = new Date()): NextAction | null {
  const st = settings()
  const fromContent = (c: Content, reason: NextAction['reason']): NextAction | null => {
    const t = tasksOf(c.id).find((x) => x.status !== 'done' && taskMatches(x, tf, af))
    if (t) return { content: c, task: t, label: t.title, estimate: t.estimateMinutes, reason }
    if (tasksOf(c.id).length === 0 && tf === 'all' && (af === 'all' || af === 'write'))
      return { content: c, label: c.channel === 'threads' ? 'Lanjut nulis thread' : 'Lanjut nulis script', reason: 'write' }
    return null
  }
  // 1. pinned
  const pinned = get('contents', st.pinnedContentId)
  if (pinned && pinned.lifecycle === 'active' && pinned.status !== 'published') {
    const r = fromContent(pinned, 'pinned'); if (r) return r
  }
  const tasks = candidateTasks().filter((t) => taskMatches(t, tf, af))
  const wrap = (t: Task, reason: NextAction['reason']): NextAction => ({ content: get('contents', t.contentId), task: t, label: t.title, estimate: t.estimateMinutes, reason })
  // 2. overdue
  const overdue = tasks.filter((t) => isTaskOverdue(t, now)).sort(cmpTasks)
  if (overdue[0]) return wrap(overdue[0], 'overdue')
  // 3. today
  const today = tasks.filter((t) => isTaskToday(t, now)).sort(cmpTasks)
  if (today[0]) return wrap(today[0], 'today')
  // 4. in-progress content, most recently edited
  const active = all('contents').filter((c) => c.lifecycle === 'active' && c.status !== 'published')
  const ordered = [
    ...active.filter((c) => c.status === 'in_progress').sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)),
    ...active.filter((c) => c.status !== 'in_progress').sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)),
  ]
  for (const c of ordered) { const r = fromContent(c, c.status === 'in_progress' ? 'recent' : 'write'); if (r) return r }
  // standalone tasks without date
  const loose = tasks.filter((t) => !t.contentId).sort(cmpTasks)
  if (loose[0]) return wrap(loose[0], 'recent')
  return null
}

export interface Attention { kind: 'overdue' | 'missed' | 'risk'; label: string; sub: string; contentId?: string; taskId?: string }

export function attentionItems(now = new Date()): Attention[] {
  const out: Attention[] = []
  for (const t of candidateTasks().filter((t) => isTaskOverdue(t, now)).sort(cmpTasks)) {
    const c = get('contents', t.contentId)
    out.push({ kind: 'overdue', label: t.title, sub: (c ? c.title + ' · ' : '') + 'lewat jadwal', contentId: c?.id, taskId: t.id })
  }
  for (const c of all('contents')) {
    if (c.lifecycle !== 'active' || c.status === 'published' || !c.plannedPublishAt) continue
    if (Date.parse(c.plannedPublishAt) < now.getTime()) out.push({ kind: 'missed', label: c.title, sub: 'Rencana posting lewat, belum ditandai terbit', contentId: c.id })
    else if (postAtRisk(c).length) out.push({ kind: 'risk', label: c.title, sub: 'Ada tugas produksi dijadwalkan setelah rencana posting', contentId: c.id, taskId: postAtRisk(c)[0].id })
  }
  return out
}

/** Unfinished tasks whose work block or deadline lands after the content's planned post. */
export function postAtRisk(c: Content): Task[] {
  if (!c.plannedPublishAt || c.status === 'published') return []
  const post = Date.parse(c.plannedPublishAt)
  const z = tz()
  return tasksOf(c.id).filter((t) => {
    if (t.status === 'done') return false
    const sch = effectiveSchedule(t)
    if (sch && Date.parse(sch.end) > post) return true
    if (t.dueDate && t.dueDate > dateKey(c.plannedPublishAt!, z)) return true
    return false
  })
}

// ---------------- builders ----------------
export function templatesFor(channel: Channel, format?: Format | null): Template[] {
  return all('templates').filter((t) => t.lifecycle === 'active' && t.channel === channel && (!format || t.compatibleFormats.includes(format)))
    .sort((a, b) => (a.builtin === b.builtin ? a.name.localeCompare(b.name) : a.builtin ? -1 : 1))
}

function addSection(contentId: string, key: string, label: string, body = '', order = 0, note?: string) {
  return put('sections', { id: uid(), contentId, key, label, body, note, order, createdAt: '', updatedAt: '' })
}

function makeStructure(c: Content, tpl: Template | undefined) {
  if (c.format === 'carousel') {
    addSection(c.id, 'slide', 'Slide 1', '', 0); addSection(c.id, 'slide', 'Slide 2', '', 1)
  } else if (c.format === 'story') {
    addSection(c.id, 'frame', 'Frame 1', '', 0, '')
  } else {
    (tpl?.sections || [{ key: 'body', label: 'Naskah' }]).forEach((s, i) => addSection(c.id, s.key, s.label, '', i))
  }
}

export function addTask(p: Partial<Task> & { title: string }): Task {
  const siblings = all('tasks').filter((t) => (t.contentId || null) === (p.contentId || null) && (t.parentTaskId || null) === (p.parentTaskId || null))
  return put('tasks', {
    id: uid(), contentId: p.contentId ?? null, parentTaskId: p.parentTaskId ?? null, title: p.title,
    activity: p.activity || 'other', status: p.status || 'todo', estimateMinutes: p.estimateMinutes ?? null,
    plannedStart: p.plannedStart ?? null, plannedEnd: p.plannedEnd ?? null, dueDate: p.dueDate ?? null,
    batchId: p.batchId ?? null, order: p.order ?? (siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0),
    completedAt: null, notes: p.notes || '', lifecycle: 'active', demo: p.demo, createdAt: '', updatedAt: '',
  })
}

function applyTemplateExtras(c: Content, tpl: Template | undefined) {
  ;(tpl?.defaultTasks || []).forEach((t, i) => addTask({ contentId: c.id, title: t.title, activity: t.activity, estimateMinutes: t.estimateMinutes ?? null, order: i, demo: c.demo }))
  const ready = c.format ? (tpl?.defaultReadiness?.length && c.format === 'reel' ? tpl.defaultReadiness : READINESS_BY_FORMAT[c.format]) : []
  ready.forEach((label, i) => put('readiness', { id: uid(), contentId: c.id, label, required: true, checked: false, order: i, createdAt: '', updatedAt: '' }))
}

export function createInstagram(p: { title?: string; format?: Format; templateId?: string; sourceIdeaId?: string | null; sourceContentId?: string | null; demo?: boolean; withTasks?: boolean } = {}): Content {
  const format = p.format || 'reel'
  const tpl = get('templates', p.templateId || (format === 'reel' ? 'tpl-talking-head' : 'tpl-blank'))
  const c = put('contents', {
    id: uid(), channel: 'instagram', title: p.title?.trim() || 'Konten tanpa judul', format, templateId: tpl?.id || null,
    status: 'idea', lifecycle: 'active', sourceIdeaId: p.sourceIdeaId || null, sourceContentId: p.sourceContentId || null,
    tagIds: [], caption: '', notes: '', plannedPublishAt: null, publishedAt: null, demo: p.demo, createdAt: '', updatedAt: '',
  })
  makeStructure(c, tpl)
  if (p.withTasks !== false) applyTemplateExtras(c, tpl)
  return c
}

export function deriveTitle(text: string) {
  const line = text.trim().split(/\n/)[0].trim()
  if (!line) return 'Thread tanpa judul'
  return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line
}

export function createThread(p: { text?: string; sourceIdeaId?: string | null; sourceContentId?: string | null; variantOfId?: string | null; variantLabel?: string; demo?: boolean; posts?: string[] } = {}): Content {
  const posts = p.posts && p.posts.length ? p.posts : [p.text || '']
  const c = put('contents', {
    id: uid(), channel: 'threads', title: deriveTitle(posts[0]), format: null, templateId: null, status: 'idea',
    lifecycle: 'active', sourceIdeaId: p.sourceIdeaId || null, sourceContentId: p.sourceContentId || null,
    variantOfId: p.variantOfId || null, variantLabel: p.variantLabel, tagIds: [], caption: '', notes: '',
    plannedPublishAt: null, publishedAt: null, demo: p.demo, createdAt: '', updatedAt: '',
  })
  posts.forEach((body, i) => put('posts', { id: uid(), contentId: c.id, body, order: i, createdAt: '', updatedAt: '' }))
  return c
}

export function touchContent(id: string) { const c = get('contents', id); if (c) put('contents', c) }

/** Threads title follows the first post unless the user typed a custom one. */
export function syncThreadTitle(contentId: string) {
  const c = get('contents', contentId); if (!c || c.channel !== 'threads') return
  const first = postsOf(contentId)[0]
  const t = deriveTitle(first?.body || '')
  if (c.title !== t) patch('contents', contentId, { title: t })
}

// ---------------- ideas ----------------
export function captureIdea(text: string, url?: string, channel?: Channel | null): Idea {
  const t = text.trim()
  if (!t) throw new Error('Tulis idenya dulu.')
  return put('ideas', { id: uid(), text: t, url: url?.trim() || undefined, preferredChannel: channel || null, convertedContentIds: [], lifecycle: 'active', createdAt: '', updatedAt: '' })
}

export function convertIdea(ideaId: string, target: { channel: Channel; format?: Format }): Content {
  const idea = get('ideas', ideaId)
  if (!idea) throw new Error('Ide tidak ditemukan')
  const firstLine = idea.text.split('\n')[0]
  const c = target.channel === 'threads'
    ? createThread({ text: idea.text, sourceIdeaId: idea.id })
    : createInstagram({ title: deriveTitle(firstLine), format: target.format || 'reel', sourceIdeaId: idea.id })
  if (target.channel === 'instagram') {
    if (idea.text.includes('\n') || idea.text.length > 60) patch('contents', c.id, { notes: idea.text })
    if (idea.url) patch('contents', c.id, { notes: (get('contents', c.id)!.notes ? get('contents', c.id)!.notes + '\n' : '') + idea.url })
  }
  patch('ideas', idea.id, { convertedContentIds: [...idea.convertedContentIds, c.id] })
  return c
}

// ---------------- content lifecycle / status ----------------
export function setLifecycle(c: Coll, id: string, lifecycle: Lifecycle) {
  patch(c as any, id, { lifecycle } as any)
  if (c === 'contents' && lifecycle !== 'active') {
    const st = settings()
    if (st.pinnedContentId === id) patch('settings', 'settings', { pinnedContentId: null })
  }
}

export function missingReadiness(contentId: string) {
  return readinessOf(contentId).filter((r) => r.required && !r.checked)
}

export function setStatus(contentId: string, status: Exclude<Status, 'published'>) {
  const c = get('contents', contentId); if (!c) return
  patch('contents', contentId, { status, publishedAt: null })
}

export function markPublished(contentId: string, publishedAt: string, postUrl?: string) {
  if (!publishedAt || isNaN(Date.parse(publishedAt))) throw new Error('Waktu terbit tidak valid')
  patch('contents', contentId, { status: 'published', publishedAt, postUrl: postUrl?.trim() || '' })
  const st = settings()
  if (st.pinnedContentId === contentId) patch('settings', 'settings', { pinnedContentId: null })
}

export function unpublish(contentId: string) {
  patch('contents', contentId, { status: 'ready', publishedAt: null })
}

// ---------------- tasks ----------------
export function setTaskStatus(taskId: string, status: 'todo' | 'doing' | 'done', opts: { cascade?: boolean } = {}) {
  const t = get('tasks', taskId); if (!t) return
  const now = nowIso()
  patch('tasks', taskId, { status, completedAt: status === 'done' ? now : null })
  const subs = subtasksOf(taskId)
  if (!t.parentTaskId && status === 'done' && opts.cascade) {
    for (const s of subs) if (s.status !== 'done') patch('tasks', s.id, { status: 'done', completedAt: now })
  }
  if (t.parentTaskId) {
    const parent = get('tasks', t.parentTaskId)!
    const sibs = subtasksOf(parent.id)
    if (status === 'done' && sibs.every((s) => s.status === 'done') && parent.status !== 'done') patch('tasks', parent.id, { status: 'done', completedAt: now })
    if (status !== 'done' && parent.status === 'done') patch('tasks', parent.id, { status: 'todo', completedAt: null })
  }
  if (t.contentId && status !== 'todo') {
    const c = get('contents', t.contentId)
    if (c && c.status === 'idea') patch('contents', c.id, { status: 'in_progress' })
  }
}

export function openSubtaskCount(taskId: string) { return subtasksOf(taskId).filter((s) => s.status !== 'done').length }

export function deleteTask(taskId: string) {
  for (const s of subtasksOf(taskId)) remove('tasks', s.id)
  remove('tasks', taskId)
}

export function moveInList<T extends { id: string; order: number }>(coll: 'tasks' | 'sections' | 'posts' | 'shots' | 'readiness', list: T[], id: string, dir: -1 | 1) {
  const i = list.findIndex((x) => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const arr = list.slice()
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  arr.forEach((x, k) => { if (x.order !== k) patch(coll as any, x.id, { order: k } as any) })
}

// ---------------- batches ----------------
export function createBatch(p: { title: string; startAt: string; endAt: string; location?: string; notes?: string; demo?: boolean }): BatchSession {
  if (Date.parse(p.endAt) <= Date.parse(p.startAt)) throw new Error('Jam selesai harus setelah jam mulai')
  return put('batches', { id: uid(), title: p.title.trim() || 'Sesi rekam', startAt: p.startAt, endAt: p.endAt, notes: p.notes || '', location: p.location || '', demo: p.demo, createdAt: '', updatedAt: '' })
}

export function batchMembers(batchId: string): Task[] {
  return all('tasks').filter((t) => t.batchId === batchId).sort((a, b) => a.order - b.order)
}

export function addToBatch(taskId: string, batchId: string) {
  const t = get('tasks', taskId)
  if (!t) return
  if (t.parentTaskId) throw new Error('Hanya tugas utama yang bisa masuk sesi')
  patch('tasks', taskId, { batchId, plannedStart: null, plannedEnd: null })
}

export function removeFromBatch(taskId: string, keepSchedule: boolean) {
  const t = get('tasks', taskId); if (!t || !t.batchId) return
  const b = get('batches', t.batchId)
  patch('tasks', taskId, { batchId: null, plannedStart: keepSchedule && b ? b.startAt : null, plannedEnd: keepSchedule && b ? b.endAt : null })
}

export function deleteBatch(batchId: string, keepSchedule: boolean) {
  for (const t of batchMembers(batchId)) removeFromBatch(t.id, keepSchedule)
  remove('batches', batchId)
}

/** Overlapping work blocks for a day (warning only). */
export function overlaps(blocks: { id: string; start: string; end: string }[]): Set<string> {
  const out = new Set<string>()
  const s = blocks.slice().sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      if (Date.parse(s[j].start) < Date.parse(s[i].end)) { out.add(s[i].id); out.add(s[j].id) } else break
    }
  return out
}

// ---------------- duplicate / derive ----------------
export function duplicateContent(id: string, opts: { variantLabel?: string; asVariant?: boolean } = {}): Content {
  const src = get('contents', id)
  if (!src) throw new Error('Konten tidak ditemukan')
  const c = put('contents', {
    ...src, id: uid(), title: opts.variantLabel ? `${src.title} · ${opts.variantLabel}` : `${src.title} (salinan)`,
    status: 'idea', lifecycle: 'active', plannedPublishAt: null, publishedAt: null, postUrl: '',
    variantOfId: opts.asVariant ? src.id : src.variantOfId || null, variantLabel: opts.variantLabel, demo: undefined,
    createdAt: '', updatedAt: '',
  })
  for (const s of sectionsOf(id)) put('sections', { ...s, id: uid(), contentId: c.id, createdAt: '', updatedAt: '' })
  for (const p of postsOf(id)) put('posts', { ...p, id: uid(), contentId: c.id, createdAt: '', updatedAt: '' })
  for (const s of shotsOf(id)) put('shots', { ...s, id: uid(), contentId: c.id, done: false, createdAt: '', updatedAt: '' })
  for (const r of readinessOf(id)) put('readiness', { ...r, id: uid(), contentId: c.id, checked: false, createdAt: '', updatedAt: '' })
  for (const t of tasksOf(id)) {
    const nt = addTask({ contentId: c.id, title: t.title, activity: t.activity, estimateMinutes: t.estimateMinutes, order: t.order })
    for (const s of subtasksOf(t.id)) addTask({ contentId: c.id, parentTaskId: nt.id, title: s.title, activity: s.activity, estimateMinutes: s.estimateMinutes, order: s.order })
  }
  for (const l of all('links').filter((l) => l.contentId === id)) put('links', { ...l, id: uid(), contentId: c.id, createdAt: '', updatedAt: '' })
  if (src.channel === 'threads' && !opts.variantLabel) patch('contents', c.id, { title: src.title })
  return c
}

export interface SourcePiece { id: string; label: string; text: string }
export function sourcePieces(contentId: string): SourcePiece[] {
  const c = get('contents', contentId)
  if (!c) return []
  const out: SourcePiece[] = []
  if (c.channel === 'threads') postsOf(contentId).forEach((p, i) => out.push({ id: p.id, label: `Post ${i + 1}`, text: p.body }))
  else sectionsOf(contentId).forEach((s) => s.body.trim() && out.push({ id: s.id, label: s.label, text: s.body }))
  if (c.caption.trim()) out.push({ id: 'caption', label: 'Caption', text: c.caption })
  return out.filter((p) => p.text.trim())
}

export function createDerivative(sourceId: string, target: { channel: Channel; format?: Format }, pieceIds: string[]): Content {
  const src = get('contents', sourceId)
  if (!src) throw new Error('Sumber tidak ditemukan')
  const pieces = sourcePieces(sourceId).filter((p) => pieceIds.includes(p.id))
  let c: Content
  if (target.channel === 'threads') {
    c = createThread({ posts: pieces.length ? pieces.map((p) => p.text) : [''], sourceContentId: src.id })
  } else {
    c = createInstagram({ title: src.title, format: target.format || 'reel', sourceContentId: src.id })
    const secs = sectionsOf(c.id)
    if (pieces.length) {
      if (target.format === 'carousel' || target.format === 'story') {
        secs.forEach((s) => remove('sections', s.id))
        pieces.forEach((p, i) => addSection(c.id, target.format === 'carousel' ? 'slide' : 'frame', target.format === 'carousel' ? `Slide ${i + 1}` : `Frame ${i + 1}`, p.text, i, ''))
      } else if (secs.length) {
        // put pieces in order into the template sections, leftovers into notes
        pieces.forEach((p, i) => { if (secs[i]) patch('sections', secs[i].id, { body: p.text }) })
        const extra = pieces.slice(secs.length).map((p) => p.text).join('\n\n')
        if (extra) patch('contents', c.id, { notes: extra })
      }
    }
  }
  patch('contents', c.id, { pillarId: src.pillarId, seriesId: src.seriesId, tagIds: src.tagIds.slice() })
  return c
}

// ---------------- review ----------------
export function ensureReview(contentId: string): Review {
  return reviewOf(contentId) || put('reviews', { id: uid(), contentId, responses: '', lesson: '', nextIdea: '', followupIdeaId: null, metrics: {}, recordedAt: null, createdAt: '', updatedAt: '' })
}

export function followupIdea(contentId: string, opts: { forceNew?: boolean } = {}): { idea: Idea; existed: boolean } {
  const r = ensureReview(contentId)
  const text = r.nextIdea.trim()
  if (!text) throw new Error('Isi "Ide berikutnya" dulu')
  const prev = get('ideas', r.followupIdeaId)
  if (prev && prev.lifecycle !== 'deleted' && !opts.forceNew) return { idea: prev, existed: true }
  const idea = put('ideas', { id: uid(), text, preferredChannel: null, sourceContentId: contentId, convertedContentIds: [], lifecycle: 'active', createdAt: '', updatedAt: '' })
  patch('reviews', r.id, { followupIdeaId: idea.id })
  return { idea, existed: false }
}

// ---------------- resources ----------------
export function linkResource(contentId: string, resourceId: string): boolean {
  if (all('links').some((l) => l.contentId === contentId && l.resourceId === resourceId)) return false
  put('links', { id: uid(), contentId, resourceId, createdAt: '', updatedAt: '' })
  return true
}
export function unlinkResource(contentId: string, resourceId: string) {
  for (const l of all('links').filter((l) => l.contentId === contentId && l.resourceId === resourceId)) remove('links', l.id)
}

// ---------------- permanent delete ----------------
export function purge(c: Coll, id: string) {
  if (c === 'contents') {
    for (const coll of ['sections', 'posts', 'shots', 'readiness', 'links', 'reviews'] as const)
      for (const r of all(coll) as any[]) if (r.contentId === id) remove(coll, r.id)
    for (const t of all('tasks').filter((t) => t.contentId === id)) remove('tasks', t.id)
    const cont = get('contents', id)
    if (cont?.coverAssetId) remove('assets', cont.coverAssetId)
    for (const idea of all('ideas')) if (idea.convertedContentIds.includes(id)) patch('ideas', idea.id, { convertedContentIds: idea.convertedContentIds.filter((x) => x !== id) })
  }
  if (c === 'resources') {
    for (const l of all('links').filter((l) => l.resourceId === id)) remove('links', l.id)
    const r = get('resources', id)
    if (r?.assetId) remove('assets', r.assetId)
  }
  if (c === 'tasks') { deleteTask(id); return }
  remove(c, id)
}

// ---------------- labels ----------------
export function taxLabel(id?: string | null) { return id ? get('taxonomy', id)?.label : undefined }
export function liveTax(type: 'pillar' | 'tag' | 'series') {
  return all('taxonomy').filter((t) => t.type === type && t.lifecycle === 'active').sort((a, b) => a.label.localeCompare(b.label))
}

export function contentDisplayDate(c: Content): string | null {
  if (c.status === 'published' && c.publishedAt) return c.publishedAt
  return c.plannedPublishAt || null
}

export function weekDates(start: string) { return Array.from({ length: 7 }, (_, i) => addDays(start, i)) }
