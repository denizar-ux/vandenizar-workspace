// Brandkit, story formulas and the free "copy prompt for Claude" builders. Ported from the Dnzr Studio artifact (brand guide v1, formulas v3).
import { settings, patch, put, defaultSettings } from '../lib/store'

export interface Beat { n: string; p: number; ins: string }
export interface Formula { id: string; name: string; src?: string; desc?: string; hook?: string; beats: Beat[] }
export interface TypeMap { formula: string; car: string; cover: string }
export interface Brand {
  v: number
  name: string; role: string; handle: string; work: string; city: string; tagline: string; about: string
  colors: Record<string, string>
  fonts: Record<string, string>
  formulas: Formula[]
  typeMap: Record<string, TypeMap>
  voice: string; avoid: string; check: string; credit: string; cta: string; micro: string
}

export const COLOR_ROLES: [string, string, string][] = [['paper', 'Paper', 'carousel background, cards'], ['ink', 'Ink', 'main text'], ['grey', 'Grey', 'second text'], ['accent', 'Accent', 'one word, labels'], ['sand', 'Sand', 'blocks, lines'], ['espresso', 'Espresso', 'dark background'], ['onvideo', 'Text on video', 'all text on top of footage']]
export const FONT_ROLES: [string, string, string][] = [['display', 'Serif title', 'cover, carousel titles'], ['displayIt', 'Accent italic', 'accent word, second line'], ['caps', 'Caps title', 'poster, keywords'], ['body', 'Body', 'carousel body text'], ['label', 'Small label', 'kicker, spaced CAPS'], ['video', 'Grotesk bold', 'catatan carousel titles'], ['script', 'Handwriting', 'poster accent']]
export const FONT_FILES: Record<string, string> = { zEditors: 'editors-note', zEditorsIt: 'editors-note-italic', zCorm: 'cormorant', zCormIt: 'cormorant-italic', zHaas: 'altehaas', zHaasB: 'altehaas-bold', zSeasons: 'seasons', zSeasonsIt: 'seasons-italic', zViv: 'vivaldi', zBlosta: 'blosta-script', zMoneta: 'moneta', zAven: 'avenir', zAvenB: 'avenir-bold' }
export const FONT_NAMES: Record<string, string> = { zCorm: 'Cormorant Garamond', zCormIt: 'Cormorant Garamond italic', zEditors: "Editor's Note", zEditorsIt: "Editor's Note italic", Newsreader: 'Newsreader', NewsreaderIt: 'Newsreader italic', zHaas: 'Alte Haas Grotesk', zHaasB: 'Alte Haas Grotesk bold', zSeasons: 'The Seasons', zSeasonsIt: 'The Seasons italic', zMoneta: 'Moneta', zAven: 'Avenir', zAvenB: 'Avenir bold', zViv: 'Vivaldi', zBlosta: 'Blosta script' }

export const TYPES = [
  { id: 'story', name: 'Storytelling', hint: 'VO + B-roll, work or life story' },
  { id: 'work', name: 'BTS / process', hint: 'behind the scenes, how you make it' },
  { id: 'shotsetup', name: 'Shot vs Setup', hint: 'the result vs how it was made' },
  { id: 'tutorial', name: 'Tutorial / tips', hint: 'talking head, teaching something' },
  { id: 'desk', name: 'Desk / workspace', hint: 'easy, cozy, affiliate' },
]
/** Which content type each default weekly slot is. */
export const SLOT_TYPE: Record<string, string> = { work: 'work', shot: 'shotsetup', story: 'story', desk: 'desk' }

