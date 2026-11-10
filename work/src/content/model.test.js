import { describe, it, expect, beforeEach } from 'vitest'
import { resetForTests, get, put } from '../lib/db.js'
import { addDays } from '../lib/date.js'
import * as M from './model.js'

const W = '2026-10-19' // Monday
beforeEach(() => { resetForTests(); M.ensureDefaults() })

describe('slots and posts', () => {
  it('creates a post in a slot with the slot day, defaults and walks the stages', () => {
    const p = M.createPost({ title: 'BTS Ainayya campaign', week: W, slot: 'work' })
    expect(p.date).toBe(W)
    expect(p.pillar).toBe('work')
    expect(p.format).toBe('reels')
    expect(M.createPost({ title: 'x', week: W, slot: 'story' }).date).toBe('2026-10-23')
    expect(M.slotItem(W, 'work').id).toBe(p.id)
    for (let i = 0; i < 5; i++) M.advance(p.id)
    expect(get('cItems', p.id).stage).toBe('done')
    expect(get('cItems', p.id).postedAt).toBeTruthy()
    expect(M.advance(p.id)).toBeUndefined()
    M.setStage(p.id, 'edit')
    expect(get('cItems', p.id).postedAt).toBeNull()
  })

  it('schedules, reschedules by date and unschedules', () => {
    const p = M.createPost({ title: 'Lampu satu titik' })
    expect(p.week).toBeNull()
    M.schedule(p.id, W, 'shot')
    expect(get('cItems', p.id).date).toBe('2026-10-21')
    expect(M.isSlotFree(W, 'shot')).toBe(false)
    expect(M.isSlotFree(W, 'shot', p.id)).toBe(true)
    // a post date on a weekday with a free slot lands in that slot
    M.setStageDate(p.id, 'date', addDays(W, 12)) // Saturday next week -> Desk
    expect(get('cItems', p.id).week).toBe(addDays(W, 7))
    expect(get('cItems', p.id).slot).toBe('desk')
    // a weekday without a slot keeps the current slot when it is free that week
    M.setStageDate(p.id, 'date', addDays(W, 8)) // Tuesday
    expect(get('cItems', p.id).slot).toBe('desk')
    M.schedule(p.id, null, null)
    expect(get('cItems', p.id).date).toBeNull()
  })

  it('custom slots: adding, changing the day and deleting keep posts intact', () => {
    const s = { ...M.newSlot(), name: 'Carousel tips', day: 6 }
    M.saveSlot(s)
    expect(M.slots().map((x) => x.name)).toContain('Carousel tips')
    const p = M.createPost({ title: 'tip', week: W, slot: s.id })
    expect(p.date).toBe('2026-10-25')
    M.saveSlot({ ...s, day: 3 })
    expect(get('cItems', p.id).date).toBe('2026-10-22')
    M.deleteSlot(s.id)
    expect(get('cItems', p.id).slot).toBeNull()
    expect(get('cItems', p.id).date).toBe('2026-10-22')
    expect(M.extraItems(W).map((i) => i.id)).toContain(p.id)
  })

  it('deleting a pillar clears it from posts and slots', () => {
    const p = M.createPost({ title: 'desk', week: W, slot: 'desk' })
    expect(p.pillar).toBe('desk')
    M.deleteTag('pillars', 'desk')
    expect(get('cItems', p.id).pillar).toBeNull()
    expect(M.slotById('desk').pillar).toBeNull()
  })

  it('migrates old settings without slots', () => {
    resetForTests()
    put('meta', { id: 'cSettings', schemaVersion: 2 })
    M.ensureDefaults()
    expect(M.cSettings().slots.length).toBe(4)
    expect(M.cSettings().pillars.length).toBe(3)
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
    expect(M.dateBounds(get('cItems', p.id), 'editDate')).toEqual({ min: '2026-10-21', max: '2026-10-23' })
    expect(M.dateConflicts(get('cItems', p.id))).toEqual([])
    // moving the post to an earlier slot creates a conflict that planBackwards fixes
    M.schedule(p.id, W, 'work') // Mon 19
    expect(M.dateConflicts(get('cItems', p.id)).length).toBeGreaterThan(0)
    M.planBackwards(p.id, '2026-10-19')
    const it = get('cItems', p.id)
    expect(M.dateConflicts(it)).toEqual([])
    expect([it.scriptDate, it.filmDate, it.editDate, it.date]).toEqual(['2026-10-19', '2026-10-19', '2026-10-19', '2026-10-19'])
  })
  it('plans backwards 3/2/1 days and skips done stages', () => {
    const p = M.createPost({ title: 'x', week: addDays(W, 7), slot: 'story' }) // post Fri 30
    M.planBackwards(p.id, T)
    let it = get('cItems', p.id)
    expect([it.scriptDate, it.filmDate, it.editDate]).toEqual(['2026-10-27', '2026-10-28', '2026-10-29'])
    M.setStageDate(p.id, 'scriptDate', null)
    M.setStage(p.id, 'film') // script already done
    M.planBackwards(p.id, T)
    it = get('cItems', p.id)
    expect(it.scriptDate).toBeNull()
    // a done stage dated after a new, earlier post date is pulled back so nothing stays out of order
    M.setStageDate(p.id, 'scriptDate', '2026-10-27')
    M.schedule(p.id, addDays(W, 7), 'work') // post Mon 26
    expect(M.dateConflicts(get('cItems', p.id)).length).toBeGreaterThan(0)
    M.planBackwards(p.id, T)
    expect(M.dateConflicts(get('cItems', p.id))).toEqual([])
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
    expect(get('cItems', b.id).stage).toBe('edit')
    M.completeTask(a.id, M.taskOf('post'))
    expect(get('cItems', a.id).stage).toBe('done')
    expect(M.tasksOn(T).map((x) => x.task.key + (x.done ? '✓' : ''))).toEqual(['script', 'film✓', 'post✓'])
    expect(M.nextTaskAfter(T).it.title).toBe('B')
  })
})

