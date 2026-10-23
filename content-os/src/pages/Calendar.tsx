import React from 'react'
import { ChevronLeft, ChevronRight, AtSign, List, AlertTriangle, Layers, Info, Plus, CalendarDays } from 'lucide-react'
import { Instagram } from '../ui/icons'
import { all, get, settings, tz } from '../lib/store'
import { contentDisplayDate, effectiveSchedule, candidateTasks, overlaps, postAtRisk, isTaskOverdue, batchMembers, weekDates, taskLive } from '../lib/model'
import { todayKey, dateKey, weekStart, addDays, fmtDay, fmtTime, monthKey, addMonths, daysInMonth, MONTHS, DAYS_S, tzLabel, zonedToIso, timeKey, fmtShort, relDay } from '../lib/time'
import { useRoute, setQuery, go } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { ACTIVITY_LABEL, THREAD_STATUS_LABEL, STATUS_LABEL, FORMAT_LABEL } from '../lib/templates'
import { Button, IconBtn, Segmented, Chips, Check3, Empty, Badge, cx } from '../ui/kit'
import { openSheet } from '../ui/bus'
import { toggleTask } from './IgEditor'
import type { Content, Task, BatchSession, Activity } from '../lib/types'

type Mode = 'posting' | 'production'
const ACT_TINT: Record<Activity, string> = { write: 'tint-cyan', record: 'tint-lavender', edit: 'tint-butter', review: 'tint-sage', other: 'tint-sage' }

