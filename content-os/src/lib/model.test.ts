import { describe, it, expect, beforeEach } from 'vitest'
import { resetForTests, get, all } from './store'
import * as M from './model'
import { addDays } from './time'

beforeEach(() => { resetForTests(); M.ensureDefaults() })

describe('week slots', () => {
  it('fills a slot with the slot day as planned date and walks through the stages', () => {
    const w = '2026-10-19'
    const it = M.fillSlot(w, 'work', 'BTS shoot Ainayya')
    expect(it.date).toBe('2026-10-19')
    expect(M.fillSlot(w, 'story', 'x').date).toBe('2026-10-23')
    expect(M.slotItem(w, 'work')!.id).toBe(it.id)
    for (let i = 0; i < 5; i++) M.advance(it.id)
    expect(get('items', it.id)!.stage).toBe('done')
    expect(get('items', it.id)!.postedAt).toBeTruthy()
    M.advance(it.id)
    expect(get('items', it.id)!.stage).toBe('done')
    M.setStage(it.id, 'edit')
    expect(get('items', it.id)!.postedAt).toBeNull()
  })
  it('offers unfinished posts from earlier weeks and carries them over', () => {
    const w = '2026-10-19', next = addDays(w, 7)
    const a = M.fillSlot(w, 'shot', 'Lampu satu titik')
    expect(M.leftover(next, 'shot')!.id).toBe(a.id)
    M.moveToWeek(a.id, next)
    expect(M.slotItem(next, 'shot')!.date).toBe(addDays(next, 2))
    expect(M.slotItem(w, 'shot')).toBeUndefined()
    M.setStage(a.id, 'done')
    expect(M.leftover(addDays(next, 7), 'shot')).toBeUndefined()
  })
  it('moves ideas into slots or threads without losing text', () => {
    const idea = M.addIdea('Kopi sebelum edit\nritual kecil sebelum mulai')!
    const p = M.fillSlot('2026-10-19', 'desk', M.firstLine(idea.text), idea)
    expect(p.title).toBe('Kopi sebelum edit')
    expect(p.script).toContain('ritual kecil')
    expect(M.ideas().length).toBe(0)
    M.clearSlot(p.id)
    expect(M.ideas()[0].text).toContain('Kopi sebelum edit')
    const t = M.ideaToThread(M.ideas()[0].id)!
    expect(t.kind).toBe('thread')
    expect(M.threadDrafts().length).toBe(1)
    M.markPosted(t.id, true)
    expect(M.threadDrafts().length).toBe(0)
    expect(M.threadPosted().length).toBe(1)
    expect(M.addIdea('   ')).toBeNull()
    expect(all('items').filter((i) => i.kind === 'idea').length).toBe(0)
  })
})
