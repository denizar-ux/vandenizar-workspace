import React, { useState } from 'react'
import { Check, Copy, Play, Link2, ChevronDown, ArrowRight, Plus } from 'lucide-react'
import { settings, tz } from '../lib/store'
import { tasksOn, overdueTasks, nextTaskAfter, completeTask, setStage, slotById, today, normalizeUrl, firstLine, STAGES, stageIndex, type DayTask } from '../lib/model'
import { fmtDay, greeting, relDay } from '../lib/time'
import { go } from '../lib/router'
import { PhoneTop } from '../ui/Shell'
import { Button, toast, copyOrShow, cx } from '../ui/kit'
import { MaterialsSheet } from '../ui/Refs'
import { openNew } from '../ui/QuickAdd'

export default function Today() {
  const z = tz(), t = today()
  const list = tasksOn(t)
  const open = list.filter((x) => !x.done)
  const done = list.filter((x) => x.done)
  const over = overdueTasks(t)
  const next = nextTaskAfter(t)
  const [showOver, setShowOver] = useState(false)
  const summary = open.length ? `${open.length} thing${open.length > 1 ? 's' : ''} today${done.length ? ` · ${done.length} done` : ''}` : list.length ? 'All done for today.' : 'Nothing scheduled today.'

  return (
    <main className="main">
      <PhoneTop />
      <div className="hello">
        <div className="hello-line">{greeting(z)}, {settings().displayName || 'there'}</div>
        <div className="eyebrow">{fmtDay(t, { long: true })}</div>
        <h1 className="page-title">Start here.</h1>
      </div>

      <div className="stack">
        <p className="today-sum">{summary}</p>

        {over.length > 0 && (
          <div className="overdue">
            <button className="overdue-head" aria-expanded={showOver} onClick={() => setShowOver(!showOver)}>
              <span className="grow">{over.length} overdue from earlier days</span><ChevronDown size={18} className={cx('acc-chev', showOver && 'up')} />
            </button>
            {showOver && <div className="stack" style={{ gap: 8 }}>{over.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} showDate />)}</div>}
          </div>
        )}

        {open.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} />)}

        {!open.length && (
          <div className="today-empty">
            {next
              ? <><span className="eyebrow">Next up · {relDay(next.date, z)}</span><button className="today-next" onClick={() => go('/post/' + next.it.id)}><b>{next.task.label}</b> {firstLine(next.it.title) || 'Untitled'}<ArrowRight size={17} /></button></>
              : <><p className="muted">No dates planned yet. Give a post its script, film, edit and post days and they show up here on the day.</p><Button variant="primary" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }} onClick={() => openNew({ kind: 'ig' })}>Plan a post</Button></>}
          </div>
        )}

        {done.length > 0 && (
          <>
            <span className="eyebrow mt8">Done today</span>
            {done.map((x) => <TaskRow key={x.it.id + x.task.key} x={x} />)}
          </>
        )}
      </div>
    </main>
  )
}

function TaskRow({ x, showDate }: { x: DayTask; showDate?: boolean }) {
  const [mats, setMats] = useState(false)
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
      {!done && (task.key === 'film' || task.key === 'post') && (
        <div className="task-actions">
          {task.key === 'film' && <Button size="sm" icon={<Link2 size={15} />} onClick={() => setMats(true)}>Materials</Button>}
          {task.key === 'post' && video && <a className="btn btn-sm" href={video} target="_blank" rel="noopener noreferrer"><Play size={15} /><span>Open video</span></a>}
          {task.key === 'post' && it.caption?.trim() && <Button size="sm" icon={<Copy size={15} />} onClick={() => copyOrShow(it.caption!, 'Copy caption', 'Caption copied')}>Copy caption</Button>}
        </div>
      )}
      {mats && <MaterialsSheet it={it} open onClose={() => setMats(false)} onOpenPost={() => go('/post/' + it.id)} />}
    </article>
  )
}
