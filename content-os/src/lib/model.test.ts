import { describe, it, expect, beforeEach } from 'vitest'
import { resetForTests, get, all, patch, S, serialize } from './store'
import * as M from './model'
import { zonedToIso, dateKey, todayKey, addDays, weekStart, timeKey } from './time'
import { validateImport, exportJson } from './backup'
import { loadDemo, clearDemo } from './seed'

const Z = 'Asia/Jakarta'
beforeEach(() => { resetForTests(); M.ensureDefaults() })

describe('time', () => {
  it('converts WIB wall clock to UTC and back', () => {
    const iso = zonedToIso('2026-10-23', '19:00', Z)
    expect(iso).toBe('2026-10-23T12:00:00.000Z')
    expect(dateKey(iso, Z)).toBe('2026-10-23')
    expect(timeKey(iso, Z)).toBe('19:00')
  })
  it('date key crosses midnight correctly', () => {
    expect(dateKey('2026-10-23T18:30:00.000Z', Z)).toBe('2026-10-24')
  })
  it('week starts Monday', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19') // Sunday -> Monday before
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
  })
  it('date-only deadline is overdue only after the local day ends', () => {
    const t = M.addTask({ title: 'x', dueDate: '2026-10-23' })
    expect(M.isTaskOverdue(t, new Date('2026-10-23T16:59:00Z'))).toBe(false) // 23:59 WIB
    expect(M.isTaskOverdue(t, new Date('2026-10-23T17:00:00Z'))).toBe(true) // 00:00 WIB next day
  })
})

describe('ideas', () => {
  it('captures an idea with text only and rejects whitespace', () => {
    expect(() => M.captureIdea('   ')).toThrow()
    const i = M.captureIdea('Warna kain berubah')
    expect(get('ideas', i.id)!.lifecycle).toBe('active')
  })
  it('converts to Instagram with source link and no silent duplicate', () => {
    const i = M.captureIdea('Warna kain berubah setelah grading')
    const c = M.convertIdea(i.id, { channel: 'instagram', format: 'reel' })
    expect(c.sourceIdeaId).toBe(i.id)
    expect(get('ideas', i.id)!.convertedContentIds).toEqual([c.id])
    expect(M.sectionsOf(c.id).map((s) => s.label)).toEqual(['Hook', 'Poin utama', 'Contoh', 'Penutup'])
    expect(M.tasksOf(c.id).length).toBe(4)
    expect(all('contents').length).toBe(1)
  })
})

describe('tasks', () => {
  it('parent/subtask cascade and reopen', () => {
    const c = M.createInstagram({ title: 'A' })
    const p = M.tasksOf(c.id)[0]
    const s1 = M.addTask({ contentId: c.id, parentTaskId: p.id, title: 's1' })
    const s2 = M.addTask({ contentId: c.id, parentTaskId: p.id, title: 's2' })
    M.setTaskStatus(s1.id, 'done'); expect(get('tasks', p.id)!.status).toBe('todo')
    M.setTaskStatus(s2.id, 'done'); expect(get('tasks', p.id)!.status).toBe('done')
    M.setTaskStatus(s1.id, 'todo'); expect(get('tasks', p.id)!.status).toBe('todo')
    M.setTaskStatus(p.id, 'done', { cascade: true })
    expect(M.subtasksOf(p.id).every((s) => s.status === 'done')).toBe(true)
    expect(M.progress(c.id)).toEqual({ done: 1, total: 4 }) // subtasks not double counted
  })
  it('batch schedule is inherited and moves all members', () => {
    const tasks = [1, 2, 3].map((n) => M.addTask({ contentId: M.createInstagram({ title: 'C' + n, withTasks: false }).id, title: 'Rekam ' + n, activity: 'record' }))
    const b = M.createBatch({ title: 'Batch', startAt: zonedToIso('2026-10-24', '13:00', Z), endAt: zonedToIso('2026-10-24', '14:00', Z) })
    tasks.forEach((t) => M.addToBatch(t.id, b.id))
    patch('batches', b.id, { startAt: zonedToIso('2026-10-24', '15:00', Z), endAt: zonedToIso('2026-10-24', '16:00', Z) })
    for (const t of tasks) expect(timeKey(M.effectiveSchedule(get('tasks', t.id)!)!.start, Z)).toBe('15:00')
    expect(all('tasks').length).toBe(3)
    M.removeFromBatch(tasks[0].id, true)
    expect(get('tasks', tasks[0].id)!.plannedStart).toBe(zonedToIso('2026-10-24', '15:00', Z))
    expect(() => M.createBatch({ title: 'x', startAt: zonedToIso('2026-10-24', '15:00', Z), endAt: zonedToIso('2026-10-24', '14:00', Z) })).toThrow()
  })
  it('detects overlaps and posts at risk', () => {
    const ov = M.overlaps([{ id: 'a', start: '2026-10-24T06:00:00Z', end: '2026-10-24T07:00:00Z' }, { id: 'b', start: '2026-10-24T06:30:00Z', end: '2026-10-24T07:30:00Z' }, { id: 'c', start: '2026-10-24T08:00:00Z', end: '2026-10-24T09:00:00Z' }])
    expect([...ov].sort()).toEqual(['a', 'b'])
    const c = M.createInstagram({ title: 'R' })
    patch('contents', c.id, { plannedPublishAt: zonedToIso('2026-10-24', '19:00', Z) })
    const t = M.tasksOf(c.id)[2]
    patch('tasks', t.id, { plannedStart: zonedToIso('2026-10-25', '10:00', Z), plannedEnd: zonedToIso('2026-10-25', '11:00', Z) })
    expect(M.postAtRisk(get('contents', c.id)!).map((x) => x.id)).toEqual([t.id])
  })
})