describe('auto plan', () => {
  it('fills only empty future script/film/edit dates for a new post', () => {
    const p = M.createPost({ title: 'x' })
    S_put_date(p.id, '2026-10-30')
    M.autoPlan(p.id, '2026-10-24')
    expect(get('cItems', p.id)).toMatchObject({ scriptDate: '2026-10-27', filmDate: '2026-10-28', editDate: '2026-10-29' })
    const q = M.createPost({ title: 'y' })
    S_put_date(q.id, '2026-10-25')
    M.autoPlan(q.id, '2026-10-24')
    expect(get('cItems', q.id)).toMatchObject({ scriptDate: null, filmDate: null, editDate: '2026-10-24' })
  })
})

function S_put_date(id, d) { put('cItems', { ...get('cItems', id), date: d }) }

describe('threads and resources', () => {
  it('schedules threads with a WIB time, lists them on the day and as overdue', () => {
    const a = M.addThread('later one', '2026-10-24', '19:00')
    const b = M.addThread('earlier one', '2026-10-24', '08:30')
    M.addThread('no date')
    expect(M.threadDrafts().map((t) => t.text)).toEqual(['earlier one', 'later one', 'no date'])
    expect(M.threadsOn('2026-10-24').map((t) => t.id)).toEqual([b.id, a.id])
    M.markPosted(b.id, true)
    expect(M.threadsOn('2026-10-24').map((t) => t.id)).toEqual([a.id, b.id])
    expect(M.overdueThreads('2026-10-25').map((t) => t.id)).toEqual([a.id])
    M.scheduleThread(a.id, null, '10:00')
    expect(get('cItems', a.id).time).toBeNull()
  })
  it('keeps resources as name + link', () => {
    expect(M.addLink('', 'not a link')).toBeNull()
    const l = M.addLink('', 'raindrop.io/my')
    expect(l.title).toBe('raindrop.io')
    expect(M.updateLink(l.id, 'Raindrop', 'https://app.raindrop.io')).toBe(true)
    expect(M.links()[0]).toMatchObject({ title: 'Raindrop', url: 'https://app.raindrop.io/' })
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
    const r = M.addRef(p.id, 'drive.google.com/file/d/1', 'shot list')
    expect(M.addRef(p.id, 'not a link')).toBeNull()
    M.updateRef(p.id, r.id, { note: 'shot list v2' })
    expect(get('cItems', p.id).refs).toEqual([{ id: r.id, url: 'https://drive.google.com/file/d/1', note: 'shot list v2' }])
  })
  it('notification prefs default and save', () => {
    expect(M.notifyPrefs()).toEqual({ morning: true, morningTime: '08:00', postReminder: true, postTime: '19:00' })
    M.setNotify({ postTime: '20:30' })
    expect(M.notifyPrefs().postTime).toBe('20:30')
    expect(M.cSettings().notify.morning).toBe(true)
  })
})

