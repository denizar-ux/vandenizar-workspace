// Daily calendar: everything with a time on one grid. Tasks can be dragged to move and stretched to change duration.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Segmented } from '../ui/kit.jsx';
import { toast, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { SubNav, DAILY_NAV, openTaskSheet, catTone } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { all, patch, useStore } from '../lib/db.js';
import { today, addDays, startOfWeek, fmtDay, fmtShort, fmtWeekdayShort, dayNum, relDay, nowParts } from '../lib/date.js';
import * as M from '../lib/model.js';

const H = 56; // px per hour
const SNAP = 15;
const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => { const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(min))); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const loadView = () => { try { return localStorage.getItem('vz:cal-view'); } catch { return null; } };

// Everything on a given day, split into timed blocks and all-day items
function dayItems(d) {
  const timed = [], allDay = [];
  for (const t of M.liveTasks()) {
    if (t.dueDate !== d || t.status === 'cancelled') continue;
    const s = toMin(t.dueTime);
    const done = t.status === 'done' || M.taskDoneOn(t, d);
    if (s == null) { if (!done) allDay.push({ kind: 'task', id: t.id, title: t.title, tone: catTone(t.category), t }); continue; }
    timed.push({ kind: 'task', id: t.id, title: t.title, start: s, dur: Math.max(SNAP, +t.estimate || 30), tone: catTone(t.category), done, t, sub: t.category });
  }
  for (const c of M.liveContents()) {
    for (const st of M.STAGES) {
      const v = c.schedule?.[st.id];
      if (!v?.date || v.date !== d) continue;
      const done = M.stageIsDone(c, st.id);
      const s = toMin(v.time);
      const item = { kind: 'content', id: c.id + ':' + st.id, title: `${st.verb}: ${c.title}`, tone: 't-violet', done, c, sub: 'Content' };
      if (s == null) { if (!done) allDay.push(item); } else timed.push({ ...item, start: s, dur: 60 });
    }
  }
  for (const th of M.liveThreads()) {
    if (th.date !== d) continue;
    const s = toMin(th.time);
    if (s == null) continue;
    timed.push({ kind: 'threads', id: th.id, title: th.text || 'Threads post', start: s, dur: 20, tone: 't-blue', done: th.status === 'posted', sub: 'Threads', th });
  }
  for (const f of M.freelanceAgenda(d, d)) {
    const name = f.project ? f.project.name : f.invoice?.number;
    allDay.push({ kind: 'freelance', id: f.kind + ':' + (f.project?.id || f.invoice?.id), title: `${f.label}: ${name}`, tone: 't-pink', f });
  }
  return { timed: layout(timed), allDay };
}

// Side-by-side columns for overlapping blocks
function layout(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out = [];
  let cluster = [], end = -1;
  const flush = () => {
    const cols = [];
    for (const it of cluster) {
      let i = cols.findIndex((last) => last <= it.start);
      if (i < 0) { i = cols.length; cols.push(0); }
      cols[i] = it.start + it.dur; it.col = i;
    }
    for (const it of cluster) { it.cols = cols.length; out.push(it); }
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= end) { flush(); end = -1; }
    cluster.push(it); end = Math.max(end, it.start + it.dur);
  }
  if (cluster.length) flush();
  return out;
}

function openItem(it) {
  if (it.kind === 'task') openTaskSheet(it.t.id);
  else if (it.kind === 'content') navigate('/content/item/' + it.c.id);
  else if (it.kind === 'threads') navigate('/content/threads?d=' + it.th.date);
  else if (it.f?.project) navigate('/freelance/projects/' + it.f.project.id);
  else if (it.f?.invoice) navigate('/freelance/invoices/' + it.f.invoice.id);
}

export function CalendarPage({ query }) {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const [view, setView] = useState(() => loadView() || (desktop ? 'week' : 'day'));
  const t0 = today();
  const d = query.d && /^\d{4}-\d{2}-\d{2}$/.test(query.d) ? query.d : t0;
  const s = M.settings();
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(d, s.weekStart), i)) : [d];
  const go = (iso) => navigate('/calendar?d=' + iso, { replace: true });
  const step = view === 'week' ? 7 : 1;
  const pickView = (v) => { setView(v); try { localStorage.setItem('vz:cal-view', v); } catch {} };
  const label = view === 'week' ? `${fmtShort(days[0])} – ${fmtShort(days[6])}` : `${relDay(d) !== fmtDay(d) ? relDay(d) + ' · ' : ''}${fmtDay(d)}`;
  return (
    <div class="page cal-page">
      <SubNav items={DAILY_NAV} active="calendar" />
      <div class="cal-head">
        <h1 class="ph-title">Calendar</h1>
        <Segmented value={view} onChange={pickView} options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }]} />
      </div>
      <div class="cal-nav">
        <button class="icon-btn sm" aria-label="Previous" onClick={() => go(addDays(d, -step))}><Icon name="chevronLeft" size={18} /></button>
        <div class="cal-label">{label}</div>
        <button class="icon-btn sm" aria-label="Next" onClick={() => go(addDays(d, step))}><Icon name="chevronRight" size={18} /></button>
        {!days.includes(t0) && <button class="btn sm soft" onClick={() => go(t0)}>Today</button>}
      </div>
      <Grid days={days} week={view === 'week'} onPickDay={(iso) => { pickView('day'); go(iso); }} />
      <div class="cal-hint">Tap an empty slot to add a task. Drag a task to move it{desktop ? '' : ' (hold first)'}, drag its bottom edge to change how long it takes.</div>
    </div>
  );
}