export const FORMULAS_DEFAULT: Formula[] = [
  { id: 'classic', name: 'Cerita singkat + pelajaran', src: 'Tommy Djoyo · pola 1', desc: 'Paling simpel. Satu kejadian kecil yang relatable, pelajarannya, terus nyambung ke kerjaan atau keseharian lu.', hook: 'Momen kecil yang spesifik, langsung ke kejadian. Contoh rasa: "Dulu tiap pagi aku [kebiasaan kecil]."',
    beats: [{ n: 'Ceritanya', p: 40, ins: 'Satu kejadian kecil yang relatable, diceritain kayak lagi ngobrol: kapan, di mana, lagi ngapain, apa yang dirasain.' }, { n: 'Pelajarannya', p: 25, ins: 'Apa yang dia sadari dari kejadian itu, satu kalimat jujur.' }, { n: 'Nyambung ke lu', p: 20, ins: 'Hubungin ke kerjaan, konten, atau kebiasaan dia sekarang. Tunjukin, jangan jualan.' }, { n: 'Ajakan ringan', p: 15, ins: 'Satu ajakan santai yang nyambung (coba, simpen, cerita di komen). Boleh dilewat kalau maksa.' }] },
  { id: 'hero', name: "Hero's journey", src: 'Tommy Djoyo · pola 2 & 7', desc: 'Cerita perubahan, termasuk versi underdog dari nol: dulu gimana, mentok di mana, udah nyoba apa, apa yang bikin berubah.', hook: 'Mulai dari kondisi dulu yang konkret. Contoh rasa: "Tiga tahun lalu aku masih [kondisi]."',
    beats: [{ n: 'Kenalin tokoh', p: 12, ins: 'Dia dulu: kondisi yang konkret dan agak nggak enak buat diakuin.' }, { n: 'Masalahnya', p: 16, ins: 'Masalah yang terus kejadian dan bikin kesel. Biar penonton ikut ngerasain.' }, { n: 'Udah nyoba', p: 18, ins: '2-3 hal yang udah dia coba dan gagal, singkat-singkat, makin lama makin putus asa.' }, { n: 'Titik balik', p: 20, ins: 'Satu momen yang ngubah: ketemu orang, sadar sesuatu, atau nyoba cara baru. Ceritain momennya, bukan teorinya.' }, { n: 'Sekarang', p: 20, ins: 'Bedanya sekarang, pake perbandingan konkret (angka, waktu, rasa). Jangan lebay.' }, { n: 'Ajakan', p: 14, ins: 'Ajak penonton yang ngerasa sama buat nyoba, santai, kayak ngasih tau temen.' }] },
  { id: 'dramatic', name: 'Dramatic arc', src: 'template cerita', desc: 'Cerita emosional: dari luar keliatan baik-baik aja, ada kejadian yang maksa milih, terus pelajarannya.', hook: 'Situasi yang keliatan normal tapi ada yang nggak beres. Contoh rasa: "Dari luar kerjaan aku keliatan aman."',
    beats: [{ n: 'Kelihatannya aman', p: 25, ins: 'Situasi yang dari luar baik-baik aja, terus ketauan dikit apa yang sebenernya kejadian.' }, { n: 'Kejadiannya', p: 25, ins: 'Satu momen yang maksa dia milih. Ceritain detik-detiknya.' }, { n: 'Yang dia sadari', p: 30, ins: 'Pelajaran yang dia dapet dan apa yang berubah dari cara dia kerja atau mikir.' }, { n: 'Yang nempel', p: 20, ins: 'Satu kalimat penutup yang jujur dan nempel. Nggak usah dijelasin lagi.' }] },
  { id: 'problem', name: 'Masalah, rasain, solusi', src: 'Tommy Djoyo · pola 3', desc: 'Mulai dari masalah yang sering dialamin penonton, bikin kerasa, terus solusinya dari pengalaman dia sendiri.', hook: 'Tanya atau sebut masalahnya langsung. Contoh rasa: "Pernah nggak sih [masalah]?"',
    beats: [{ n: 'Masalahnya', p: 15, ins: 'Sebut masalah yang sering dialamin penonton, pake kata-kata mereka sendiri.' }, { n: 'Rasain', p: 30, ins: 'Bikin kerasa: 2 detail sakitnya yang spesifik, plus "aku juga pernah" dengan kejadian nyata dia.' }, { n: 'Yang akhirnya kepake', p: 40, ins: 'Solusi dari pengalaman dia, praktis, bisa langsung dicoba.' }, { n: 'Langkah berikut', p: 15, ins: 'Satu langkah kecil yang bisa dicoba hari ini.' }] },
  { id: 'curiosity', name: 'Penasaran duluan', src: 'Tommy Djoyo · pola 4', desc: 'Buka pake pernyataan yang bikin penasaran, ceritanya nggak biasa, insight-nya di belakang.', hook: 'Pernyataan yang bikin mikir "kok bisa?". Contoh rasa: "Aku nggak nyangka satu [hal kecil] ngubah [hal besar]."',
    beats: [{ n: 'Bikin penasaran', p: 12, ins: 'Satu pernyataan nyata yang bikin orang mikir "kok bisa?". Fakta, bukan teaser kosong.' }, { n: 'Ceritanya', p: 40, ins: 'Cerita yang nggak biasa di balik pernyataan itu, urut, banyak detail.' }, { n: 'Insight-nya', p: 33, ins: 'Pelajaran yang bikin kaget dari cerita itu.' }, { n: 'Nyambung pelan', p: 15, ins: 'Hubungin ke kerjaan atau konten dia dengan halus, satu kalimat.' }] },
  { id: 'cliff', name: 'Cliffhanger', src: 'Tommy Djoyo · pola 5', desc: 'Masuk langsung di tengah kejadian, jawabannya ditahan lewat urutan cerita, dibuka di akhir.', hook: 'Langsung di tengah kejadian. Contoh rasa: "Jam 2 pagi, file klien aku ilang."',
    beats: [{ n: 'Di tengah kejadian', p: 15, ins: 'Langsung masuk ke momen paling tegang, tanpa pembukaan.' }, { n: 'Mundur dikit', p: 25, ins: 'Latar singkat: kenapa situasinya bisa sampe kayak gitu.' }, { n: 'Ditahan', p: 35, ins: 'Ceritain usaha dan kebingungannya, jawabannya belum dikasih. Jangan pake kalimat "tonton sampe habis".' }, { n: 'Jawabannya', p: 25, ins: 'Buka jawabannya dengan jelas dan memuaskan, plus satu kalimat penutup.' }] },
  { id: 'wish', name: 'Seandainya dulu tau', src: 'Tommy Djoyo · pola 6', desc: 'Penyesalan + pelajaran. Orang suka belajar dari kesalahan orang lain. Pas banget buat tips yang diceritain.', hook: 'Contoh rasa: "Seandainya dulu aku tau [hal ini], aku nggak bakal [kesalahan]."',
    beats: [{ n: 'Seandainya', p: 12, ins: 'Buka pake "seandainya dulu aku tau..." versi dia sendiri, spesifik.' }, { n: 'Kesalahannya', p: 33, ins: 'Kesalahan yang dia buat: apa yang kejadian, apa akibatnya, kenapa dulu dia mikir itu bener.' }, { n: 'Yang akhirnya ketemu', p: 40, ins: 'Cara dia benerin, konkret, bisa ditiru.' }, { n: 'Ajak coba', p: 15, ins: 'Ajak penonton yang lagi di posisi dia dulu buat nyoba, santai.' }] },
  { id: 'myth', name: 'Bongkar mitos', src: 'Tommy Djoyo · pola 8', desc: 'Bantah sesuatu yang orang yakini, pake pengalaman dan logika dia sendiri.', hook: 'Contoh rasa: "Banyak yang ngira [anggapan umum]. Aku juga dulu."',
    beats: [{ n: 'Yang orang kira', p: 15, ins: 'Anggapan umum yang mau dibantah, ditulis kayak orang biasa ngomong.' }, { n: 'Kenapa salah', p: 35, ins: 'Bongkar pake pengalaman nyata dia plus logika simpel. Tanpa nyindir penonton.' }, { n: 'Cara pikir baru', p: 35, ins: 'Perspektif yang dia pake sekarang dan contohnya.' }, { n: 'Nyambung ke lu', p: 15, ins: 'Satu kalimat soal gimana ini kepake di kerjaan atau konten dia.' }] },
  { id: 'fmvsc03sagg8l', name: 'Ref: Review standing desk studio', src: 'referensi', desc: 'Pembukanya relatable dan sekaligus jadi permainan kata, lalu detail produk selalu langsung dikasih arti buat pemakainya, jadi harga di akhir terasa seperti kejutan.', hook: 'Hook kalimat reflektif, contoh: "Hidup kadang suka gitu ya, kadang di atas kadang di bawah."',
    beats: [{ n: 'Hook reflektif', p: 8, ins: 'Satu kalimat pembuka tentang pengalaman hidup yang punya kiasan halus ke produk atau topik yang dibahas.' }, { n: 'Konteks setup', p: 12, ins: 'Urutan tempat atau tahap yang pernah dilalui, lalu tunjukin di tahap mana barang ini masuk.' }, { n: 'Spek dan bukti', p: 35, ins: '3-4 fakta produk, tiap fakta langsung disambung ke manfaat dan didemokan lewat aksi.' }, { n: 'Pengalaman pakai', p: 25, ins: 'Momen pertama pakai barangnya, satu hal yang bikin kaget, contoh situasi nyata kapan fitur itu berguna.' }, { n: 'Harga kejutan', p: 12, ins: 'Setelah semua nilai dijabarin, sebut harganya dengan reaksi jujur, bandingin sama ekspektasi awal.' }, { n: 'Rekomendasi', p: 8, ins: 'Satu kalimat saran jujur, buat tipe orang seperti apa barang ini cocok.' }] },
]

