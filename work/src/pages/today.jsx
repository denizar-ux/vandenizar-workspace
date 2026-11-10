import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { AddBtn } from '../ui/parts.jsx';
import { BentoCard, ChipCount } from '../ui/polish.jsx';
import { AgendaRow } from '../ui/agendaRow.jsx';
import { SlotTile } from '../ui/slotTile.jsx';
import { openAddMenu } from '../App.jsx';
import { navigate } from '../lib/router.js';
import { all, get, useStore } from '../lib/db.js';
import { today, addDays, nowTime, greeting, fmtLong, fmtDay, diffDays } from '../lib/date.js';
import * as M from '../lib/model.js';
import * as C from '../content/model.js';
import { hasSample } from '../lib/sample.js';
import { buildAgenda } from '../combined/agenda.js';
import { runReplan } from '../ui/replanToast.js';
import { areas, areaOfTask, CONTENT_AREA } from '../combined/areas.js';

const FILTER_KEY = 'vzw:todayFilter';
const loadFilter = () => { try { return localStorage.getItem(FILTER_KEY) || 'all'; } catch { return 'all'; } };
const saveFilter = (v) => { try { localStorage.setItem(FILTER_KEY, v); } catch {} };


export function TodayPage() {
  useStore();
  const s = M.settings();
  const t0 = today();
  const [saved, setSaved] = useState(loadFilter);
  const [lateOpen, setLateOpen] = useState(false);

  const everything = buildAgenda({ date: t0, filter: 'all' });
  const counts = everything.counts;
  const chipAreas = areas().filter((a) => counts[a.id] > 0);
  const total = chipAreas.reduce((n, a) => n + counts[a.id], 0);
  // A saved filter whose area has nothing today falls back to All without losing the choice.
  const filter = saved === 'all' || counts[saved] > 0 ? saved : 'all';
  const pick = (v) => { setSaved(v); saveFilter(v); };
  const agenda = filter === 'all' ? everything : buildAgenda({ date: t0, filter });

  const groups = [
    { id: 'today-allday', title: 'All day', items: agenda.allDay },
    { id: 'today-scheduled', title: 'Scheduled', items: agenda.scheduled },
    { id: 'today-anytime', title: 'Anytime today', items: agenda.anytime },
  ].filter((g) => g.items.length);
  const empty = !groups.length && !agenda.late.length;

  const replan = () => runReplan(filter, t0);

  return (
    <div class="page">
      <div class="hello-row">
        <div class="hello">
          <div class="hello-line">{greeting()}, {s.name}</div>
          <div class="eyebrow">{fmtLong(t0)}</div>
          <h1 class="ph-title">Start here.</h1>
        </div>
        <span class="home-add"><AddBtn label="Add" onClick={(e) => openAddMenu(e)} /></span>
      </div>
      {hasSample() && <a class="note-bar" href="#/settings/data"><Icon name="info" size={16} /><span class="grow">You're looking at sample data. Remove it in Settings.</span><Icon name="chevronRight" size={15} /></a>}

      <SummaryCards everything={everything} />

      {chipAreas.length > 0 && (
        <div class="chips scroll today-chips" role="group" aria-label="Filter by area">
          <ChipCount label="All" count={total} on={filter === 'all'} onClick={() => pick('all')} />
          {chipAreas.map((a) => <ChipCount key={a.id} label={a.name} count={counts[a.id]} on={filter === a.id} onClick={() => pick(a.id)} />)}
        </div>
      )}

      <div class="two-col focus-layout today-layout">
        <section class="block agenda-panel" aria-label="Agenda">
          {agenda.late.length > 0 && (
            <div class="late-bar">
              <div class="late-head">
                <button type="button" class="late-toggle" aria-expanded={lateOpen} onClick={() => setLateOpen(!lateOpen)}>
                  <Icon name="alert" size={16} /><b>{agenda.late.length} late</b>
                  <Icon name={lateOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                </button>
                <button type="button" class="btn sm primary" onClick={replan}>Replan</button>
              </div>
              {lateOpen && (
                <div class="late-body">
                  {agenda.late.map((i) => <AgendaRow key={i.key} item={i} />)}
                  <p class="late-help">Replan moves late items forward so the first one is today. Gaps stay the same.</p>
                </div>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id} id={g.id} class="agenda-group">
              <div class="group-label">{g.title}<span class="count">{g.items.length}</span></div>
              {g.items.map((i) => <AgendaRow key={i.key} item={i} />)}
            </div>
          ))}
          {empty && <EmptyDay />}
        </section>
        <div class="stack today-side">
          <Upcoming />
          <ThisWeekSlots />
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ everything }) {
  const t0 = today(), now = nowTime();
  const timed = everything.scheduled.filter((i) => i.time);
  const upcoming = timed.filter((i) => i.time >= now);
  const nextThree = (upcoming.length ? upcoming : timed).slice(0, 3);
  const notEvent = (i) => i.kind !== 'event';
  const todo = everything.scheduled.filter(notEvent).length + everything.anytime.filter(notEvent).length + everything.late.filter(notEvent).length;
  const waiting = M.liveProjects().filter((p) => !p.archived && p.stage === 'client_review').length;
  const toSched = () => {
    const el = document.getElementById('today-scheduled') || document.querySelector('.agenda-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div class="today-bento">
      <div class="tb-today">
        <BentoCard tint="butter" icon="calendar" label="Today" onClick={toSched}>
          {nextThree.length ? (
            <span class="bento-list">
              {nextThree.map((i) => <span key={i.key} class="bento-line"><b class="tnum">{i.time}</b> {i.title}</span>)}
            </span>
          ) : <span class="bento-empty">Nothing timed</span>}
        </BentoCard>
      </div>
      <BentoCard tint="cyan" icon="tasks" label="To do" value={todo} href="#/work/tasks?view=today" />
      <BentoCard tint="lavender" icon="clock" label="Waiting" value={waiting} href="#/work/projects?stage=client_review" />
    </div>
  );
}

function nextDated(t0) {
  const c = [];
  const nt = C.nextTaskAfter(t0);
  if (nt) c.push({ date: nt.date, text: (nt.task.label) + ': ' + nt.it.title });
  for (const t of M.liveTasks().filter(M.isOpen)) {
    const d = t.workDate && t.workDate > t0 ? t.workDate : t.deadlineDate && t.deadlineDate > t0 ? t.deadlineDate : null;
    if (d) c.push({ date: d, text: t.title });
  }
  for (const e of all('pmEvents')) if (!e.deletedAt && e.date > t0) c.push({ date: e.date, text: e.title });
  for (const it of C.liveItems()) if (it.kind === 'thread' && !it.postedAt && it.date && it.date > t0) c.push({ date: it.date, text: C.firstLine(it.text) });
  c.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return c[0];
}

function EmptyDay() {
  const n = nextDated(today());
  return (
    <div class="today-empty">
      <div class="today-empty-title">A clear day.</div>
      {n && <div class="muted">Next: {n.text}, {fmtDay(n.date)}</div>}
    </div>
  );
}

// Next 7 days: hard deadlines and posts, with an area dot on each row.
function Upcoming() {
  const t0 = today(), last = addDays(t0, 7);
  const items = [
    ...M.deadlineItems().filter((x) => x.date >= t0).map((x) => {
      const isTask = x.path.startsWith('/tasks/');
      const area = areaOfTask(isTask ? get('pmTasks', x.id) : { projectId: x.id });
      return { key: 'd:' + x.id, date: x.date, title: x.title, path: x.path, area };
    }),
    ...C.igItems().filter((i) => i.stage !== 'done' && i.date && i.date >= t0 && i.date <= last)
      .map((i) => ({ key: 'p:' + i.id, date: i.date, title: 'Post: ' + i.title, path: '/post/' + i.id, area: CONTENT_AREA })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 8);
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">Upcoming</h2><span class="muted overview-note">Next 7 days</span></div>
      {items.length ? (
        <div class="mini-agenda">
          {items.map((x) => (
            <a key={x.key} class="mag-row" href={'#' + x.path}>
              <span class="ar-dot" style={{ background: 'var(--' + x.area.color + ')' }} title={x.area.name} />
              <span class="grow ellipsis">{x.title}</span>
              <span class="muted tnum">{diffDays(x.date, t0) === 0 ? 'Today' : fmtDay(x.date)}</span>
            </a>
          ))}
        </div>
      ) : <div class="quiet-note">Nothing due in the next 7 days.</div>}
    </section>
  );
}

// This week's Instagram slots, same tiles as the Content tab.
export function ThisWeekSlots() {
  const week = C.thisWeek();
  const { posted, total } = C.weekProgress(week);
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">This week</h2><a class="muted overview-note" href="#/content/ig">{posted} of {total} posted</a></div>
      <div class="slot-grid">
        {C.slots().map((sl) => <SlotTile key={sl.id} week={week} slot={sl} />)}
      </div>
    </section>
  );
}

export { navigate };
