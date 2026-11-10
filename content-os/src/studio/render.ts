// @ts-nocheck
// Canvas engine for covers and carousel slides, ported from Dnzr Studio. Draws at 1080 wide.
import { FONT_FILES, type Brand } from './brand'

let B: Brand
export function useBrandForDraw(b: Brand) { B = b }

// ---------- fonts (served from /fonts, loaded once when a Studio tool opens) ----------
let fontsP: Promise<unknown> | null = null
export function loadFonts() {
  if (fontsP) return fontsP
  const faces: Promise<unknown>[] = []
  const add = (fam: string, file: string, style = 'normal') => {
    try { const f = new FontFace(fam, `url(/fonts/${file}.woff2)`, { style }); (document as any).fonts.add(f); faces.push(f.load().catch(() => null)) } catch { /* old browser */ }
  }
  Object.entries(FONT_FILES).forEach(([fam, file]) => add(fam, file))
  add('Newsreader', 'newsreader'); add('Newsreader', 'newsreader-italic', 'italic')
  fontsP = Promise.all(faces)
  return fontsP
}
const FAMCSS = { NewsreaderIt: 'Newsreader' }
const FAMSTYLE = { NewsreaderIt: 'italic ' }
export const fontStack = (f: string) => `${FAMSTYLE[f] || ''}"${FAMCSS[f] || f}", Georgia, serif`

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export function mixHex(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('') }
const caseT = (w, cs) => cs === 'upper' ? w.toUpperCase() : cs === 'lower' ? w.toLowerCase() : w

function setFont(ctx, f) { const fm = f.fam; ctx.font = `${FAMSTYLE[fm] || ''}${Math.round(f.size)}px "${FAMCSS[fm] || fm}", Georgia, serif`; try { ctx.letterSpacing = ((f.ls || 0) * f.size).toFixed(1) + 'px' } catch { /* */ } }
function txt(ctx, s, x, y, fm, size, col, { ls = 0, align = 'left', shadow = true } = {}) { ctx.save(); setFont(ctx, { fam: fm, size, ls }); ctx.textAlign = align; ctx.fillStyle = col; if (shadow) { ctx.shadowColor = 'rgba(12,8,5,.5)'; ctx.shadowBlur = size * 0.35 } ctx.fillText(s, x, y); ctx.restore() }

