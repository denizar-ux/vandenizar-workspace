import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, Chips, Segmented, Empty } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { PageHeader, SubNav, DAILY_NAV } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, patch, remove, useStore } from '../lib/db.js';
import { today, addDays, startOfWeek, fmtShort, fmtDay, fmtWeekdayShort, dayNum, weekday } from '../lib/date.js';
import * as M from '../lib/model.js';

const STARTERS = [
  { title: 'Workout', emoji: '🏋️', freq: 'weekly', target: 3 },
  { title: 'Read 20 minutes', emoji: '📖', freq: 'daily' },
  { title: 'Drink 2L water', emoji: '💧', freq: 'daily' },
  { title: 'Sleep before 12', emoji: '🌙', freq: 'daily' },
  { title: 'Shoot B-roll', emoji: '🎥', freq: 'weekly', target: 2 },
];

const freqLabel = (h) => (h.freq === 'weekly' ? `${M.habitTarget(h)}× a week` : 'Every day');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function HabitMark({ h }) {
  return h.emoji ? <span class="hb-emoji" aria-hidden="true">{h.emoji}</span> : null;
}

// =====================================================================
// PAGE
// =====================================================================
export function HabitsPage({ query = {} }) {
  useStore();
  const t0 = today();
  const s = M.settings();
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => { if (location.hash.includes('new=1')) { navigate('/habits', { replace: true }); setTimeout(() => openHabitSheet(), 30); } }, []);
  const cur = t0.slice(0, 7);
  const view = query.view === 'month' ? 'month' : 'week';
  const ym = /^\d{4}-\d{2}$/.test(query.m || '') && query.m <= cur ? query.m : cur;
  const setView = (v) => navigate(v === 'month' ? '/habits?view=month' + (ym !== cur ? '&m=' + ym : '') : '/habits', { replace: true });
  const habits = M.liveHabits();
  const archived = M.allHabits().filter((h) => h.archived);
  const daily = habits.filter((h) => h.freq !== 'weekly');
  const weekly = habits.filter((h) => h.freq === 'weekly');
  const ws = startOfWeek(t0, s.weekStart);
  const doneToday = habits.filter((h) => M.habitDone(h, t0)).length;
  const any = habits.length + archived.length > 0;
  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="habits" />
      <PageHeader title="Habits" actions={<button class="btn primary" onClick={() => openHabitSheet()}><Icon name="plus" size={18} />New habit</button>}>
        <div class="muted" style={{ marginTop: 6 }}>{view === 'month' ? 'Monthly recap. It also goes into the monthly PDF in Review.' : <>Week of {fmtShort(ws)} – {fmtShort(addDays(ws, 6))}{habits.length ? ` · ${doneToday} of ${habits.length} checked today` : ''}</>}</div>
      </PageHeader>
      {any && <Segmented options={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} value={view} onChange={setView} />}

      {!habits.length && view === 'week' && (
        <div class="card">
          <Empty icon="habit" title="No habits yet" action={<button class="btn primary sm" onClick={() => openHabitSheet()}><Icon name="plus" size={15} />New habit</button>}>
            Daily habits are checked every day. Weekly habits have a target, like gym 3× a week. Tap one below to start fast.
          </Empty>
          <div class="hb-starters">
            {STARTERS.map((st) => (
              <button class="chip" onClick={() => { M.newHabit(st); toast(`Added ${st.title}`); }}>{st.emoji} {st.title}<span class="muted"> · {st.freq === 'weekly' ? `${st.target}×/wk` : 'daily'}</span></button>
            ))}
          </div>
        </div>
      )}

      {view === 'month' ? <HabitsMonth ym={ym} cur={cur} /> : (
        <>
          {daily.length > 0 && <div class="section"><div class="section-head"><div class="section-title">Daily</div></div>{daily.map((h) => <HabitCard h={h} />)}</div>}
          {weekly.length > 0 && <div class="section"><div class="section-head"><div class="section-title">Weekly</div></div>{weekly.map((h) => <HabitCard h={h} />)}</div>}
          {archived.length > 0 && (
            <div class="section">
              <button class="section-link" style={{ fontWeight: 700 }} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : `Archived (${archived.length})`}</button>
              {showArchived && archived.map((h) => <HabitCard h={h} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// MONTH RECAP
// =====================================================================
const monthTitle = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

export function habitMonthSummary(ym) {
  const list = M.habitsForMonth(ym).map((h) => ({ h, r: M.habitMonth(h, ym) })).filter((x) => x.r.counted > 0 || x.r.done > 0);
  const pct = list.length ? Math.round(list.reduce((n, x) => n + x.r.pct, 0) / list.length) : 0;
  return { list, pct, checkins: list.reduce((n, x) => n + x.r.done, 0), best: list.filter((x) => !x.r.weekly).reduce((n, x) => Math.max(n, x.r.best), 0) };
}

function HabitsMonth({ ym, cur }) {
  const go = (v) => navigate('/habits?view=month' + (v !== cur ? '&m=' + v : ''), { replace: true });
  const sum = habitMonthSummary(ym);
  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label="Previous month" onClick={() => go(shiftMonth(ym, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}>
          <div class="card-title" style={{ justifyContent: 'center' }}>{monthTitle(ym)}</div>
          <div class="muted" style={{ fontSize: 13 }}>{ym === cur ? 'This month, so far' : ym === shiftMonth(cur, -1) ? 'Last month' : ''}</div>
        </div>
        <button class="icon-btn" aria-label="Next month" disabled={ym >= cur} onClick={() => go(shiftMonth(ym, 1))}><Icon name="chevronRight" /></button>
      </div>
      {sum.list.length ? (
        <>
          <div class="stats hb-stats">
            <div class="stat"><div class="stat-label">Consistency</div><div class="stat-value">{sum.pct}%</div></div>
            <div class="stat"><div class="stat-label">Check-ins</div><div class="stat-value">{sum.checkins}</div></div>
            <div class="stat"><div class="stat-label">Longest run</div><div class="stat-value">{sum.best}<span class="stat-unit"> {sum.best === 1 ? 'day' : 'days'}</span></div></div>
          </div>
          <div class="hb-month-list">{sum.list.map(({ h, r }) => <HabitMonthCard h={h} r={r} />)}</div>
        </>
      ) : <div class="card"><Empty icon="habit" title={`No habits in ${monthTitle(ym)}`}>Habits you track show up here with a calendar for the month.</Empty></div>}
    </>
  );
}

function HabitMonthCard({ h, r }) {
  const t0 = today();
  const [open, setOpen] = useState(true);
  const lead = (weekday(r.days[0]) - M.settings().weekStart + 7) % 7;
  const dows = Array.from({ length: 7 }, (_, i) => fmtWeekdayShort(addDays(startOfWeek(t0, M.settings().weekStart), i)).slice(0, 2));
  const summary = r.weekly
    ? `${r.met} of ${r.weeks.length} week${r.weeks.length === 1 ? '' : 's'} hit ${r.target}×`
    : `${r.done} of ${r.counted} day${r.counted === 1 ? '' : 's'}`;
  return (
    <div class={'card hb-mcard' + (h.archived ? ' archived' : '')}>
      <button class="hb-mhead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <div class="grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <div class="hb-title"><HabitMark h={h} />{h.title}</div>
          <div class="hb-meta">
            <span>{summary}</span>
            {r.weekly && <span>{plural(r.done, 'check-in')}</span>}
            {!r.weekly && r.best > 1 && <span class="hb-streak"><Icon name="flame" size={13} />best {r.best} days</span>}
            {h.archived && <span>Archived</span>}
          </div>
        </div>
        <span class={'hb-pct' + (r.pct >= 80 ? ' good' : '')}>{r.pct}%</span>
        <Icon name="chevronDown" size={18} class={'hb-chev' + (open ? ' open' : '')} />
      </button>
      {open && (
        <div class="hb-cal" role="group" aria-label={h.title + ', ' + monthTitle(r.ym)}>
          {dows.map((d) => <span class="hb-cal-dow">{d}</span>)}
          {Array.from({ length: lead }, () => <span />)}
          {r.days.map((d) => {
            const on = r.set.has(d), future = d > t0, before = d < r.from;
            return (
              <button class={'hb-cell' + (on ? ' on' : '') + (d === t0 ? ' today' : '') + (future || before ? ' off' : '')} disabled={future || h.archived} aria-pressed={on} aria-label={fmtDay(d) + (on ? ', done' : '')} onClick={() => M.toggleHabit(h.id, d)}>{dayNum(d)}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function habitMenu(e, h) {
  openMenu(e, [
    { label: 'Edit', icon: 'edit', onSelect: () => openHabitSheet(h.id) },
    h.archived
      ? { label: 'Restore', icon: 'restore', onSelect: () => { patch('habits', h.id, { archived: false }); toast('Habit restored'); } }
      : { label: 'Archive', icon: 'archive', onSelect: () => { patch('habits', h.id, { archived: true }); toast('Habit archived. History is kept.'); } },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete this habit?', body: 'Its check history goes too. Archive keeps the history.', confirmLabel: 'Delete', danger: true })) { remove('habits', h.id); toast('Habit deleted'); } } },
  ], { title: h.title });
}

function HabitCard({ h }) {
  const t0 = today();
  const s = M.settings();
  const ws = startOfWeek(t0, s.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const done = M.habitDone(h, t0);
  const streak = M.habitStreak(h, t0);
  const weekly = h.freq === 'weekly';
  const count = M.habitWeekCount(h, t0), target = M.habitTarget(h);
  const met = weekly && count >= target;
  return (
    <div class={'card habit-card' + (h.archived ? ' archived' : '')}>
      <div class="hb-head">
        <button class={'hb-today' + (done ? ' on' : '')} aria-pressed={done} aria-label={(done ? 'Uncheck ' : 'Check ') + h.title + ' for today'} disabled={h.archived} onClick={() => M.toggleHabit(h.id, t0)}>
          <Icon name="check" size={20} stroke={2.6} />
        </button>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="hb-title"><HabitMark h={h} />{h.title}</div>
          <div class="hb-meta">
            <span>{freqLabel(h)}</span>
            {weekly && <span class={met ? 'ok' : ''}>{count}/{target} this week</span>}
            {streak > 0 && <span class="hb-streak"><Icon name="flame" size={13} />{weekly ? plural(streak, 'week') : plural(streak, 'day')}</span>}
            <span>{M.habitRate(h, t0)}% last 30 days</span>
          </div>
        </div>
        <button class="icon-btn ghost sm" aria-label="Habit actions" onClick={(e) => habitMenu(e, h)}><Icon name="more" /></button>
      </div>
      <div class="hb-week" role="group" aria-label={'This week for ' + h.title}>
        {days.map((d) => {
          const on = M.habitDone(h, d), future = d > t0;
          return (
            <button class={'hb-day' + (on ? ' on' : '') + (d === t0 ? ' today' : '') + (future ? ' future' : '')} disabled={future || h.archived} aria-pressed={on} aria-label={fmtDay(d) + (on ? ', done' : '')} onClick={() => M.toggleHabit(h.id, d)}>
              <span class="hb-dow">{fmtWeekdayShort(d).slice(0, 2)}</span>
              <span class="hb-dot">{on ? <Icon name="check" size={13} stroke={2.8} /> : dayNum(d)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// TODAY CARD
// =====================================================================
export function HabitsTodayCard() {
  useStore();
  const t0 = today();
  const habits = M.liveHabits();
  if (!habits.length) {
    return (
      <div class="card">
        <div class="card-head"><div class="card-title">Habits</div><a class="btn sm soft" href="#/habits?new=1"><Icon name="plus" size={16} />Habit</a></div>
        <div class="today-empty">
          <span class="mini-ic t-accent"><Icon name="habit" size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">Track daily and weekly habits</div>
            <div class="row-meta">Check them off here every day. Streaks build up on the Habits page.</div>
          </div>
        </div>
      </div>
    );
  }
  // open ones first, then the ones already done today or with the weekly target met
  const rows = habits.map((h) => ({ h, open: M.habitOpenToday(h, t0), done: M.habitDone(h, t0) }));
  rows.sort((a, b) => (b.open - a.open) || ((a.h.freq === 'weekly') - (b.h.freq === 'weekly')) || ((a.h.order || 0) - (b.h.order || 0)));
  // a weekly habit whose target is already met counts as complete for today
  const doneN = rows.filter((r) => !r.open).length;
  const pct = Math.round((doneN / rows.length) * 100);
  return (
    <div class="card">
      <div class="card-head">
        <div class="card-title">Habits <span class="count">{doneN}/{rows.length}</span></div>
        <a class="btn sm soft" href="#/habits">All</a>
      </div>
      <div class="today-progress">
        <div class="th-bar grow"><i style={{ width: pct + '%' }} /></div>
        <span class="tnum">{doneN} of {rows.length} done</span>
      </div>
      <div class="list">
        {rows.map(({ h, open, done }) => {
          const weekly = h.freq === 'weekly';
          const streak = M.habitStreak(h, t0);
          const count = M.habitWeekCount(h, t0), target = M.habitTarget(h);
          return (
            <div class={'task hb-row' + (done ? ' done' : '') + (!open && !done ? ' rest' : '')}>
              <Check checked={done} onChange={() => M.toggleHabit(h.id, t0)} label={(done ? 'Uncheck ' : 'Check ') + h.title} />
              <div class="task-body" onClick={() => navigate('/habits')}>
                <div class="task-title"><HabitMark h={h} />{h.title}</div>
                <div class="task-meta">
                  {weekly && <span class={'m' + (count >= target ? ' today' : '')}>{count}/{target} this week</span>}
                  {!weekly && <span class="m">Daily</span>}
                  {streak > 0 && <span class="m hb-streak"><Icon name="flame" />{weekly ? plural(streak, 'week') : plural(streak, 'day')}</span>}
                  {!open && !done && <span class="m">Target met</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// SHEET
// =====================================================================
export function openHabitSheet(id) { openOverlay((close) => <HabitSheet id={id} close={close} />, { kind: 'sheet' }); }

function HabitSheet({ id, close }) {
  const ex = id ? get('habits', id) : null;
  const [h, setH] = useState(() => (ex ? { ...ex } : { title: '', emoji: '', freq: 'daily', target: 3 }));
  const set = (ch) => setH({ ...h, ...ch });
  const save = () => {
    const title = h.title.trim();
    if (!title) return toast('Name the habit first.', { tone: 'warn' });
    const data = { title, emoji: (h.emoji || '').trim().slice(0, 4), freq: h.freq, target: h.freq === 'weekly' ? Math.max(1, Math.min(7, +h.target || 1)) : 1 };
    if (ex) patch('habits', ex.id, data); else M.newHabit(data);
    toast(ex ? 'Habit saved' : 'Habit added');
    close();
  };
  return (
    <>
      <SheetHead title={ex ? 'Edit habit' : 'New habit'} onClose={close} />
      <SheetBody>
        <div class="form">
          <div class="hb-name-row">
            <Field label="Icon" htmlFor="hb-emoji"><TextInput id="hb-emoji" class="hb-emoji-input" value={h.emoji} onInput={(v) => set({ emoji: v })} placeholder="🙂" maxLength={4} /></Field>
            <Field label="Habit" htmlFor="hb-title"><TextInput id="hb-title" value={h.title} onInput={(v) => set({ title: v })} placeholder="e.g. Workout, Read 20 minutes" autoFocus={!ex} onEnter={save} /></Field>
          </div>
          <Field label="How often"><Segmented options={[{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }]} value={h.freq} onChange={(v) => set({ freq: v })} /></Field>
          {h.freq === 'weekly'
            ? <Field label="Times per week"><Chips options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, label: n + '×' }))} value={+h.target || 1} onChange={(v) => set({ target: v })} /></Field>
            : <div class="field-hint">Check it once a day. Missing a day resets the streak.</div>}
          {h.freq === 'weekly' && <div class="field-hint">Check it on the days you do it. The week counts when you hit the target.</div>}
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{ex ? 'Save' : 'Add habit'}</button></SheetFoot>
    </>
  );
}
