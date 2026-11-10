import React from 'react'
import { Plus, Trash2, RotateCcw, Copy } from 'lucide-react'
import { PageHead, PhoneTop } from '../ui/Shell'
import { AutoTextarea, Button, Accordion, IconBtn, ask, toast, copyOrShow } from '../ui/kit'
import { brand, saveBrand, resetBrand, COLOR_ROLES, FONT_ROLES, FONT_NAMES, TYPES, typeDef, FORMULAS_DEFAULT, rules, type Formula } from '../studio/brand'
import { fontStack, renderCover, drawSlide } from '../studio/render'
import { DrawCanvas, useFonts } from '../studio/ui'
import { CTPL } from './Cover'
import { uid } from '../lib/store'

const CARS = [['catatan', 'Catatan'], ['editorial', 'Editorial'], ['photo', 'Photo story']]

export default function Studio() {
  const b = brand()
  const ready = useFonts()
  const setF = (i: number, p: Partial<Formula>) => saveBrand({ formulas: b.formulas.map((f, j) => (j === i ? { ...f, ...p } : f)) })
  const setBeat = (i: number, j: number, p: Partial<Formula['beats'][0]>) => setF(i, { beats: b.formulas[i].beats.map((x, k) => (k === j ? { ...x, ...p } : x)) })
  const txt = (k: 'name' | 'role' | 'handle' | 'work' | 'city' | 'tagline' | 'credit' | 'cta' | 'micro', label: string) => (
    <label className="field"><span className="field-label">{label}</span><input className="input" value={b[k]} onChange={(e) => saveBrand({ [k]: e.target.value })} /></label>
  )

  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="Brandkit, formulas, looks" title="Studio." />
      <div className="stack-lg">
        <section className="bk-hero" style={{ background: b.colors.paper, color: b.colors.ink }}>
          <div className="bk-text">
            <div className="bk-role" style={{ fontFamily: fontStack(b.fonts.label), color: b.colors.accent }}>{[b.role, b.city].filter(Boolean).join(' · ')}</div>
            <div className="bk-name" style={{ fontFamily: fontStack(b.fonts.display) }}>{b.name}</div>
            <div className="bk-tag" style={{ fontFamily: fontStack(b.fonts.displayIt) }}>{b.tagline}</div>
            <div className="bk-strip">{COLOR_ROLES.map(([k, n]) => <i key={k} title={n} style={{ background: b.colors[k] }} />)}</div>
          </div>
          <div className="bk-mocks">
            <DrawCanvas w={1080} h={1920} label="Cover sample" className="bk-mock" deps={[ready, b]} draw={(ctx) => renderCover(ctx, 1080, 1920, { tpl: 'editorial', fmt: 'reel', kicker: 'catatan shoot', title: 'Kertas shot list\nyang masih aku bawa', accent: '', micro: b.micro, size: 100, y: 0, align: 'center', grade: false, dark: false }, null, false)} />
            <DrawCanvas w={1080} h={1350} label="Carousel sample" className="bk-mock" deps={[ready, b]} draw={(ctx) => drawSlide(ctx, 1080, 1350, { kind: 'cover', kicker: 'catatan', title: '3 shot yang _selalu_ aku ambil', body: 'Full body, mid shot, close up.', photo: null }, 0, 6, { tpl: 'catatan', num: true, foot: true }, null)} />
          </div>
        </section>

        <section className="stack">
          <h2 className="h2">Identity</h2>
          <div className="grid2">{txt('name', 'Name')}{txt('role', 'Role')}{txt('handle', 'Handle')}{txt('work', 'Work account')}{txt('city', 'City')}{txt('tagline', 'Tagline')}</div>
          <label className="field"><span className="field-label">About you (goes into every Claude prompt)</span><AutoTextarea value={b.about} onChange={(v) => saveBrand({ about: v })} minRows={3} /></label>
        </section>

        <section className="stack">
          <h2 className="h2">Colors</h2>
          <div className="colorgrid">
            {COLOR_ROLES.map(([k, n, d]) => (
              <label key={k} className="colorrow">
                <input type="color" value={b.colors[k]} aria-label={n} onChange={(e) => saveBrand({ colors: { ...b.colors, [k]: e.target.value } })} />
                <span><b>{n}</b><span className="xs muted">{b.colors[k].toUpperCase()} · {d}</span></span>
              </label>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2 className="h2">Fonts</h2>
          <div className="list">
            {FONT_ROLES.map(([r, n, d]) => (
              <div key={r} className="li fontrow">
                <span className="li-main"><span className="li-title">{n}</span><span className="li-sub">{d}</span></span>
                <span className="font-sample" style={{ fontFamily: fontStack(b.fonts[r]), letterSpacing: r === 'label' ? '.18em' : undefined, textTransform: r === 'label' || r === 'caps' ? 'uppercase' : undefined }}>{r === 'script' ? 'notes' : 'Fabric & light'}</span>
                <select className="input font-select" aria-label={`${n} font`} value={b.fonts[r]} onChange={(e) => saveBrand({ fonts: { ...b.fonts, [r]: e.target.value } })}>
                  {Object.entries(FONT_NAMES).map(([f, name]) => <option key={f} value={f}>{name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2 className="h2">Each content type</h2>
          <div className="list">
            {TYPES.map((t) => { const d = typeDef(t.id); return (
              <div key={t.id} className="li typerow">
                <span className="li-main"><span className="li-title">{t.name}</span><span className="li-sub">{t.hint}</span></span>
                <div className="typesel">
                  <select className="input" aria-label={`${t.name} formula`} value={d.formula} onChange={(e) => saveBrand({ typeMap: { ...b.typeMap, [t.id]: { ...d, formula: e.target.value } } })}>{b.formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <select className="input" aria-label={`${t.name} cover`} value={d.cover} onChange={(e) => saveBrand({ typeMap: { ...b.typeMap, [t.id]: { ...d, cover: e.target.value } } })}>{CTPL.map((c) => <option key={c.id} value={c.id}>Cover: {c.name}</option>)}</select>
                  <select className="input" aria-label={`${t.name} carousel`} value={d.car} onChange={(e) => saveBrand({ typeMap: { ...b.typeMap, [t.id]: { ...d, car: e.target.value } } })}>{CARS.map(([v, n]) => <option key={v} value={v}>Carousel: {n}</option>)}</select>
                </div>
              </div>) })}
          </div>
        </section>

        <section className="stack">
          <div className="row"><h2 className="h2 grow">Story formulas</h2>
            <Button size="sm" variant="ghost" onClick={() => { const ids = new Set(b.formulas.map((f) => f.id)); const add = FORMULAS_DEFAULT.filter((f) => !ids.has(f.id)); saveBrand({ formulas: [...b.formulas, ...structuredClone(add)] }); toast(add.length ? `${add.length} formula${add.length > 1 ? 's' : ''} restored` : 'All built-in formulas are here') }}>Restore built-ins</Button>
          </div>
          {b.formulas.map((f, i) => {
            const tot = f.beats.reduce((a, x) => a + (+x.p || 0), 0)
            return (
              <Accordion key={f.id} title={f.name} right={<span className="small muted acc-sum">{f.beats.length} beats</span>}>
                <div className="grid2">
                  <label className="field"><span className="field-label">Name</span><input className="input" value={f.name} onChange={(e) => setF(i, { name: e.target.value })} /></label>
                  <label className="field"><span className="field-label">Source</span><input className="input" value={f.src || ''} onChange={(e) => setF(i, { src: e.target.value })} /></label>
                </div>
                <label className="field"><span className="field-label">When to use it</span><AutoTextarea value={f.desc || ''} onChange={(v) => setF(i, { desc: v })} minRows={1} /></label>
                <label className="field"><span className="field-label">Hook pattern</span><AutoTextarea value={f.hook || ''} onChange={(v) => setF(i, { hook: v })} minRows={1} /></label>
                {f.beats.map((x, j) => (
                  <div key={j} className="fbeat">
                    <input className="input" aria-label="Beat name" value={x.n} onChange={(e) => setBeat(i, j, { n: e.target.value })} />
                    <input className="input tnum" type="number" min={1} max={100} aria-label="Share in percent" value={x.p} onChange={(e) => setBeat(i, j, { p: +e.target.value || 0 })} />
                    <IconBtn label="Delete beat" disabled={f.beats.length < 2} onClick={() => setF(i, { beats: f.beats.filter((_, k) => k !== j) })}><Trash2 size={17} /></IconBtn>
                    <AutoTextarea aria-label="Beat instruction" className="fbeat-ins" value={x.ins} onChange={(v) => setBeat(i, j, { ins: v })} minRows={1} />
                  </div>
                ))}
                <div className="row gap8 wrap">
                  <Button size="sm" icon={<Plus size={15} />} onClick={() => setF(i, { beats: [...f.beats, { n: 'New beat', p: 20, ins: '' }] })}>Beat</Button>
                  <span className="xs muted grow">Total {tot}%{tot !== 100 ? ' (scaled automatically)' : ''}</span>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} disabled={b.formulas.length < 2} onClick={async () => { if ((await ask({ title: `Delete "${f.name}"?`, confirm: 'Delete', danger: true })) === 'confirm') saveBrand({ formulas: b.formulas.filter((_, k) => k !== i) }) }}>Delete formula</Button>
                </div>
              </Accordion>
            )
          })}
          <Button size="sm" icon={<Plus size={15} />} style={{ alignSelf: 'flex-start' }} onClick={() => saveBrand({ formulas: [...b.formulas, { id: 'f' + uid().slice(0, 10), name: 'New formula', src: '', desc: '', hook: '', beats: [{ n: 'Open', p: 15, ins: '' }, { n: 'Middle', p: 65, ins: '' }, { n: 'Close', p: 20, ins: '' }] }] })}>New formula</Button>
        </section>

        <section className="stack">
          <h2 className="h2">Writing rules</h2>
          <label className="field"><span className="field-label">Voice (goes into every Claude prompt)</span><AutoTextarea value={b.voice} onChange={(v) => saveBrand({ voice: v })} minRows={5} /></label>
          <label className="field"><span className="field-label">Banned words (comma separated, the checker flags them)</span><AutoTextarea value={b.avoid} onChange={(v) => saveBrand({ avoid: v })} minRows={1} /></label>
          <label className="field"><span className="field-label">Script checklist (one per line)</span><AutoTextarea value={b.check} onChange={(v) => saveBrand({ check: v })} minRows={4} /></label>
          <div className="grid2">{txt('credit', 'Credit line')}{txt('cta', 'End slide line')}</div>
          {txt('micro', 'Cover micro text')}
          <div className="row gap8 wrap">
            <Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(rules(), 'Copy writing rules', 'Writing rules copied')}>Copy rules for Claude</Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={async () => { if ((await ask({ title: 'Reset the brandkit?', body: 'Colors, fonts, rules and formulas go back to brand guide v1.', confirm: 'Reset', danger: true })) === 'confirm') resetBrand() }}>Reset brandkit</Button>
          </div>
        </section>
      </div>
    </main>
  )
}
