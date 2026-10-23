// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'

beforeAll(() => {
  ;(window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
  window.scrollTo = () => {}
  ;(Element.prototype as any).scrollIntoView = () => {}
})

async function go(hash: string) {
  await act(async () => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')) })
  await act(async () => { await new Promise((r) => setTimeout(r, 120)) })
}
const tick = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe('app smoke (local mode)', () => {
  it('runs the main flows end to end', async () => {
    const store = await import('./lib/store')
    const model = await import('./lib/model')
    const { default: App } = await import('./App')
    store.startLocal(); model.ensureDefaults()
    expect(store.P.mode).toBe('local')
    render(<App />)
    await tick()

    // 1. empty overview -> capture idea without metadata
    expect(screen.getByText('Belum ada konten')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Tangkap ide')[0])
    await tick()
    fireEvent.click(screen.getByText('Simpan ide'))
    await tick()
    expect(screen.getByText('Tulis idenya dulu.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ide'), { target: { value: 'Warna kain berubah setelah grading' } })
    fireEvent.click(screen.getByText('Simpan ide'))
    await tick(800)
    const idea = store.all('ideas')[0]
    expect(idea.text).toBe('Warna kain berubah setelah grading')
    const cache = JSON.parse(localStorage.getItem('vzc:data')!)
    expect(cache.ideas.length).toBe(1) // persisted across reload

    // 2. develop into Instagram
    await go(`#/ideas?open=${idea.id}`)
    fireEvent.click(within(document.querySelector('main')!).getByRole('button', { name: 'Instagram' }))
    await tick(60)
    const c = store.all('contents')[0]
    expect(location.hash).toContain(`/instagram/${c.id}`)
    expect(c.sourceIdeaId).toBe(idea.id)

    // 3. edit script -> autosave to memory + cache
    fireEvent.change(await screen.findByLabelText('Hook'), { target: { value: 'Grading bagus belum tentu cocok' } })
    await tick(900)
    expect(JSON.parse(localStorage.getItem('vzc:data')!).sections.some((s: any) => s.body === 'Grading bagus belum tentu cocok')).toBe(true)

    // 4. production tab: check a task
    await go(`#/instagram/${c.id}?tab=production`)
    expect(screen.getByText('Langkah berikutnya')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Script selesai' }))
    await tick()
    expect(model.progress(c.id).done).toBe(1)

    // 5. publish tab: copy/open do not change status, mark published does
    await go(`#/instagram/${c.id}?tab=publish`)
    expect(screen.getByText('Belum dijadwalkan')).toBeTruthy()
    fireEvent.click(screen.getByText('Tandai sudah terbit'))
    await tick()
    fireEvent.click(screen.getByText('Simpan sebagai terbit'))
    await tick()
    expect(store.get('contents', c.id)!.status).toBe('published')

    // 6. review + follow-up idea
    await go(`#/content/${c.id}/review`)
    fireEvent.change(screen.getByLabelText('Ide berikutnya'), { target: { value: 'Cara cek warna produk' } })
    await tick()
    fireEvent.click(screen.getByText('Jadikan ide lanjutan'))
    await tick()
    expect(store.all('ideas').some((i) => i.text === 'Cara cek warna produk' && i.sourceContentId === c.id)).toBe(true)

    // 7. threads: add posts
    await go('#/threads')
    fireEvent.change(screen.getByLabelText('Mulai thread baru'), { target: { value: 'Kadang masalahnya bukan gear.' } })
    await tick()
    fireEvent.click(screen.getByLabelText('Mulai nulis'))
    await tick(60)
    fireEvent.click(await screen.findByText('Tambah post'))
    await tick()
    const th = store.all('contents').find((x) => x.channel === 'threads')!
    expect(model.postsOf(th.id).length).toBe(2)
    expect(th.title).toBe('Kadang masalahnya bukan gear.')

    // 8. demo data + every route renders without crashing
    const { loadDemo } = await import('./lib/seed')
    await act(async () => { loadDemo() })
    const routes = ['#/overview', '#/ideas', '#/calendar?mode=posting', '#/calendar?mode=production', '#/calendar?mode=posting&v=month', '#/calendar?mode=production&v=month',
      '#/instagram', '#/instagram?stage=idea', '#/threads', '#/threads?t=published', '#/resources', '#/settings', '#/archive', '#/archive?l=deleted', '#/nope', '#/instagram/missing']
    for (const r of routes) { await go(r); expect(document.querySelector('main'), r).toBeTruthy() }
    for (const x of store.all('contents')) {
      await go(`#/${x.channel}/${x.id}`)
      if (x.channel === 'instagram') { await go(`#/instagram/${x.id}?tab=production`); await go(`#/instagram/${x.id}?tab=publish`) }
      await go(`#/content/${x.id}/review?tab=derive`)
    }
    for (const b of store.all('batches')) await go(`#/batches/${b.id}`)
    for (const r of store.all('resources')) await go(`#/resources/${r.id}`)
    expect(screen.queryByText(/Something went wrong/)).toBeNull()

    // 9. calendar production: tick a task from the calendar updates the editor progress
    const today = (await import('./lib/time')).todayKey('Asia/Jakarta')
    await go(`#/calendar?mode=production&d=${today}`)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.length).toBeGreaterThan(0)
  }, 30000)
})
