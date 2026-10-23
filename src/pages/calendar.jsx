// Day and week calendar. Blocks come from the work schedule; deadlines show as slim markers.
// Drag a block to move the work schedule (the deadline never moves), drag its bottom edge to change the estimate.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Segmented, Check, Empty } from '../ui/kit.jsx';
import { toast, useMedia, DESKTOP_Q, openOverlay, SheetHead, SheetBody } from '../ui/overlay.jsx';
import { PageHeader, AddBtn, dateTimeShort } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import { today, addDays, addMonths, startOfMonth, daysInMonth, startOfWeek, fmtMonth, fmtMonthShort, fmtWeekdayShort, dayNum, relDay, nowParts, fmtMinutes, fmtShort, fmtDay } from '../lib/date.js';
import * as M from '../lib/model.js';
import { openQuickAdd } from '../App.jsx';

const H = 56; // px per hour
const SNAP = 15;
export const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (min) => { const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(min))); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const VIEWS = ['day', 'week', 'month'];
const VIEW_OPTS = [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }];
const loadView = () => { try { const v = localStorage.getItem('vz:pm:cal-view'); return VIEWS.includes(v) ? v : null; } catch { return null; } };
const saveView = (v) => { try { localStorage.setItem('vz:pm:cal-view', v); } catch {} };
const nowMinutes = () => { const n = nowParts(); return n.hour * 60 + n.minute; };
export const toneOfTask = (t) => { const p = t.projectId && get('pmProjects', t.projectId); if (!p) return 'plain'; const c = M.projectCategory(p).color; return c === 'plain' ? 'lavender' : c; };

export function dayItems(d) {
  const timed = [], allDay = [];
  for (const t of M.liveTasks()) {
    const done = t.status === 'done';
    if (t.status === 'cancelled' || t.status === 'deferred') continue;
    if (t.workDate === d) {
      const s = toMin(t.workTime);
      if (s == null) { if (!done) allDay.push({ kind: 'task', id: t.id, title: t.title, t, tone: toneOfTask(t) }); }
      else timed.push({ kind: 'task', id: t.id, title: t.title, start: s, dur: Math.max(SNAP, +t.estimateMinutes || 30), tone: toneOfTask(t), done, t, sub: M.projectName(t.projectId) });
    }
    if (t.deadlineDate === d && !done) allDay.push({ kind: 'deadline', id: 'dl:' + t.id, title: 'Deadline: ' + t.title + (t.deadlineTime ? ' · ' + t.deadlineTime : ''), t, tone: 'deadline' });
  }
  for (const p of M.liveProjects()) {
    if (p.archived) continue;
    if (p.deadlineDate === d && M.stageIdx(p.stage) < M.stageIdx('delivered')) allDay.push({ kind: 'pdeadline', id: 'pd:' + p.id, title: 'Deadline: ' + p.name + (p.deadlineTime ? ' · ' + p.deadlineTime : ''), p, tone: 'deadline' });
    if (p.shootDate === d) allDay.push({ kind: 'shoot', id: 'sh:' + p.id, title: 'Shoot: ' + p.name, p, tone: 'sage' });
    if (p.followUpDate === d && p.stage === 'client_review') allDay.push({ kind: 'follow', id: 'fu:' + p.id, title: 'Follow up: ' + p.name, p, tone: 'lavender' });
  }
  return { timed: layout(timed), allDay };
}
function layout(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out = [];
  let cluster = [], end = -1;
  const flush = () => {
    const cols = [];
    for (const it of cluster) { let i = cols.findIndex((last) => last <= it.start); if (i < 0) { i = cols.length; cols.push(0); } cols[i] = it.start + it.dur; it.col = i; }
    for (const it of cluster) { it.cols = cols.length; out.push(it); }
    cluster = [];
  };
  for (const it of sorted) { if (cluster.length && it.start >= end) { flush(); end = -1; } cluster.push(it); end = Math.max(end, it.start + it.dur); }
  if (cluster.length) flush();
  return out;
}
function openItem(it) {
  if (it.t) navigate('/tasks/' + it.t.id);
  else if (it.p) navigate('/projects/' + it.p.id);
}

