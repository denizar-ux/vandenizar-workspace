import { COLLS, SCHEMA_VERSION, type Coll } from './types'
import { serialize, type State, S } from './store'
import { isValidIso, isValidDateKey } from './time'

export function exportJson(state: State = S): string {
  return JSON.stringify({ app: 'vandenizar-content-os', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: serialize(state) }, null, 1)
}

export interface ImportCheck { ok: boolean; errors: string[]; counts: Partial<Record<Coll, number>>; data?: Record<string, any[]> }

const REQUIRED: Partial<Record<Coll, string[]>> = {
  ideas: ['text'], contents: ['channel', 'title', 'status', 'lifecycle'], sections: ['contentId'], posts: ['contentId'],
  tasks: ['title', 'status'], shots: ['contentId'], readiness: ['contentId', 'label'], batches: ['startAt', 'endAt'],
  resources: ['type', 'title'], links: ['contentId', 'resourceId'], templates: ['name'], reviews: ['contentId'],
  taxonomy: ['type', 'label'], assets: ['dataUrl'],
}

export function validateImport(raw: string): ImportCheck {
  const errors: string[] = []
  const counts: Partial<Record<Coll, number>> = {}
  if (raw.length > 40_000_000) return { ok: false, errors: ['File terlalu besar (maks 40 MB).'], counts }
  let j: any
  try { j = JSON.parse(raw) } catch { return { ok: false, errors: ['File bukan JSON yang valid.'], counts } }
  if (!j || typeof j !== 'object' || !j.data || typeof j.data !== 'object') return { ok: false, errors: ['Bukan file backup Content OS.'], counts }
  if (typeof j.schemaVersion !== 'number') errors.push('schemaVersion tidak ada.')
  else if (j.schemaVersion > SCHEMA_VERSION) errors.push(`Backup dibuat oleh versi app yang lebih baru (schema ${j.schemaVersion}). Perbarui app dulu.`)
  const ids: Record<string, Set<string>> = {}
  for (const c of COLLS) {
    const arr = j.data[c] ?? []
    if (!Array.isArray(arr)) { errors.push(`${c}: harus berupa daftar.`); continue }
    ids[c] = new Set()
    arr.forEach((r: any, i: number) => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) { errors.push(`${c}[${i}]: id tidak valid.`); return }
      if (ids[c].has(r.id)) errors.push(`${c}: id ganda ${r.id}.`)
      ids[c].add(r.id)
      for (const f of REQUIRED[c] || []) if (r[f] == null) errors.push(`${c} ${r.id}: field ${f} kosong.`)
      for (const f of ['createdAt', 'updatedAt', 'plannedPublishAt', 'publishedAt', 'plannedStart', 'plannedEnd', 'startAt', 'endAt'])
        if (r[f] != null && r[f] !== '' && !isValidIso(r[f])) errors.push(`${c} ${r.id}: tanggal ${f} tidak valid.`)
      if (r.dueDate != null && !isValidDateKey(r.dueDate)) errors.push(`${c} ${r.id}: dueDate tidak valid.`)
    })
    counts[c] = arr.length
  }
  if (!errors.length) {
    const d = j.data
    const ref = (c: Coll, field: string, target: Coll, optional = false) => {
      for (const r of d[c] || []) {
        const v = r[field]
        if (v == null || v === '') { if (!optional) errors.push(`${c} ${r.id}: ${field} kosong.`); continue }
        if (!ids[target].has(v)) errors.push(`${c} ${r.id}: menunjuk ${target} yang tidak ada.`)
      }
    }
    ref('sections', 'contentId', 'contents'); ref('posts', 'contentId', 'contents'); ref('shots', 'contentId', 'contents')
    ref('readiness', 'contentId', 'contents'); ref('links', 'contentId', 'contents'); ref('links', 'resourceId', 'resources')
    ref('reviews', 'contentId', 'contents'); ref('tasks', 'contentId', 'contents', true); ref('tasks', 'parentTaskId', 'tasks', true)
    ref('tasks', 'batchId', 'batches', true)
    const tasks = new Map<string, any>((d.tasks || []).map((t: any) => [t.id, t]))
    for (const t of tasks.values()) {
      if (!t.parentTaskId) continue
      const p = tasks.get(t.parentTaskId)
      if (p && (p.parentTaskId || (p.contentId || null) !== (t.contentId || null))) errors.push(`tasks ${t.id}: subtask tidak cocok dengan induknya.`)
    }
    for (const c of d.contents || []) {
      if (c.sourceContentId === c.id || c.variantOfId === c.id) errors.push(`contents ${c.id}: sumber menunjuk ke dirinya sendiri.`)
      if (c.status === 'published' && !c.publishedAt) errors.push(`contents ${c.id}: terbit tanpa waktu terbit.`)
    }
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 30), counts, data: errors.length ? undefined : fillDefaults(j.data) }
}

function fillDefaults(d: Record<string, any[]>) {
  const out: Record<string, any[]> = {}
  for (const c of COLLS) out[c] = (d[c] || []).map((r) => ({ ...r }))
  for (const c of out.contents) { c.tagIds ||= []; c.caption ??= ''; c.notes ??= '' }
  for (const r of out.resources) { r.tags ||= []; r.lifecycle ||= 'active'; r.sourceKind ||= 'text' }
  for (const t of out.tasks) { t.lifecycle ||= 'active'; t.order ??= 0 }
  for (const i of out.ideas) { i.convertedContentIds ||= []; i.lifecycle ||= 'active' }
  return out
}
