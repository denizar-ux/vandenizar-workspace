import { describe, it, expect, beforeEach } from 'vitest'
import { resetForTests, get, all, settings, put } from './store'
import * as M from './model'
import { addDays } from './time'

const W = '2026-10-19' // Monday
beforeEach(() => { resetForTests(); M.ensureDefaults() })

describe('slots and posts', () => {
  it('creates a post in a slot with the slot day, defaults and walks the stages', () => {
    const p = M.createPost({ title: 'BTS Ainayya campaign', week: W, slot: 'work' })
    expect(p.date).toBe(W)
    expect(p.pillar).toBe('work')
    expect(p.format).toBe('reels')
    expect(M.createPost({ title: 'x', week: W, slot: 'story' }).date).toBe('2026-10-23')
    expect(M.slotItem(W, 'work')!.id).toBe(p.id)
    for (let i = 0; i < 5; i++) M.advance(p.id)
    expect(get('items', p.id)!.stage).toBe('done')
    expect(get('items', p.id)!.postedAt).toBeTruthy()
    expect(M.advance(p.id)).toBeUndefined()
    M.setStage(p.id, 'edit')
    expect(get('items', p.id)!.postedAt).toBeNull()
  })

  it('schedules, reschedules by date and unschedules', () => {
    const p = M.createPost({ title: 'Lampu satu titik' })
    expect(p.week).toBeNull()
    M.schedule(p.id, W, 'shot')
    expect(get('items', p.id)!.date).toBe('2026-10-21')
    expect(M.isSlotFree(W, 'shot')).toBe(false)
    expect(M.isSlotFree(W, 'shot', p.id)).toBe(true)
    // a post date on a weekday with a free slot lands in that slot
    M.setStageDate(p.id, 'date', addDays(W, 12)) // Saturday next week -> Desk
    expect(get('items', p.id)!.week).toBe(addDays(W, 7))
    expect(get('items', p.id)!.slot).toBe('desk')
    // a weekday without a slot keeps the current slot when it is free that week
    M.setStageDate(p.id, 'date', addDays(W, 8)) // Tuesday
    expect(get('items', p.id)!.slot).toBe('desk')
    M.schedule(p.id, null, null)
    expect(get('items', p.id)!.date).toBeNull()
  })

  it('custom slots: adding, changing the day and deleting keep posts intact', () => {
    const s = { ...M.newSlot(), name: 'Carousel tips', day: 6 }
    M.saveSlot(s)
    expect(M.slots().map((x) => x.name)).toContain('Carousel tips')
    const p = M.createPost({ title: 'tip', week: W, slot: s.id })
    expect(p.date).toBe('2026-10-25')
    M.saveSlot({ ...s, day: 3 })
    expect(get('items', p.id)!.date).toBe('2026-10-22')
    M.deleteSlot(s.id)
    expect(get('items', p.id)!.slot).toBeNull()
    expect(get('items', p.id)!.date).toBe('2026-10-22')
    expect(M.extraItems(W).map((i) => i.id)).toContain(p.id)
  })

  it('deleting a pillar clears it from posts and slots', () => {
    const p = M.createPost({ title: 'desk', week: W, slot: 'desk' })
    expect(p.pillar).toBe('desk')
    M.deleteTag('pillars', 'desk')
    expect(get('items', p.id)!.pillar).toBeNull()
    expect(M.slotById('desk')!.pillar).toBeNull()
  })

  it('migrates old settings without slots', () => {
    resetForTests()
    put('settings', { id: 'settings', displayName: 'D', timezone: 'Asia/Jakarta', schemaVersion: 2, createdAt: '', updatedAt: '' } as any)
    M.ensureDefaults()
    expect(settings().slots.length).toBe(4)
    expect(settings().pillars.length).toBe(3)
  })
})

