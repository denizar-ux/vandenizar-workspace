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
    // custom date inside next week keeps the slot when it is free there
    M.setPostDate(p.id, addDays(W, 9))
    expect(get('items', p.id)!.week).toBe(addDays(W, 7))
    expect(get('items', p.id)!.slot).toBe('shot')
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

describe('up next', () => {
  const T = '2026-10-21' // Wednesday
  it('picks late first, then film today, then post today, then empty slot or next post', () => {
    expect(M.upNext(T)).toMatchObject({ type: 'empty' })
    const work = M.createPost({ title: 'Mon post', week: W, slot: 'work' })
    const shot = M.createPost({ title: 'Wed post', week: W, slot: 'shot' })
    expect(M.upNext(T)).toMatchObject({ type: 'late', item: { id: work.id } })
    M.setStage(work.id, 'done')
    expect(M.upNext(T)).toMatchObject({ type: 'post', item: { id: shot.id } })
    const story = M.createPost({ title: 'Fri post', week: W, slot: 'story' })
    put('items', { ...get('items', story.id)!, filmDate: T })
    expect(M.upNext(T)).toMatchObject({ type: 'film', item: { id: story.id } })
    M.setStage(shot.id, 'done'); M.setStage(story.id, 'edit')
    // Friday is planned, Saturday desk is empty, so the next planned post comes first
    expect(M.upNext(T)).toMatchObject({ type: 'next', item: { id: story.id } })
    M.setStage(story.id, 'done')
    expect(M.upNext(T)).toMatchObject({ type: 'empty', slot: { id: 'desk' } })
    M.createPost({ title: 'desk', week: W, slot: 'desk' }); M.setStage(M.slotItem(W, 'desk')!.id, 'done')
    expect(M.upNext(T)).toMatchObject({ type: 'clear', posted: 4 })
  })
})

describe('ideas and threads', () => {
  it('moves ideas into posts or threads without losing text', () => {
    const idea = M.addIdea('Coffee before editing\na small ritual before I start')!
    const p = M.createPost({ title: M.firstLine(idea.text), week: W, slot: 'desk', fromIdea: idea })
    expect(p.title).toBe('Coffee before editing')
    expect(p.notes).toContain('small ritual')
    expect(M.ideas().length).toBe(0)
    M.backToIdeas(p.id)
    expect(M.ideas()[0].text).toContain('Coffee before editing')
    const t = M.ideaToThread(M.ideas()[0].id)!
    expect(t.kind).toBe('thread')
    M.markPosted(t.id, true)
    expect(M.threadDrafts().length).toBe(0)
    expect(M.threadPosted().length).toBe(1)
    expect(M.addIdea('   ')).toBeNull()
    expect(all('items').filter((i) => i.kind === 'idea').length).toBe(0)
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
    expect(M.backToIdeas(p.id)!.text).toContain('drive.google.com')
  })
  it('notification prefs default and save', () => {
    expect(M.notifyPrefs()).toEqual({ morning: true, morningTime: '08:00', postReminder: true, postTime: '19:00' })
    M.setNotify({ postTime: '20:30' })
    expect(M.notifyPrefs().postTime).toBe('20:30')
    expect(settings().notify!.morning).toBe(true)
  })
})
