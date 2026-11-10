// Per-post Studio data (script, cover, carousel), local photo storage, prompts and file downloads.
import { useEffect, useState } from 'react'
import { get, patch, uid } from '../lib/store'
import { slotById } from '../lib/model'
import type { Item, StudioData, CoverData, CarouselData, Slide, ImgRef, ScriptBeat } from '../lib/types'
import { brand, typeDef, formulaById, beatTimes, rules, formulaText, typeName, type Formula } from './brand'

// ---------- defaults ----------
export function ctypeOf(it: Item): string {
  if (it.studio?.type) return it.studio.type
  const s = slotById(it.slot)
  if (s) { const byId: Record<string, string> = { work: 'work', shot: 'shotsetup', story: 'story', desk: 'desk' }; if (byId[s.id]) return byId[s.id]; if (/shot/i.test(s.name)) return 'shotsetup'; if (/desk/i.test(s.name)) return 'desk'; if (/work|bts/i.test(s.name)) return 'work' }
  return 'story'
}
export function studioOf(it: Item): Required<Pick<StudioData, 'formula' | 'len' | 'beats'>> & StudioData {
  const s = it.studio || {}
  const t = ctypeOf(it)
  const f = formulaById(s.formula) || formulaById(typeDef(t).formula) || brand().formulas[0]
  return { ...s, type: t, formula: f.id, len: s.len || 45, beats: s.beats || [] }
}
export function curFormula(it: Item): Formula { return formulaById(studioOf(it).formula) || brand().formulas[0] }
export function beatsFromFormula(f: Formula, len: number, keep: ScriptBeat[] = []): ScriptBeat[] {
  const ts = beatTimes(f, len)
  return f.beats.map((b, i) => ({ name: b.n, time: ts[i], vo: keep[i]?.vo || '', visual: keep[i]?.visual || '', screen: keep[i]?.screen || '' }))
}
export function setStudio(id: string, p: Partial<StudioData>) {
  const it = get('items', id); if (!it) return
  const next = { ...(it.studio || {}), ...p }
  const extra: Partial<Item> = { studio: next }
  if (p.beats) extra.script = scriptPlain(next.beats || [])
  patch('items', id, extra)
}
export const plainLine = (s: string) => s.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
export function scriptPlain(beats: ScriptBeat[]) {
  return beats.filter((b) => b.vo.trim() || b.visual.trim()).map((b) => `[${b.time} dtk · ${b.name}]\n${b.vo.trim()}${b.visual.trim() ? `\n(visual: ${b.visual.trim()})` : ''}${b.screen.trim() ? `\n(teks: ${b.screen.trim()})` : ''}`).join('\n\n')
}
export const wordCount = (beats: ScriptBeat[]) => beats.reduce((a, b) => a + plainLine(b.vo).split(' ').filter(Boolean).length, 0)
export const beatsWritten = (it: Item) => (it.studio?.beats || []).filter((b) => b.vo.trim()).length

export function coverOf(it: Item): CoverData {
  const b = brand()
  return { tpl: typeDef(ctypeOf(it)).cover, fmt: 'reel', kicker: '', title: '', accent: '', micro: b.micro, size: 100, y: 0, align: 'center', grade: true, dark: false, photo: null, titleTouched: false, ...(it.cover || {}) }
}
export function coverTitle(it: Item) { const c = coverOf(it); return c.titleTouched ? c.title : (c.title || plainLine(it.hook || '') || it.title || '') }
export function setCover(id: string, p: Partial<CoverData>) { const it = get('items', id); if (it) patch('items', id, { cover: { ...coverOf(it), ...p } }) }

export function carouselOf(it: Item): CarouselData { return { tpl: typeDef(ctypeOf(it)).car, ratio: '45', num: true, foot: true, slides: [], ...(it.carousel || {}) } }
export function setCarousel(id: string, p: Partial<CarouselData>) { const it = get('items', id); if (it) patch('items', id, { carousel: { ...carouselOf(it), ...p } }) }
export const newSlide = (kind: string, o: Partial<Slide> = {}): Slide => ({ id: 's' + uid().slice(0, 10), kind, kicker: '', title: '', body: '', caption: '', photo: null, py: 50, zoom: 100, dark: false, ...o })
/** Basic slides from the script, no AI: cover from the hook, one slide per written beat, an end slide. */
export function slidesFromScript(it: Item): Slide[] {
  const out = [newSlide('cover', { title: plainLine(it.hook || '') || it.title || '' })]
  for (const b of it.studio?.beats || []) {
    const ls = b.vo.replace(/\*/g, '').split('\n').map((x) => x.trim()).filter(Boolean)
    if (ls.length) out.push(newSlide('text', { kicker: b.name, title: ls[0], body: ls.slice(1).join(' ') }))
  }
  out.push(newSlide('end'))
  return out
}

// ---------- photos: kept on this device (IndexedDB), not synced ----------
const idb = (() => {
  let dp: Promise<IDBDatabase> | null = null
  const open = () => dp || (dp = new Promise((res, rej) => { const r = indexedDB.open('dnzr-studio-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }))
  const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void) => open().then((d) => new Promise<T>((res, rej) => { const t = d.transaction('blobs', mode); const q = fn(t.objectStore('blobs')); t.oncomplete = () => res(q ? (q as IDBRequest).result : undefined); t.onerror = () => rej(t.error) }))
  return { put: (k: string, v: Blob) => tx<void>('readwrite', (s) => s.put(v, k)), get: (k: string) => tx<Blob | undefined>('readonly', (s) => s.get(k)) }
})()
/** Shrink big photos so a cover or slide stays fast to draw. */
async function shrink(file: Blob, max = 2400): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (s >= 1 && file.size < 3e6) return file
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.9))
  } catch { return file }
}
export async function savePhoto(file: Blob): Promise<ImgRef> { const k = 'p' + uid().slice(0, 12); await idb.put(k, await shrink(file)); return { idb: k } }
const imgCache = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImg(ref?: ImgRef | null): Promise<HTMLImageElement | null> {
  if (!ref?.idb) return Promise.resolve(null)
  let p = imgCache.get(ref.idb)
  if (!p) {
    p = idb.get(ref.idb).then((b) => new Promise<HTMLImageElement | null>((res) => { if (!b) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = URL.createObjectURL(b) })).catch(() => null)
    imgCache.set(ref.idb, p)
  }
  return p
}
export function useImg(ref?: ImgRef | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const k = ref?.idb || ''
  useEffect(() => { let on = true; setImg(null); loadImg(ref).then((i) => { if (on) setImg(i) }); return () => { on = false } }, [k])
  return { img, missing: !!k && img === null }
}