function Grid({ days, week, onPickDay }) {
  const scroller = useRef();
  const cols = useRef();
  const [drag, setDrag] = useState(null); // { id, start, dur, day, mode }
  const data = days.map((d) => ({ d, ...dayItems(d) }));
  const t0 = today();
  const firstTimed = Math.min(...data.flatMap((x) => x.timed.map((i) => i.start)), 6 * 60);
  const startH = Math.max(0, Math.min(6, Math.floor(firstTimed / 60)));
  const hours = Array.from({ length: 24 - startH }, (_, i) => startH + i);
  const top = (min) => ((min - startH * 60) / 60) * H;
  const now = nowParts();
  const nowMin = now.hour * 60 + now.minute;

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const target = days.includes(t0) ? nowMin - 90 : 8 * 60;
    el.scrollTop = Math.max(0, top(target));
  }, [days.join(), startH]);

  // tap on empty space: new task at that time
  const onGridClick = (e, d) => {
    if (e.target.closest('.cal-block')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = startH * 60 + Math.floor(((e.clientY - rect.top) / H) * 2) * 30;
    openTaskSheet(null, { dueDate: d, dueTime: toHHMM(min) });
  };

  // drag a task block (move) or its handle (resize)
  const startDrag = (e, it, d, mode) => {
    if (it.kind !== 'task' || e.button > 0) return;
    e.stopPropagation();
    const touch = e.pointerType === 'touch';
    const sx = e.clientX, sy = e.clientY;
    const colW = cols.current ? cols.current.getBoundingClientRect().width / days.length : 1;
    let active = false, timer = null, moved = false, cur = null;
    const begin = () => { active = true; if (navigator.vibrate) try { navigator.vibrate(10); } catch {} cur = { id: it.id, start: it.start, dur: it.dur, day: d, mode }; setDrag(cur); };
    if (touch) timer = setTimeout(begin, 320);
    const blockScroll = (ev) => { if (active) ev.preventDefault(); };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!active) {
        if (Math.abs(dx) + Math.abs(dy) > 8) { if (touch) { clearTimeout(timer); cleanup(); return; } begin(); } else return;
      }
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
      clearTimeout(timer);
      cleanup();
      if (active && moved && cur) {
        if (mode === 'resize') { patch('tasks', it.id, { estimate: cur.dur }); toast(`Duration ${cur.dur} min`); }
        else { patch('tasks', it.id, { dueDate: cur.day, dueTime: toHHMM(cur.start) }); toast(`Moved to ${toHHMM(cur.start)}${cur.day !== d ? ' · ' + fmtDay(cur.day) : ''}`); }
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
  return (
    <div class={'card cal-card ' + (week ? 'is-week' : 'is-day')}>
      {week && (
        <div class="cal-days" style={{ '--n': days.length }}>
          <div />
          {days.map((d) => <button class={'cal-dayhead ' + (d === t0 ? 'today' : '')} onClick={() => onPickDay(d)}><span>{fmtWeekdayShort(d)}</span><b>{dayNum(d)}</b></button>)}
        </div>
      )}
      {hasAllDay && (
        <div class="cal-allday" style={{ '--n': days.length }}>
          <div class="cal-gutter-label">All day</div>
          {data.map((x) => (
            <div class="cal-allday-col">
              {x.allDay.slice(0, week ? 3 : 8).map((it) => <button class={'cal-chip ' + it.tone} onClick={() => openItem(it)}>{it.title}</button>)}
              {x.allDay.length > (week ? 3 : 8) && <button class="cal-more" onClick={() => onPickDay(x.d)}>+{x.allDay.length - 3} more</button>}
            </div>
          ))}
        </div>
      )}
      <div class="cal-scroll" ref={scroller}>
        <div class="cal-body" style={{ '--n': days.length, height: hours.length * H + 'px' }}>
          <div class="cal-hours">{hours.map((h) => <div class="cal-hour" style={{ height: H + 'px' }}><span>{String(h).padStart(2, '0')}:00</span></div>)}</div>
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
                    <div class={`cal-block ${it.tone} ${it.done ? 'done' : ''} ${g ? 'dragging' : ''} ${it.kind} ${du < 45 ? 'short' : ''}`} style={{ top: top(st) + 'px', height: Math.max(22, (du / 60) * H - 2) + 'px', left: `calc(${l}% + 2px)`, width: `calc(${w}% - 4px)` }}
                      onPointerDown={(e) => (it.kind === 'task' ? startDrag(e, it, x.d, 'move') : null)} onClick={(e) => { e.stopPropagation(); if (it.kind !== 'task') openItem(it); }}>
                      <div class="cal-block-title">{it.title}</div>
                      {du >= 40 && <div class="cal-block-time">{toHHMM(st)}–{toHHMM(st + du)}{it.sub ? ' · ' + it.sub : ''}</div>}
                      {it.kind === 'task' && !it.done && <div class="cal-resize" onPointerDown={(e) => startDrag(e, it, x.d, 'resize')} />}
                    </div>
                  );
                })}
                {drag && drag.day === x.d && !x.timed.some((i) => i.id === drag.id) && (() => {
                  const src = data.flatMap((y) => y.timed).find((i) => i.id === drag.id);
                  return src ? <div class={`cal-block ${src.tone} dragging`} style={{ top: top(drag.start) + 'px', height: Math.max(22, (drag.dur / 60) * H - 2) + 'px', left: '2px', width: 'calc(100% - 4px)' }}><div class="cal-block-title">{src.title}</div><div class="cal-block-time">{toHHMM(drag.start)}</div></div> : null;
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
