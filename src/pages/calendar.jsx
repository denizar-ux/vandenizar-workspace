// Day and week calendar. Blocks come from the work schedule; deadlines show as slim markers.
// Drag a block to move the work schedule (the deadline never moves), drag its bottom edge to change the estimate.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Segmented, Check, Empty } from '../ui/kit.jsx';
import { toast, useMedia, DESKTOP_Q, openOverlay, SheetHead, SheetBody } from '../ui/overlay.jsx';
import { PageHeader, AddBtn, dateTimeShort } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import { today, addDays, startOfWeek, fmtMonth, fmtWeekdayShort, dayNum, relDay, nowParts, fmtMinutes, fmtShort, fmtDay } from '../lib/date.js';
import * as M from '../lib/model.js';
import { openQuickAdd } from '../App.jsx';

const H = 56; // px per hour
const SNAP = 15;
export const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (min) => { const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(min))); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const loadView = () => { try { const v = localStorage.getItem('vz:pm:cal-view'); return v === 'day' || v === 'week' ? v : null; } catch { return null; } };
const saveView = (v) => { try { localStorage.setItem('vz:pm:cal-view', v); } catch {} };
const nowMinutes = () => { const n = nowParts(); return n.hour * 60 + n.minute; };
export const toneOfTask = (t) => { const p = t.projectId && get('pmProjects', t.projectId); if (!p) return 'plain'; const tone = M.stageOf(p.stage).tone; return tone === 'plain' ? 'lavender' : tone; };

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
  const [view, setView] = useState(() => (query.v === 'day' || query.v === 'week' ? query.v : null) || loadView() || 'day');
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
  return (
    <div class="page cal-page">
      <PageHeader title="Plan time." actions={<AddBtn label="Add task" onClick={() => openQuickAdd({ date: d })} />} />
      {soon && <a class="banner-soft t-lavender" href={'#' + soon.path}><Icon name="bell" size={18} /><span class="grow ellipsis">Deadline {relDay(soon.date).toLowerCase()}: {soon.title}</span><Icon name="chevronRight" size={16} /></a>}
      <Segmented class="full" options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }]} value={view} onChange={pick} />
      <div class="cal-nav">
        <div class="cal-month">{fmtMonth(d)}</div>
        <div class="row gap-6">
          {!week.includes(t0) && <button class="btn sm outline" onClick={() => go(t0)}>Today</button>}
          <button class="icon-btn soft sm" aria-label="Previous" onClick={() => go(addDays(d, view === 'week' ? -7 : -1))}><Icon name="chevronLeft" size={18} /></button>
          <button class="icon-btn soft sm" aria-label="Next" onClick={() => go(addDays(d, view === 'week' ? 7 : 1))}><Icon name="chevronRight" size={18} /></button>
        </div>
      </div>
      <div class="wstrip" role="tablist" aria-label="Days of this week">
        {week.map((x) => {
          const its = dayItems(x);
          const n = its.timed.filter((i) => !i.done).length + its.allDay.length;
          return (
            <button role="tab" aria-selected={x === d} class={'ws-day' + (x === d && view === 'day' ? ' on' : '') + (x === t0 ? ' today' : '')} onClick={() => { go(x); if (view === 'week' && !desktop) pick('day'); }}>
              <span class="ws-dow">{fmtWeekdayShort(x)}</span><b class="ws-num">{dayNum(x)}</b><i class={'ws-dot' + (n ? ' on' : '')} />
            </button>
          );
        })}
      </div>
      <Grid days={days} week={view === 'week'} onPickDay={(x) => { go(x); pick('day'); }} />
      <button class="drawer-btn" onClick={() => openUnscheduled(d)}><Icon name="more2" size={18} /><span class="grow">Unscheduled · {uns.length} task{uns.length === 1 ? '' : 's'}</span><Icon name="chevronRight" size={16} /></button>
      <div class="cal-hint">All times WIB. Tap an empty slot to add a task. {desktop ? 'Drag' : 'Hold and drag'} a block to move the work schedule, drag its bottom edge to change the estimate. Deadlines never move.</div>
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
  const firstTimed = Math.min(...data.flatMap((x) => x.timed.map((i) => i.start)), 8 * 60);
  const startH = Math.max(0, Math.min(8, Math.floor(firstTimed / 60)));
  const hours = Array.from({ length: 24 - startH }, (_, i) => startH + i);
  const top = (min) => ((min - startH * 60) / 60) * H;
  const nowMin = nowMinutes();
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const target = days.includes(t0) ? nowMin - 90 : 8 * 60;
    el.scrollTop = Math.max(0, top(target));
  }, [days.join(), startH]);
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
                {x.d === t0 && nowMin >= startH * 60 && <div class="cal-now" style={{ top: top(nowMin) + 'px' }} />}
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