export function CalendarPage({ query }) {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const [view, setView] = useState(() => (VIEWS.includes(query.v) ? query.v : null) || loadView() || 'day');
  // a link like #/calendar?v=week should switch the view even when the page is already open
  useEffect(() => { if (VIEWS.includes(query.v)) { setView(query.v); saveView(query.v); } }, [query.v]);
  const t0 = today();
  const s = M.settings();
  const d = query.d && /^\d{4}-\d{2}-\d{2}$/.test(query.d) ? query.d : t0;
  const ws = startOfWeek(d, s.weekStart);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const days = view === 'week' ? week : [d];
  const go = (iso) => navigate('/calendar?d=' + iso, { replace: true });
  const pick = (v) => { setView(v); saveView(v); };
  const soon = M.nextDeadlineSoon(2);
  const uns = M.unscheduledTasks();
  const step = (dir) => go(view === 'month' ? addMonths(d, dir) : addDays(d, dir * (view === 'week' || !desktop ? 7 : 1)));
  const swipe = useSwipe((dir) => go(addDays(d, dir * 7)));
  const monthSwipe = useSwipe((dir) => go(addMonths(d, dir)));
  const inRange = view === 'month' ? d.slice(0, 7) === t0.slice(0, 7) : week.includes(t0);
  const strip = (
    <div class="wstrip" role="tablist" aria-label="Days of this week" {...(desktop ? {} : swipe)}>
      {week.map((x) => {
        const its = dayItems(x);
        const n = its.timed.filter((i) => !i.done).length + its.allDay.length;
        return (
          <button role="tab" aria-selected={x === d && view === 'day'} class={'ws-day' + (x === d && view === 'day' ? ' on' : '') + (x === t0 ? ' today' : '')} onClick={() => { go(x); if (view === 'week') pick('day'); }}>
            <span class="ws-dow">{fmtWeekdayShort(x)}</span><b class="ws-num">{dayNum(x)}</b><i class={'ws-dot' + (n ? ' on' : '')} />
          </button>
        );
      })}
    </div>
  );
  if (!desktop) {
    const dd = dayItems(d);
    const planned = dd.timed.filter((i) => !i.done);
    const mins = planned.reduce((a, i) => a + i.dur, 0);
    return (
      <div class="page cal-page is-m">
        <PageHeader title="Plan time." actions={<AddBtn label="Add task" onClick={() => openQuickAdd({ date: d })} />} />
        {soon && <a class="banner-soft t-lavender" href={'#' + soon.path}><Icon name="bell" size={18} /><span class="grow ellipsis">Deadline {relDay(soon.date).toLowerCase()}: {soon.title}</span><Icon name="chevronRight" size={16} /></a>}
        <div class="cal-bar">
          <div class="cal-bar-row">
            {view === 'month' ? (
              <div class="row gap-2 cal-month-nav">
                <button class="icon-btn xs" aria-label="Previous month" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
                <div class="cal-month">{fmtMonthShort(d) + ' ' + d.slice(0, 4)}</div>
                <button class="icon-btn xs" aria-label="Next month" onClick={() => step(1)}><Icon name="chevronRight" size={18} /></button>
              </div>
            ) : <div class="cal-month">{fmtMonth(d)}</div>}
            <Segmented class="compact" options={VIEW_OPTS} value={view} onChange={pick} />
          </div>
          {view !== 'month' && <div class="cal-strip-row">
            <button class="icon-btn xs" aria-label="Previous week" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
            {strip}
            <button class="icon-btn xs" aria-label="Next week" onClick={() => step(1)}><Icon name="chevronRight" size={18} /></button>
          </div>}
        </div>
        {view === 'month' && <div {...monthSwipe}><MonthGrid d={d} compact onPick={(x) => go(x)} /></div>}
        <div class="cal-sub">
          <span class="grow ellipsis">{view === 'month' ? monthSummary(d) : view === 'day' ? [relDay(d), planned.length ? planned.length + ' block' + (planned.length === 1 ? '' : 's') + ' · ' + fmtMinutes(mins) : 'Nothing timed'].join(' · ') : fmtShort(week[0]) + ' – ' + fmtShort(week[6])}</span>
          {(!inRange || (view === 'month' && d !== t0)) && <button class="chip-btn" onClick={() => go(t0)}>Today</button>}
          <button class={'chip-btn' + (uns.length ? ' on' : '')} onClick={() => openUnscheduled(d)}>Unscheduled <b class="tnum">{uns.length}</b></button>
        </div>
        {view === 'month' ? <Agenda days={[d]} onPickDay={() => pick('day')} /> : view === 'week' ? <Agenda days={week} onPickDay={(x) => { go(x); pick('day'); }} /> : <Grid days={days} week={false} onPickDay={(x) => go(x)} />}
        {view === 'day' && <div class="cal-hint">Tap an empty slot to add. Hold a block to move it, drag its bottom edge to change the estimate. Deadlines never move.</div>}
      </div>
    );
  }
  return (
    <div class="page cal-page">
      <PageHeader title="Plan time." actions={<AddBtn label="Add task" onClick={() => openQuickAdd({ date: d })} />} />
      {soon && <a class="banner-soft t-lavender" href={'#' + soon.path}><Icon name="bell" size={18} /><span class="grow ellipsis">Deadline {relDay(soon.date).toLowerCase()}: {soon.title}</span><Icon name="chevronRight" size={16} /></a>}
      <div class="cal-nav">
        <div class="cal-month">{fmtMonth(d)}</div>
        <div class="row gap-6">
          <Segmented class="compact" options={VIEW_OPTS} value={view} onChange={pick} />
          {!inRange && <button class="btn sm outline" onClick={() => go(t0)}>Today</button>}
          <button class="icon-btn soft sm" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
          <button class="icon-btn soft sm" aria-label="Next" onClick={() => step(1)}><Icon name="chevronRight" size={18} /></button>
        </div>
      </div>
      {view === 'day' && strip}
      {view === 'month' ? <MonthGrid d={d} onPick={(x) => { go(x); pick('day'); }} /> : <Grid days={days} week={view === 'week'} onPickDay={(x) => { go(x); pick('day'); }} />}
      <button class="drawer-btn" onClick={() => openUnscheduled(d)}><Icon name="more2" size={18} /><span class="grow">Unscheduled · {uns.length} task{uns.length === 1 ? '' : 's'}</span><Icon name="chevronRight" size={16} /></button>
      <div class="cal-hint">All times WIB. Click an empty slot to add a task. Drag a block to move the work schedule, drag its bottom edge to change the estimate. Deadlines never move.</div>
    </div>
  );
}