// ---------- downloads ----------
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
/** iPhone: hand the PNG to the share sheet (Save Image) when possible. */
export async function shareOrDownload(name: string, blob: Blob) {
  const f = new File([blob], name, { type: blob.type })
  const nav = navigator as any
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && nav.canShare?.({ files: [f] })) { try { await nav.share({ files: [f] }); return } catch (e: any) { if (e?.name === 'AbortError') return } }
  downloadBlob(name, blob)
}
export const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
export const safeName = (s: string) => (s || 'dnzr').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'dnzr'

// ---------- prompts for the Claude app (copy, paste, paste the answer back) ----------
function ctx(it: Item) {
  const s = studioOf(it)
  return `Jenis konten: ${typeName(s.type)}.\nJudul/ide: ${it.title || '(belum ada)'}\n${s.idea ? `Ide mentah: ${s.idea}\n` : ''}Fakta asli dari dia: ${s.facts || '(belum ada, pake [kurung siku] buat detail personal)'}${s.refText ? `\n\nSCRIPT REFERENSI (contoh struktur aja, JANGAN dicontek kalimatnya, maksimal 4 kata berurutan yang sama):\n"""${s.refText.slice(0, 3000)}"""` : ''}`
}
export function promptAngles(it: Item) {
  const list = brand().formulas.map((f) => `- ${f.name}: ${f.desc || ''} (${f.beats.map((b) => b.n).join(' → ')})`).join('\n')
  return `${rules()}\n\n${ctx(it)}\n\nFORMULA YANG ADA:\n${list}\n\nKasih 3 angle (sudut cerita) yang beda arah buat konten ini. Semua angle harus berbentuk CERITA: ada momen atau kejadian nyata dari hidup/kerjaan dia (pake [kurung siku] kalau belum dikasih), bukan daftar tips. Tiap angle: judul (maks 6 kata), ceritanya jadi tentang apa (1 kalimat), kenapa personal buat dia (1 kalimat), formula yang cocok, dan hook 0-3 detik (bahasa Indonesia aku/kamu). Tulis rapi, tanpa basa-basi pembuka.`
}
export function promptScript(it: Item) {
  const s = studioOf(it); const f = curFormula(it); const len = s.len
  return `${rules()}\n\n${ctx(it)}\n${it.hook?.trim() ? `Hook (pake persis di baris pertama): "${plainLine(it.hook)}"` : `Hook: bikin sendiri, pola "${f.hook || ''}"`}\nFormula cerita: ${f.name}. ${f.desc || ''}\nDurasi target: ${len} detik (±${Math.round(len * 2.4)} kata).\n\nKETUKAN (detik | nama | instruksi):\n${formulaText(f, len)}\n\nTulis script VO STORYTELLING ngikutin fungsi tiap ketukan, satu objek per ketukan, urutannya sama. Instruksi ketukan itu fungsi, bukan kalimat buat dicopy. Baca keras dalam kepala: kalimat yang kedengeran kayak tulisan atau iklan, tulis ulang jadi omongan. Pecah VO jadi baris pendek (2-7 kata, pisahin pake \\n). Tandai 2-4 kata kunci pake *bintang*. "visual" = shot yang nunjukin kalimatnya. "screen" = teks besar di layar 1-4 kata, atau "".\nJuga kasih shot list singkat.\nBalas HANYA JSON: {"hook":"...","beats":[{"name":"...","time":"0-4","vo":"baris1\\nbaris2","visual":"...","screen":"..."}],"shots":["..."]}`
}
export function promptCaption(it: Item) {
  const s = studioOf(it)
  const body = (it.studio?.beats || []).map((b) => plainLine(b.vo)).filter(Boolean).join(' ')
  return `${rules()}\n\nTulis caption Instagram buat postingan ini.\nJenis konten: ${typeName(s.type)}\nJudul: ${it.title || ''}\nIsi postingan: ${body || s.idea || it.title || ''}\nFakta asli: ${s.facts || '(nggak ada tambahan)'}\nBahasa: English natural, simple. Panjang: 2-4 kalimat.\nBaris pertama harus kuat (kebaca sebelum "more"). Jangan tulis credit. Jangan hashtag. Maksimal 1 emoji.\nKasih 3 opsi yang beda arah, dipisah garis kosong, tanpa nomor atau penjelasan.`
}
export function promptCheck(it: Item) {
  const items = brand().check.split('\n').map((x) => x.trim()).filter(Boolean)
  return `${rules()}\n\nCek script ini pake checklist. Durasi target ${studioOf(it).len} detik.\nHOOK: ${plainLine(it.hook || '')}\nSCRIPT:\n${scriptPlain(it.studio?.beats || [])}\n\nCHECKLIST:\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nTiap poin: lolos atau nggak, plus 1 kalimat (kalau nggak lolos: baris mana yang bermasalah + saran ganti yang pendek). Jangan muji.`
}