let noise = null
function noiseTile() { if (noise) return noise; noise = document.createElement('canvas'); noise.width = noise.height = 256; const g = noise.getContext('2d'); const d = g.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 } g.putImageData(d, 0, 0); return noise }
function filmLook(ctx, W, H) {
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,170,110,.22)'; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = 'rgba(34,24,16,1)'; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'multiply'; const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(120,100,85,1)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07; ctx.fillStyle = ctx.createPattern(noiseTile(), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore()
}
const srcSize = (s) => [s.naturalWidth || s.width || 0, s.naturalHeight || s.height || 0]
function drawFill(ctx, src, x, y, w, h, { zoom = 100, px = 50, py = 50 } = {}) {
  const [sw, sh] = srcSize(src); if (!sw || !sh) return false
  const s = Math.max(w / sw, h / sh) * (zoom / 100); const dw = sw * s, dh = sh * s
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(src, x + (w - dw) * (px / 100), y + (h - dh) * (py / 100), dw, dh); ctx.restore(); return true
}
export function placeholderBg(ctx, W, H, dark) {
  const c = B.colors; const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, dark ? c.espresso : mixHex(c.sand, c.paper, 0.3)); g.addColorStop(1, dark ? mixHex(c.espresso, '#000000', 0.45) : mixHex(c.sand, c.accent, 0.35)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = dark ? 0.35 : 0.5; ctx.fillStyle = dark ? mixHex(c.espresso, '#000000', 0.3) : mixHex(c.accent, c.sand, 0.45)
  ctx.beginPath(); ctx.arc(W / 2, H * 0.42, W * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(W / 2, H * 0.86, W * 0.36, H * 0.3, 0, Math.PI, 0); ctx.fill(); ctx.restore()
}

// ---------- rich text: *word* or _word_ = accent italic ----------
function richRuns(text) { return String(text || '').split('\n').map((line) => { const runs = []; const re = /\*([^*]+)\*|_([^_]+)_|([^*_]+)/g; let m; while ((m = re.exec(line))) { if (m[1] || m[2]) runs.push({ t: m[1] || m[2], it: true }); else runs.push({ t: m[3], it: false }) } return runs }) }
function wrapRich(ctx, text, fR, fI, size, maxW) {
  const lines = []
  richRuns(text).forEach((par) => {
    const toks = []; par.forEach((r) => { const tt = caseT(r.t, (r.it ? fI : fR).cs); tt.split(/(\s+)/).forEach((w) => { if (w) toks.push({ t: w, it: r.it }) }) })
    let cur = [], w = 0; const pop = () => { while (cur.length && /^\s+$/.test(cur[cur.length - 1].t)) w -= cur.pop().w }
    toks.forEach((tk) => { const sp = /^\s+$/.test(tk.t); const f = tk.it ? fI : fR; setFont(ctx, { fam: f.fam, size: size * (f.mul || 1), ls: f.ls || 0 }); const tw = ctx.measureText(sp ? ' ' : tk.t).width
      if (!sp && cur.length && w + tw > maxW) { pop(); lines.push({ runs: cur, w }); cur = []; w = 0 }
      if (sp && !cur.length) return; cur.push({ t: sp ? ' ' : tk.t, it: tk.it, w: tw }); w += tw })
    pop(); lines.push({ runs: cur, w })
  })
  return lines
}
function drawRich(ctx, lines, x, y, lh, fR, fI, size, col, colIt, align, shadow?) {
  lines.forEach((ln, i) => { let xx = align === 'center' ? x - ln.w / 2 : align === 'right' ? x - ln.w : x
    ln.runs.forEach((r) => { const f = r.it ? fI : fR; ctx.save(); setFont(ctx, { fam: f.fam, size: size * (f.mul || 1), ls: f.ls || 0 }); ctx.fillStyle = r.it ? colIt : col; ctx.textBaseline = 'alphabetic'; if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = size * 0.3 } ctx.fillText(r.t, xx, y + i * lh); ctx.restore(); xx += r.w }) })
  return lines.length * lh
}
function fitRich(ctx, text, fR, fI, size, maxW, maxLines) { let s = size, ls = []; for (let k = 0; k < 14; k++) { ls = wrapRich(ctx, text, fR, fI, s, maxW); if (ls.length <= maxLines && ls.every((l) => l.w <= maxW + 1)) break; s *= 0.92 } return { lines: ls, size: s } }
function label(ctx, s, x, y, size, col, align?, ls?) { txt(ctx, String(s || '').toUpperCase(), x, y, B.fonts.label, size, col, { ls: ls ?? 0.22, align: align || 'left', shadow: false }) }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h) }
function photoBox(ctx, img, x, y, w, h, r, s, dark) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip()
  if (img) drawFill(ctx, img, x, y, w, h, { zoom: s.zoom || 100, px: 50, py: s.py ?? 50 })
  else { ctx.fillStyle = dark ? mixHex(B.colors.espresso, '#000000', 0.25) : mixHex(B.colors.sand, B.colors.paper, 0.25); ctx.fillRect(x, y, w, h); ctx.fillStyle = dark ? B.colors.grey : mixHex(B.colors.grey, B.colors.paper, 0.2); ctx.textAlign = 'center'; setFont(ctx, { fam: B.fonts.label, size: 24, ls: 0.2 }); ctx.fillText('ADD A PHOTO', x + w / 2, y + h / 2 + 8) }
  ctx.restore()
}