// Horizontal swipe on an element: dir -1 = previous, 1 = next.
function useSwipe(on) {
  const st = useRef(null);
  return {
    onTouchStart: (e) => { const t = e.touches[0]; st.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e) => { const a = st.current; st.current = null; if (!a) return; const t = e.changedTouches[0]; const dx = t.clientX - a.x, dy = t.clientY - a.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) on(dx < 0 ? 1 : -1); },
  };
}

function monthSummary(d) {
  let blocks = 0, dls = 0;
  for (let i = 0, n = daysInMonth(d), f = startOfMonth(d); i < n; i++) { const it = dayItems(addDays(f, i)); blocks += it.timed.filter((x) => !x.done).length; dls += it.allDay.filter((x) => x.tone === 'deadline').length; }
  return [blocks + ' block' + (blocks === 1 ? '' : 's'), dls + ' deadline' + (dls === 1 ? '' : 's')].join(' · ') + ' this month';
}
// Month grid. Phones show dots and pick a day for the list below; desktop shows the first few items per day.
function MonthGrid({ d, compact, onPick }) {
  const t0 = today();
  const ws = M.settings().weekStart;
  const first = startOfMonth(d);
  const start = startOfWeek(first, ws);
  const rows = Math.ceil((daysInMonth(d) + ((new Date(first + 'T00:00:00Z').getUTCDay() - ws + 7) % 7)) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => addDays(start, i));
  const mon = d.slice(0, 7);
  return (
    <div class={'month' + (compact ? ' compact' : '')}>
      <div class="month-head">{cells.slice(0, 7).map((x) => <span>{fmtWeekdayShort(x)}</span>)}</div>
      <div class="month-grid" style={{ '--rows': rows }}>
        {cells.map((x) => {
          const { timed, allDay } = dayItems(x);
          const items = [...allDay, ...timed.filter((i) => !i.done)];
          const cls = 'mcell' + (x.slice(0, 7) !== mon ? ' out' : '') + (x === t0 ? ' today' : '') + (compact && x === d ? ' on' : '') + (x < t0 ? ' past' : '');
          const label = fmtDay(x) + (items.length ? ', ' + items.length + ' item' + (items.length === 1 ? '' : 's') : '');
          if (compact) return (
            <button class={cls} onClick={() => onPick(x)} aria-label={label} aria-pressed={x === d}>
              <b class="mnum">{dayNum(x)}</b>
              <span class="mdots">{items.slice(0, 3).map((it) => <i class={it.tone === 'deadline' ? 'dl' : 't-' + it.tone} />)}</span>
            </button>
          );
          const cap = 3;
          return (
            <div class={cls} onClick={(e) => { if (!e.target.closest('.mchip')) onPick(x); }} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => { if (e.key === 'Enter') onPick(x); }}>
              <b class="mnum">{dayNum(x)}</b>
              <div class="mitems">
                {items.slice(0, items.length > cap ? cap - 1 : cap).map((it) => (
                  <button class={'mchip ' + (it.tone === 'deadline' ? 'dl' : 't-' + it.tone)} onClick={() => openItem(it)} title={it.title}>
                    {it.start != null && <span class="tnum mtime">{toHHMM(it.start)}</span>}<span class="ellipsis">{it.tone === 'deadline' ? it.title.replace(/^Deadline: /, '') : it.title}</span>
                  </button>
                ))}
                {items.length > cap && <span class="mmore">+{items.length - cap + 1} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Phone week view: a list grouped by day instead of seven cramped columns.
function Agenda({ days, onPickDay }) {
  const t0 = today();
  return (
    <div class="agenda">
      {days.map((d) => {
        const { timed, allDay } = dayItems(d);
        const mins = timed.filter((i) => !i.done).reduce((a, i) => a + i.dur, 0);
        const empty = !timed.length && !allDay.length;
        return (
          <section class={'ag-day' + (d === t0 ? ' today' : '') + (d < t0 ? ' past' : '')}>
            <button class="ag-date" onClick={() => onPickDay(d)} aria-label={'Open ' + fmtDay(d)}>
              <span class="ag-dow">{fmtWeekdayShort(d)}</span><b class="ag-num">{dayNum(d)}</b>
            </button>
            <div class="ag-items">
              {(d === t0 || mins > 0) && <div class="ag-meta">{[d === t0 ? 'Today' : '', mins ? fmtMinutes(mins) + ' planned' : ''].filter(Boolean).join(' · ')}</div>}
              {allDay.map((it) => <button class={'cal-chip t-' + it.tone} onClick={() => openItem(it)}>{it.tone === 'deadline' && <Icon name="flag" size={11} />}<span class="ellipsis">{it.title}</span></button>)}
              {timed.map((it) => (
                <button class={'ag-item' + (it.done ? ' done' : '')} onClick={() => openItem(it)}>
                  <span class="ag-time tnum">{toHHMM(it.start)}<small>{fmtMinutes(it.dur)}</small></span>
                  <span class={'ag-bar t-' + it.tone} />
                  <span class="ag-main"><span class="ag-title">{it.title}</span>{it.sub && <span class="ag-sub">{it.sub}</span>}</span>
                </button>
              ))}
              {empty && (d < t0 ? <div class="ag-empty past">Nothing planned</div> : <button class="ag-empty" onClick={() => openQuickAdd({ date: d })}><span>Nothing planned</span><span class="ag-add"><Icon name="plus" size={14} />Add</span></button>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function openUnscheduled(d) { openOverlay((close) => <Unscheduled d={d} close={close} />, { kind: 'sheet' }); }
function Unscheduled({ d, close }) {
  useStore();
  const list = M.unscheduledTasks();
  return (
    <>
      <SheetHead title="Unscheduled" sub={'Open tasks without a work schedule. Plan one for ' + relDay(d).toLowerCase() + '.'} onClose={close} />
      <SheetBody>
        {list.length ? <div class="list">{list.map((t) => (
          <div class="list-row">
            <div class="row-main"><a class="row-title" href={'#/tasks/' + t.id} onClick={close}>{t.title}</a><div class="row-meta">{[M.projectName(t.projectId), t.deadlineDate ? 'Deadline ' + dateTimeShort(t.deadlineDate, t.deadlineTime) : '', t.estimateMinutes ? fmtMinutes(t.estimateMinutes) : ''].filter(Boolean).join(' · ') || 'Inbox'}</div></div>
            <button class="btn xs outline" onClick={() => { M.rescheduleWork(t.id, d, null); toast('Scheduled ' + relDay(d).toLowerCase()); }}>{fmtShort(d)}</button>
          </div>
        ))}</div> : <Empty icon="check" title="Everything has a time">Open tasks all have a work schedule.</Empty>}
      </SheetBody>
    </>
  );
}

function Grid({ days, week, onPickDay }) {
  const scroller = useRef();
  const cols = useRef();
  const [drag, setDrag] = useState(null);
  const data = days.map((d) => ({ d, ...dayItems(d) }));
  const t0 = today();
  // One scroll for the whole page: show the working day (07-21) and widen it only when something falls outside.
  const nowMin = nowMinutes();
  const timedAll = data.flatMap((x) => x.timed);
  const firstTimed = Math.min(...timedAll.map((i) => i.start), 7 * 60);
  const lastTimed = Math.max(...timedAll.map((i) => i.start + i.dur), 21 * 60, days.includes(t0) ? nowMin + 30 : 0);
  const startH = Math.max(0, Math.floor(firstTimed / 60));
  const endH = Math.min(24, Math.ceil(lastTimed / 60));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const top = (min) => ((min - startH * 60) / 60) * H;
  const onGridClick = (e, d) => {
    if (e.target.closest('.cal-block')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = startH * 60 + Math.floor(((e.clientY - rect.top) / H) * 2) * 30;
    openQuickAdd({ date: d, time: toHHMM(min) });
  };
  const startDrag = (e, it, d, mode) => {
    if (it.kind !== 'task' || e.button > 0) return;
    e.stopPropagation();
    const touch = e.pointerType === 'touch';
    const sx = e.clientX, sy = e.clientY;
    const colW = cols.current ? cols.current.getBoundingClientRect().width / days.length : 1;
    let active = false, timer = null, moved = false, cur = null;
    const begin = () => { active = true; try { navigator.vibrate && navigator.vibrate(10); } catch {} cur = { id: it.id, start: it.start, dur: it.dur, day: d, mode }; setDrag(cur); };
    if (touch) timer = setTimeout(begin, 320);
    const blockScroll = (ev) => { if (active) ev.preventDefault(); };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!active) { if (Math.abs(dx) + Math.abs(dy) > 8) { if (touch) { clearTimeout(timer); cleanup(); return; } begin(); } else return; }
      moved = true;
      const dMin = Math.round(((dy / H) * 60) / SNAP) * SNAP;
      if (mode === 'resize') cur = { ...cur, dur: Math.max(SNAP, it.dur + dMin) };
      else {
        const di = week ? Math.round(dx / colW) : 0;
        const idx = Math.max(0, Math.min(days.length - 1, days.indexOf(d) + di));
        cur = { ...cur, start: Math.max(0, Math.min(24 * 60 - SNAP, it.start + dMin)), day: days[idx] };
      }
      setDrag(cur);
    };
    const up = () => {
      clearTimeout(timer); cleanup();
      if (active && moved && cur) {
        if (mode === 'resize') { M.patchTask(it.id, { estimateMinutes: cur.dur }); toast('Estimate ' + fmtMinutes(cur.dur)); }
        else { M.rescheduleWork(it.id, cur.day, toHHMM(cur.start)); toast('Work moved to ' + toHHMM(cur.start) + (cur.day !== d ? ' · ' + fmtDay(cur.day) : '') + '. Deadline unchanged.'); }
      } else if (!active || !moved) openItem(it);
      setDrag(null);
    };
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); document.removeEventListener('touchmove', blockScroll); };
    const cancel = () => { clearTimeout(timer); cleanup(); setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  const hasAllDay = data.some((x) => x.allDay.length);
  const cap = week ? 2 : 6;
  return (
    <div class={'cal-card ' + (week ? 'is-week' : 'is-day')}>
      {week && (
        <div class="cal-days" style={{ '--n': days.length }}>
          <div class="cal-tz">WIB</div>
          {days.map((d) => <button class={'cal-dayhead ' + (d === t0 ? 'today' : '')} onClick={() => onPickDay(d)}><span>{fmtWeekdayShort(d)}</span><b>{dayNum(d)}</b></button>)}
        </div>
      )}
      {!week && <div class="cal-tz solo">WIB</div>}
      {hasAllDay && (
        <div class="cal-allday" style={{ '--n': days.length }}>
          <div class="cal-gutter-label">All day</div>
          {data.map((x) => (
            <div class="cal-allday-col">
              {x.allDay.slice(0, cap).map((it) => <button class={'cal-chip t-' + it.tone} onClick={() => openItem(it)}>{it.tone === 'deadline' && <Icon name="flag" size={11} />}<span class="ellipsis">{it.title}</span></button>)}
              {x.allDay.length > cap && <button class="cal-more" onClick={() => onPickDay(x.d)}>+{x.allDay.length - cap} more</button>}
            </div>
          ))}
        </div>
      )}
      <div class="cal-scroll" ref={scroller}>
        <div class="cal-body" style={{ '--n': days.length, height: hours.length * H + 'px' }}>
          <div class="cal-hours">{hours.map((h) => <div class="cal-hour" style={{ height: H + 'px' }}><span>{String(h).padStart(2, '0')}.00</span></div>)}</div>
          <div class="cal-cols" ref={cols}>
            {data.map((x) => (
              <div class="cal-col" onClick={(e) => onGridClick(e, x.d)}>
                {hours.map(() => <div class="cal-line" style={{ height: H + 'px' }} />)}
                 {x.d === t0 && nowMin >= startH * 60 && nowMin <= endH * 60 && <div class="cal-now" style={{ top: top(nowMin) + 'px' }} />}
                {x.timed.map((it) => {
                  const g = drag && drag.id === it.id ? drag : null;
                  if (g && g.day !== x.d) return null;
                  const st = g ? g.start : it.start, du = g ? g.dur : it.dur;
                  const w = 100 / (g ? 1 : it.cols), l = g ? 0 : it.col * w;
                  return (
                    <div class={`cal-block t-${it.tone} ${it.done ? 'done' : ''} ${g ? 'dragging' : ''} ${du < 45 ? 'short' : ''}`} style={{ top: top(st) + 'px', height: Math.max(22, (du / 60) * H - 3) + 'px', left: `calc(${l}% + 2px)`, width: `calc(${w}% - 4px)` }}
                      onPointerDown={(e) => startDrag(e, it, x.d, 'move')} onClick={(e) => e.stopPropagation()}>
                      <div class="cal-block-time tnum">{toHHMM(st)} – {toHHMM(st + du)}</div>
                      <div class="cal-block-title">{it.title}</div>
                      {du >= 55 && it.sub && <div class="cal-block-sub">{it.sub}</div>}
                      {!it.done && <div class="cal-resize" onPointerDown={(e) => startDrag(e, it, x.d, 'resize')} />}
                    </div>
                  );
                })}
                {drag && drag.day === x.d && !x.timed.some((i) => i.id === drag.id) && (() => {
                  const src = data.flatMap((y) => y.timed).find((i) => i.id === drag.id);
                  return src ? <div class={`cal-block t-${src.tone} dragging`} style={{ top: top(drag.start) + 'px', height: Math.max(22, (drag.dur / 60) * H - 3) + 'px', left: '2px', width: 'calc(100% - 4px)' }}><div class="cal-block-time">{toHHMM(drag.start)}</div><div class="cal-block-title">{src.title}</div></div> : null;
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export { Check };
