import React, { useState } from 'react'
import { ArrowLeft, Download, ImagePlus, X, Layers } from 'lucide-react'
import { get } from '../lib/store'
import { firstLine } from '../lib/model'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, AutoTextarea, Button, Chips, toast } from '../ui/kit'
import { NotFound } from '../ui/NotFound'
import { brand } from '../studio/brand'
import { renderCover, coverH, CFMT, useBrandForDraw, loadFonts } from '../studio/render'
import { coverOf, coverTitle, setCover, savePhoto, useImg, canvasBlob, shareOrDownload, safeName } from '../studio/studio'
import { DrawCanvas, useFonts, Range, Toggle } from '../studio/ui'

export const CTPL = [
  { id: 'editorial', name: 'Editorial', d: 'Serif + italic second line, CAPS kicker, micro text.' },
  { id: 'story', name: 'Story', d: 'Serif + italic, bottom left, calm.' },
  { id: 'split', name: 'Shot vs Setup', d: 'Two caps labels + handwritten vs.' },
  { id: 'poster', name: 'Film poster', d: 'Caps title, handwriting crossing it.' },
  { id: 'script', name: 'Script hero', d: 'One big handwritten word + small caps.' },
]

export default function Cover({ id }: { id: string }) {
  const it = get('items', id)
  const ready = useFonts()
  const [grid, setGrid] = useState(false)
  const [busy, setBusy] = useState(false)
  const c = it ? coverOf(it) : null
  const { img, missing } = useImg(c?.photo)
  if (!it || it.kind !== 'ig' || !c) return <NotFound what="Post" backTo="/instagram" />
  const H = coverH(c)
  const title = coverTitle(it)
  const set = (p: Parameters<typeof setCover>[1]) => setCover(id, p)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); set({ photo: await savePhoto(f) }); setBusy(false)
  }
  const download = async () => {
    await loadFonts()
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = H
    useBrandForDraw(brand())
    renderCover(cv.getContext('2d'), 1080, H, { ...c, title }, img, false)
    await shareOrDownload(`${safeName(it.title || 'cover')}-cover.png`, await canvasBlob(cv))
    toast('Cover saved')
  }

  return (
    <main className="main wide editor">
      <div className="edhead">
        <IconBtn label="Back to post" onClick={() => back('/post/' + id)}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
      </div>
      <div className="stack" style={{ gap: 6, marginBottom: 18 }}>
        <button className="eyebrow linkish" onClick={() => go('/post/' + id)}>{firstLine(it.title) || 'Untitled post'}</button>
        <h1 className="page-title">Cover.</h1>
      </div>
      <div className="studio-split">
        <div className="studio-preview">
          <DrawCanvas h={H} label={`Cover preview: ${title}`} className="preview-cv" deps={[ready, img, JSON.stringify(c), title, grid, brand()]}
            draw={(ctx) => renderCover(ctx, 1080, H, { ...c, title }, img, grid)} />
          {missing && <p className="xs muted">The photo was added on another device. Photos stay on the device they were added on.</p>}
        </div>
        <div className="stack-lg studio-controls">
          <section className="block">
            <div className="block-head"><h2 className="block-label grow">Template</h2></div>
            <div className="tplgrid">
              {CTPL.map((t) => (
                <button key={t.id} className={t.id === c.tpl ? 'tpl on' : 'tpl'} aria-pressed={t.id === c.tpl} onClick={() => set({ tpl: t.id })}>
                  <b>{t.name}</b><span>{t.d}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="block">
            <div className="block-head"><h2 className="block-label grow">Format</h2></div>
            <Chips label="Format" value={c.fmt} onChange={(v) => set({ fmt: v })} options={CFMT.map(([v, n]) => ({ value: v, label: n }))} />
          </section>
          <section className="block">
            <div className="block-head"><h2 className="block-label grow">Text</h2>{c.titleTouched && <button className="linkbtn small" onClick={() => set({ title: '', titleTouched: false })}>Use hook</button>}</div>
            <AutoTextarea aria-label="Cover title" value={title} onChange={(v) => set({ title: v, titleTouched: true })} minRows={2} placeholder="Title. A new line = second line." />
            <div className="grid2">
              <input className="input" aria-label="Kicker" placeholder="Kicker (small caps)" value={c.kicker} onChange={(e) => set({ kicker: e.target.value })} />
              <input className="input" aria-label="Accent" placeholder={c.tpl === 'split' ? 'Middle word (vs)' : 'Accent word'} value={c.accent} onChange={(e) => set({ accent: e.target.value })} />
            </div>
            <input className="input" aria-label="Micro text" placeholder="Micro text" value={c.micro} onChange={(e) => set({ micro: e.target.value })} />
          </section>
          <section className="block">
            <div className="block-head"><h2 className="block-label grow">Photo</h2></div>
            <div className="row gap8 wrap">
              <label className="btn btn-sm"><ImagePlus size={15} /><span>{busy ? 'Saving…' : c.photo ? 'Change photo' : 'Add photo'}</span><input type="file" accept="image/*" hidden onChange={pick} /></label>
              {c.photo && <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => set({ photo: null })}>Remove</Button>}
            </div>
            <p className="xs muted">Tip: export a frame from DaVinci or take a screenshot of the shot.</p>
          </section>
          <section className="block">
            <Range label="Text size" value={c.size} min={60} max={140} suffix="%" onChange={(v) => set({ size: v })} />
            <Range label="Move text up / down" value={c.y} min={-30} max={30} onChange={(v) => set({ y: v })} />
            <Chips label="Align" value={c.align} onChange={(v) => set({ align: v })} options={[{ value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }]} />
            <div className="row gap16 wrap mt8">
              <Toggle label="Film look" on={c.grade} onChange={(v) => set({ grade: v })} />
              <Toggle label="Dark text" on={c.dark} onChange={(v) => set({ dark: v })} />
              <Toggle label="3:4 grid crop" on={grid} onChange={setGrid} />
            </div>
          </section>
        </div>
      </div>
      <div className="ed-actions">
        <div className="ed-actions-inner">
          <Button icon={<Layers size={17} />} onClick={() => go(`/post/${id}/carousel`)}>Carousel</Button>
          <Button variant="primary" icon={<Download size={17} />} onClick={download}>Download PNG</Button>
        </div>
      </div>
    </main>
  )
}
