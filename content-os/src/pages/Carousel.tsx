import React, { useEffect, useState } from 'react'
import { ArrowLeft, Download, ImagePlus, X, Plus, ChevronLeft, ChevronRight, MoveLeft, MoveRight, CopyPlus, Trash2, Wand2, Package } from 'lucide-react'
import JSZip from 'jszip'
import { get } from '../lib/store'
import { firstLine } from '../lib/model'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, AutoTextarea, Button, Chips, toast, ask, cx } from '../ui/kit'
import { NotFound } from '../ui/NotFound'
import { brand } from '../studio/brand'
import { drawSlide, carH, useBrandForDraw, loadFonts, placeholderBg } from '../studio/render'
import { carouselOf, setCarousel, newSlide, slidesFromScript, savePhoto, useImg, loadImg, canvasBlob, shareOrDownload, downloadBlob, safeName } from '../studio/studio'
import { DrawCanvas, useFonts, Range, Toggle } from '../studio/ui'
import type { Slide, CarouselData } from '../lib/types'

const CARTPL = [
  { id: 'catatan', name: 'Catatan', d: 'Tips & workflow. Bold grotesk + one italic accent word.' },
  { id: 'editorial', name: 'Editorial', d: 'Magazine. Big serif, reading text, wide photo.' },
  { id: 'photo', name: 'Photo story', d: 'Full photo + small film-subtitle caption.' },
]
const KINDS = [['cover', 'Cover'], ['text', 'Text'], ['list', 'List'], ['photo', 'Photo'], ['quote', 'Quote'], ['end', 'End']] as const

function SlideCanvas({ s, i, car, ready, thumb }: { s: Slide; i: number; car: CarouselData; ready: boolean; thumb?: boolean }) {
  const { img } = useImg(s.photo)
  const H = carH(car)
  const k = thumb ? 0.12 : 1
  return (
    <DrawCanvas w={Math.round(1080 * k)} h={Math.round(H * k)} label={`Slide ${i + 1}`} className={thumb ? 'slide-thumb' : 'preview-cv'} deps={[ready, img, JSON.stringify(s), car.tpl, car.ratio, car.num, car.foot, car.slides.length, brand()]}
      draw={(ctx) => { ctx.save(); ctx.scale(k, k); drawSlide(ctx, 1080, H, s, i, car.slides.length, car, img); ctx.restore() }} />
  )
}

