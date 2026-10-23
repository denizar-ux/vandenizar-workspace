import { put, patch, uid, settings, tz, all, get } from './store'
import { createInstagram, createThread, sectionsOf, tasksOf, setTaskStatus, markPublished, ensureReview, linkResource, createBatch, addToBatch, readinessOf, addTask, purge } from './model'
import { todayKey, addDays, zonedToIso } from './time'
import type { Resource } from './types'

export function loadDemo(now = new Date()): boolean {
  if (settings().demoLoaded) return false
  const z = tz()
  const today = todayKey(z, now), tomorrow = addDays(today, 1), day2 = addDays(today, 2)
  const at = (dk: string, hm: string) => zonedToIso(dk, hm, z)

  const pillar = put('taxonomy', { id: uid(), type: 'pillar', label: 'Creative decisions', lifecycle: 'active', createdAt: '', updatedAt: '' })
  for (const l of ['Process', 'Gear', 'Videographer life', 'Portfolio'])
    if (!all('taxonomy').some((t) => t.label === l)) put('taxonomy', { id: uid(), type: 'pillar', label: l, lifecycle: 'active', createdAt: '', updatedAt: '' })
  const series = put('taxonomy', { id: uid(), type: 'series', label: 'Project Reset', lifecycle: 'active', createdAt: '', updatedAt: '' })

  // 1. Talking head
  const a = createInstagram({ title: 'Grading bagus belum tentu cocok buat brand', format: 'reel', templateId: 'tpl-talking-head', demo: true })
  const bodies = ['Grading yang bagus belum tentu cocok buat brand.', 'Warna kain harus tetap akurat.', 'Bandingkan before dan after.', 'Mulai dari karakter brand, baru pilih look.']
  sectionsOf(a.id).forEach((s, i) => patch('sections', s.id, { body: bodies[i] || '' }))
  patch('contents', a.id, { pillarId: pillar.id, caption: 'Look yang keren di timeline bisa bikin warna produk melenceng. Buat brand fashion, kain harus terlihat seperti aslinya.', plannedPublishAt: at(day2, '19:00') })
  const ta = tasksOf(a.id)
  patch('tasks', ta[0].id, { title: 'Rapikan hook', estimateMinutes: 15, dueDate: today })
  patch('contents', a.id, { status: 'in_progress' })
  patch('tasks', ta[1].id, { dueDate: tomorrow })
  patch('tasks', ta[2].id, { plannedStart: at(tomorrow, '15:00'), plannedEnd: at(tomorrow, '16:00') })
  for (const [d, n] of [['Medium shot', 'Frame dada ke atas'], ['Close-up kain', 'Tekstur dan detail warna'], ['Before/after frame', 'Tampilkan perbedaan look']])
    put('shots', { id: uid(), contentId: a.id, description: d, notes: n, done: false, order: all('shots').length, createdAt: '', updatedAt: '' })

  // 2. BTS
  const b = createInstagram({ title: 'BTS lighting satu lampu', format: 'reel', templateId: 'tpl-bts', demo: true })
  patch('contents', b.id, { status: 'in_progress', seriesId: series.id, seriesDay: 'Day 4' })
  const tb = tasksOf(b.id)
  setTaskStatus(tb[0].id, 'done'); setTaskStatus(tb[1].id, 'done')
  addTask({ contentId: b.id, parentTaskId: tb[2].id, title: 'Tandai klip wide', activity: 'edit', demo: true })
  addTask({ contentId: b.id, parentTaskId: tb[2].id, title: 'Tandai klip detail lampu', activity: 'edit', demo: true })
  patch('tasks', tb[2].id, { plannedStart: at(today, '13:00'), plannedEnd: at(today, '14:00') })

  // 3. Carousel
  const c = createInstagram({ title: '3 hal sebelum mulai shoot', format: 'carousel', templateId: 'tpl-blank', demo: true })
  const slides = sectionsOf(c.id)
  patch('sections', slides[0].id, { label: 'Cek brief', body: 'Tahu dulu apa yang pengin audiens rasain setelah nonton.' })
  patch('sections', slides[1].id, { label: 'Cek warna produk', body: 'Foto produk di bawah lampu set, bandingkan dengan aslinya.' })
  patch('contents', c.id, { pillarId: pillar.id })

  // 4/5. Threads
  createThread({ text: 'Kadang masalahnya bukan gear. Yang lebih penting itu cara lihat, rasa, dan cerita yang mau disampein.', demo: true })
  createThread({ posts: [
    'Banyak proses kecil yang nggak kelihatan di hasil akhir satu video.',
    'Riset referensi, test shot di meja, sampai nyari mood warna yang pas buat kain.',
    'Yang ditonton cuma 30 detik. Persiapannya bisa dua hari.',
  ], demo: true })

  // 6. Published + review
  const p = createInstagram({ title: 'Grading & identitas brand', format: 'reel', templateId: 'tpl-talking-head', demo: true })
  tasksOf(p.id).forEach((t) => setTaskStatus(t.id, 'done'))
  readinessOf(p.id).forEach((r) => patch('readiness', r.id, { checked: true }))
  patch('contents', p.id, { plannedPublishAt: at(addDays(today, -3), '19:00'), caption: 'Warna yang konsisten bikin brand gampang dikenali.' })
  markPublished(p.id, at(addDays(today, -3), '19:10'))
  const r = ensureReview(p.id)
  patch('reviews', r.id, { responses: 'Banyak yang tanya soal warna kain.', lesson: 'Contoh before-after.', nextIdea: 'Cara cek warna produk.' })

  // Batch: three record-ish tasks from different content
  const batch = createBatch({ title: 'Batch talking head', startAt: at(tomorrow, '13:00'), endAt: at(tomorrow, '14:00'), location: 'Meja studio', demo: true })
  addToBatch(ta[1].id, batch.id)
  const extra = addTask({ contentId: c.id, title: 'Rekam B-roll checklist', activity: 'record', estimateMinutes: 20, demo: true })
  addToBatch(extra.id, batch.id)
  const w = addTask({ title: 'Tulis hook minggu depan', activity: 'write', estimateMinutes: 15, plannedStart: at(today, '10:00'), plannedEnd: at(today, '10:30'), demo: true })
  void w

  // Ideas
  put('ideas', { id: uid(), text: 'Tadi warna kain berubah setelah grading. Bisa jadi bahan breakdown.', preferredChannel: null, convertedContentIds: [], lifecycle: 'active', demo: true, createdAt: '', updatedAt: '' })
  put('ideas', { id: uid(), text: 'Setup meja buat edit malam, lampu apa saja yang dipakai', preferredChannel: 'threads', convertedContentIds: [], lifecycle: 'active', demo: true, createdAt: '', updatedAt: '' })

  // Resources
  const res = (x: Partial<Resource> & { title: string; type: Resource['type'] }) =>
    put('resources', { id: uid(), sourceKind: 'text', body: '', tags: [], pinned: false, lifecycle: 'active', demo: true, createdAt: '', updatedAt: '', ...x } as Resource)
  const r1 = res({ title: 'BTS lighting', type: 'footage', sourceKind: 'local_path', localPath: 'SSD / Ainayya / BTS / lighting', body: 'Contoh lokasi folder, ganti dengan path asli.', tags: ['bts', 'lighting'] })
  const r2 = res({ title: 'Detail kain', type: 'reference', sourceKind: 'web_link', url: 'https://example.com/contoh-referensi-kain', body: 'Contoh link, bukan file sungguhan.', tags: ['close-up', 'texture', 'brand'] })
  res({ title: 'Before-after grading', type: 'footage', sourceKind: 'text', body: 'Catatan: pakai frame yang sama, satu ungraded dan satu final.', tags: ['grading'] })
  res({ title: 'Hook: warna produk', type: 'hook', body: 'Warna di layar lu belum tentu warna kain aslinya.', tags: ['grading'] })
  res({ title: 'Brand voice Denizar', type: 'voice', pinned: true, body: '', voice: { tone: 'Jujur, tenang, proses dulu, tanpa klaim berlebihan.', audience: 'Videografer dan brand fashion lokal.', prefer: 'proses, kain, brief, look', avoid: 'rahasia sukses, wajib tahu, game changer', examples: 'Gue cek warna kain dulu sebelum mikir look.' } })
  linkResource(a.id, r1.id); linkResource(a.id, r2.id)

  // Template example: Project Reset
  put('templates', {
    id: uid(), name: 'Project Reset', channel: 'instagram', compatibleFormats: ['reel'],
    sections: [{ key: 'hook', label: 'Hook' }, { key: 'today', label: 'Hari ini ngapain' }, { key: 'lesson', label: 'Pelajaran' }],
    defaultTasks: [{ title: 'Rekam harian', activity: 'record', estimateMinutes: 20 }, { title: 'Edit cepat', activity: 'edit', estimateMinutes: 30 }],
    defaultReadiness: ['Video final', 'Caption'], lifecycle: 'active', createdAt: '', updatedAt: '',
  })

  patch('settings', 'settings', { demoLoaded: true })
  return true
}

/** Remove everything created by "Muat contoh" (keeps the user's own items). */
export function clearDemo() {
  for (const c of all('contents').filter((c) => c.demo)) purge('contents', c.id)
  for (const t of all('tasks').filter((t) => t.demo)) purge('tasks', t.id)
  for (const i of all('ideas').filter((i) => i.demo)) purge('ideas', i.id)
  for (const r of all('resources').filter((r) => r.demo)) purge('resources', r.id)
  for (const b of all('batches').filter((b) => b.demo)) purge('batches', b.id)
  if (get('settings', 'settings')) patch('settings', 'settings', { demoLoaded: false })
}