describe('stage dates and today', () => {
  const T = '2026-10-21' // Wednesday
  it('keeps script <= film <= edit <= post and explains refusals', () => {
    const p = M.createPost({ title: 'Rumah Nenek', week: W, slot: 'story' }) // post Fri 23
    expect(M.setStageDate(p.id, 'filmDate', '2026-10-24')).toEqual({ ok: false, error: expect.stringContaining("Film can't be after Post") })
    expect(M.setStageDate(p.id, 'filmDate', '2026-10-21').ok).toBe(true)
    expect(M.setStageDate(p.id, 'scriptDate', '2026-10-22')).toEqual({ ok: false, error: expect.stringContaining("Script can't be after Film") })
    expect(M.setStageDate(p.id, 'scriptDate', '2026-10-20').ok).toBe(true)
    expect(M.setStageDate(p.id, 'date', '2026-10-20')).toEqual({ ok: false, error: expect.stringContaining("Post can't be before") })
    expect(M.dateBounds(get('items', p.id)!, 'editDate')).toEqual({ min: '2026-10-21', max: '2026-10-23' })
    expect(M.dateConflicts(get('items', p.id)!)).toEqual([])
    // moving the post to an earlier slot creates a conflict that planBackwards fixes
    M.schedule(p.id, W, 'work') // Mon 19
    expect(M.dateConflicts(get('items', p.id)!).length).toBeGreaterThan(0)
    M.planBackwards(p.id, '2026-10-19')
    const it = get('items', p.id)!
    expect(M.dateConflicts(it)).toEqual([])
    expect([it.scriptDate, it.filmDate, it.editDate, it.date]).toEqual(['2026-10-19', '2026-10-19', '2026-10-19', '2026-10-19'])
  })
  it('plans backwards 3/2/1 days and skips done stages', () => {
    const p = M.createPost({ title: 'x', week: addDays(W, 7), slot: 'story' }) // post Fri 30
    M.planBackwards(p.id, T)
    let it = get('items', p.id)!
    expect([it.scriptDate, it.filmDate, it.editDate]).toEqual(['2026-10-27', '2026-10-28', '2026-10-29'])
    M.setStageDate(p.id, 'scriptDate', null)
    M.setStage(p.id, 'film') // script already done
    M.planBackwards(p.id, T)
    it = get('items', p.id)!
    expect(it.scriptDate).toBeNull()
    // a done stage dated after a new, earlier post date is pulled back so nothing stays out of order
    M.setStageDate(p.id, 'scriptDate', '2026-10-27')
    M.schedule(p.id, addDays(W, 7), 'work') // post Mon 26
    expect(M.dateConflicts(get('items', p.id)!).length).toBeGreaterThan(0)
    M.planBackwards(p.id, T)
    expect(M.dateConflicts(get('items', p.id)!)).toEqual([])
  })
  it('lists every task dated today, completes them and moves the stage', () => {
    const a = M.createPost({ title: 'A', week: W, slot: 'shot' }) // post Wed 21
    const b = M.createPost({ title: 'B', week: W, slot: 'story' })
    M.setStageDate(b.id, 'filmDate', T)
    const c = M.createPost({ title: 'C', week: W, slot: 'desk' })
    M.setStageDate(c.id, 'scriptDate', T)
    const d = M.createPost({ title: 'D' })
    M.setStageDate(d.id, 'editDate', '2026-10-20') // overdue edit
    expect(M.tasksOn(T).map((x) => x.task.key + ':' + x.it.title)).toEqual(['script:C', 'film:B', 'post:A'])
    expect(M.overdueTasks(T).map((x) => x.task.key)).toEqual(['edit'])
    M.completeTask(b.id, M.taskOf('film'))
    expect(get('items', b.id)!.stage).toBe('edit')
    M.completeTask(a.id, M.taskOf('post'))
    expect(get('items', a.id)!.stage).toBe('done')
    expect(M.tasksOn(T).map((x) => x.task.key + (x.done ? '✓' : ''))).toEqual(['script', 'film✓', 'post✓'])
    expect(M.nextTaskAfter(T)!.it.title).toBe('B')
  })
})

