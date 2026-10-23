import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check } from '../ui/kit.jsx';
import { toast, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { dateTimeShort, whenLabel } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import { today, greeting, fmtMinutes, fmtDuration, fmtLong, addDays, startOfWeek, daysInMonth, diffDays } from '../lib/date.js';
import { openMenu } from '../ui/overlay.jsx';
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
  // Recommended task first, then the rest of today in schedule order.
  const rest = M.sortTasks(M.todayTasks().filter((t) => !hero || t.id !== hero.id), 'schedule');
  const list = hero ? [hero, ...rest] : rest;
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
          {shown.map((t, i) => <PriorityRow t={t} next={i === 0 && !!hero} reason={i === 0 ? rec?.reason : null} />)}
        </div>
      ) : (
        <div class="quiet-empty">
          <span>{doneToday ? doneToday + ' done today. Nothing else is planned.' : 'Nothing planned for today yet.'}</span>
          <button class="btn outline xs" onClick={() => openQuickAdd()}><Icon name="plus" size={14} />Add a task</button>
        </div>
      )}
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
        <div class="stack">
        <Overview />
        <div class="two-col">
          <div class="stack">{Priorities}{Capture}</div>
          <div class="stack">{Attention}<TodaySchedule always /><UpcomingDeadlines /></div>
        </div>
        </div>
      ) : (
        <div class="stack">
          <Overview />
          {Priorities}
          {Attention}
          {Capture}
        </div>
      )}
    </div>
  );
}

function PriorityRow({ t, next, reason }) {
  const project = t.projectId && get('pmProjects', t.projectId);
  const focusing = M.focusTask()?.id === t.id;
  const sub = [project?.name, t.workTime || (t.workDate && t.workDate !== today() ? whenLabel(t.workDate) : ''), t.estimateMinutes ? fmtMinutes(t.estimateMinutes) : '', M.isOverdue(t) ? 'Overdue' : t.deadlineDate === today() ? 'Deadline today' : ''].filter(Boolean).join(' · ');
  const tag = next ? ({ overdue: 'Deadline passed', focus: 'Working now', in_progress: 'In progress' }[reason] || 'Up next') : '';
  return (
    <div class={'prow' + (next ? ' next' : '')}>
      <Check checked={false} onChange={() => { M.completeTask(t.id); toast('Task done', { action: { label: 'Undo', run: () => M.reopenTask(t.id) } }); }} label={'Complete ' + t.title} />
      <a class="prow-main" href={'#/tasks/' + t.id}>{tag && <span class={'prow-tag' + (reason === 'overdue' ? ' bad' : '')}>{tag}</span>}<span class="prow-title">{t.title}</span>{sub && <span class={'prow-sub' + (M.isOverdue(t) ? ' bad' : '')}>{sub}</span>}</a>
      {next && !focusing ? <button class="btn primary xs" onClick={() => M.startFocus(t.id)}><Icon name="play" size={12} />Start</button>
        : focusing ? <span class="prow-live"><span class="pulse" />Working</span> : <Icon name="chevronRight" size={16} class="muted" />}
    </div>
  );
}

