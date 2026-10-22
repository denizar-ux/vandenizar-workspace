import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check } from '../ui/kit.jsx';
import { toast, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { dateTimeShort, whenLabel } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import { today, greeting, fmtMinutes, fmtDuration, fmtLong } from '../lib/date.js';
import * as M from '../lib/model.js';
import { openQuickAdd } from '../App.jsx';
import { hasSample } from '../lib/migrate.js';

export function TodayPage() {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const s = M.settings();
  const t0 = today();
  const rec = M.recommendedTask();
  const hero = rec?.task;
  const list = M.sortTasks(M.todayTasks().filter((t) => !hero || t.id !== hero.id), 'schedule');
  const shown = list.slice(0, 3);
  const attention = M.attentionItems();
  const doneToday = M.liveTasks().filter((t) => t.status === 'done' && t.completedAt && M.isoOf(t.completedAt) === t0).length;

  const Priorities = (
    <section class="block">
      <div class="block-head">
        <h2 class="block-title">Today's priorities</h2>
        {list.length > 3 && <a class="link-quiet" href="#/tasks?view=today">{list.length - 3} more<Icon name="chevronRight" size={15} /></a>}
      </div>
      {shown.length ? (
        <div class="plist">
          {shown.map((t) => <PriorityRow t={t} />)}
        </div>
      ) : <div class="quiet-note">{doneToday ? doneToday + ' done today. Nothing else is planned.' : 'Nothing else planned for today.'}</div>}
      <a class="link-strong" href="#/tasks">See all tasks<Icon name="arrowRight" size={16} /></a>
    </section>
  );
  const Attention = attention.length > 0 && (
    <section class="block">
      <div class="block-head"><h2 class="block-title">Needs attention</h2></div>
      <div class="col gap-8">
        {attention.slice(0, 4).map((a) => (
          <a class={'attn t-' + a.tone} href={'#' + a.path}>
            <span class="attn-ic"><Icon name={a.icon} size={18} /></span>
            <span class="grow" style={{ minWidth: 0 }}><span class="attn-title">{a.title}</span><span class="attn-sub">{a.sub}</span></span>
            <span class="circle-btn" aria-hidden="true"><Icon name="arrowRight" size={16} /></span>
          </a>
        ))}
      </div>
    </section>
  );
  const Capture = <CaptureField />;

  return (
    <div class="page">
      <div class="hello">
        <div class="hello-line">{greeting()}, {s.name}</div>
        <div class="eyebrow">{fmtLong(t0)}</div>
        <h1 class="ph-title">Start here.</h1>
      </div>
      {hasSample() && <a class="note-bar" href="#/settings/data"><Icon name="info" size={16} /><span class="grow">You're looking at sample data. Remove it in Settings.</span><Icon name="chevronRight" size={15} /></a>}
      {desktop ? (
        <div class="two-col">
          <div class="stack">{hero ? <HeroCard t={hero} reason={rec.reason} /> : <EmptyHero />}{Priorities}</div>
          <div class="stack">{Attention}{Capture}<TodaySchedule /></div>
        </div>
      ) : (
        <div class="stack">
          {hero ? <HeroCard t={hero} reason={rec.reason} /> : <EmptyHero />}
          {Priorities}
          {Attention}
          {Capture}
        </div>
      )}
    </div>
  );
}

function HeroCard({ t, reason }) {
  const project = t.projectId && get('pmProjects', t.projectId);
  const focusing = M.focusTask()?.id === t.id;
  const [, tick] = useState(0);
  useEffect(() => { if (!focusing) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [focusing]);
  const sc = M.subtaskCount(t);
  const label = { overdue: 'Deadline passed', focus: 'Working now', in_progress: 'In progress', scheduled: 'Work on now', pinned: 'Pinned for today', next_action: 'Next action' }[reason] || 'Work on now';
  const tone = reason === 'overdue' ? 'rose' : 'butter';
  return (
    <section class={'hero t-' + tone}>
      <div class="row between gap-8">
        <span class="eyebrow">{label}</span>
        <a class="circle-btn" href={'#/tasks/' + t.id} aria-label="Open task"><Icon name="arrowRight" size={18} /></a>
      </div>
      <a class="hero-title" href={'#/tasks/' + t.id}>{t.title}</a>
      <div class="hero-sub">{[project?.name || (t.projectId ? '' : 'No project'), t.estimateMinutes ? fmtMinutes(t.estimateMinutes) : '', sc.total ? sc.done + ' of ' + sc.total + ' steps' : ''].filter(Boolean).join(' · ')}</div>
      <div class="hero-facts">
        <div class="fact"><Icon name="calendar" size={18} /><div><span class="fact-label">Work schedule</span><span class="fact-value">{t.workDate ? (t.workDate === today() ? t.workTime || 'Today' : whenLabel(t.workDate, t.workTime)) : 'Not scheduled'}</span></div></div>
        <div class="fact"><Icon name="clock" size={18} /><div><span class="fact-label">Deadline</span><span class={'fact-value' + (M.isOverdue(t) ? ' bad' : '')}>{t.deadlineDate ? dateTimeShort(t.deadlineDate, t.deadlineTime) : 'None'}</span></div></div>
      </div>
      {focusing ? (
        <div class="row gap-8">
          <div class="focus-timer tnum"><span class="pulse" />{fmtDuration(Date.now() - t.focusStartedAt)}</div>
          <button class="btn outline grow" onClick={() => { M.stopFocus(); toast('Paused'); }}><Icon name="pause" size={14} />Pause</button>
          <button class="btn primary grow" onClick={() => { M.completeTask(t.id); toast('Done', { action: { label: 'Undo', run: () => M.reopenTask(t.id) } }); }}><Icon name="check" size={16} />Done</button>
        </div>
      ) : <button class="btn primary block lg" onClick={() => M.startFocus(t.id)}><Icon name="play" size={16} />Start work</button>}
    </section>
  );
}
function EmptyHero() {
  return (
    <section class="hero t-sage">
      <span class="eyebrow">Work on now</span>
      <div class="hero-title">Nothing planned yet.</div>
      <div class="hero-sub">Write the first task. Details can wait.</div>
      <button class="btn primary block lg" onClick={() => openQuickAdd()}><Icon name="plus" size={16} />Write a task</button>
    </section>
  );
}
function PriorityRow({ t }) {
  const project = t.projectId && get('pmProjects', t.projectId);
  const sub = [project?.name, t.workTime || (t.workDate && t.workDate !== today() ? whenLabel(t.workDate) : ''), M.isOverdue(t) ? 'Overdue' : t.deadlineDate === today() ? 'Deadline today' : ''].filter(Boolean).join(' · ');
  return (
    <div class="prow">
      <Check checked={false} onChange={() => { M.completeTask(t.id); toast('Task done', { action: { label: 'Undo', run: () => M.reopenTask(t.id) } }); }} label={'Complete ' + t.title} />
      <a class="prow-main" href={'#/tasks/' + t.id}><span class="prow-title">{t.title}</span>{sub && <span class={'prow-sub' + (M.isOverdue(t) ? ' bad' : '')}>{sub}</span>}</a>
      <Icon name="chevronRight" size={16} class="muted" />
    </div>
  );
}
function CaptureField() {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (!t) return; M.newTask({ title: t, workDate: today() }); setV(''); toast('Added to today'); };
  return (
    <div class="capture">
      <Icon name="plus" size={18} />
      <input id="capture" value={v} placeholder="Write a task..." onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} enterKeyHint="done" aria-label="Write a task" />
      {v.trim() && <button class="btn sm primary" onClick={add}>Add</button>}
    </div>
  );
}
function TodaySchedule() {
  const t0 = today();
  const items = M.sortTasks(M.liveTasks().filter((t) => M.isOpen(t) && t.workDate === t0 && t.workTime), 'schedule');
  if (!items.length) return null;
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">On the clock</h2><a class="link-quiet" href="#/calendar">Calendar<Icon name="chevronRight" size={15} /></a></div>
      <div class="mini-agenda">
        {items.map((t) => <a class="mag-row" href={'#/tasks/' + t.id}><span class="tnum mag-time">{t.workTime}</span><span class="grow ellipsis">{t.title}</span>{t.estimateMinutes ? <span class="muted tnum">{fmtMinutes(t.estimateMinutes)}</span> : null}</a>)}
      </div>
    </section>
  );
}
export { navigate };