export const TYPEMAP_DEFAULT: Record<string, TypeMap> = {
  tutorial: { formula: 'wish', car: 'catatan', cover: 'editorial' },
  story: { formula: 'hero', car: 'editorial', cover: 'story' },
  work: { formula: 'cliff', car: 'editorial', cover: 'editorial' },
  shotsetup: { formula: 'curiosity', car: 'photo', cover: 'split' },
  desk: { formula: 'classic', car: 'photo', cover: 'story' },
}

export const BRAND_DEFAULT: Brand = {
  v: 1, name: 'vandenizar', role: 'Fashion videographer', handle: '@vandenizar', work: '@by.vandenizar', city: 'Bekasi', tagline: 'Fashion, film, dan ruang kerja yang tenang.',
  about: 'Denizar (@vandenizar), fashion videographer di Bekasi. Konten personal dia (Instagram, TikTok, Threads), bukan kerjaan klien. Pengen dikenal sebagai orang yang hidup di dunia produksi fashion: cinematic, tenang, dokumentasi proses kerja, ruang kerja cozy. Yang nonton: owner brand fashion & beauty, tim marketing, agency, sesama videografer.',
  colors: { paper: '#EEE8DE', ink: '#1D1915', grey: '#857A6E', accent: '#8A5A3B', sand: '#D9CBB8', espresso: '#3A2E26', onvideo: '#F3EADB' },
  fonts: { display: 'zCorm', displayIt: 'zCormIt', caps: 'zEditors', body: 'Newsreader', label: 'zHaas', video: 'zHaasB', script: 'zViv' },
  formulas: FORMULAS_DEFAULT, typeMap: TYPEMAP_DEFAULT,
  voice: ['CARA NULIS (biar nggak kaku):',
    '- Tulis kayak lagi cerita ke temen sambil ngopi, bukan kayak naskah presentasi. Dibaca keras harus kedengeran kayak orang ngomong.',
    '- Di kamera dia pake "aku/kamu". Pake kata ngobrol: nggak, udah, kalo, gimana, sampe, bikin, ngerti, kayak, banget, terus. Partikel (sih, kok, deh, ya, nih) secukupnya.',
    '- Jangan pake kata baku/formal: adalah, merupakan, tersebut, namun, sehingga, oleh karena itu, apabila, ialah, bagi, maka, yaitu, hal ini.',
    '- Kalimat pendek, 3-10 kata. Boleh kalimat nggak lengkap. Satu ide satu kalimat.',
    '- Detail konkret ngalahin kata sifat: sebut jam, tempat, angka, benda, atau kalimat persis yang diomongin orang.',
    '- Ceritain kejadian dulu, pelajaran belakangan. Tunjukin, jangan jelasin.',
    '- Instruksi formula itu fungsi ketukan, BUKAN kalimat buat dicopy.',
    '- Jangan pake pola "bukan X, tapi Y" atau "not X. Just Y.". Jangan kalimat suspense kosong. Jangan motivasi, menggurui, atau lebay. Jangan nyuruh follow.',
    '- Minim em dash. Jangan bikin daftar "pertama... kedua..." di dalam kalimat. Spesifik, nggak ada "para ahli bilang".',
    '- JANGAN NGARANG fakta hidup atau kerja dia. Detail personal yang nggak dikasih ditulis [kurung siku].',
    '- Dia main character. Kalau orang lain bisa posting video yang persis sama, gali "kenapa"-nya lagi.'].join('\n'),
  avoid: 'elevate, seamless, unlock, leverage, delve, navigate, robust, landscape, tapestry, game changer, level up',
  check: ['3 detik pertama ada "aku" + perasaan atau momen nyata', 'Ada 3 detail yang cuma dia yang punya', 'Ada kalimat belokan', 'Penutup jujur, nggak menggurui, nggak nyuruh follow', 'Lolos tes "orang lain bisa posting video persis sama?"', 'Tiap kalimat ada visualnya', 'Durasi pas, kebaca natural pas diomongin'].join('\n'),
  credit: 'Videography & edit: @vandenizar', cta: 'Simpen dulu, kepake pas shoot berikutnya.', micro: 'PRESENTED BY · VANDENIZAR',
}