// ---------- overview ----------
const PERIODS = [{ id: 'today', label: 'Today' }, { id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }];
const loadPeriod = () => { try { const v = localStorage.getItem('vz:pm:ovPeriod'); return PERIODS.some((p) => p.id === v) ? v : 'week'; } catch { return 'week'; } };
function periodDays(period) {
  const t0 = today();
  if (period === 'today') return [t0];
  if (period === 'month') { const first = t0.slice(0, 8) + '01'; return Array.from({ length: daysInMonth(t0) }, (_, i) => addDays(first, i)); }
  const ws = startOfWeek(t0, M.settings().weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}
// A smooth line through daily values, for the small chart on each tile.
function sparkPath(vals, w = 72, h = 30) {
  const n = vals.length;
  if (n < 2) vals = [vals[0] || 0, vals[0] || 0];
  const max = Math.max(1, ...vals), pad = 3;
  const pts = vals.map((v, i) => [pad + (i * (w - pad * 2)) / (vals.length - 1), h - pad - (v / max) * (h - pad * 2)]);
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
function Overview() {
  const [period, setPeriod] = useState(loadPeriod);
  const pick = (v) => { setPeriod(v); try { localStorage.setItem('vz:pm:ovPeriod', v); } catch {} };
  const t0 = today();
  const days = periodDays(period);
  const from = days[0], to = days[days.length - 1];
  const inP = (d) => d && d >= from && d <= to;
  const open = M.liveTasks().filter(M.isOpen);
  const projects = M.liveProjects().filter((p) => !p.archived && p.stage !== 'completed');
  // the chart always spans at least a week so a single day still reads as a trend
  const chartDays = days.length >= 7 ? days : Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));
  const projectBusy = (p, d) => p.deadlineDate === d || p.shootDate === d || p.followUpDate === d || open.some((t) => t.projectId === p.id && (t.workDate === d || t.deadlineDate === d));
  const tiles = [
    { label: 'Today', value: M.todayTasks().length, tone: 'lavender', href: '#/tasks?view=today', series: chartDays.map((d) => open.filter((t) => t.workDate === d || t.deadlineDate === d).length) },
    { label: 'Scheduled', value: open.filter((t) => inP(t.workDate) && t.workTime).length, tone: 'peach', href: '#/calendar', series: chartDays.map((d) => open.filter((t) => t.workDate === d && t.workTime).length) },
    { label: 'Projects', value: projects.filter((p) => days.some((d) => projectBusy(p, d))).length, tone: 'cyan', href: '#/projects', series: chartDays.map((d) => projects.filter((p) => projectBusy(p, d)).length), all: projects.length },
    { label: 'Open tasks', value: open.filter((t) => inP(t.workDate) || inP(t.deadlineDate) || M.isOverdue(t)).length, tone: 'sage', href: '#/tasks?view=all', series: chartDays.map((d) => open.filter((t) => t.workDate === d || t.deadlineDate === d).length) },
  ];
  const label = PERIODS.find((p) => p.id === period).label;
  return (
    <section class="block">
      <div class="block-head">
        <h2 class="block-title">Overview</h2>
        <button class="dropdown-pill sm" aria-haspopup="menu" onClick={(e) => openMenu(e, PERIODS.map((p) => ({ label: p.label, active: p.id === period, onSelect: () => pick(p.id) })), { title: 'Overview period' })}>{label}<Icon name="chevronDown" size={14} /></button>
      </div>
      <div class="ovw-grid">
        {tiles.map((x) => (
          <a class={'ovw-tile t-' + x.tone} href={x.href} aria-label={x.value + ' ' + x.label + (x.label === 'Today' ? '' : ', ' + label.toLowerCase())}>
            <div class="ovw-top"><span class="ovw-num tnum">{x.value}</span><svg class={'ovw-spark s-' + x.tone} viewBox="0 0 72 30" width="72" height="30" aria-hidden="true"><path d={sparkPath(x.series)} /></svg></div>
            <div class="ovw-foot"><span>{x.label}</span><Icon name="chevronRight" size={16} /></div>
          </a>
        ))}
      </div>
    </section>
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
function TodaySchedule({ always }) {
  const t0 = today();
  const items = M.sortTasks(M.liveTasks().filter((t) => M.isOpen(t) && t.workDate === t0 && t.workTime), 'schedule');
  if (!items.length && !always) return null;
  return (
    <section class="block">
      <div class="block-head"><h2 class="block-title">Today's agenda</h2><a class="link-quiet" href="#/calendar">Calendar<Icon name="chevronRight" size={15} /></a></div>
      {items.length ? <div class="mini-agenda">
        {items.map((t) => { const p = t.projectId && get('pmProjects', t.projectId); return <a class="mag-row" href={'#/tasks/' + t.id}><span class="tnum mag-time">{t.workTime}</span>{p && <span class={'cat-dot t-' + M.projectCategory(p).color} aria-hidden="true" />}<span class="grow ellipsis">{t.title}</span>{t.estimateMinutes ? <span class="muted tnum">{fmtMinutes(t.estimateMinutes)}</span> : null}</a>; })}
      </div> : <div class="quiet-note">Nothing has a time today. Give a task a work time and it lines up here.</div>}
    </section>
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
      <div class="block-head"><h2 class="block-title">Deadlines this week</h2></div>
      {items.length ? <div class="mini-agenda">
        {items.map((x) => <a class="mag-row" href={'#' + x.path}><span class={'tnum mag-time' + (x.date === t0 ? ' bad' : '')}>{x.date === t0 ? 'Today' : dateTimeShort(x.date)}</span><span class="grow" style={{ minWidth: 0 }}><span class="ellipsis" style={{ display: 'block' }}>{x.title}</span><span class="muted ellipsis" style={{ display: 'block', fontSize: 13 }}>{x.sub}{x.time ? ' · ' + x.time : ''}</span></span><Icon name="flag" size={15} class="muted" /></a>)}
      </div> : <div class="quiet-note">No hard deadlines in the next 7 days.</div>}
    </section>
  );
}
export { navigate };
