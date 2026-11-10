import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { brand, lintText } from './brand'
import { loadFonts, useBrandForDraw, renderCover, coverH, gridRect } from './render'
import { coverOf, coverTitle, useImg } from './studio'
import type { Item } from '../lib/types'

export function useFonts() {
  const [ready, setReady] = useState(false)
  useEffect(() => { let on = true; loadFonts().then(() => { if (on) setReady(true) }); return () => { on = false } }, [])
  return ready
}

/** A canvas drawn at full size (1080 wide) and shown scaled by CSS. */
export function DrawCanvas({ w = 1080, h, draw, deps, className, label }: { w?: number; h: number; draw: (ctx: CanvasRenderingContext2D) => void; deps: unknown[]; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    useBrandForDraw(brand())
    draw(ctx)
  }, [w, h, ...deps])
  return <canvas ref={ref} className={className} role="img" aria-label={label} style={{ aspectRatio: `${w} / ${h}` }} />
}

export function LintList({ text, mode = 'caption' }: { text: string; mode?: 'caption' | 'vo' }) {
  const l = lintText(text, mode)
  if (!l.length) return null
  return (
    <div className="lint" role="status">
      <AlertTriangle size={14} />
      <span>{l.map((x, i) => <span key={i} className="lint-item">{x.label}: <b>{x.hit}</b></span>)}</span>
    </div>
  )
}

/** Small cover thumbnail, cropped like the 3:4 profile grid. Used by Feed and the post editor. */
export function CoverThumb({ it, ready }: { it: Item; ready: boolean }) {
  const c = coverOf(it)
  const { img } = useImg(c.photo)
  const H = coverH(c)
  const g = gridRect(1080, H) || [0, 0, 1080, H]
  const title = coverTitle(it)
  return (
    <DrawCanvas w={270} h={360} label={`Cover: ${title}`} className="thumb-cv" deps={[ready, img, JSON.stringify(c), title, brand()]}
      draw={(ctx) => { const s = 270 / g[2]; ctx.save(); ctx.scale(s, s); ctx.translate(-g[0], -g[1]); renderCover(ctx, 1080, H, { ...c, title }, img, false); ctx.restore() }} />
  )
}

export function Range({ label, value, min, max, step = 1, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="field">
      <span className="field-label row"><span className="grow">{label}</span><span className="muted tnum">{value}{suffix}</span></span>
      <input type="range" className="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tgl">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
