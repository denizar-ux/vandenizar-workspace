import { describe, it, expect } from 'vitest'
import * as store from './store'

function fakeServer() {
  const rows = new Map<string, store.Row>()
  let t = 1000
  const subs: ((r: store.Row[]) => void)[] = []
  const backend: store.Backend = {
    async push(batch) {
      for (const r of batch) {
        const row = { ...r, data: JSON.parse(JSON.stringify(r.data)), updated_at: new Date(t++ * 1000).toISOString() }
        rows.set(r.coll + '/' + r.id, row)
      }
    },
    async pullSince(c) { return [...rows.values()].filter((r) => !c || r.updated_at > c).sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1)) },
    subscribe(fn) { subs.push(fn); return () => {} },
  }
  return { rows, backend, remoteWrite(r: Omit<store.Row, 'updated_at'>) { const row = { ...r, updated_at: new Date(t++ * 1000).toISOString() }; rows.set(r.coll + '/' + r.id, row); subs.forEach((f) => f([row])) } }
}

describe('sync', () => {
  it('pushes local edits, applies remote changes and deletions, keeps unsent edits', async () => {
    store.resetForTests()
    const srv = fakeServer()
    await store.startSync(srv.backend, 'x@y.z')
    expect(store.P.mode).toBe('synced')
    store.put('items', { id: 'i1', text: 'satu', kind: 'idea', createdAt: '', updatedAt: '' })
    await store.flush()
    expect(srv.rows.get('items/i1')!.data.text).toBe('satu')

    // remote edit (another device) with a newer timestamp
    srv.remoteWrite({ coll: 'items', id: 'i1', deleted: false, data: { ...store.get('items', 'i1'), text: 'dua', updatedAt: '2999-01-01T00:00:00.000Z' } })
    expect((store.get('items', 'i1') as any).text).toBe('dua')

    // a local unsent edit is never overwritten by an incoming row
    store.patch('items', 'i1', { text: 'tiga' })
    srv.remoteWrite({ coll: 'items', id: 'i1', deleted: false, data: { ...store.get('items', 'i1'), text: 'remote', updatedAt: '3999-01-01T00:00:00.000Z' } })
    expect((store.get('items', 'i1') as any).text).toBe('tiga')
    await store.flush()
    expect(srv.rows.get('items/i1')!.data.text).toBe('tiga')

    // deletion travels as a tombstone
    store.remove('items', 'i1')
    await store.flush()
    expect(srv.rows.get('items/i1')!.deleted).toBe(true)
    srv.remoteWrite({ coll: 'items', id: 'i2', deleted: false, data: { id: 'i2', text: 'x', kind: 'idea', createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(store.get('items', 'i2')).toBeTruthy()
    srv.remoteWrite({ coll: 'items', id: 'i2', deleted: true, data: {} })
    expect(store.get('items', 'i2')).toBeUndefined()
  })

  it('keeps edits in the outbox when the push fails', async () => {
    store.resetForTests()
    const srv = fakeServer()
    let fail = true
    const b = { ...srv.backend, push: async (r: any) => { if (fail) throw new Error('Failed to fetch'); return srv.backend.push(r) } }
    await store.startSync(b, 'x@y.z')
    store.put('items', { id: 'k', text: 'offline', kind: 'idea', createdAt: '', updatedAt: '' })
    await store.flush()
    expect(store.P.status).toBe('offline')
    expect(store.pendingCount()).toBe(1)
    fail = false
    await store.flush()
    expect(srv.rows.get('items/k')!.data.text).toBe('offline')
    expect(store.pendingCount()).toBe(0)
  })
})