const isObj = (o: unknown): o is Record<string, any> => !!o && typeof o === 'object' && !Array.isArray(o)
function mergeDefaults<T>(def: T, src: unknown): T {
  if (!isObj(src)) return structuredClone(def)
  const out: any = { ...src }
  for (const k of Object.keys(def as any)) {
    const d = (def as any)[k]
    if (!(k in src) || src[k] === undefined) out[k] = structuredClone(d)
    else if (isObj(d) && isObj(src[k])) out[k] = mergeDefaults(d, src[k])
  }
  return out
}

let cacheKey: unknown = null
let cacheVal: Brand = BRAND_DEFAULT
export function brand(): Brand {
  const raw = settings().brand
  if (raw === cacheKey) return cacheVal
  cacheKey = raw
  const b = mergeDefaults(BRAND_DEFAULT, raw)
  if (!Array.isArray(b.formulas) || !b.formulas.length) b.formulas = structuredClone(FORMULAS_DEFAULT)
  cacheVal = b
  return b
}
export function saveBrand(p: Partial<Brand>) {
  const cur = settings()
  const next = { ...brand(), ...p }
  if (cur.id && (cur as any).createdAt) patch('settings', 'settings', { brand: next } as any)
  else put('settings', { ...defaultSettings(), ...cur, brand: next } as any)
}
export function resetBrand() { saveBrand(structuredClone(BRAND_DEFAULT)) }

