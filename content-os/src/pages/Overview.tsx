import React, { useState } from 'react'
import { ArrowRight, FileText, Video, Scissors, CheckCircle2, PlayCircle, AlertTriangle, Plus, Lightbulb, ChevronRight, Pin, ListChecks, Sparkles } from 'lucide-react'
import { all, get, settings, tz, patch } from '../lib/store'
import { pickNextAction, attentionItems, effectiveSchedule, isTaskToday, candidateTasks, setTaskStatus, type TimeFilter, type ActFilter, type NextAction } from '../lib/model'
import { fmtTime, fmtDuration, dateKey, todayKey } from '../lib/time'
import { go } from '../lib/router'
import { pref, setPref } from '../lib/prefs'
import { loadDemo } from '../lib/seed'
import { PageTop, SaveBadge } from '../ui/Shell'
import { Button, Check3, Empty, cx, toast } from '../ui/kit'
import { openSheet } from '../ui/bus'
import type { Task } from '../lib/types'

const ACT_ICON = { write: FileText, record: Video, edit: Scissors, review: CheckCircle2, other: ListChecks }

export function openForTask(t?: Task, contentId?: string) {
  const c = get('contents', contentId || t?.contentId)
  if (!c) { if (t) openSheet({ type: 'task', taskId: t.id }); return }
  if (c.channel === 'threads') { go(`/threads/${c.id}`); return }
  const tab = !t || t.activity === 'write' ? 'write' : 'production'
  go(`/instagram/${c.id}?tab=${tab}`)
}

function heroCta(n: NextAction) {
  const act = n.task?.activity || 'write'
  return act === 'write' ? 'Lanjut nulis' : act === 'record' ? 'Mulai rekam' : act === 'edit' ? 'Lanjut edit' : act === 'review' ? 'Mulai review' : 'Buka'
}

