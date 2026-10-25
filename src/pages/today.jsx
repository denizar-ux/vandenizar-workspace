import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check } from '../ui/kit.jsx';
import { toast, openOverlay, SheetHead, SheetBody } from '../ui/overlay.jsx';
import { dateTimeShort, whenLabel, AddBtn } from '../ui/parts.jsx';
import { openQuickAdd } from '../App.jsx';
import { navigate } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import { today, greeting, fmtMinutes, fmtLong } from '../lib/date.js';
import * as M from '../lib/model.js';
import { EventRow, openEventSheet } from './events.jsx';
import { hasSample } from '../lib/migrate.js';

export function TodayPage() {
  useStore();
  const s = M.settings();
  const t0 = today();
  const tasks = M.todayTasks();
  const overdue = M.sortTasks(tasks.filter(M.isOverdue), 'deadline');
  const scheduled = tasks.filter((t) => !M.isOverdue(t) && t.workDate === t0 && t.workTime).sort((a, b) => a.workTime.localeCompare(b.workTime));
  const flexible = M.sortTasks(tasks.filter((t) => !M.isOverdue(t) && !(t.workDate === t0 && t.workTime)), 'deadline');
  const groups = [{ title: 'Overdue', tasks: overdue, tone: 'bad' }, { title: 'Scheduled', tasks: [...scheduled, ...M.eventsOn(t0).filter(e=>!e.allDay).map(e=>({...e,event:e,workTime:e.startTime}))].sort((a,b)=>a.workTime.localeCompare(b.workTime)) }, { title: 'Not scheduled', tasks: flexible }];
  const doneToday = M.liveTasks().filter((t) => t.status === 'done' && t.completedAt && M.isoOf(t.completedAt) === t0).length;

  return (
    <div class="page">
      <div class="hello-row">
        <div class="hello">
          <div class="hello-line">{greeting()}, {s.name}</div>
          <div class="eyebrow">{fmtLong(t0)}</div>
          <h1 class="ph-title">Start here.</h1>
        </div>
        <span class="home-add"><AddBtn label="Add" onClick={() => openQuickAdd()} /></span>
      </div>
      {hasSample() && <a class="note-bar" href="#/settings/data"><Icon name="info" size={16} /><span class="grow">You're looking at sample data. Remove it in Settings.</span><Icon name="chevronRight" size={15} /></a>}
      <Overview />
      <div class="two-col focus-layout">
        <section class="block agenda-panel">
          <div class="block-head"><h2 class="block-title">Today's agenda</h2><a class="link-quiet" href="#/calendar">Calendar<Icon name="chevronRight" size={15} /></a></div>
          <CaptureField /><button class="link-quiet" onClick={()=>openEventSheet()}>+ Add event</button>
          {M.eventsOn(t0).filter(e=>e.allDay).map(e=><EventRow key={e.id} event={e}/>)}
          {(tasks.length || M.eventsOn(t0).some(e=>!e.allDay)) ? groups.filter((g) => g.tasks.length).map((g) => <div key={g.title} class="agenda-group">
            <div class={'group-label ' + (g.tone || '')}>{g.title}<span class="count">{g.tasks.length}</span></div>
            {g.tasks.map((t) => <>{t.event ? <EventRow key={t.id} event={t.event}/> : <AgendaRow key={t.id} t={t}/>}</>)}
          </div>) : <div class="agenda-empty">{M.eventsOn(t0).length ? '' : doneToday ? doneToday + ' done today. Nothing else is planned.' : 'A clear day. Add a task above to get started.'}</div>}
          <a class="link-strong" href="#/tasks?view=today">See today's tasks<Icon name="arrowRight" size={16} /></a>
        </section>
        <div class="stack day-context"><UpcomingDeadlines /></div>
      </div>
    </div>
  );
}

function AgendaRow({ t }) {
  const project = t.projectId && get('pmProjects', t.projectId);
  const overdue = M.isOverdue(t);
  const scheduled = t.workDate === today() && t.workTime;
  const sub = [project?.name, t.estimateMinutes ? fmtMinutes(t.estimateMinutes) : '', overdue ? 'Deadline passed · ' + whenLabel(t.deadlineDate) : t.deadlineDate === today() ? 'Deadline today' : ''].filter(Boolean).join(' · ');
  return <div class="prow agenda-row">
    <Check checked={false} onChange={() => { M.completeTask(t.id); toast('Task done', { action: { label: 'Undo', run: () => M.reopenTask(t.id) } }); }} label={'Complete ' + t.title} />
    <a class="prow-main" href={'#/tasks/' + t.id}>
      {scheduled && <span class="prow-tag tnum">{t.workTime}</span>}
      <span class="prow-title">{t.title}</span>{sub && <span class={'prow-sub' + (overdue ? ' bad' : '')}>{sub}</span>}
    </a>
  </div>;
}

// Counts link to the same scope they describe; no historical-looking sparklines.
function Overview() {
  const open = M.liveTasks().filter(M.isOpen);
  const projects = M.liveProjects().filter((p) => !p.archived && p.stage !== 'completed');
  const tiles = [
    { label: 'Tasks for today', value: M.todayTasks().length, tone: 'lavender', href: '#/tasks?view=today' },
    { label: 'Deadlines', value: M.deadlineItems().length, tone: 'peach', href: '#/?deadlines=1' },
    { label: 'Active projects', value: projects.length, tone: 'cyan', href: '#/projects' },
    { label: 'Events today', value: M.eventsOn(today()).length, tone: 'sage', href: '#/calendar?v=day&d=' + today() },
  ];
  return <section class="block compact-overview" aria-label="Workspace overview">
    <div class="block-head"><h2 class="block-title">At a glance</h2><span class="muted overview-note">Your workspace, right now</span></div>
    <div class="ovw-grid">{tiles.map((x) => <a key={x.label} class={'ovw-tile t-' + x.tone} href={x.href} onClick={x.label === 'Deadlines' ? (e)=>{e.preventDefault();openDeadlineList();} : undefined}>
      <span class="ovw-num tnum">{x.value}</span>
      <span class="ovw-foot"><span>{x.label}</span><Icon name="chevronRight" size={16} /></span>
    </a>)}</div>
  </section>;
}
function CaptureField() {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (!t) return; M.newTask({ title: t, workDate: today() }); setV(''); toast('Added to today'); };
  return (
    <div class="capture">
      <Icon name="plus" size={18} />
      <input id="capture" value={v} placeholder="What will you finish today?" onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} enterKeyHint="done" aria-label="Write a task" />
      {v.trim() && <button class="btn sm primary" onClick={add}>Add</button>}
    </div>
  );
}
// Hard deadlines in the next 7 days, tasks and projects together.
function UpcomingDeadlines() {
  const t0 = today();
  const lim = (d) => d && d >= t0 && (Date.parse(d) - Date.parse(t0)) / 864e5 <= 7;
  const items = [
    ...M.liveTasks().filter((t) => M.isOpen(t) && lim(t.deadlineDate)).map((t) => ({ date: t.deadlineDate, time: t.deadlineTime, title: t.title, sub: M.projectName(t.projectId) || 'Task', path: '/tasks/' + t.id })),
    ...M.liveProjects().filter((p) => !p.archived && p.stage !== 'completed' && M.stageIdx(p.stage) < M.stageIdx('delivered') && lim(p.deadlineDate)).map((p) => ({ date: p.deadlineDate, time: p.deadlineTime, title: p.name, sub: 'Project · ' + M.projectCategory(p).name, path: '/projects/' + p.id })),
  ].sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, 6);
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">Upcoming deadlines</h2></div>
      {items.length ? <div class="mini-agenda">
        {items.map((x) => <a class="mag-row" href={'#' + x.path}><span class={'tnum mag-time' + (x.date === t0 ? ' bad' : '')}>{x.date === t0 ? 'Today' : dateTimeShort(x.date)}</span><span class="grow" style={{ minWidth: 0 }}><span class="ellipsis" style={{ display: 'block' }}>{x.title}</span><span class="muted ellipsis" style={{ display: 'block', fontSize: 13 }}>{x.sub}{x.time ? ' · ' + x.time : ''}</span></span><Icon name="flag" size={15} class="muted" /></a>)}
      </div> : <div class="quiet-note">No hard deadlines in the next 7 days.</div>}
    </section>
  );
}
export { navigate };

function openDeadlineList() { openOverlay(close=><><SheetHead title="Deadlines" onClose={close}/><SheetBody><p class="muted">Next 7 days, including overdue</p>{M.deadlineItems().length ? M.deadlineItems().map(x=><a class="mag-row" href={'#'+x.path} onClick={close}><span class="grow">{x.title}</span><span class={x.date < today()?'bad':'muted'}>{x.date}</span></a>) : <p>No deadlines in this period.</p>}</SheetBody></>,{kind:'sheet'}); }