export default function Carousel({ id }: { id: string }) {
  const it = get('items', id)
  const ready = useFonts()
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState('')
  const car = it ? carouselOf(it) : null
  useEffect(() => { if (car && sel > car.slides.length - 1) setSel(Math.max(0, car.slides.length - 1)) }, [car?.slides.length])
  if (!it || it.kind !== 'ig' || !car) return <NotFound what="Post" backTo="/instagram" />
  const slides = car.slides
  const s = slides[sel]
  const set = (p: Partial<CarouselData>) => setCarousel(id, p)
  const setSlides = (next: Slide[], nsel = sel) => { set({ slides: next }); setSel(Math.max(0, Math.min(nsel, next.length - 1))) }
  const setS = (p: Partial<Slide>) => setSlides(slides.map((x, i) => (i === sel ? { ...x, ...p } : x)))
  const H = carH(car)

  const build = async () => {
    if (slides.length && (await ask({ title: 'Replace the slides?', body: 'Builds new slides from the hook and script. Photos stay on the same slide number.', confirm: 'Replace' })) !== 'confirm') return
    const nw = slidesFromScript(it)
    nw.forEach((x, i) => { if (slides[i]?.photo) { x.photo = slides[i].photo; x.py = slides[i].py; x.zoom = slides[i].zoom } })
    setSlides(nw, 0)
    toast(`${nw.length} slides from the script. Edit the text.`)
  }
  const render = async (i: number) => {
    await loadFonts(); useBrandForDraw(brand())
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = H
    drawSlide(cv.getContext('2d'), 1080, H, slides[i], i, slides.length, car, await loadImg(slides[i].photo))
    return canvasBlob(cv)
  }
  const name = safeName(it.title || 'carousel')
  const one = async () => { if (!s) return; await shareOrDownload(`${name}-${String(sel + 1).padStart(2, '0')}.png`, await render(sel)); toast('Slide saved') }
  const all = async () => {
    setBusy('Preparing slides…')
    try {
      const files: File[] = []
      for (let i = 0; i < slides.length; i++) files.push(new File([await render(i)], `${name}-${String(i + 1).padStart(2, '0')}.png`, { type: 'image/png' }))
      const nav = navigator as any
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && nav.canShare?.({ files })) { try { await nav.share({ files }); setBusy(''); return } catch (e: any) { if (e?.name === 'AbortError') { setBusy(''); return } } }
      const zip = new JSZip(); files.forEach((f) => zip.file(f.name, f))
      downloadBlob(`${name}-carousel.zip`, await zip.generateAsync({ type: 'blob' }))
      toast(`${slides.length} slides saved in one .zip`)
    } finally { setBusy('') }
  }
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !s) return
    setBusy('Saving photo…'); const ref = await savePhoto(f); setBusy('')
    setS({ photo: ref, py: 50, zoom: 100, kind: s.kind === 'text' && !s.body ? 'photo' : s.kind })
  }
  const move = (d: number) => { const j = sel + d; if (j < 0 || j >= slides.length) return; const n = [...slides]; [n[sel], n[j]] = [n[j], n[sel]]; setSlides(n, j) }

  return (
    <main className="main wide editor">
      <div className="edhead">
        <IconBtn label="Back to post" onClick={() => back('/post/' + id)}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
      </div>
      <div className="stack" style={{ gap: 6, marginBottom: 18 }}>
        <button className="eyebrow linkish" onClick={() => go('/post/' + id)}>{firstLine(it.title) || 'Untitled post'}</button>
        <h1 className="page-title">Carousel.</h1>
      </div>
      <div className="studio-split">
        <div className="studio-preview">
          {s ? <SlideCanvas s={s} i={sel} car={car} ready={ready} />
            : <DrawCanvas h={H} label="No slides yet" className="preview-cv" deps={[ready, H, brand()]} draw={(ctx) => placeholderBg(ctx, 1080, H, false)} />}
          <div className="row gap8 slide-nav">
            <IconBtn label="Previous slide" disabled={sel <= 0} onClick={() => setSel(sel - 1)}><ChevronLeft size={20} /></IconBtn>
            <span className="grow center small muted tnum">{slides.length ? `${sel + 1} / ${slides.length}` : 'No slides yet'}</span>
            <IconBtn label="Next slide" disabled={sel >= slides.length - 1} onClick={() => setSel(sel + 1)}><ChevronRight size={20} /></IconBtn>
          </div>
          <div className="strip" role="tablist" aria-label="Slides">
            {slides.map((x, i) => (
              <button key={x.id} role="tab" aria-selected={i === sel} className={cx('strip-item', i === sel && 'on')} onClick={() => setSel(i)}>
                <SlideCanvas s={x} i={i} car={car} ready={ready} thumb />
              </button>
            ))}
            <button className="strip-add" aria-label="Add slide" onClick={() => { const n = [...slides]; n.splice(slides.length ? sel + 1 : 0, 0, newSlide(slides.length ? 'text' : 'cover')); setSlides(n, slides.length ? sel + 1 : 0) }}><Plus size={20} /></button>
          </div>
        </div>
        <div className="stack-lg studio-controls">
          <section className="block">
            <div className="block-head"><h2 className="block-label grow">Template</h2></div>
            <div className="tplgrid">
              {CARTPL.map((t) => (
                <button key={t.id} className={t.id === car.tpl ? 'tpl on' : 'tpl'} aria-pressed={t.id === car.tpl} onClick={() => set({ tpl: t.id })}><b>{t.name}</b><span>{t.d}</span></button>
              ))}
            </div>
            <div className="row gap16 wrap mt8">
              <Chips label="Ratio" value={car.ratio} onChange={(v) => set({ ratio: v })} options={[{ value: '45', label: '4:5' }, { value: '34', label: '3:4' }]} />
              <Toggle label="Numbers" on={car.num} onChange={(v) => set({ num: v })} />
              <Toggle label="Handle & swipe" on={car.foot} onChange={(v) => set({ foot: v })} />
            </div>
            <Button size="sm" icon={<Wand2 size={15} />} style={{ alignSelf: 'flex-start' }} onClick={build}>Build from script</Button>
          </section>

          {s && (
            <section className="block">
              <div className="block-head">
                <h2 className="block-label grow">Slide {sel + 1}</h2>
                <IconBtn label="Move slide left" disabled={sel === 0} onClick={() => move(-1)}><MoveLeft size={18} /></IconBtn>
                <IconBtn label="Move slide right" disabled={sel >= slides.length - 1} onClick={() => move(1)}><MoveRight size={18} /></IconBtn>
                <IconBtn label="Duplicate slide" onClick={() => { const n = [...slides]; n.splice(sel + 1, 0, { ...structuredClone(s), id: newSlide('text').id }); setSlides(n, sel + 1) }}><CopyPlus size={18} /></IconBtn>
                <IconBtn label="Delete slide" onClick={() => setSlides(slides.filter((_, i) => i !== sel), sel - 1)}><Trash2 size={18} /></IconBtn>
              </div>
              <Chips label="Slide type" scroll value={s.kind} onChange={(v) => setS({ kind: v })} options={KINDS.map(([v, n]) => ({ value: v, label: n }))} />
              <input className="input" aria-label="Kicker" placeholder="Kicker (small label)" value={s.kicker} onChange={(e) => setS({ kicker: e.target.value })} />
              <AutoTextarea aria-label="Title" value={s.title} onChange={(v) => setS({ title: v })} minRows={1} placeholder={s.kind === 'end' ? brand().cta : 'Title. Wrap one word in _underscores_ for the italic accent.'} />
              <AutoTextarea aria-label="Body" value={s.body} onChange={(v) => setS({ body: v })} minRows={2} placeholder={s.kind === 'list' ? 'One point per line' : s.kind === 'quote' ? 'Who said it' : 'Body'} />
              {s.kind === 'photo' && <input className="input" aria-label="Caption" placeholder="Caption" value={s.caption} onChange={(e) => setS({ caption: e.target.value })} />}
              <div className="row gap8 wrap">
                <label className="btn btn-sm"><ImagePlus size={15} /><span>{s.photo ? 'Change photo' : 'Add photo'}</span><input type="file" accept="image/*" hidden onChange={pick} /></label>
                {s.photo && <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => setS({ photo: null })}>Remove</Button>}
                {car.tpl !== 'photo' && <Toggle label="Dark slide" on={s.dark} onChange={(v) => setS({ dark: v })} />}
              </div>
              {s.photo && <><Range label="Photo position" value={s.py} min={0} max={100} onChange={(v) => setS({ py: v })} /><Range label="Zoom" value={s.zoom} min={100} max={200} suffix="%" onChange={(v) => setS({ zoom: v })} /></>}
            </section>
          )}
          {busy && <p className="small muted" role="status">{busy}</p>}
        </div>
      </div>
      <div className="ed-actions">
        <div className="ed-actions-inner">
          <Button icon={<Download size={17} />} disabled={!s} onClick={one}>This slide</Button>
          <Button variant="primary" icon={<Package size={17} />} disabled={!slides.length || !!busy} onClick={all}>All slides</Button>
        </div>
      </div>
    </main>
  )
}