export default function Overview() {
  const st = settings()
  const z = tz()
  const [tf, setTf] = useState<TimeFilter>(() => pref('ov:tf', 'all'))
  const [af, setAf] = useState<ActFilter>(() => pref('ov:af', 'all'))
  const setT = (v: TimeFilter) => { setTf(v); setPref('ov:tf', v) }
  const setA = (v: ActFilter) => { setAf(v); setPref('ov:af', v) }

  const next = pickNextAction(tf, af)
  const today = todayKey(z)
  const prodToday = candidateTasks().concat(all('tasks').filter((t) => t.status === 'done' && !t.parentTaskId && isTaskToday(t)))
    .filter((t) => isTaskToday(t))
    .sort((a, b) => (effectiveSchedule(a)?.start || '9') < (effectiveSchedule(b)?.start || '9') ? -1 : 1)
  const ready = all('contents').filter((c) => c.lifecycle === 'active' && c.status === 'ready')
  const attention = attentionItems()
  const ideas = all('ideas').filter((i) => i.lifecycle === 'active' && i.convertedContentIds.length === 0).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  const isEmpty = all('contents').length === 0 && all('ideas').length === 0 && all('tasks').length === 0

  const startHero = () => {
    if (!next) return
    if (next.task && next.task.status === 'todo' && next.task.activity !== 'write') setTaskStatus(next.task.id, 'doing')
    openForTask(next.task, next.content?.id)
  }

  return (
    <main className="main">
      <PageTop />
      <div className="mt8">
        <p className="muted">Hello {st.displayName || 'Denizar'},</p>
        <h1 className="page-title">Lanjut yang ini.</h1>
      </div>

      {isEmpty ? (
        <div className="card mt24">
          <Empty icon={<Lightbulb size={22} />} title="Belum ada konten" body="Mulai dari satu ide. Bentuk dan jadwalnya bisa menyusul." action={<>
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => openSheet({ type: 'capture' })}>Tangkap ide</Button>
            <Button onClick={() => { loadDemo(); toast('Contoh dimuat, ditandai "Contoh"') }}>Muat contoh</Button>
          </>} />
        </div>
      ) : (
        <div className="stack-lg mt16">
          <div className="stack" style={{ gap: 8 }}>
            <div className="filters" role="group" aria-label="Waktu yang tersedia">
              {([['all', 'Semua'], [15, '15 menit'], [30, '30 menit'], [60, '1 jam']] as [TimeFilter, string][]).map(([v, l]) => (
                <button key={String(v)} className={cx('fpill', tf === v && 'on')} aria-pressed={tf === v} onClick={() => setT(v)}>{l}</button>
              ))}
            </div>
            <div className="filters" role="group" aria-label="Jenis kerja">
              {([['all', 'Semua'], ['write', 'Nulis'], ['record', 'Rekam'], ['edit', 'Edit']] as [ActFilter, string][]).map(([v, l]) => (
                <button key={v} className={cx('fpill', af === v && 'on')} aria-pressed={af === v} onClick={() => setA(v)}>{l}</button>
              ))}
            </div>
          </div>

          {next ? (
            <section className="hero" aria-label="Lanjutkan sekarang">
              <div className="row between">
                <span className="eyebrow" style={{ color: 'rgba(17,17,15,.7)' }}>Lanjutkan sekarang{next.reason === 'overdue' ? ' · terlambat' : next.reason === 'pinned' ? ' · dipin' : ''}</span>
                {next.reason === 'pinned' ? <Pin size={18} /> : <FileText size={20} />}
              </div>
              <h2 className="hero-title">{next.content?.title || next.task?.title}</h2>
              <p className="small" style={{ color: 'rgba(17,17,15,.72)' }}>
                {next.content ? next.label : 'Tugas produksi'}{next.estimate ? ` · ${fmtDuration(next.estimate)}` : ''}
              </p>
              <Button variant="primary" size="lg" block className="mt8" onClick={startHero}>{heroCta(next)}<ArrowRight size={18} /></Button>
            </section>
          ) : (
            <section className="card">
              <Empty title="Belum ada yang cocok dengan filter ini" action={<>
                <Button onClick={() => { setT('all'); setA('all') }}>Reset filter</Button>
                <Button variant="primary" onClick={() => openSheet({ type: 'capture' })}>Tangkap ide</Button>
              </>} />
            </section>
          )}

          <section>
            <div className="section-head">
              <h2 className="h2">Produksi hari ini</h2>
              <div className="row gap4">
                {prodToday.length > 3 && <button className="linkbtn" onClick={() => go(`/calendar?mode=production&d=${today}`)}>Lihat semua</button>}
                <button className="iconbtn" aria-label="Tambah tugas hari ini" onClick={() => openSheet({ type: 'task', defaults: { dueDate: today } })}><Plus size={20} /></button>
              </div>
            </div>
            {prodToday.length === 0 ? (
              <p className="muted small">Belum ada tugas hari ini. <button className="linkbtn" onClick={() => go('/calendar?mode=production')}>Atur jadwal produksi</button></p>
            ) : (
              <div className="list">
                {prodToday.slice(0, 3).map((t) => {
                  const I = ACT_ICON[t.activity] || ListChecks
                  const sch = effectiveSchedule(t)
                  const c = get('contents', t.contentId)
                  return (
                    <div key={t.id} className="li">
                      <Check3 checked={t.status === 'done'} label={`Tandai ${t.title} selesai`} onChange={(v) => setTaskStatus(t.id, v ? 'done' : 'todo', { cascade: true })} />
                      <button className="li-main tap" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => openSheet({ type: 'task', taskId: t.id })}>
                        <div className={cx('li-title', t.status === 'done' && 'done-text')}>{t.title}</div>
                        <div className="li-sub row gap4"><I size={13} />{c ? c.title : 'Tanpa konten'}{sch?.batch ? ` · ${sch.batch.title}` : ''}</div>
                      </button>
                      <span className="li-meta tnum">{sch && dateKey(sch.start, z) === today ? fmtTime(sch.start, z, st.hour12) : 'Tenggat'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {ready.length > 0 && (
            <button className="card tint-sage tap row gap12" onClick={() => go('/instagram?stage=ready')}>
              <PlayCircle size={22} />
              <span className="grow" style={{ fontWeight: 600 }}>Siap tayang · {ready.length} konten</span>
              <ChevronRight size={20} />
            </button>
          )}

          {attention.length > 0 && (
            <section className="card tint-lavender stack" aria-label="Perlu perhatian">
              <div className="row gap8"><AlertTriangle size={20} /><h2 className="h3 grow">Perlu perhatian</h2><span className="small tnum">{attention.length}</span></div>
              <div className="col gap4">
                {attention.slice(0, 3).map((a, i) => (
                  <button key={i} className="tap row gap8" style={{ border: 0, background: 'rgba(255,255,255,.55)', borderRadius: 12, padding: '10px 12px', minHeight: 48 }}
                    onClick={() => {
                      if (a.kind === 'missed' && a.contentId) {
                        const c = get('contents', a.contentId)
                        go(c?.channel === 'threads' ? `/threads/${a.contentId}` : `/instagram/${a.contentId}?tab=publish`)
                      } else if (a.taskId) openSheet({ type: 'task', taskId: a.taskId })
                    }}>
                    <span className="grow">
                      <span className="li-title" style={{ display: 'block' }}>{a.label}</span>
                      <span className="li-sub" style={{ display: 'block', color: 'rgba(17,17,15,.7)' }}>{a.sub}</span>
                    </span>
                    <span className="small" style={{ fontWeight: 600 }}>Atur</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="section-head">
              <h2 className="h2">Inbox ide</h2>
              <button className="linkbtn" onClick={() => go('/ideas')}>Lihat semua{ideas.length ? ` (${ideas.length})` : ''}</button>
            </div>
            <div className="list">
              {ideas.slice(0, 3).map((i) => (
                <button key={i.id} className="li" onClick={() => go(`/ideas?open=${i.id}`)}>
                  <Sparkles size={18} className="muted" />
                  <span className="li-main"><span className="li-title clamp2" style={{ fontWeight: 500 }}>{i.text}</span></span>
                  <ChevronRight size={18} className="muted" />
                </button>
              ))}
              <button className="li" onClick={() => openSheet({ type: 'capture' })}><Plus size={20} /><span className="li-main li-title">Tangkap ide</span></button>
            </div>
          </section>
          <div className="row center" style={{ justifyContent: 'center' }}><SaveBadge /></div>
        </div>
      )}
    </main>
  )
}
