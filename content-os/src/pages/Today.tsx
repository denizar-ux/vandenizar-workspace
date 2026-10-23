import React, { useEffect, useState } from 'react'
import { Check, Copy, Play, ChevronDown, ArrowRight, Plus } from 'lucide-react'
import { settings, tz } from '../lib/store'
import { tasksOn, overdueTasks, nextTaskAfter, completeTask, setStage, slotById, today, normalizeUrl, firstLine, STAGES, stageIndex, threadsOn, overdueThreads, markPosted, type DayTask } from '../lib/model'
import { fmtDay, greeting, relDay, timeKey } from '../lib/time'
import { go } from '../lib/router'
import { PhoneTop } from '../ui/Shell'
import { Button, toast, copyOrShow, cx } from '../ui/kit'
import { openNew } from '../ui/QuickAdd'

export default function Today() {
  const z = tz(), t = today()
  const list = tasksOn(t)
  const open = list.filter((x) => !x.done)
  const done = list.filter((x) => x.done)
  const th = threadsOn(t)
  const thOpen = th.filter((x) => !x.postedAt), thDone = th.filter((x) => x.postedAt)
  const over = overdueTasks(t)
  const overTh = overdueThreads(t)
  const overN = over.length + overTh.length
  const next = nextTaskAfter(t)
  const [showOver, setShowOver] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i) }, [])
  const openN = open.length + thOpen.length, doneN = done.length + thDone.length
  const summary = openN ? `${openN} thing${openN > 1 ? 's' : ''} today${doneN ? ` · ${doneN} done` : ''}` : (list.length + th.length) ? 'All done for today.' : 'Nothing scheduled today.'

  return (
    <main className="main">
      <PhoneTop />
      <div className="hello">
        <div className="hello-line">{greeting(z)}, {settings().displayName || 'there'}</div>
        <div className="eyebrow">{fmtDay(t, { long: true })} · {timeKey(new Date(), z).replace(':', '.')} WIB</div>
        <h1 className="page-title">Start here.</h1>
      </div>

      <div className="stack">
        <p className="today-sum">{summary}</p>

        {overN > 0 && (
          <div className="overdue">
            <button className="overdue-head" aria-expanded={showOver} onClick={() => setShowOver(!showOver)}>
              <span className="grow">{overN} overdue from earlier days</span><ChevronDown size={18} className={cx('acc-chev', showOver && 'up')} />
            </button>
            {showOver && <div className="stack" style={{ gap: 8 }}>{over.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} showDate />)}{overTh.map((x) => <ThreadRow key={x.id} it={x} showDate />)}</div>}
          </div>
        )}

        {open.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} />)}
        {thOpen.map((x) => <ThreadRow key={x.id} it={x} />)}

        {!openN && (
          <div className="today-empty">
            {next
              ? <><span className="eyebrow">Next up · {relDay(next.date, z)}</span><button className="today-next" onClick={() => go('/post/' + next.it.id)}><b>{next.task.label}</b> {firstLine(next.it.title) || 'Untitled'}<ArrowRight size={17} /></button></>
              : <><p className="muted">No dates planned yet. Give a post its script, film, edit and post days and they show up here on the day.</p><Button variant="primary" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => openNew({ kind: 'ig' })}>Plan a post</Button></>}
          </div>
        )}

        {doneN > 0 && (
          <>
            <span className="eyebrow mt8">Done today</span>
            {done.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} />)}
            {thDone.map((x) => <ThreadRow key={x.id} it={x} />)}
          </>
        )}
      </div>
    </main>
  )
}

function TaskRow({ x, showDate }: { x: DayTask; showDate?: boolean }) {
  const { it, task, done } = x
  const s = slotById(it.slot)
  const video = it.finalUrl ? normalizeUrl(it.finalUrl) : null
  // un-checking is only safe right after finishing this task (stage is exactly the next one)
  const canUndo = done && stageIndex(it.stage) === task.idx + 1
  const toggle = () => {
    if (done) { if (canUndo) setStage(it.id, STAGES[task.idx].id); return }
    const prev = completeTask(it.id, task)
    if (prev) toast(`${task.done}: ${firstLine(it.title) || 'Untitled'}`, { label: 'Undo', run: () => setStage(it.id, prev) })
  }
  return (
    <article className={cx('task', done ? 'task-done' : s ? 'tint-' + s.tint : 'card')}>
      <div className="task-top">
        <button className={cx('task-check', done && 'on')} role="checkbox" aria-checked={done} aria-label={done ? `${task.done}${canUndo ? ', tap to undo' : ''}` : `Mark ${task.label.toLowerCase()} done`} disabled={done && !canUndo} onClick={toggle}>
          {done && <Check size={16} strokeWidth={3} />}
        </button>
        <button className="task-main" onClick={() => go('/post/' + it.id)}>
          <span className="eyebrow">{task.label}{showDate ? ' · ' + fmtDay(x.date) : ''}{s ? ' · ' + s.name : ''}</span>
          <span className="task-title">{it.title || 'Untitled'}</span>
        </button>
      </div>
      {!done && task.key === 'post' && (video || it.caption?.trim()) && (
        <div className="task-actions">
          {video && <a className="btn btn-sm" href={video} target="_blank" rel="noopener noreferrer"><Play size={15} /><span>Open video</span></a>}
          {it.caption?.trim() && <Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(it.caption!, 'Copy caption', 'Caption copied')}>Copy caption</Button>}
        </div>
      )}
    </article>
  )
}

function ThreadRow({ it, showDate }: { it: import('../lib/types').Item; showDate?: boolean }) {
  const done = !!it.postedAt
  const toggle = () => {
    if (done) { markPosted(it.id, false); return }
    markPosted(it.id, true)
    toast('Threads marked posted', { label: 'Undo', run: () => markPosted(it.id, false) })
  }
  return (
    <article className={cx('task', done ? 'task-done' : 'card')}>
      <div className="task-top">
        <button className={cx('task-check', done && 'on')} role="checkbox" aria-checked={done} aria-label={done ? 'Posted, tap to undo' : 'Mark posted'} onClick={toggle}>
          {done && <Check size={16} strokeWidth={3} />}
        </button>
        <button className="task-main" onClick={() => go('/threads')}>
          <span className="eyebrow">Threads{showDate && it.date ? ' · ' + fmtDay(it.date) : ''}{it.time ? ' · ' + it.time.replace(':', '.') + ' WIB' : ''}</span>
          <span className="task-text clamp3 pre">{it.text}</span>
        </button>
      </div>
      {!done && <div className="task-actions"><Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(it.text || '', 'Copy draft')}>Copy</Button></div>}
    </article>
  )
}