// ---------- carousel ----------
export const carH = (c) => c.ratio === '34' ? 1440 : 1350
export function drawSlide(ctx, W, H, s, i, n, car, img) {
  const C = B.colors, F = B.fonts; const M = 88; const tpl = car.tpl
  const num = car.num ? `${String(i + 1).padStart(2, '0')}/${String(n).padStart(2, '0')}` : ''; const last = i === n - 1
  const title = s.title || (s.kind === 'end' ? B.cta : '')
  if (tpl === 'photo') {
    if (img) drawFill(ctx, img, 0, 0, W, H, { zoom: s.zoom || 100, px: 50, py: s.py ?? 50 }); else placeholderBg(ctx, W, H, true)
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(10,7,5,0)'); g.addColorStop(1, 'rgba(10,7,5,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    const tc = C.onvideo, sh = 'rgba(10,7,5,.55)'
    if (num) label(ctx, num, W - M, M, 22, tc, 'right'); if (car.foot) label(ctx, B.handle, M, M, 22, tc, 'left')
    const fR = { fam: F.display, mul: 1, ls: 0 }, fI = { fam: F.displayIt, mul: 1.04, ls: 0 }
    if (s.kind === 'cover') { const { lines, size } = fitRich(ctx, title, fR, fI, 112, W - 2 * M, 3); const h = lines.length * size; const y0 = H * 0.78 - h
      if (s.kicker) label(ctx, s.kicker, W / 2, y0 - size * 0.55, 26, tc, 'center', 0.3); drawRich(ctx, lines, W / 2, y0 + size * 0.8, size, fR, fI, size, tc, tc, 'center', sh)
      if (s.body) { const bl = wrapRich(ctx, s.body, { fam: F.display }, { fam: F.displayIt }, 36, W - 2 * M); drawRich(ctx, bl.slice(0, 2), W / 2, y0 + size * 0.8 + h + 20, 46, { fam: F.display }, { fam: F.displayIt }, 36, tc, tc, 'center', sh) } }
    else if (s.kind === 'end') { ctx.fillStyle = 'rgba(10,7,5,.45)'; ctx.fillRect(0, 0, W, H); txt(ctx, B.name, W / 2, H * 0.47, F.displayIt, 128, tc, { align: 'center' })
      const bl = wrapRich(ctx, title, { fam: F.display }, { fam: F.displayIt }, 40, W - 2 * M - 80); drawRich(ctx, bl, W / 2, H * 0.47 + 90, 52, { fam: F.display }, { fam: F.displayIt }, 40, tc, tc, 'center', sh); label(ctx, B.handle, W / 2, H * 0.47 + 90 + bl.length * 52 + 40, 24, tc, 'center', 0.26) }
    else { const t = s.kind === 'list' ? [s.title, ...String(s.body || '').split('\n').filter(Boolean)].filter(Boolean).join('\n') : s.kind === 'photo' ? (s.caption || s.title) : [s.title, s.body].filter(Boolean).join('\n')
      const it = s.kind === 'quote'; const sz = it ? 56 : 44; const bl = wrapRich(ctx, t, { fam: it ? F.displayIt : F.display }, { fam: F.displayIt }, sz, W - 2 * M - 60); const lh = sz * 1.3
      drawRich(ctx, bl.slice(-6), W / 2, H - M - 40 - (Math.min(6, bl.length) - 1) * lh, lh, { fam: it ? F.displayIt : F.display }, { fam: F.displayIt }, sz, tc, tc, 'center', sh)
      if (s.kicker) label(ctx, s.kicker, W / 2, H - M - 40 - Math.min(6, bl.length) * lh - 14, 22, tc, 'center', 0.3) }
    return
  }
  const dark = !!s.dark; const bg = tpl === 'catatan' ? (dark ? C.espresso : mixHex(C.paper, C.sand, 0.42)) : (dark ? C.espresso : C.paper)
  const ink = dark ? C.paper : C.ink, mut = dark ? mixHex(C.paper, C.espresso, 0.38) : C.grey, ac = dark ? mixHex(C.accent, '#ffffff', 0.32) : C.accent; const rule = dark ? 'rgba(238,232,222,.18)' : 'rgba(29,25,21,.14)'
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const foot = () => { if (!car.foot) return; if (s.kind !== 'end') label(ctx, B.handle, M, H - M + 18, 22, mut, 'left'); if (!last) { label(ctx, 'geser', W - M - 46, H - M + 18, 22, mut, 'right'); ctx.save(); ctx.strokeStyle = mut; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - M - 34, H - M + 10); ctx.lineTo(W - M, H - M + 10); ctx.moveTo(W - M - 9, H - M + 3); ctx.lineTo(W - M, H - M + 10); ctx.lineTo(W - M - 9, H - M + 17); ctx.stroke(); ctx.restore() } }
  const fB = { fam: F.body }, fBI = { fam: F.body === 'Newsreader' ? 'NewsreaderIt' : F.displayIt }
  if (tpl === 'catatan') {
    const fR = { fam: F.video, mul: 1, ls: -0.03 }, fI = { fam: F.displayIt, mul: 1.14, ls: 0 }
    label(ctx, s.kicker || 'catatan', M, M + 10, 24, ac, 'left'); if (num) label(ctx, num, W - M, M + 10, 24, mut, 'right')
    const top = M + 90, maxW = W - 2 * M
    if (s.kind === 'cover') { const { lines, size } = fitRich(ctx, title, fR, fI, img ? 104 : 128, maxW, img ? 3 : 4); const y0 = img ? top + size * 0.85 : H * 0.34; const h = drawRich(ctx, lines, M, y0, size * 1.02, fR, fI, size, ink, ac, 'left')
      let y = y0 + h - size * 0.2 + 26; if (s.body) { const bl = wrapRich(ctx, s.body, fB, fBI, 40, maxW); y += drawRich(ctx, bl.slice(0, 3), M, y + 30, 56, fB, fBI, 40, mut, mut, 'left') }
      if (img || s.photo) { const py = Math.max(y + 40, H * 0.5); photoBox(ctx, img, M, py, maxW, H - M - 70 - py, 26, s, dark) } }
    else if (s.kind === 'list') { const { lines, size } = fitRich(ctx, s.title, fR, fI, 84, maxW, 3); const h = drawRich(ctx, lines, M, top + size * 0.85, size * 1.04, fR, fI, size, ink, ac, 'left')
      let y = top + h + 50; const items = String(s.body || '').split('\n').map((x) => x.trim()).filter(Boolean); const room = (H - M - 80 - y) / Math.max(1, items.length); const isz = clamp(room * 0.36, 30, 46)
      items.forEach((it, k) => { ctx.fillStyle = rule; ctx.fillRect(M, y, maxW, 2); label(ctx, String(k + 1).padStart(2, '0'), M, y + isz * 1.45, 26, ac, 'left', 0.1); const bl = wrapRich(ctx, it, fB, fBI, isz, maxW - 110); drawRich(ctx, bl.slice(0, 3), M + 110, y + isz * 1.45, isz * 1.3, fB, fBI, isz, ink, ac, 'left'); y += Math.max(room, isz * 1.3 * Math.min(3, bl.length) + isz) }) }
    else if (s.kind === 'photo') { const capY = H - M - 150; photoBox(ctx, img, M, top, maxW, capY - top - 30, 26, s, dark); if (s.title) { const { lines, size } = fitRich(ctx, s.title, fR, fI, 52, maxW, 1); drawRich(ctx, lines, M, capY + 30, size, fR, fI, size, ink, ac, 'left') }
      if (s.caption || s.body) { const bl = wrapRich(ctx, s.caption || s.body, fB, fBI, 34, maxW); drawRich(ctx, bl.slice(0, 2), M, capY + (s.title ? 80 : 40), 46, fB, fBI, 34, mut, mut, 'left') } }
    else if (s.kind === 'quote') { const fq = { fam: F.displayIt, mul: 1, ls: 0 }; const { lines, size } = fitRich(ctx, s.title, fq, fq, 92, maxW, 6); txt(ctx, '“', M - 8, top + 120, F.display, 180, ac, { shadow: false }); drawRich(ctx, lines, M, top + 150 + size, size * 1.08, fq, fq, size, ink, ac, 'left')
      if (s.body) label(ctx, s.body, M, top + 150 + size + lines.length * size * 1.08 + 40, 24, mut, 'left') }
    else if (s.kind === 'end') { const { lines, size } = fitRich(ctx, title, fR, fI, 96, maxW, 4); const y0 = H * 0.36; const h = drawRich(ctx, lines, M, y0, size * 1.04, fR, fI, size, ink, ac, 'left'); label(ctx, B.handle, M, y0 + h + 40, 30, ac, 'left', 0.2); if (B.work) label(ctx, 'kerjaan: ' + B.work, M, y0 + h + 90, 24, mut, 'left', 0.2)
      txt(ctx, B.name, M, H - M - 60, F.displayIt, 72, ink, { shadow: false }) }
    else { const { lines, size } = fitRich(ctx, s.title, fR, fI, 86, maxW, 4); const h = drawRich(ctx, lines, M, top + size * 0.85, size * 1.04, fR, fI, size, ink, ac, 'left'); let y = top + h + 40
      if (s.body) { const bl = wrapRich(ctx, s.body, fB, fBI, 42, maxW); y += drawRich(ctx, bl.slice(0, img || s.photo ? 5 : 12), M, y + 20, 60, fB, fBI, 42, mut, ink, 'left') }
      if (img || s.photo) { const py = Math.max(y + 30, H * 0.55); photoBox(ctx, img, M, py, maxW, H - M - 70 - py, 26, s, dark) } }
    foot(); return
  }
  // editorial
  const fR = { fam: F.display, mul: 1, ls: -0.01 }, fI = { fam: F.displayIt, mul: 1.02, ls: 0 }
  txt(ctx, B.name, M, M + 18, F.display, 36, ink, { shadow: false }); if (num) label(ctx, 'N° ' + num, W - M, M + 12, 22, mut, 'right'); ctx.fillStyle = rule; ctx.fillRect(M, M + 42, W - 2 * M, 2)
  const top = M + 90, maxW = W - 2 * M
  if (s.kind === 'cover') { if (img || s.photo) { const ph = H * 0.5; photoBox(ctx, img, M, top, maxW, ph, 4, s, dark); let y = top + ph + 70; if (s.kicker) label(ctx, s.kicker, M, y, 24, ac, 'left', 0.28)
      const { lines, size } = fitRich(ctx, title, fR, fI, 112, maxW, 2); drawRich(ctx, lines, M, y + size * 0.95, size, fR, fI, size, ink, ac, 'left'); y += size * 0.95 + lines.length * size; if (s.body) { const bl = wrapRich(ctx, s.body, fB, fBI, 34, maxW); drawRich(ctx, bl.slice(0, 2), M, y + 10, 46, fB, fBI, 34, mut, mut, 'left') } }
    else { const { lines, size } = fitRich(ctx, title, fR, fI, 150, maxW, 4); const h = lines.length * size * 0.98; const y0 = H * 0.56 - h / 2; if (s.kicker) label(ctx, s.kicker, M, y0 - 20, 26, ac, 'left', 0.3); drawRich(ctx, lines, M, y0 + size * 0.85, size * 0.98, fR, fI, size, ink, ac, 'left')
      if (s.body) { const bl = wrapRich(ctx, s.body, fB, fBI, 38, maxW * 0.8); drawRich(ctx, bl.slice(0, 3), M, y0 + h + 70, 54, fB, fBI, 38, mut, mut, 'left') } } }
  else if (s.kind === 'list') { if (s.kicker) label(ctx, s.kicker, M, top + 10, 22, ac, 'left', 0.28); const { lines, size } = fitRich(ctx, s.title, fR, fI, 88, maxW, 3); const h = drawRich(ctx, lines, M, top + 40 + size * 0.85, size, fR, fI, size, ink, ac, 'left'); let y = top + 40 + h + 40
    const items = String(s.body || '').split('\n').map((x) => x.trim()).filter(Boolean); const room = (H - M - 90 - y) / Math.max(1, items.length); const isz = clamp(room * 0.34, 30, 44)
    items.forEach((it, k) => { txt(ctx, String(k + 1), M, y + isz * 1.5, F.displayIt, isz * 1.7, ac, { shadow: false }); const bl = wrapRich(ctx, it, fB, fBI, isz, maxW - 100); drawRich(ctx, bl.slice(0, 3), M + 100, y + isz * 1.3, isz * 1.35, fB, fBI, isz, ink, ac, 'left'); y += Math.max(room, isz * 1.35 * Math.min(3, bl.length) + isz * 0.8) }) }
  else if (s.kind === 'photo') { const capH = s.title ? 190 : 130; photoBox(ctx, img, M, top, maxW, H - M - 60 - capH - top, 4, s, dark); let y = H - M - 60 - capH + 60; if (s.title) { const { lines, size } = fitRich(ctx, s.title, fR, fI, 60, maxW, 1); drawRich(ctx, lines, M, y, size, fR, fI, size, ink, ac, 'left'); y += 56 }
    if (s.caption || s.body) { const bl = wrapRich(ctx, s.caption || s.body, fBI, fBI, 32, maxW); drawRich(ctx, bl.slice(0, 2), M, y + 10, 44, fBI, fBI, 32, mut, mut, 'left') } }
  else if (s.kind === 'quote') { const fq = { fam: F.displayIt, mul: 1, ls: 0 }; const { lines, size } = fitRich(ctx, s.title, fq, fq, 96, maxW - 40, 6); const h = lines.length * size * 1.06; const y0 = H * 0.52 - h / 2; txt(ctx, '“', W / 2, y0 - 10, F.display, 220, ac, { align: 'center', shadow: false })
    drawRich(ctx, lines, W / 2, y0 + size * 0.9, size * 1.06, fq, fq, size, ink, ac, 'center'); if (s.body) label(ctx, s.body, W / 2, y0 + h + 70, 22, mut, 'center', 0.28) }
  else if (s.kind === 'end') { txt(ctx, B.name, W / 2, H * 0.44, F.displayIt, 140, ink, { align: 'center', shadow: false }); const bl = wrapRich(ctx, title, fB, fBI, 40, maxW - 80); drawRich(ctx, bl.slice(0, 3), W / 2, H * 0.44 + 100, 56, fB, fBI, 40, mut, ink, 'center')
    label(ctx, [B.handle, B.work].filter(Boolean).join('   '), W / 2, H * 0.44 + 100 + Math.min(3, bl.length) * 56 + 40, 24, ac, 'center', 0.24) }
  else { if (s.kicker) label(ctx, s.kicker, M, top + 10, 22, ac, 'left', 0.28); const { lines, size } = fitRich(ctx, s.title, fR, fI, 92, maxW, 3); const h = drawRich(ctx, lines, M, top + 40 + size * 0.85, size, fR, fI, size, ink, ac, 'left'); let y = top + 40 + h + 30
    if (s.body) { const bl = wrapRich(ctx, s.body, fB, fBI, 40, maxW); y += drawRich(ctx, bl.slice(0, img || s.photo ? 5 : 13), M, y + 20, 60, fB, fBI, 40, ink, ink, 'left') }
    if (img || s.photo) { const py = Math.max(y + 30, H * 0.56); photoBox(ctx, img, M, py, maxW, H - M - 80 - py, 4, s, dark) } }
  ctx.fillStyle = rule; ctx.fillRect(M, H - M - 22, W - 2 * M, 2); foot()
}