describe('auto plan', () => {
  it('fills only empty future script/film/edit dates for a new post', () => {
    const p = M.createPost({ title: 'x' })
    S_put_date(p.id, '2026-10-30')
    M.autoPlan(p.id, '2026-10-24')
    expect(get('items', p.id)).toMatchObject({ scriptDate: '2026-10-27', filmDate: '2026-10-28', editDate: '2026-10-29' })
    const q = M.createPost({ title: 'y' })
    S_put_date(q.id, '2026-10-25')
    M.autoPlan(q.id, '2026-10-24')
    expect(get('items', q.id)).toMatchObject({ scriptDate: null, filmDate: null, editDate: '2026-10-24' })
  })
})

function S_put_date(id: string, d: string) { put('items', { ...get('items', id)!, date: d }) }

describe('threads, resources and old ideas', () => {
  it('schedules threads with a WIB time, lists them on the day and as overdue', () => {
    const a = M.addThread('later one', '2026-10-24', '19:00')!
    const b = M.addThread('earlier one', '2026-10-24', '08:30')!
    M.addThread('no date')
    expect(M.threadDrafts().map((t) => t.text)).toEqual(['earlier one', 'later one', 'no date'])
    expect(M.threadsOn('2026-10-24').map((t) => t.id)).toEqual([b.id, a.id])
    M.markPosted(b.id, true)
    expect(M.threadsOn('2026-10-24').map((t) => t.id)).toEqual([a.id, b.id])
    expect(M.overdueThreads('2026-10-25').map((t) => t.id)).toEqual([a.id])
    M.scheduleThread(a.id, null, '10:00')
    expect(get('items', a.id)!.time).toBeNull()
  })
  it('keeps resources as name + link', () => {
    expect(M.addLink('', 'not a link')).toBeNull()
    const l = M.addLink('', 'raindrop.io/my')!
    expect(l.title).toBe('raindrop.io')
    expect(M.updateLink(l.id, 'Raindrop', 'https://app.raindrop.io')).toBe(true)
    expect(M.links()[0]).toMatchObject({ title: 'Raindrop', url: 'https://app.raindrop.io/' })
  })
  it('turns old ideas into unscheduled Instagram posts at the Idea stage', () => {
    put('items', { id: 'old', kind: 'idea', text: 'Coffee before editing\na small ritual', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '' })
    M.ensureDefaults()
    const it = get('items', 'old')!
    expect(it).toMatchObject({ kind: 'ig', title: 'Coffee before editing', stage: 'idea', date: null })
    expect(it.notes).toContain('small ritual')
  })
})

describe('references and links', () => {
  it('normalizes, labels, adds, edits and removes reference links', () => {
    expect(M.normalizeUrl('instagram.com/reel/abc')).toBe('https://instagram.com/reel/abc')
    expect(M.normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(M.normalizeUrl('hello')).toBeNull()
    expect(M.linkLabel('https://www.tiktok.com/@x/video/1')).toBe('TikTok')
    expect(M.linkLabel('https://youtu.be/abc')).toBe('YouTube')
    expect(M.linkLabel('https://pin.it/xyz')).toBe('Pinterest')
    expect(M.linkLabel('https://studio.example.com/a')).toBe('studio.example.com')
    const p = M.createPost({ title: 'refs', week: W, slot: 'work' })
    const r = M.addRef(p.id, 'drive.google.com/file/d/1', 'shot list')!
    expect(M.addRef(p.id, 'not a link')).toBeNull()
    M.updateRef(p.id, r.id, { note: 'shot list v2' })
    expect(get('items', p.id)!.refs).toEqual([{ id: r.id, url: 'https://drive.google.com/file/d/1', note: 'shot list v2' }])
  })
  it('notification prefs default and save', () => {
    expect(M.notifyPrefs()).toEqual({ morning: true, morningTime: '08:00', postReminder: true, postTime: '19:00' })
    M.setNotify({ postTime: '20:30' })
    expect(M.notifyPrefs().postTime).toBe('20:30')
    expect(settings().notify!.morning).toBe(true)
  })
})
