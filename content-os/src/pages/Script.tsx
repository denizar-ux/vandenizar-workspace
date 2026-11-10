import React, { useEffect, useState } from 'react'
import { ArrowLeft, Copy, ClipboardPaste, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { get, patch } from '../lib/store'
import { firstLine } from '../lib/model'
import { back, go } from '../lib/router'
import { SaveBadge } from '../ui/Shell'
import { IconBtn, AutoTextarea, Button, Accordion, Chips, Check3, toast, copyOrShow, ask } from '../ui/kit'
import { NotFound } from '../ui/NotFound'
import { brand, TYPES, typeDef, formulaById, extractJson, beatTimes } from '../studio/brand'
import { studioOf, curFormula, setStudio, beatsFromFormula, wordCount, plainLine, scriptPlain, promptAngles, promptScript, promptCheck } from '../studio/studio'
import { LintList } from '../studio/ui'
import type { ScriptBeat } from '../lib/types'

const LENS = [15, 30, 45, 60, 90]

export default function Script({ id }: { id: string }) {
  const it = get('items', id)
  const [paste, setPaste] = useState('')
  const s = it && it.kind === 'ig' ? studioOf(it) : null
  // First open: lay out the beats of the formula so there is something to write into.
  useEffect(() => { if (it && s && !it.studio?.beats?.length) setStudio(id, { type: s.type, formula: s.formula, len: s.len, beats: beatsFromFormula(curFormula(it), s.len) }) }, [id])
  if (!it || it.kind !== 'ig' || !s) return <NotFound what="Post" backTo="/instagram" />
  const f = curFormula(it)
  const beats = s.beats
  const target = Math.round(s.len * 2.4)
  const words = wordCount(beats)
  const hasText = beats.some((b) => b.vo.trim() || b.visual.trim())

  const setBeat = (i: number, p: Partial<ScriptBeat>) => setStudio(id, { beats: beats.map((b, j) => (j === i ? { ...b, ...p } : b)) })
  const changeFormula = async (fid: string) => {
    const nf = formulaById(fid); if (!nf) return
    if (hasText) {
      const a = await ask({ title: 'Switch formula?', body: `The beats change to ${nf.name}. Text you wrote stays in the same order.`, confirm: 'Switch' })
      if (a !== 'confirm') return
    }
    setStudio(id, { formula: fid, beats: beatsFromFormula(nf, s.len, beats) })
  }
  const changeType = (t: string) => {
    const fid = typeDef(t).formula
    if (!hasText && formulaById(fid)) setStudio(id, { type: t, formula: fid, beats: beatsFromFormula(formulaById(fid)!, s.len) })
    else setStudio(id, { type: t })
  }
  const changeLen = (len: number) => { const ts = beatTimes(f, len); setStudio(id, { len, beats: beats.map((b, i) => ({ ...b, time: ts[i] || b.time })) }) }

  const applyPaste = () => {
    const j = extractJson(paste)
    if (j && Array.isArray(j.beats) && j.beats.length) {
      const prev = { beats, hook: it.hook || '', shots: s.shots || '' }
      const ts = beatTimes(f, s.len)
      const nb: ScriptBeat[] = j.beats.map((b: any, i: number) => ({ name: String(b.name || f.beats[i]?.n || `Beat ${i + 1}`), time: String(b.time || ts[i] || ''), vo: String(b.vo || ''), visual: String(b.visual || ''), screen: String(b.screen || '') }))
      setStudio(id, { beats: nb, shots: Array.isArray(j.shots) ? j.shots.map(String).join('\n') : s.shots })
      if (j.hook) patch('items', id, { hook: String(j.hook) })
      setPaste('')
      toast(`Script filled in (${nb.length} beats)`, { label: 'Undo', run: () => { setStudio(id, { beats: prev.beats, shots: prev.shots }); patch('items', id, { hook: prev.hook }) } })
    } else if (paste.trim()) {
      setStudio(id, { angles: [s.angles, paste.trim()].filter(Boolean).join('\n\n') })
      setPaste('')
      toast('Saved under Notes from Claude')
    }
  }
  const copyPrompt = (p: string, what: string) => copyOrShow(p, 'Copy this prompt', `${what} prompt copied. Paste it in the Claude app.`)
  const shots = (s.shots || '').split('\n').map((x) => x.trim()).filter(Boolean)
  const done = new Set(s.shotsDone || [])
  const checks = brand().check.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <main className="main editor">
      <div className="edhead">
        <IconBtn label="Back to post" onClick={() => back('/post/' + id)}><ArrowLeft size={22} /></IconBtn>
        <span className="grow" />
        <SaveBadge />
      </div>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 6 }}>
          <button className="eyebrow linkish" onClick={() => go('/post/' + id)}>{firstLine(it.title) || 'Untitled post'}</button>
          <h1 className="page-title">Script.</h1>
        </div>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Type</h2></div>
          <Chips label="Content type" scroll value={s.type!} onChange={changeType} options={TYPES.map((t) => ({ value: t.id, label: t.name }))} />
        </section>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Formula</h2></div>
          <select className="input" aria-label="Story formula" value={f.id} onChange={(e) => changeFormula(e.target.value)}>
            {brand().formulas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {f.desc && <p className="small muted">{f.desc}</p>}
          <div className="beatbar">{f.beats.map((b, i) => <span key={i} style={{ flex: `${Math.max(4, b.p)} 1 0` }}>{b.n}</span>)}</div>
        </section>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Length</h2><span className="small muted tnum">{words}/{target} words</span></div>
          <Chips label="Length in seconds" value={s.len} onChange={changeLen} options={LENS.map((l) => ({ value: l, label: `${l}s` }))} />
        </section>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Idea & facts</h2></div>
          <AutoTextarea aria-label="Idea" value={s.idea || ''} onChange={(v) => setStudio(id, { idea: v })} minRows={2} placeholder="What's the story about? Rough is fine." />
          <AutoTextarea aria-label="Real facts" value={s.facts || ''} onChange={(v) => setStudio(id, { facts: v })} minRows={2} placeholder="Real details only you have: time, place, numbers, what someone said." />
        </section>

        <Accordion title="Reference" right={<span className="small muted acc-sum">{s.refText ? 'Transcript added' : s.refLink ? 'Link added' : 'Optional'}</span>}>
          <input className="input" inputMode="url" autoCapitalize="off" placeholder="Reel link (optional)" value={s.refLink || ''} onChange={(e) => setStudio(id, { refLink: e.target.value })} />
          <AutoTextarea aria-label="Reference transcript" value={s.refText || ''} onChange={(v) => setStudio(id, { refText: v })} minRows={3} placeholder="Paste the reference script or transcript. Used as structure in the Claude prompts, never copied." />
        </Accordion>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Hook</h2></div>
          <AutoTextarea aria-label="Hook" value={it.hook || ''} onChange={(v) => patch('items', id, { hook: v })} minRows={1} placeholder="The first 2 seconds." />
          {f.hook && <p className="xs muted">Pattern: {f.hook}</p>}
          <LintList text={it.hook || ''} mode="vo" />
        </section>

        <section className="stack">
          <div className="block-head"><h2 className="block-label grow">Beats</h2>
            {hasText && <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={async () => { if ((await ask({ title: 'Clear all beats?', body: 'Every line, visual and screen text in this script goes.', confirm: 'Clear', danger: true })) === 'confirm') setStudio(id, { beats: beatsFromFormula(f, s.len) }) }}>Clear</Button>}
          </div>
          {beats.map((b, i) => (
            <div key={i} className="beat">
              <div className="beat-head"><b>{b.name}</b><span className="small muted tnum">{b.time}s</span></div>
              {f.beats[i]?.ins && <p className="xs muted">{f.beats[i].ins}</p>}
              <AutoTextarea aria-label={`${b.name} voice over`} className="beat-vo" value={b.vo} onChange={(v) => setBeat(i, { vo: v })} minRows={2} placeholder="What you say. One short line per caption." />
              <LintList text={b.vo} mode="vo" />
              <div className="grid2">
                <input className="input" aria-label={`${b.name} visual`} placeholder="Visual / shot" value={b.visual} onChange={(e) => setBeat(i, { visual: e.target.value })} />
                <input className="input" aria-label={`${b.name} screen text`} placeholder="Big text on screen" value={b.screen} onChange={(e) => setBeat(i, { screen: e.target.value })} />
              </div>
            </div>
          ))}
          <p className="xs muted">Mark a keyword with *stars*. It becomes the accent word on the cover and carousel.</p>
        </section>

        <section className="card stack claude-box">
          <div><h2 className="block-label">Write it with Claude</h2><p className="small muted mt4">Free: copy a prompt, paste it in the Claude app, then paste the answer back here.</p></div>
          <div className="row gap8 wrap">
            <Button size="sm" icon={<Copy size={15} />} onClick={() => copyPrompt(promptAngles(it), 'Angles')}>Angles</Button>
            <Button size="sm" variant="primary" icon={<Copy size={15} />} onClick={() => copyPrompt(promptScript(it), 'Script')}>Full script</Button>
            <Button size="sm" icon={<Copy size={15} />} disabled={!hasText} onClick={() => copyPrompt(promptCheck(it), 'Check')}>Check my script</Button>
          </div>
          <AutoTextarea aria-label="Claude's answer" value={paste} onChange={setPaste} minRows={2} placeholder="Paste Claude's answer. A script fills the beats, anything else is saved as notes." />
          <Button size="sm" icon={<ClipboardPaste size={15} />} disabled={!paste.trim()} style={{ alignSelf: 'flex-start' }} onClick={applyPaste}>Use answer</Button>
          {s.angles && (
            <Accordion title="Notes from Claude">
              <AutoTextarea aria-label="Notes from Claude" value={s.angles} onChange={(v) => setStudio(id, { angles: v })} minRows={4} />
            </Accordion>
          )}
        </section>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Shot list</h2>{shots.length > 0 && <span className="small muted tnum">{shots.filter((_, i) => done.has(i)).length}/{shots.length}</span>}</div>
          {shots.length > 0 && (
            <div className="list">
              {shots.map((x, i) => (
                <div key={i} className="li shotli">
                  <Check3 checked={done.has(i)} label={x} onChange={(v) => setStudio(id, { shotsDone: v ? [...done, i] : [...done].filter((n) => n !== i) })} />
                  <span className={done.has(i) ? 'li-main done-text' : 'li-main'}>{x.replace(/^\d+[.)]\s*/, '')}</span>
                </div>
              ))}
            </div>
          )}
          <AutoTextarea aria-label="Shot list" value={s.shots || ''} onChange={(v) => setStudio(id, { shots: v, shotsDone: [] })} minRows={2} placeholder="One shot per line. Tick them off on the shoot." />
        </section>

        <section className="block">
          <div className="block-head"><h2 className="block-label grow">Checklist</h2></div>
          <div className="list">
            {checks.map((c, i) => (
              <div key={i} className="li shotli">
                <Check3 checked={!!s.check?.[i]} label={c} onChange={(v) => { const n = [...(s.check || [])]; n[i] = v; setStudio(id, { check: n }) }} />
                <span className="li-main small">{c}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="ed-actions">
        <div className="ed-actions-inner">
          <Button icon={<Copy size={17} />} disabled={!hasText} onClick={() => copyOrShow([plainLine(it.hook || ''), scriptPlain(beats)].filter(Boolean).join('\n\n'), 'Copy script', 'Script copied')}>Copy script</Button>
          <Button variant="primary" icon={<ImageIcon size={17} />} onClick={() => go(`/post/${id}/cover`)}>Cover</Button>
        </div>
      </div>
    </main>
  )
}
