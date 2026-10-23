// Shared actions used by list cards and editor menus.
import { get, patch, settings } from './store'
import { setLifecycle, setStatus, missingReadiness, duplicateContent, unpublish } from './model'
import { ask, toast } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { go } from './router'
import type { Status } from './types'
import { STATUS_LABEL } from './templates'

export async function changeStage(id: string, to: Status) {
  const c = get('contents', id); if (!c || c.status === to) return
  if (to === 'published') { openSheet({ type: 'publish', contentId: id }); return }
  if (c.status === 'published') {
    const r = await ask({ title: 'Tandai belum terbit?', body: 'Waktu terbit akan dihapus dan konten kembali ke tahap yang dipilih. Review tetap tersimpan.', confirm: 'Ya, belum terbit' })
    if (r !== 'confirm') return
    unpublish(id)
    if (to !== 'ready') setStatus(id, to)
    toast('Status dikoreksi')
    return
  }
  if (to === 'ready' && c.channel === 'instagram') {
    const miss = missingReadiness(id)
    if (miss.length) {
      const r = await ask({ title: 'Checklist belum lengkap', body: <>Belum dicentang: <b>{miss.map((m) => m.label).join(', ')}</b>. Tetap pindah ke Siap tayang?</>, confirm: 'Tetap pindah', extra: 'Buka checklist' })
      if (r === 'extra') { go(`/instagram/${id}?tab=publish`); return }
      if (r !== 'confirm') return
    }
  }
  setStatus(id, to as Exclude<Status, 'published'>)
  toast(`Pindah ke ${c.channel === 'threads' ? (to === 'ready' ? 'Siap' : 'Draft') : STATUS_LABEL[to]}`)
}

export function lifecycleAction(id: string, lc: 'parked' | 'archived' | 'deleted', after?: () => void) {
  setLifecycle('contents', id, lc)
  const msg = lc === 'parked' ? 'Konten diparkir' : lc === 'archived' ? 'Konten diarsip' : 'Dipindah ke Sampah'
  toast(msg, { label: 'Batal', run: () => setLifecycle('contents', id, 'active') })
  after?.()
}

export function duplicate(id: string) {
  const c = duplicateContent(id)
  toast('Salinan dibuat', { label: 'Buka', run: () => go(`/${c.channel}/${c.id}`) })
  return c
}

export function togglePin(id: string) {
  const st = settings()
  const on = st.pinnedContentId === id
  patch('settings', 'settings', { pinnedContentId: on ? null : id })
  toast(on ? 'Pin dilepas dari Overview' : 'Dipin ke Overview')
}