export const typeDef = (t?: string | null): TypeMap => ({ ...TYPEMAP_DEFAULT[t || 'story'] || TYPEMAP_DEFAULT.story, ...(brand().typeMap?.[t || 'story'] || {}) })
export const typeName = (t?: string | null) => TYPES.find((x) => x.id === t)?.name || 'Storytelling'
export const formulaById = (id?: string | null) => brand().formulas.find((f) => f.id === id)
export const famName = (f: string) => FONT_NAMES[f] || f

/** "0-4" style second ranges for each beat of a formula at a target length. */
export function beatTimes(f: Formula, len: number): string[] {
  const tot = f.beats.reduce((a, b) => a + Math.max(1, +b.p || 0), 0)
  let acc = 0
  return f.beats.map((b) => { const a = Math.round(acc / tot * len); acc += Math.max(1, +b.p || 0); return `${a}-${Math.round(acc / tot * len)}` })
}

// ---------- writing check (offline, no AI) ----------
const ID_AVOID = ['meningkatkan', 'tingkatkan', 'mulus', 'membuka potensi', 'memanfaatkan', 'menavigasi', 'lanskap', 'permadani', 'menyelami', 'kuat dan andal']
const FORMAL = ['adalah', 'merupakan', 'tersebut', 'namun', 'sehingga', 'oleh karena itu', 'apabila', 'ialah', 'yaitu', 'hal ini']
export interface Lint { label: string; hit: string }
export function lintText(text: string, mode: 'caption' | 'vo' = 'caption'): Lint[] {
  const t = String(text || '')
  if (!t.trim()) return []
  const out: Lint[] = []
  const add = (label: string, m: RegExpMatchArray | null) => { if (m) out.push({ label, hit: m[0].trim().slice(0, 48) }) }
  add('Em dash, pakai koma atau titik', t.match(/—|\s–\s/))
  add('Pola "bukan X, tapi Y"', t.match(/\bbukan\b[^.?!\n]{1,60}\btapi\b/i))
  add('Pola "not X. Just Y"', t.match(/\bnot\b[^.?!\n]{1,40}[.!]\s*(just|but)\b/i))
  add('Kalimat suspense', t.match(/here'?s the (kicker|thing)|tunggu sampe (akhir|habis)|tonton sampe (akhir|habis)|wait for it|you won'?t believe|sampai akhir ya/i))
  add('Daftar "pertama... kedua..."', t.match(/\bpertama\b[\s\S]{0,240}\bkedua\b/i))
  add('Ahli tanpa nama', t.match(/\b(para ahli|kata ahli|experts? say|studies show|studi menunjukkan|riset bilang)\b/i))
  add('Nyuruh follow', t.match(/\b(follow|ikuti)\b[^.\n]{0,30}\b(aku|gw|kita|akun|for more|untuk)\b/i))
  const words = [...brand().avoid.split(',').map((w) => w.trim()).filter(Boolean), ...ID_AVOID]
  for (const w of words) { const m = t.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i')); if (m) out.push({ label: 'Kata AI', hit: m[0] }) }
  if (mode === 'vo') for (const w of FORMAL) { const m = t.match(new RegExp(`\\b${w}\\b`, 'i')); if (m) out.push({ label: 'Kata baku', hit: m[0] }) }
  return out
}

// ---------- copy-prompt builders (paste into the Claude app: free) ----------
export function rules() {
  const b = brand()
  return `Kamu nulis buat ${b.about}\nATURAN NULIS (wajib):\n${b.voice}\n- Jangan pake kata: ${b.avoid}, atau padanan Indonesianya.`
}
export function formulaText(f: Formula, len: number) {
  const ts = beatTimes(f, len)
  return f.beats.map((b, i) => `${ts[i]} dtk | ${b.n} | ${b.ins}`).join('\n')
}

export const extractJson = (s: string): any => {
  const t = String(s || '').replace(/```(json)?/gi, '')
  const a = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i }))
  if (!isFinite(a)) return null
  const close = t[a] === '{' ? '}' : ']'
  const z = t.lastIndexOf(close)
  if (z <= a) return null
  try { return JSON.parse(t.slice(a, z + 1)) } catch { return null }
}