describe('publishing', () => {
  it('only marks published explicitly and keeps the plan', () => {
    const c = M.createInstagram({ title: 'P' })
    const plan = zonedToIso('2026-10-20', '19:00', Z)
    patch('contents', c.id, { plannedPublishAt: plan })
    M.tasksOf(c.id).forEach((t) => M.setTaskStatus(t.id, 'done'))
    expect(get('contents', c.id)!.status).not.toBe('published')
    M.markPublished(c.id, zonedToIso('2026-10-20', '19:10', Z), 'https://instagram.com/p/x')
    const p = get('contents', c.id)!
    expect(p.status).toBe('published'); expect(p.plannedPublishAt).toBe(plan); expect(p.publishedAt).toBeTruthy()
    M.unpublish(c.id)
    expect(get('contents', c.id)!.publishedAt).toBeNull()
    expect(get('contents', c.id)!.status).toBe('ready')
  })
  it('pick next action respects filters and never invents work', () => {
    expect(M.pickNextAction('all', 'all')).toBeNull()
    const c = M.createInstagram({ title: 'N' })
    const n = M.pickNextAction(15, 'record')
    expect(n).toBeNull() // record task estimate is 30 min
    const n2 = M.pickNextAction(30, 'record')!
    expect(n2.task!.activity).toBe('record')
    expect(M.pickNextAction('all', 'all')!.content!.id).toBe(c.id)
  })
})

describe('threads, duplicate, derive, review', () => {
  it('threads keep order and duplicate resets status/schedule', () => {
    const t = M.createThread({ posts: ['satu', 'dua', 'tiga'] })
    M.moveInList('posts', M.postsOf(t.id), M.postsOf(t.id)[2].id, -1)
    expect(M.postsOf(t.id).map((p) => p.body)).toEqual(['satu', 'tiga', 'dua'])
    patch('contents', t.id, { status: 'ready', plannedPublishAt: '2026-10-25T12:00:00.000Z' })
    const d = M.duplicateContent(t.id, { variantLabel: 'Versi pendek', asVariant: true })
    expect(d.status).toBe('idea'); expect(d.plannedPublishAt).toBeNull(); expect(d.variantOfId).toBe(t.id)
    expect(M.postsOf(d.id).map((p) => p.body)).toEqual(['satu', 'tiga', 'dua'])
  })
  it('review follow-up idea is not duplicated; derivative is independent', () => {
    const c = M.createInstagram({ title: 'S' })
    patch('sections', M.sectionsOf(c.id)[0].id, { body: 'Hook asli' })
    M.markPublished(c.id, new Date().toISOString())
    const r = M.ensureReview(c.id)
    patch('reviews', r.id, { nextIdea: 'Cara cek warna produk' })
    const a = M.followupIdea(c.id), b = M.followupIdea(c.id)
    expect(b.existed).toBe(true); expect(a.idea.id).toBe(b.idea.id)
    const d = M.createDerivative(c.id, { channel: 'threads' }, M.sourcePieces(c.id).map((p) => p.id))
    expect(d.sourceContentId).toBe(c.id)
    patch('posts', M.postsOf(d.id)[0].id, { body: 'diubah' })
    expect(M.sectionsOf(c.id)[0].body).toBe('Hook asli')
    expect(M.tasksOf(d.id).length).toBe(0)
  })
  it('resources link once and survive edits', () => {
    const c1 = M.createInstagram({ title: 'A' }), c2 = M.createInstagram({ title: 'B' })
    const res = { id: 'r1', type: 'reference', sourceKind: 'text', title: 'Detail kain', body: '', tags: [], pinned: false, lifecycle: 'active', createdAt: '', updatedAt: '' } as any
    S.resources.set('r1', res)
    expect(M.linkResource(c1.id, 'r1')).toBe(true); expect(M.linkResource(c1.id, 'r1')).toBe(false)
    M.linkResource(c2.id, 'r1')
    patch('resources', 'r1', { title: 'Detail kain v2' })
    expect(M.resourcesOf(c1.id)[0].title).toBe('Detail kain v2'); expect(M.resourcesOf(c2.id)[0].title).toBe('Detail kain v2')
    M.purge('resources', 'r1')
    expect(all('links').length).toBe(0)
  })
})

describe('backup', () => {
  it('round-trips and rejects broken files without touching state', () => {
    loadDemo(new Date('2026-10-23T05:00:00Z'))
    const before = JSON.stringify(serialize())
    const json = exportJson()
    const ok = validateImport(json)
    expect(ok.ok).toBe(true)
    expect(ok.data!.posts.length).toBe(all('posts').length)
    const bad = JSON.parse(json); bad.data.sections.push({ id: 'zz', contentId: 'missing' })
    expect(validateImport(JSON.stringify(bad)).ok).toBe(false)
    const newer = JSON.parse(json); newer.schemaVersion = 99
    expect(validateImport(JSON.stringify(newer)).ok).toBe(false)
    expect(validateImport('not json').ok).toBe(false)
    expect(JSON.stringify(serialize())).toBe(before)
  })
  it('demo is idempotent and removable', () => {
    expect(loadDemo()).toBe(true); expect(loadDemo()).toBe(false)
    const n = all('contents').length
    expect(n).toBeGreaterThan(4)
    M.captureIdea('ide milik sendiri')
    clearDemo()
    expect(all('contents').length).toBe(0)
    expect(all('ideas').map((i) => i.text)).toEqual(['ide milik sendiri'])
  })
})