// ---------- cover ----------
export const CFMT: [string, string, number][] = [['reel', 'Reels 9:16', 1920], ['feed', 'Feed 4:5', 1350], ['feed34', 'Feed 3:4', 1440]]
export const coverH = (c) => (CFMT.find((x) => x[0] === c.fmt) || CFMT[0])[2]
function fitSize(ctx, lines, fm, size, maxW, ls) { let s = size; for (let k = 0; k < 20; k++) { setFont(ctx, { fam: fm, size: s, ls }); const w = Math.max(...lines.map((l) => ctx.measureText(l).width)); if (w <= maxW) break; s *= 0.94 } return s }
export function gridRect(W, H) { const r = 3 / 4; if (Math.abs(W / H - r) < 0.01) return null; if (W / H < r) { const h = W / r; return [0, (H - h) / 2, W, h] } const w = H * r; return [(W - w) / 2, 0, w, H] }
export function renderCover(ctx, W, H, c, src, guides) {
  const F = B.fonts
  if (src) drawFill(ctx, src, 0, 0, W, H, {}); else placeholderBg(ctx, W, H, !c.dark); if (c.grade && src) filmLook(ctx, W, H)
  const C = c.dark ? B.colors.ink : B.colors.onvideo; const sh = !c.dark; const k = c.size / 100; const dy = c.y / 100 * H; let lines = String(c.title || '').split('\n').filter(Boolean)
  if (lines.length === 1 && (c.tpl === 'editorial' || c.tpl === 'story')) { const w = lines[0].split(/\s+/); if (w.length > 3 && lines[0].length > 18) { let best = 1, bd = 1e9; for (let q = 1; q < w.length; q++) { const d = Math.abs(w.slice(0, q).join(' ').length - w.slice(q).join(' ').length); if (d < bd) { bd = d; best = q } } lines = [w.slice(0, best).join(' '), w.slice(best).join(' ')] } }
  const gr = gridRect(W, H) || [0, 0, W, H]; const left = c.align === 'left'; const X = left ? gr[0] + W * 0.09 : W / 2; const AL = left ? 'left' : 'center'; const maxW = gr[2] * 0.84
  const S = (s, x, y, fm, size, o: any = {}) => { ctx.save(); setFont(ctx, { fam: fm, size, ls: o.ls || 0 }); ctx.textAlign = o.align || AL; ctx.fillStyle = o.col || C; ctx.shadowColor = sh ? 'rgba(12,8,5,.5)' : 'rgba(243,234,219,.7)'; ctx.shadowBlur = size * 0.3; if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0 } ctx.fillText(s, x, y); ctx.restore() }
  const by = gr[1] + gr[3]; const microY = Math.min(H * 0.93, by - gr[3] * 0.07) + dy * 0.3
  if (c.tpl === 'editorial') { const l1 = lines.slice(0, Math.max(1, lines.length - 1)), l2 = lines.length > 1 ? lines.slice(-1) : (c.accent ? [c.accent] : [])
    const size = fitSize(ctx, [...l1, ...l2].length ? [...l1, ...l2] : [' '], F.display, 128 * k, maxW, 0); const blockH = (l1.length + l2.length) * size * 0.98; const y0 = gr[1] + gr[3] * 0.74 - blockH + dy
    if (c.kicker) S(c.kicker.toUpperCase(), X, y0 - size * 0.15, F.label, 28, { ls: 0.3 })
    l1.forEach((l, i) => S(l, X, y0 + size * 0.82 + i * size * 0.98, F.display, size)); l2.forEach((l, i) => S(l, X, y0 + size * 0.82 + (l1.length + i) * size * 0.98, F.displayIt, size * 1.04))
    if (c.micro) S(c.micro.toUpperCase(), X, y0 + blockH + size * 0.45, F.label, 22, { ls: 0.3 }) }
  else if (c.tpl === 'poster') { const ttl = lines.map((l) => l.toUpperCase()); const size = fitSize(ctx, ttl.length ? ttl : [' '], F.caps, 150 * k, maxW, 0.01); const y = gr[1] + gr[3] * 0.5 + dy
    if (c.kicker) S(c.kicker.toUpperCase(), X, y - size * 0.25, F.label, 30, { ls: 0.32 })
    ttl.forEach((l, i) => S(l, X, y + size * 0.85 + i * size * 0.9, F.caps, size, { ls: 0.01 }))
    if (c.accent) S(c.accent, left ? X + W * 0.3 : W * 0.66, y + size * 0.85 + (ttl.length - 1) * size * 0.9 + size * 0.55, F.script, size * 0.85, { rot: -0.1, align: 'center' })
    if (c.micro) S(c.micro.toUpperCase(), X, microY, F.label, 24, { ls: 0.3 }) }
  else if (c.tpl === 'story') { const size = fitSize(ctx, lines.length ? lines : [' '], F.display, 118 * k, maxW, 0); const y = gr[1] + gr[3] * 0.62 + dy; const x = c.align === 'center' ? W / 2 : gr[0] + W * 0.09; const al = c.align === 'center' ? 'center' : 'left'
    if (c.kicker) S(c.kicker.toUpperCase(), x, y, F.label, 28, { ls: 0.3, align: al })
    lines.forEach((l, i) => S(l, x, y + size + i * size * 0.98, i === lines.length - 1 && lines.length > 1 ? F.displayIt : F.display, size, { align: al }))
    if (c.accent) S(c.accent, x, y + size + lines.length * size * 0.98 + size * 0.1, F.displayIt, size * 0.55, { align: al })
    if (c.micro) S(c.micro.toUpperCase(), x, microY, F.label, 22, { ls: 0.3, align: al }) }
  else if (c.tpl === 'split') { const a = (lines[0] || 'THE SHOT').toUpperCase(), b = (lines[1] || 'THE SETUP').toUpperCase(); const size = fitSize(ctx, [a, b], F.caps, 92 * k, maxW, 0.06); const y = gr[1] + gr[3] * 0.5 + dy
    S(a, X, y - size * 0.55, F.caps, size, { ls: 0.06 }); S(c.accent || 'vs', X, y + size * 0.18, F.script, size * 0.8); S(b, X, y + size * 1.05, F.caps, size, { ls: 0.06 })
    if (c.kicker) S(c.kicker.toUpperCase(), X, y - size * 1.45, F.label, 26, { ls: 0.32 }); if (c.micro) S(c.micro.toUpperCase(), X, microY, F.label, 24, { ls: 0.3 }) }
  else { const word = c.accent || lines[0] || 'notes'; const size = fitSize(ctx, [word], F.script, 190 * k, maxW, 0); const y = gr[1] + gr[3] * 0.5 + dy; S(word, X, y, F.script, size)
    const sub = lines.length && c.accent ? lines.join(' ').toUpperCase() : (c.kicker || '').toUpperCase(); if (sub) S(sub, X, y + size * 0.55, F.label, 30, { ls: 0.32 }); if (c.micro) S(c.micro.toUpperCase(), X, microY, F.label, 24, { ls: 0.3 }) }
  if (guides) { const g = gridRect(W, H); if (g) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.35)'; if (g[1] > 0) { ctx.fillRect(0, 0, W, g[1]); ctx.fillRect(0, g[1] + g[3], W, H - g[1] - g[3]) } else { ctx.fillRect(0, 0, g[0], H); ctx.fillRect(g[0] + g[2], 0, W - g[0] - g[2], H) }
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.setLineDash([16, 12]); ctx.strokeRect(g[0] + 2, g[1] + 2, g[2] - 4, g[3] - 4); ctx.restore() } }
}