export default function Calendar() {
  const r = useRoute()
  const z = tz(), st = settings()
  const today = todayKey(z)
  const mode = (r.q.get('mode') as Mode) || pref<Mode>('cal:mode', 'posting')
  const view = (r.q.get('v') as 'week' | 'month') || pref<'week' | 'month'>('cal:v', window.innerWidth >= 1024 ? 'month' : 'week')
  const sel = r.q.get('d') || today
  const ch = (r.q.get('ch') as 'all' | 'instagram' | 'threads') || 'all'
  const act = (r.q.get('act') as 'all' | Activity) || 'all'
  const setMode = (m: Mode) => { setPref('cal:mode', m); setQuery('mode', m) }
  const setView = (v: 'week' | 'month') => { setPref('cal:v', v); setQuery('v', v) }
  const setSel = (d: string) => setQuery('d', d)

  // ---- data ----
  const posts = all('contents').filter((c) => c.lifecycle === 'active' && contentDisplayDate(c) && (ch === 'all' || c.channel === ch))
  const postsOn = (d: string) => posts.filter((c) => dateKey(contentDisplayDate(c)!, z) === d).sort((a, b) => (contentDisplayDate(a)! < contentDisplayDate(b)! ? -1 : 1))
  const liveTasks = all('tasks').filter((t) => !t.parentTaskId && taskLive(t) && (act === 'all' || t.activity === act))
  const batches = all('batches')
  const blocksOn = (d: string) => {
    const out: { id: string; start: string; end: string; task?: Task; batch?: BatchSession }[] = []
    for (const b of batches) if (dateKey(b.startAt, z) === d && (act === 'all' || batchMembers(b.id).some((t) => t.activity === act) || batchMembers(b.id).length === 0)) out.push({ id: b.id, start: b.startAt, end: b.endAt, batch: b })
    for (const t of liveTasks) { if (t.batchId) continue; const s = effectiveSchedule(t); if (s && dateKey(s.start, z) === d) out.push({ id: t.id, start: s.start, end: s.end, task: t }) }
    return out.sort((a, b) => (a.start < b.start ? -1 : 1))
  }
  const dueOn = (d: string) => liveTasks.filter((t) => t.dueDate === d && !effectiveSchedule(t))
  const hasProd = (d: string) => blocksOn(d).length + dueOn(d).length > 0
  const unscheduledPosts = all('contents').filter((c) => c.lifecycle === 'active' && c.status !== 'published' && !c.plannedPublishAt && (ch === 'all' || c.channel === ch))
  const unscheduledTasks = candidateTasks().filter((t) => !effectiveSchedule(t) && (act === 'all' || t.activity === act))
  const risky = all('contents').filter((c) => c.lifecycle === 'active' && postAtRisk(c).length > 0)

  // ---- navigation ----
  const ws = weekStart(sel)
  const mk = monthKey(sel)
  const shift = (n: number) => {
    if (view === 'week') setSel(addDays(sel, n * 7))
    else { const m = addMonths(mk, n); setSel(m + '-01') }
  }
  const [y, m] = mk.split('-').map(Number)

  return (
    <main className={cx('main', view === 'month' && 'wide')}>
      <div className="pagehead" style={{ marginTop: 10, alignItems: 'center' }}>
        <h1 className="page-title">{mode === 'production' ? 'Produksi.' : 'Calendar.'}</h1>
        <div className="seg" style={{ flex: 'none' }} role="tablist" aria-label="Tampilan">
          <button role="tab" aria-selected={view === 'week'} className={cx('seg-item', view === 'week' && 'on')} onClick={() => setView('week')}>Minggu</button>
          <button role="tab" aria-selected={view === 'month'} className={cx('seg-item', view === 'month' && 'on')} onClick={() => setView('month')}>Bulan</button>
        </div>
      </div>
      <div className="stack">
        <Segmented label="Mode kalender" value={mode} onChange={setMode} options={[{ value: 'posting', label: 'Posting' }, { value: 'production', label: 'Produksi' }]} />
        <div className="row gap4">
          <h2 className="h2 grow">{MONTHS[m - 1]} {y}</h2>
          {sel !== today && <Button size="sm" variant="soft" onClick={() => setSel(today)}>Hari ini</Button>}
          <IconBtn label={view === 'week' ? 'Minggu sebelumnya' : 'Bulan sebelumnya'} onClick={() => shift(-1)}><ChevronLeft size={22} /></IconBtn>
          <IconBtn label={view === 'week' ? 'Minggu berikutnya' : 'Bulan berikutnya'} onClick={() => shift(1)}><ChevronRight size={22} /></IconBtn>
        </div>

        {view === 'week' ? (
          <div className="week" role="group" aria-label="Pilih tanggal">
            {weekDates(ws).map((d) => {
              const n = mode === 'posting' ? postsOn(d).length : blocksOn(d).length + dueOn(d).length
              return (
                <button key={d} className={cx('wday', d === sel && 'on', d === today && 'today')} aria-pressed={d === sel} aria-label={`${fmtDay(d)}${n ? `, ${n} item` : ''}`} onClick={() => setSel(d)}>
                  <b>{+d.slice(8)}</b><span>{DAYS_S[new Date(d + 'T00:00:00Z').getUTCDay()]}</span>
                  <span className="dots">{Array.from({ length: Math.min(n, 3) }, (_, i) => <i key={i} className="dot" />)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <MonthGrid mk={mk} sel={sel} today={today} onSel={setSel}
            items={(d) => mode === 'posting'
              ? postsOn(d).map((c) => ({ label: c.title, tint: c.channel === 'threads' ? 'tint-lavender' : c.status === 'published' ? 'tint-sage' : 'tint-butter' }))
              : [...blocksOn(d).map((b) => ({ label: b.batch ? b.batch.title : b.task!.title, tint: b.batch ? 'tint-lavender' : ACT_TINT[b.task!.activity] })), ...dueOn(d).map((t) => ({ label: 'Tenggat: ' + t.title, tint: 'tint-danger' }))]} />
        )}

        {mode === 'posting' ? (
          <>
            <Chips label="Channel" value={ch} onChange={(v) => setQuery('ch', v === 'all' ? null : v)} options={[{ value: 'all', label: 'Semua' }, { value: 'instagram', label: 'Instagram' }, { value: 'threads', label: 'Threads' }]} />
            <PostingDay d={sel} items={postsOn(sel)} />
            <p className="row gap6 xs muted"><Info size={14} />Rencana posting, bukan auto-post.</p>
            <button className="card tap row gap12" onClick={() => openSheet({ type: 'schedulePost', date: sel })}>
              <List size={20} /><span className="grow" style={{ fontWeight: 550 }}>Belum dijadwalkan · {unscheduledPosts.length}</span><ChevronRight size={20} />
            </button>
            {view === 'week' && [1, 2, 3].map((i) => {
              const d = addDays(sel, i), list = postsOn(d)
              return list.length ? <PostingDay key={d} d={d} items={list} compact /> : null
            })}
          </>
        ) : (
          <>
            <Chips label="Jenis kerja" value={act} onChange={(v) => setQuery('act', v === 'all' ? null : v)} options={[{ value: 'all', label: 'Semua' }, { value: 'write', label: 'Nulis' }, { value: 'record', label: 'Rekam' }, { value: 'edit', label: 'Edit' }, { value: 'review', label: 'Review' }]} />
            <div className="row between"><h2 className="h2">{fmtDay(sel)}</h2><span className="xs muted">{tzLabel(z)}</span></div>
            {risky.length > 0 && (
              <div className="banner tint-danger"><AlertTriangle size={18} /><span className="grow">{risky.length} rencana post terdampak</span>
                <Button size="sm" onClick={() => openSheet({ type: 'task', taskId: postAtRisk(risky[0])[0].id })}>Atur ulang</Button></div>
            )}
            {dueOn(sel).length > 0 && (
              <section className="stack" style={{ gap: 8 }}>
                <h3 className="eyebrow">Tenggat {sel === today ? 'hari ini' : fmtShort(sel, z)}</h3>
                <TaskRows tasks={dueOn(sel)} />
              </section>
            )}
            <Timeline d={sel} today={today} blocks={blocksOn(sel)} />
            <section className="stack" style={{ gap: 8 }}>
              <div className="section-head"><h3 className="h3">Belum dijadwalkan · {unscheduledTasks.length}</h3><IconBtn label="Tugas baru" onClick={() => openSheet({ type: 'task' })}><Plus size={20} /></IconBtn></div>
              {unscheduledTasks.length ? <TaskRows tasks={unscheduledTasks.slice(0, 12)} /> : <p className="small muted">Semua tugas aktif sudah punya jadwal.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function MonthGrid({ mk, sel, today, onSel, items }: { mk: string; sel: string; today: string; onSel: (d: string) => void; items: (d: string) => { label: string; tint: string }[] }) {
  const first = mk + '-01'
  const start = weekStart(first)
  const n = daysInMonth(mk)
  const cells = Math.ceil((n + (Date.parse(first) - Date.parse(start)) / 86400000) / 7) * 7
  return (
    <div className="month" role="grid" aria-label="Bulan">
      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d} className="mhead" role="columnheader">{d}</div>)}
      {Array.from({ length: cells }, (_, i) => {
        const d = addDays(start, i)
        const its = items(d)
        return (
          <button key={d} role="gridcell" className={cx('mcell', monthKey(d) !== mk && 'out', d === sel && 'sel', d === today && 'today')} aria-selected={d === sel} aria-label={`${fmtDay(d)}${its.length ? `, ${its.length} item` : ''}`} onClick={() => onSel(d)}>
            <span className="mnum">{+d.slice(8)}</span>
            <span className="dots">{its.slice(0, 3).map((_, k) => <i key={k} className="dot" />)}</span>
            {its.slice(0, 3).map((x, k) => <span key={k} className={cx('mchip', x.tint)}>{x.label}</span>)}
            {its.length > 3 && <span className="mchip" style={{ color: 'var(--muted)' }}>+{its.length - 3} lagi</span>}
          </button>
        )
      })}
    </div>
  )
}

function PostingDay({ d, items, compact }: { d: string; items: Content[]; compact?: boolean }) {
  const z = tz(), st = settings()
  return (
    <section className="stack" style={{ gap: 10 }}>
      <h2 className={compact ? 'h3' : 'h2'}>{relDay(d, z) === fmtDay(d) ? fmtDay(d) : `${relDay(d, z)}, ${fmtShort(d, z)}`}</h2>
      {items.length === 0 ? (
        <div className="card row gap12"><CalendarDays size={20} className="muted" /><span className="grow small muted">Belum ada rencana posting.</span><Button size="sm" onClick={() => openSheet({ type: 'schedulePost', date: d })}>Jadwalkan</Button></div>
      ) : items.map((c) => {
        const at = contentDisplayDate(c)!
        const label = c.status === 'published' ? 'Terbit' : c.status === 'ready' ? 'Siap' : 'Rencana'
        return (
          <div key={c.id} className="agenda-row">
            <span className="agenda-time">{fmtTime(at, z, st.hour12)}</span>
            <button className={cx('evt on-tint', c.channel === 'threads' ? 'tint-lavender' : 'tint-butter')} onClick={() => go(c.channel === 'threads' ? `/threads/${c.id}` : `/instagram/${c.id}?tab=publish`)}>
              {c.channel === 'threads' ? <AtSign size={22} /> : <Instagram size={22} />}
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="li-title clamp2" style={{ display: 'block' }}>{c.title}</span>
                <span className="xs" style={{ color: 'rgba(17,17,15,.7)' }}>{c.channel === 'threads' ? 'Threads' : `Instagram ${c.format ? FORMAT_LABEL[c.format] : ''}`}</span>
              </span>
              <Badge tone={label === 'Terbit' ? 'ink' : undefined}>{label}</Badge>
            </button>
          </div>
        )
      })}
    </section>
  )
}

function TaskRows({ tasks }: { tasks: Task[] }) {
  const z = tz()
  return (
    <div className="list">
      {tasks.map((t) => {
        const c = get('contents', t.contentId)
        return (
          <div key={t.id} className="li">
            <Check3 checked={t.status === 'done'} label={`${t.title} selesai`} onChange={(v) => toggleTask(t, v)} />
            <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => openSheet({ type: 'task', taskId: t.id })}>
              <span className={cx('li-title', t.status === 'done' && 'done-text')} style={{ display: 'block' }}>{t.title}</span>
              <span className="li-sub">{ACTIVITY_LABEL[t.activity]} · {c ? c.title : 'Tanpa konten'}{t.dueDate ? ` · tenggat ${fmtShort(t.dueDate, z)}` : ''}</span>
            </button>
            {isTaskOverdue(t) && <Badge tone="danger">Terlambat</Badge>}
          </div>
        )
      })}
    </div>
  )
}

function Timeline({ d, today, blocks }: { d: string; today: string; blocks: { id: string; start: string; end: string; task?: Task; batch?: BatchSession }[] }) {
  const z = tz(), st = settings()
  const H = 56
  const mins = (iso: string) => { const [h, m] = timeKey(iso, z).split(':').map(Number); return h * 60 + m }
  let from = 8, to = 21
  for (const b of blocks) { from = Math.min(from, Math.floor(mins(b.start) / 60)); const e = dateKey(b.end, z) !== d ? 24 : Math.ceil(mins(b.end) / 60); to = Math.max(to, e) }
  to = Math.min(24, Math.max(to, from + 4))
  const warn = overlaps(blocks)
  // lanes for overlapping blocks
  const lanes: Record<string, { lane: number; of: number }> = {}
  let cluster: typeof blocks = [], clusterEnd = 0
  const flushCluster = () => {
    const ends: number[] = []
    for (const b of cluster) {
      let l = ends.findIndex((e) => e <= Date.parse(b.start))
      if (l < 0) { l = ends.length; ends.push(0) }
      ends[l] = Date.parse(b.end); lanes[b.id] = { lane: l, of: 0 }
    }
    for (const b of cluster) lanes[b.id].of = ends.length
    cluster = []
  }
  for (const b of blocks) { if (cluster.length && Date.parse(b.start) >= clusterEnd) flushCluster(); cluster.push(b); clusterEnd = Math.max(clusterEnd, Date.parse(b.end)) }
  flushCluster()
  const nowM = d === today ? mins(new Date().toISOString()) : -1
  const newAt = (h: number) => {
    const hh = String(h).padStart(2, '0')
    openSheet({ type: 'task', defaults: { plannedStart: zonedToIso(d, `${hh}:00`, z), plannedEnd: zonedToIso(d, `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${h + 1 > 23 ? '59' : '00'}`, z) } })
  }
  return (
    <div className="timeline" style={{ height: (to - from) * H + 8, marginTop: 8 }} aria-label="Jadwal kerja hari ini">
      {Array.from({ length: to - from }, (_, i) => (
        <div key={i} className="tl-hour"><span>{String(from + i).padStart(2, '0')}.00</span>
          <button className="tl-slot" aria-label={`Buat tugas jam ${from + i}.00`} onClick={() => newAt(from + i)} />
        </div>
      ))}
      {blocks.map((b) => {
        const s = Math.max(mins(b.start), from * 60)
        const e = dateKey(b.end, z) !== d ? 24 * 60 : Math.max(mins(b.end), s + 20)
        const ln = lanes[b.id] || { lane: 0, of: 1 }
        const style: React.CSSProperties = { top: ((s - from * 60) / 60) * H, height: Math.max(((e - s) / 60) * H - 3, 30), left: `calc(56px + (100% - 58px) * ${ln.lane / ln.of})`, right: 'auto', width: `calc((100% - 58px) / ${ln.of} - 4px)` }
        const time = `${fmtTime(b.start, z, st.hour12)}–${fmtTime(b.end, z, st.hour12)}`
        if (b.batch) {
          const mem = batchMembers(b.batch.id)
          return (
            <button key={b.id} className={cx('tl-block tint-lavender', warn.has(b.id) && 'warn')} style={style} onClick={() => go(`/batches/${b.batch!.id}`)}>
              <span className="xs tnum">{time}</span>
              <span className="row gap4" style={{ fontWeight: 600 }}><Layers size={14} />{b.batch.title}</span>
              <span className="xs">{mem.length} tugas · {new Set(mem.map((t) => t.contentId).filter(Boolean)).size} konten</span>
            </button>
          )
        }
        const t = b.task!
        const c = get('contents', t.contentId)
        return (
          <div key={b.id} className={cx('tl-block', ACT_TINT[t.activity], warn.has(b.id) && 'warn')} style={{ ...style, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ paddingTop: 2 }}><Check3 size={20} checked={t.status === 'done'} label={`${t.title} selesai`} onChange={(v) => toggleTask(t, v)} /></span>
            <button className="tap grow" style={{ border: 0, background: 'none', padding: 0, minWidth: 0 }} onClick={() => openSheet({ type: 'task', taskId: t.id })}>
              <span className="xs tnum" style={{ display: 'block' }}>{time}{warn.has(b.id) ? ' · bentrok' : ''}</span>
              <span className={cx(t.status === 'done' && 'done-text')} style={{ fontWeight: 600, display: 'block' }}>{t.title}</span>
              {c && <span className="xs" style={{ display: 'block', opacity: .75 }}>{c.title}</span>}
            </button>
          </div>
        )
      })}
      {nowM >= from * 60 && nowM <= to * 60 && <div className="tl-now" style={{ top: ((nowM - from * 60) / 60) * H }} aria-hidden />}
      {blocks.length === 0 && <p className="small muted" style={{ position: 'absolute', top: H * 1.4, left: 64 }}>Kosong. Ketuk jam untuk menambah tugas.</p>}
    </div>
  )
}