describe('catching up', () => {
  it('replans a late post from today, keeping the gaps, and undo restores it', () => {
    const p = M.createPost({ title: 'Carou' })
    M.setStageDate(p.id, 'filmDate', '2026-10-23')
    M.setStageDate(p.id, 'date', '2026-10-24')
    const t = '2026-10-27'
    expect(M.overdueTasks(t).length).toBeGreaterThan(0)
    const snap = M.replanPost(p.id, t)
    const it = get('cItems', p.id)
    expect(it.filmDate).toBe('2026-10-27')
    expect(it.date).toBe('2026-10-28')
    expect(it.week).toBe('2026-10-26')
    expect(M.overdueTasks(t).length).toBe(0)
    M.restoreSnaps([snap])
    expect(get('cItems', p.id).date).toBe('2026-10-24')
    expect(get('cItems', p.id).filmDate).toBe('2026-10-23')
  })

  it('replans everything late, threads included', () => {
    const a = M.createPost({ title: 'A' }); M.setStageDate(a.id, 'date', '2026-10-20')
    const th = M.addThread('tes', '2026-10-25', '02:33')
    const snaps = M.replanAll('2026-10-27')
    expect(snaps.length).toBe(2)
    expect(get('cItems', th.id).date).toBe('2026-10-27')
    expect(get('cItems', th.id).time).toBe('02:33')
    expect(get('cItems', a.id).date).toBe('2026-10-27')
  })

  it('a post planned on a calendar day without a slot keeps that day', () => {
    const p = M.createPost({ title: 'Tuesday post', date: '2026-11-03' })
    expect(p.date).toBe('2026-11-03')
    expect(p.slot).toBeNull()
  })
})

describe('trash', () => {
  it('a deleted post vanishes from lists and tasks, restore brings it back', () => {
    const p = M.createPost({ title: 'Gone', week: W, slot: 'work' })
    const th = M.addThread('draft', W, null)
    const l = M.addLink('Drive', 'drive.google.com/x')
    expect(M.tasksOn(W).some((x) => x.it.id === p.id)).toBe(true)
    for (const id of [p.id, th.id, l.id]) M.trashItem(id)
    expect(get('cItems', p.id).deletedAt).toBeTruthy()
    expect(M.igItems().some((i) => i.id === p.id)).toBe(false)
    expect(M.tasksOn(W)).toEqual([])
    expect(M.tasksBetween(W, addDays(W, 6))).toEqual([])
    expect(M.openGroups(W).flatMap((g) => g.items)).toEqual([])
    expect(M.slotItem(W, 'work')).toBeUndefined()
    expect(M.threadsOn(W)).toEqual([])
    expect(M.threadDrafts()).toEqual([])
    expect(M.links()).toEqual([])
    for (const id of [p.id, th.id, l.id]) M.restoreItem(id)
    expect(M.igItems().some((i) => i.id === p.id)).toBe(true)
    expect(M.tasksOn(W).some((x) => x.it.id === p.id)).toBe(true)
    expect(M.openGroups(W).flatMap((g) => g.items).length).toBe(1)
    expect(M.threadsOn(W).length).toBe(1)
    expect(M.links().length).toBe(1)
  })

  it('a blank post made by Add is dropped on leaving, a touched one stays', () => {
    const a = M.createPost({ title: '' }); M.markFreshBlank(a.id)
    expect(M.dropIfBlank(a.id)).toBe(true)
    expect(get('cItems', a.id)).toBeUndefined()
    const b = M.createPost({ title: '' }); M.markFreshBlank(b.id)
    put('cItems', { ...get('cItems', b.id), title: 'Something' })
    expect(M.dropIfBlank(b.id)).toBe(false)
    expect(get('cItems', b.id)).toBeTruthy()
    const c = M.createPost({ title: '' })
    expect(M.dropIfBlank(c.id)).toBe(false)
  })
})
