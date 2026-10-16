import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, Chips, Segmented, Progress, Ring, Empty, NumberInput } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { TaskRow, PageHeader, SubNav, DAILY_NAV, openTaskSheet, pickTask, catTone, Dot, ContentBadge, fmtAgo } from '../ui/parts.jsx';
import { agendaItems, AgendaList } from './calendar.jsx';
import { ThreadsTodayCard } from './threads.jsx';
import { navigate } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, addDays, diffDays, relDay, relDayLower, fmtDay, fmtLong, fmtShort, greeting, isoOf, startOfWeek, fmtFull, nowParts, fmtMinutes, fmtWeekdayShort, dayNum } from '../lib/date.js';
import { fmtMoney } from '../lib/money.js';
import { dragHandlers, orderBetween } from '../lib/dnd.js';
import * as M from '../lib/model.js';
import { openSearch, openQuickAdd, recentRow } from '../App.jsx';
import { reminderState, dismissReminder, loadSampleData, useSync } from './settings.jsx';
import { monthData, buildMonthlyPdf, ENERGY } from '../lib/reviewpdf.js';
import { uploadMonthlyReview, monthLabel } from '../lib/drive.js';
import { saveFile, saveMessage } from '../lib/files.js';
import { sync } from '../lib/sync.js';
import { pendingJournal, saveJournal } from '../lib/journal.js';

// =====================================================================
// TODAY
// =====================================================================
export function TodayPage() {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const s = M.settings();
  const t0 = today();
  const tasks = M.liveTasks();
  const dueToday = tasks.filter((t) => M.isOpen(t) && t.dueDate === t0);
  // Tasks with a time come first, in time order, then the rest
  const openToday = [...dueToday.filter((t) => t.dueTime).sort((a, b) => a.dueTime.localeCompare(b.dueTime)), ...M.sortTasks(dueToday.filter((t) => !t.dueTime))];
  const overdue = M.sortTasks(tasks.filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < t0));
  const doneToday = tasks.filter((t) => M.taskDoneOn(t, t0));
  const contentActs = M.contentActions(t0);
  const freelance = M.freelanceAgenda(t0, t0, true);
  const remaining = openToday.length + contentActs.filter((a) => !a.overdue).length + freelance.filter((f) => !f.overdue).length;
  const rem = reminderState();
  const empty = !tasks.length && !M.liveContents().length && !M.liveProjects().length && !M.meta('onboarding', {}).done;
  const hasSample = tasks.some((t) => t.sample) || M.liveContents().some((c) => c.sample) || M.liveClients().some((c) => c.sample);
  const attention = overdue.length + freelance.filter((f) => f.overdue).length + contentActs.filter((a) => a.overdue).length;
  const journal = <JournalCard />;

  return (
    <div class="page">
      <div class="topbar">
        <button class="avatar" aria-label="Settings" onClick={() => navigate('/settings')}>{(s.name || 'D')[0].toUpperCase()}</button>
        <div class="topbar-text">
          <div class="hello">{greeting()}, {s.name}</div>
          <div class="hello-sub">{fmtDay(t0)} · {remaining ? `${remaining} thing${remaining === 1 ? '' : 's'} today` : 'Nothing scheduled'}</div>
        </div>
        <button class="icon-btn glass" aria-label="Attention and reminders" onClick={() => openAttention()}>
          <Icon name="bell" />{(attention > 0 || rem.morning || rem.evening) && <span class="notif-dot" />}
        </button>
      </div>

      {empty && <Welcome />}
      <SyncNudge />
      <JournalNudge />
      {hasSample && (
        <div class="nudge blue">
          <Icon name="info" size={20} />
          <div class="grow" style={{ fontSize: 14 }}>You're looking at <b>sample data</b>. Remove it any time in Settings, your own entries stay.</div>
          <button class="btn sm" onClick={() => navigate('/settings/data')}>Settings</button>
        </div>
      )}
      {rem.morning && <MorningBrief openToday={openToday} contentActs={contentActs} freelance={freelance} />}
      {rem.evening && (
        <div class="nudge blue">
          <Icon name="moonStars" size={22} />
          <div class="grow"><b>Time to close the day.</b> <span class="muted">How was today?</span></div>
          <button class="btn sm primary" onClick={() => { dismissReminder('evening'); const el = document.getElementById('today-journal'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus(), 350); } }}>Write</button>
          <button class="icon-btn ghost sm" aria-label="Dismiss" onClick={() => dismissReminder('evening')}><Icon name="x" size={16} /></button>
        </div>
      )}

      <div class="hero today-hero">
        <HeroArt />
        <h1 class="hero-title">Your day,<br /><span class="soft">in focus.</span></h1>
        <Capture />
      </div>

      <WeekStrip />

      <div class="two-col">
        <div class="stack">
          <TodayTasks openToday={openToday} doneToday={doneToday} />
          {overdue.length > 0 && (
            <div class="card">
              <div class="card-head">
                <div class="card-title" style={{ color: 'var(--bad)' }}>Overdue <span class="count">{overdue.length}</span></div>
                <button class="btn sm soft" onClick={() => { overdue.forEach((t) => patch('tasks', t.id, { dueDate: t0 })); toast(`Moved ${overdue.length} to today`); }}>Move all to today</button>
              </div>
              <div class="list">{overdue.slice(0, 8).map((t) => <TaskRow t={t} />)}</div>
              {overdue.length > 8 && <a class="section-link" href="#/tasks?view=overdue">See all {overdue.length}</a>}
            </div>
          )}
          {desktop && journal}
        </div>

        <div class="stack">
          <Schedule />
          <ThreadsTodayCard />
          {!desktop && journal}
          <Recent />
        </div>
      </div>
    </div>
  );
}

// This week at a glance. Tap a day to open it in Calendar.
function WeekStrip() {
  const s = M.settings();
  const t0 = today();
  const ws = startOfWeek(t0, s.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <nav class="wstrip" aria-label="This week">
      {days.map((d) => {
        const a = agendaItems(d);
        const its = [...a.allDay, ...a.timed].filter((i) => !i.done);
        const kinds = ['task', 'content', 'freelance'].filter((k) => its.some((i) => i.kind === k));
        return (
          <a class={'ws-day' + (d === t0 ? ' today' : '') + (d < t0 ? ' past' : '')} href={'#/calendar?d=' + d + '&v=day'} aria-label={fmtDay(d) + (its.length ? `, ${its.length} planned` : '')}>
            <span class="ws-dow">{fmtWeekdayShort(d)}</span>
            <b class="ws-num">{dayNum(d)}</b>
            <span class="ws-dots">{kinds.map((k) => <i class={'k-' + k} />)}</span>
          </a>
        );
      })}
    </nav>
  );
}

function TodayTasks({ openToday, doneToday }) {
  const t0 = today();
  const total = openToday.length + doneToday.length;
  const pct = total ? Math.round((doneToday.length / total) * 100) : 0;
  const inbox = M.liveTasks().filter((t) => M.isOpen(t) && !t.dueDate);
  const planInbox = () => pickTask({ title: 'Plan for today', filter: (t) => !t.dueDate, allowNew: false, onPick: (t) => { patch('tasks', t.id, { dueDate: t0 }); toast('Added to today'); } });
  return (
    <div class="card">
      <div class="card-head">
        <div class="card-title">Today <span class="count">{openToday.length}</span></div>
        <button class="btn sm soft" onClick={() => openTaskSheet(null, { dueDate: t0 })}><Icon name="plus" size={16} />Task</button>
      </div>
      {total > 0 && (
        <div class="today-progress">
          <div class="th-bar grow"><i style={{ width: pct + '%' }} /></div>
          <span class="tnum">{doneToday.length} of {total} done</span>
        </div>
      )}
      {openToday.length ? <div class="list">{openToday.map((t) => <TaskRow t={t} hideDate />)}</div> : (
        <div class="today-empty">
          <span class={'mini-ic ' + (doneToday.length ? 't-green' : 't-accent')}><Icon name={doneToday.length ? 'check' : 'sun'} size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">{doneToday.length ? 'All done for today' : 'Nothing due today'}</div>
            <div class="row-meta">{inbox.length ? `${inbox.length} task${inbox.length === 1 ? '' : 's'} in Inbox without a date.` : 'Type one in the box above, or block time in Calendar.'}</div>
          </div>
          {inbox.length > 0 && <button class="btn sm soft" onClick={planInbox}>Plan from Inbox</button>}
        </div>
      )}
      {doneToday.length > 0 && (
        <details class="done-today">
          <summary>Completed today ({doneToday.length})</summary>
          <div class="list">{doneToday.map((t) => <TaskRow t={t} hideDate />)}</div>
        </details>
      )}
    </div>
  );
}

// Everything with a time today, plus shoots, deliveries and invoices, in one timeline.
function Schedule() {
  const t0 = today();
  const { allDay, timed } = agendaItems(t0, { untimedTasks: false });
  const late = [
    ...M.freelanceAgenda(t0, t0, true).filter((f) => f.overdue).map((f) => ({ kind: 'freelance', id: 'late:' + f.kind + (f.project?.id || f.invoice?.id), f, tone: 't-red', overdue: true, timeLabel: 'Late',
      title: f.kind === 'invoice' ? `Follow up ${f.invoice.number}` : `${f.project.name}`, sub: f.kind === 'invoice' ? `${M.clientName(f.invoice.clientId)} · ${fmtMoney(f.calc.balance, f.invoice.currency)} unpaid since ${fmtShort(f.date)}` : `Delivery was due ${relDayLower(f.date)}` })),
    ...M.contentActions(t0).filter((a) => a.overdue).map((a) => ({ kind: 'content', id: 'late:' + a.content.id + a.stage.id, c: a.content, stage: a.stage.id, tone: 't-red', overdue: true, timeLabel: 'Late',
      title: `${a.stage.verb}: ${a.content.title}`, sub: `Content · was due ${relDayLower(a.date)}` })),
  ];
  const n = late.length + allDay.length + timed.length;
  return (
    <div class="card">
      <div class="card-head">
        <div class="card-title">Schedule {n > 0 && <span class="count">{n}</span>}</div>
        <a class="section-link" href={'#/calendar?d=' + t0 + '&v=day'}>Calendar</a>
      </div>
      {n ? <AgendaList d={t0} allDay={[...late, ...allDay]} timed={timed} /> : (
        <div class="today-empty">
          <span class="mini-ic t-violet"><Icon name="calendar" size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">Nothing on the clock</div>
            <div class="row-meta">Give a task a time, or plan a shoot or upload. It lines up here.</div>
          </div>
          <a class="btn sm soft" href={'#/calendar?d=' + t0 + '&v=day'}>Open</a>
        </div>
      )}
    </div>
  );
}

// Today's journal entry, written right on the home page. Same entry as Review.
function JournalCard() {
  const t0 = today();
  const [r, set, saved] = useAutosave('dailyReviews', t0, { journal: '' });
  return (
    <div class="card journal-mini">
      <div class="card-head">
        <div class="card-title"><Icon name="review" size={18} style={{ color: 'var(--accent)' }} />How was today?</div>
        {saved ? <span class="save-hint">{saved}</span> : <a class="section-link" href="#/review">Journal</a>}
      </div>
      <TextArea id="today-journal" value={r.journal} onInput={(v) => set({ journal: v })} placeholder="A few lines about today. It goes into your journal and the monthly PDF." minRows={3} />
    </div>
  );
}

function HeroArt() {
  return (
    <svg class="hero-art" viewBox="0 0 112 76" aria-hidden="true">
      <rect x="44" y="6" width="58" height="40" rx="9" fill="var(--t-blue-bg)" transform="rotate(8 73 26)" />
      <rect x="20" y="16" width="62" height="44" rx="10" fill="var(--surface)" stroke="var(--line)" />
      <rect x="29" y="27" width="30" height="5" rx="2.5" fill="var(--line-strong)" />
      <rect x="29" y="37" width="40" height="5" rx="2.5" fill="var(--surface-3)" />
      <rect x="29" y="47" width="22" height="5" rx="2.5" fill="var(--surface-3)" />
      <circle cx="84" cy="56" r="13" fill="var(--accent)" />
      <path d="M78 56.5l4 4 8-8.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="4" fill="var(--t-pink-bg)" />
    </svg>
  );
}

function Capture() {
  const [text, setText] = useState('');
  const [dest, setDest] = useState('today');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    M.newTask({ title: t, dueDate: dest === 'today' ? today() : '' });
    setText('');
    toast(dest === 'today' ? 'Added to today' : 'Added to Inbox');
  };
  return (
    <div class="capture">
      <button class="icon-btn" aria-label="Create something else" onClick={openQuickAdd}><Icon name="plus" size={20} /></button>
      <button class="capture-dest" onClick={() => setDest(dest === 'today' ? 'inbox' : 'today')} aria-label="Switch where new tasks go" title="Tap to switch">{dest === 'today' ? 'Today' : 'Inbox'}<Icon name="chevronDown" size={14} /></button>
      <input id="capture" value={text} placeholder={dest === 'today' ? 'Add a task' : 'Capture for later'} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} enterKeyHint="done" />
      <button class="icon-btn accent" aria-label="Add task" onClick={add}><Icon name="send" size={18} /></button>
    </div>
  );
}

function Recent() {
  const rows = (M.meta('recent', { items: [] }).items || []).map(recentRow).filter(Boolean).slice(0, 8);
  if (!rows.length) return null;
  return (
    <div class="section">
      <div class="section-head"><div class="section-title">Recently visited</div></div>
      <div class="hscroll">
        {rows.map((r) => (
          <a class="mini-card" href={'#' + r.path}>
            <span class={'mini-ic ' + r.tone}><Icon name={r.icon} size={16} /></span>
            <div class="mini-title clamp2">{r.title}</div>
            <div class="row-meta ellipsis">{r.kind}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function MorningBrief({ openToday, contentActs, freelance }) {
  const timed = openToday.filter((t) => t.dueTime).sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  const today_ = contentActs.filter((a) => !a.overdue);
  const bits = [];
  bits.push(`${openToday.length} task${openToday.length === 1 ? '' : 's'} today${timed.length ? `, first at ${timed[0].dueTime}` : ''}.`);
  const shoots = [...today_.filter((a) => a.stage.id === 'shoot'), ...freelance.filter((f) => f.kind === 'shoot')];
  const uploads = today_.filter((a) => a.stage.id === 'upload');
  if (shoots.length) bits.push(`${shoots.length === 1 ? 'A shoot' : shoots.length + ' shoots'} planned.`);
  if (uploads.length) bits.push(`${uploads.length} upload${uploads.length === 1 ? '' : 's'}${uploads[0].time ? ' at ' + uploads[0].time : ''}.`);
  return (
    <div class="nudge">
      <Icon name="coffee" size={22} />
      <div class="grow" style={{ fontSize: 14 }}><b>Morning brief.</b> {bits.join(' ')}</div>
      <button class="icon-btn ghost sm" aria-label="Dismiss" onClick={() => dismissReminder('morning')}><Icon name="x" size={16} /></button>
    </div>
  );
}

function Welcome() {
  return (
    <div class="card" style={{ background: 'var(--surface)' }}>
      <div class="row gap-12" style={{ alignItems: 'flex-start' }}>
        <span class="mini-ic t-accent" style={{ borderRadius: 12 }}><Icon name="spark" size={18} /></span>
        <div class="grow">
          <div class="card-title">Welcome, {M.settings().name}</div>
          <div class="muted" style={{ fontSize: 14, marginTop: 4 }}>Everything here is saved on this device. Want to look around with example data first? It is labeled as sample and you can remove it in one tap from Settings.</div>
          <div class="row gap-8 wrap" style={{ marginTop: 12 }}>
            <button class="btn sm primary" onClick={() => { loadSampleData(); toast('Sample data loaded'); }}>Load sample data</button>
            <button class="btn sm soft" onClick={() => put('meta', { id: 'onboarding', done: true })}>Start empty</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function openAttention() {
  openOverlay((close) => <Attention close={close} />, { kind: 'sheet' });
}
function Attention({ close }) {
  useStore();
  const t0 = today();
  const overdue = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < t0);
  const fl = M.freelanceAgenda(t0, t0, true);
  const ca = M.contentActions(t0);
  const rem = reminderState(true);
  const go = (p) => { close(); navigate(p); };
  return (
    <>
      <SheetHead title="Needs attention" onClose={close} />
      <SheetBody>
        <div class="col gap-12">
          {rem.morningDue && <div class="nudge"><Icon name="coffee" size={20} /><div class="grow">Morning brief at {rem.morningTime}. Check today's tasks and uploads.</div></div>}
          {rem.eveningDue && <div class="nudge blue"><Icon name="moonStars" size={20} /><div class="grow">Daily review is open from {rem.eveningTime}.</div><button class="btn sm primary" onClick={() => { dismissReminder('evening'); go('/review'); }}>Review</button></div>}
          {!overdue.length && !fl.length && !ca.length && <Empty icon="check" title="All clear">Nothing overdue and nothing waiting on you right now.</Empty>}
          {overdue.length > 0 && <div class="card soft tight"><div class="card-title" style={{ marginBottom: 6 }}>{overdue.length} overdue task{overdue.length === 1 ? '' : 's'}</div><div class="list">{overdue.slice(0, 6).map((t) => <TaskRow t={t} />)}</div></div>}
          {fl.map((f) => (
            <button class="list-row clickable" onClick={() => go(f.kind === 'invoice' ? '/freelance/invoices/' + f.invoice.id : '/freelance/projects/' + f.project.id)}>
              <span class={'mini-ic ' + (f.overdue ? 't-red' : 't-orange')}><Icon name={f.kind === 'invoice' ? 'file' : 'briefcase'} size={16} /></span>
              <div class="row-main"><div class="row-title">{f.kind === 'invoice' ? f.invoice.number : f.project.name}</div><div class="row-meta">{f.label} · {relDay(f.date)}</div></div>
            </button>
          ))}
          {ca.map((a) => (
            <button class="list-row clickable" onClick={() => go('/content/item/' + a.content.id)}>
              <span class={'mini-ic ' + (a.overdue ? 't-red' : 't-violet')}><Icon name="video" size={16} /></span>
              <div class="row-main"><div class="row-title">{a.stage.verb}: {a.content.title}</div><div class="row-meta">{relDay(a.date)}{a.time ? ' · ' + a.time : ''}</div></div>
            </button>
          ))}
          <div class="muted" style={{ fontSize: 12.5 }}>Reminders show inside the app at {rem.morningTime} and {rem.eveningTime}. Change them in Settings.</div>
        </div>
      </SheetBody>
    </>
  );
}

// =====================================================================
// TASKS
// =====================================================================
const VIEWS = [{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'inbox', label: 'Inbox' }, { id: 'overdue', label: 'Overdue' }, { id: 'all', label: 'All open' }, { id: 'done', label: 'Done' }, { id: 'other', label: 'Deferred & cancelled' }, { id: 'archived', label: 'Archived' }];
function loadPref(k, d) { try { const v = localStorage.getItem('vz:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem('vz:' + k, JSON.stringify(v)); } catch {} }

export function TasksPage({ query }) {
  useStore();
  const s = M.settings();
  const t0 = today();
  const [view, setView] = useState(query.view || loadPref('taskView', 'today'));
  const [cat, setCat] = useState('');
  const [prio, setPrio] = useState('');
  const [link, setLink] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(loadPref('taskSort', 'smart'));
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => { if (query.view) setView(query.view); }, [query.view]);
  useEffect(() => savePref('taskView', view), [view]);
  useEffect(() => savePref('taskSort', sort), [sort]);

  const all0 = M.liveTasks();
  const archived = all('tasks').filter((t) => t.archived && !t.deletedAt);
  const counts = {
    today: all0.filter((t) => M.isOpen(t) && t.dueDate && t.dueDate <= t0).length,
    upcoming: all0.filter((t) => M.isOpen(t) && t.dueDate > t0).length,
    inbox: all0.filter((t) => M.isOpen(t) && !t.dueDate).length,
    overdue: all0.filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < t0).length,
    all: all0.filter(M.isOpen).length,
  };
  let list = view === 'archived' ? archived : all0.filter((t) => {
    if (view === 'today') return M.isOpen(t) && t.dueDate && t.dueDate <= t0;
    if (view === 'upcoming') return M.isOpen(t) && t.dueDate > t0;
    if (view === 'inbox') return M.isOpen(t) && !t.dueDate;
    if (view === 'overdue') return M.isOpen(t) && t.dueDate && t.dueDate < t0;
    if (view === 'all') return M.isOpen(t);
    if (view === 'done') return t.status === 'done' || (t.completions || []).length > 0;
    if (view === 'other') return t.status === 'deferred' || t.status === 'cancelled';
    return true;
  });
  if (cat) list = list.filter((t) => t.category === cat);
  if (prio) list = list.filter((t) => (t.priority || 'none') === prio);
  if (link === 'goal') list = list.filter((t) => t.goalId); else if (link === 'content') list = list.filter((t) => t.contentId); else if (link === 'project') list = list.filter((t) => t.projectId); else if (link === 'invoice') list = list.filter((t) => t.invoiceId); else if (link === 'none') list = list.filter((t) => !t.goalId && !t.contentId && !t.projectId && !t.invoiceId);
  else if (link.startsWith('g:')) list = list.filter((t) => t.goalId === link.slice(2)); else if (link.startsWith('p:')) list = list.filter((t) => t.projectId === link.slice(2));
  if (q.trim()) { const term = q.toLowerCase(); list = list.filter((t) => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(term)); }
  list = view === 'done' ? [...list].sort((a, b) => (b.completedAt || b.lastCompletedAt || 0) - (a.completedAt || a.lastCompletedAt || 0)) : M.sortTasks(list, sort);

  const manual = sort === 'manual' && (view === 'inbox' || view === 'all' || view === 'today');
  const onDrop = ({ id, to, before, after }) => {
    if (to !== 'tasklist') return;
    const prev = after && get('tasks', after), nxt = before && get('tasks', before);
    patch('tasks', id, { order: orderBetween(prev?.order, nxt?.order) });
  };
  const addQuick = () => {
    const t = draft.trim();
    if (!t) return;
    M.newTask({ title: t, dueDate: view === 'today' ? t0 : view === 'upcoming' ? addDays(t0, 1) : '', category: cat || s.defaultCategory, priority: prio && prio !== 'none' ? prio : s.defaultPriority });
    setDraft('');
  };
  const filtersOn = cat || prio || link || q;

  const groups = [];
  if (view === 'upcoming' && sort === 'smart') {
    const by = {};
    list.forEach((t) => { (by[t.dueDate] = by[t.dueDate] || []).push(t); });
    Object.keys(by).sort().forEach((d) => groups.push({ label: relDay(d) + (diffDays(d, t0) > 1 && diffDays(d, t0) < 7 ? ' · ' + fmtShort(d) : ''), items: by[d] }));
  } else groups.push({ label: null, items: list });

  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="tasks" />
      <PageHeader title="Tasks" actions={<button class="btn primary" onClick={() => openTaskSheet(null, { dueDate: view === 'today' ? t0 : '', category: cat || s.defaultCategory })}><Icon name="plus" size={18} />New task</button>} />
      <div class="chips scroll">
        {VIEWS.map((v) => <button class={'chip ' + (view === v.id ? 'on' : '')} onClick={() => setView(v.id)}>{v.label}{counts[v.id] != null && counts[v.id] > 0 && <span class="chip-count">{counts[v.id]}</span>}</button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="task-q" value={q} placeholder="Search tasks" onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (filtersOn && !q ? 'dark' : '')} aria-label="Filters" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="filter" size={18} /></button>
        <button class="icon-btn" aria-label="Sort" onClick={(e) => openMenu(e, [{ heading: 'Sort by' }, ...[['smart', 'Smart (status, date, priority)'], ['due', 'Due date'], ['priority', 'Priority'], ['manual', 'Manual (drag to reorder)'], ['created', 'Newest first'], ['title', 'Title A–Z']].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>
      </div>
      {showFilters && (
        <div class="card tight">
          <div class="form">
            <Field label="Category"><Chips allowEmpty options={s.categories.map((c) => ({ id: c, label: c, dot: `var(--${catTone(c)})` }))} value={cat} onChange={(v) => setCat(v === cat ? '' : v)} /></Field>
            <div class="form-row">
              <Field label="Priority" htmlFor="f-prio"><Select id="f-prio" value={prio} onChange={setPrio} placeholder="Any" options={M.PRIORITIES} /></Field>
              <Field label="Linked to" htmlFor="f-link"><Select id="f-link" value={link} onChange={setLink} placeholder="Anything" options={[{ id: 'goal', label: 'Any goal' }, { id: 'content', label: 'Any content' }, { id: 'project', label: 'Any project' }, { id: 'invoice', label: 'Any invoice' }, { id: 'none', label: 'Not linked' }, ...M.activeGoals().map((g) => ({ id: 'g:' + g.id, label: 'Goal: ' + g.title })), ...M.liveProjects().filter((p) => !p.archived).map((p) => ({ id: 'p:' + p.id, label: 'Project: ' + p.name }))]} /></Field>
            </div>
            {filtersOn && <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => { setCat(''); setPrio(''); setLink(''); setQ(''); }}>Clear filters</button>}
          </div>
        </div>
      )}
      <div class="card">
        {!['done', 'other', 'archived', 'overdue'].includes(view) && (
          <div class="cl-add" style={{ padding: '0 4px 8px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <Icon name="plus" size={18} class="muted" />
            <input class="cl-text" id="task-quick" value={draft} placeholder={view === 'inbox' ? 'Capture to Inbox' : view === 'today' ? 'Add a task for today' : view === 'upcoming' ? 'Add a task for tomorrow' : 'Add a task'} onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addQuick(); } }} />
            {draft.trim() && <button class="btn sm primary" onClick={addQuick}>Add</button>}
          </div>
        )}
        {list.length === 0 ? (
          <Empty icon={view === 'inbox' ? 'inbox' : 'check'} title={filtersOn ? 'No tasks match these filters' : view === 'today' ? 'Nothing due today' : view === 'inbox' ? 'Inbox is empty' : view === 'overdue' ? 'Nothing overdue' : 'No tasks here'}>
            {view === 'inbox' && !filtersOn ? 'Things you capture without a date land here until you plan them.' : null}
          </Empty>
        ) : groups.map((g) => (
          <div>
            {g.label && <div class="result-label" style={{ paddingTop: 12 }}>{g.label}</div>}
            <div class="list" data-drop={manual ? 'tasklist' : undefined}>
              {g.items.map((t) => <TaskRow t={t} hideDate={view === 'upcoming' && sort === 'smart'} dragProps={manual ? dragHandlers(t.id, onDrop, { accept: (k) => k === 'tasklist' }) : null} />)}
            </div>
          </div>
        ))}
      </div>
      {view === 'archived' && list.length > 0 && <div class="muted" style={{ fontSize: 13 }}>Archived tasks stay out of every list. Open one and use the menu to reopen it, or restore below.</div>}
      {view === 'archived' && list.map((t) => null)}
      {view === 'archived' && list.length > 0 && <button class="btn soft" onClick={() => { list.forEach((t) => patch('tasks', t.id, { archived: false })); toast('Restored'); }}>Restore all archived</button>}
    </div>
  );
}

// =====================================================================
// GOALS
// =====================================================================
export function GoalsPage() {
  useStore();
  const [tab, setTab] = useState('active');
  const s = M.settings();
  const t0 = today();
  useEffect(() => { if (location.hash.includes('new=1')) { navigate('/goals', { replace: true }); setTimeout(() => openGoalSheet(), 30); } }, []);
  const goals = all('goals').filter((g) => !g.deletedAt && (tab === 'active' ? g.status === 'active' : g.status === tab));
  const weekStart = startOfWeek(t0, s.weekStart);
  const weekly = goals.filter((g) => g.period === 'weekly');
  const longer = goals.filter((g) => g.period !== 'weekly');
  const activeWeekly = all('goals').filter((g) => g.status === 'active' && g.period === 'weekly' && !g.deletedAt && (!g.endDate || g.endDate >= t0));
  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="goals" />
      <PageHeader title="Goals" actions={<button class="btn primary" onClick={() => openGoalSheet()}><Icon name="plus" size={18} />New goal</button>}>
        <div class="muted" style={{ marginTop: 6 }}>Week of {fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}. Keep it to {s.weeklyGoalLimit} weekly goals or fewer.</div>
      </PageHeader>
      <Segmented options={[{ id: 'active', label: 'Active', count: all('goals').filter((g) => g.status === 'active' && !g.deletedAt).length }, { id: 'completed', label: 'Completed' }, { id: 'archived', label: 'Archived' }]} value={tab} onChange={setTab} />
      {activeWeekly.length > s.weeklyGoalLimit && tab === 'active' && <div class="nudge"><Icon name="bulb" size={20} /><div>You have {activeWeekly.length} weekly goals. Fewer goals usually means more of them get done.</div></div>}
      {!goals.length && <div class="card"><Empty icon="target" title={tab === 'active' ? 'No active goals' : `No ${tab} goals yet`} action={tab === 'active' && <button class="btn primary sm" onClick={() => openGoalSheet()}>Set a weekly goal</button>}>{tab === 'active' ? 'Pick one to three outcomes for this week, then turn each into a few tasks.' : null}</Empty></div>}
      {weekly.length > 0 && <div class="section"><div class="section-head"><div class="section-title">Weekly</div></div>{weekly.map((g) => <GoalCard g={g} />)}</div>}
      {longer.length > 0 && <div class="section"><div class="section-head"><div class="section-title">Monthly & longer</div></div>{longer.map((g) => <GoalCard g={g} />)}</div>}
    </div>
  );
}

function GoalCard({ g }) {
  const p = M.goalProgress(g);
  const tasks = M.sortTasks(all('tasks').filter((t) => t.goalId === g.id && !t.deletedAt));
  const [open, setOpen] = useState(g.method === 'tasks' && tasks.length < 6);
  const ended = g.endDate && g.endDate < today() && g.status === 'active';
  return (
    <div class="card">
      <div class="row gap-12" style={{ alignItems: 'flex-start' }}>
        <Ring pct={p.pct} size={52} stroke={5} />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row gap-6 wrap"><span class="badge sm t-yellow">{g.period === 'weekly' ? 'Weekly' : g.period === 'monthly' ? 'Monthly' : 'Custom'}</span>{ended && <span class="badge sm t-red">Period ended</span>}{g.status === 'completed' && <span class="badge sm t-green">Completed</span>}</div>
          <div class="card-title" style={{ marginTop: 6, fontSize: 17 }}>{g.title}</div>
          {g.description && <div class="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{g.description}</div>}
          <div class="row-meta" style={{ marginTop: 4 }}>{p.label}{g.startDate ? ` · ${fmtShort(g.startDate)} – ${fmtShort(g.endDate)}` : ''}</div>
        </div>
        <button class="icon-btn ghost sm" aria-label="Goal actions" onClick={(e) => openMenu(e, [
          { label: 'Edit', icon: 'edit', onSelect: () => openGoalSheet(g.id) },
          g.status !== 'completed' && { label: 'Mark completed', icon: 'check', onSelect: () => { patch('goals', g.id, { status: 'completed', completedAt: Date.now() }); toast('Goal completed'); } },
          g.status !== 'active' && { label: 'Make active again', icon: 'restore', onSelect: () => patch('goals', g.id, { status: 'active' }) },
          g.status !== 'archived' && { label: 'Archive', icon: 'archive', onSelect: () => patch('goals', g.id, { status: 'archived' }) },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete this goal?', body: 'Linked tasks stay, they just lose the link.', confirmLabel: 'Delete', danger: true })) { all('tasks').filter((t) => t.goalId === g.id).forEach((t) => patch('tasks', t.id, { goalId: '' })); remove('goals', g.id); toast('Goal deleted'); } } },
        ], { title: g.title })}><Icon name="more" /></button>
      </div>
      {g.method === 'numeric' && g.status === 'active' && (
        <div class="row gap-8" style={{ marginTop: 14 }}>
          <button class="icon-btn soft sm" aria-label="Decrease" onClick={() => patch('goals', g.id, { current: Math.max(0, (+g.current || 0) - 1) })}><span style={{ fontWeight: 800, fontSize: 18 }}>−</span></button>
          <Progress pct={p.pct} />
          <button class="icon-btn dark sm" aria-label="Increase" onClick={() => patch('goals', g.id, { current: (+g.current || 0) + 1 })}><Icon name="plus" size={16} /></button>
        </div>
      )}
      {g.method === 'manual' && g.status === 'active' && (
        <div class="row gap-10" style={{ marginTop: 14 }}>
          <input type="range" min="0" max="100" step="5" value={+g.manual || 0} onInput={(e) => patch('goals', g.id, { manual: +e.currentTarget.value })} style={{ flex: 1, accentColor: 'var(--accent)' }} aria-label="Progress percent" />
          <span class="tnum" style={{ fontWeight: 800, width: 42, textAlign: 'right' }}>{+g.manual || 0}%</span>
        </div>
      )}
      {g.method === 'tasks' && (
        <div style={{ marginTop: 12 }}>
          {tasks.length > 0 && <button class="section-link" style={{ fontWeight: 700 }} onClick={() => setOpen(!open)}>{open ? 'Hide tasks' : `Show ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}</button>}
          {open && <div class="list">{tasks.map((t) => <TaskRow t={t} />)}</div>}
          {g.status === 'active' && (
            <div class="row gap-8 wrap" style={{ marginTop: 8 }}>
              <button class="btn sm soft" onClick={() => openTaskSheet(null, { goalId: g.id, dueDate: today() })}><Icon name="plus" size={15} />New task</button>
              <button class="btn sm ghost" onClick={() => pickTask({ title: 'Link a task', filter: (t) => t.goalId !== g.id, allowNew: false, onPick: (t) => { patch('tasks', t.id, { goalId: g.id }); toast('Linked to goal'); } })}><Icon name="link" size={15} />Link existing</button>
            </div>
          )}
        </div>
      )}
      {g.notes && <div class="muted" style={{ fontSize: 13, marginTop: 10, whiteSpace: 'pre-wrap' }}>{g.notes}</div>}
    </div>
  );
}

export function openGoalSheet(id) { openOverlay((close) => <GoalSheet id={id} close={close} />, { kind: 'sheet' }); }
function periodDates(period, s = M.settings()) {
  const t0 = today();
  if (period === 'weekly') { const st = startOfWeek(t0, s.weekStart); return { startDate: st, endDate: addDays(st, 6) }; }
  if (period === 'monthly') { const st = t0.slice(0, 8) + '01'; const [y, m] = st.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { startDate: st, endDate: st.slice(0, 8) + String(last).padStart(2, '0') }; }
  return { startDate: t0, endDate: addDays(t0, 29) };
}
function GoalSheet({ id, close }) {
  useStore();
  const ex = id ? get('goals', id) : null;
  const [g, setG] = useState(() => ex ? { ...ex } : { title: '', description: '', period: 'weekly', ...periodDates('weekly'), method: 'tasks', target: '', current: 0, unit: '', manual: 0, notes: '', status: 'active' });
  const set = (ch) => setG({ ...g, ...ch });
  const save = () => {
    if (!g.title.trim()) return toast('Name the goal first.', { tone: 'warn' });
    if (g.endDate && g.startDate && g.endDate < g.startDate) return toast('End date is before the start date.', { tone: 'warn' });
    put('goals', { ...g, id: ex?.id || uid(), title: g.title.trim() });
    toast(ex ? 'Goal saved' : 'Goal added');
    close();
  };
  return (
    <>
      <SheetHead title={ex ? 'Edit goal' : 'New goal'} onClose={close} />
      <SheetBody>
        <div class="form">
          <Field label="Goal" htmlFor="g-title"><TextInput id="g-title" value={g.title} onInput={(v) => set({ title: v })} placeholder="e.g. Publish 4 Reels" autoFocus={!ex} /></Field>
          <Field label="Definition of done" htmlFor="g-desc"><TextArea id="g-desc" value={g.description} onInput={(v) => set({ description: v })} placeholder="How will you know it's done?" /></Field>
          <Field label="Period"><Chips options={[{ id: 'weekly', label: 'This week' }, { id: 'monthly', label: 'This month' }, { id: 'custom', label: 'Custom' }]} value={g.period} onChange={(v) => set({ period: v, ...(v !== 'custom' ? periodDates(v) : {}) })} /></Field>
          <div class="form-row">
            <Field label="Start" htmlFor="g-start"><DateInput id="g-start" value={g.startDate} onChange={(v) => set({ startDate: v, period: 'custom' })} clearable={false} /></Field>
            <Field label="End" htmlFor="g-end"><DateInput id="g-end" value={g.endDate} onChange={(v) => set({ endDate: v, period: 'custom' })} clearable={false} /></Field>
          </div>
          <Field label="Track progress by"><Segmented options={[{ id: 'tasks', label: 'Linked tasks' }, { id: 'numeric', label: 'A number' }, { id: 'manual', label: 'Manual %' }]} value={g.method} onChange={(v) => set({ method: v })} /></Field>
          {g.method === 'numeric' && (
            <div class="form-row three">
              <Field label="Target" htmlFor="g-target"><NumberInput id="g-target" value={g.target} onChange={(v) => set({ target: v })} placeholder="4" /></Field>
              <Field label="Current" htmlFor="g-cur"><NumberInput id="g-cur" value={g.current} onChange={(v) => set({ current: v })} /></Field>
              <Field label="Unit" htmlFor="g-unit"><TextInput id="g-unit" value={g.unit} onInput={(v) => set({ unit: v })} placeholder="posts" /></Field>
            </div>
          )}
          {g.method === 'tasks' && <div class="field-hint">Progress counts each linked task once, when it's done. Add tasks from the goal card after saving.</div>}
          <Field label="Notes / review" htmlFor="g-notes"><TextArea id="g-notes" value={g.notes} onInput={(v) => set({ notes: v })} placeholder="What helped, what got in the way" /></Field>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{ex ? 'Save' : 'Add goal'}</button></SheetFoot>
    </>
  );
}

// =====================================================================
// REVIEWS
// =====================================================================
export function ReviewPage({ mode, date }) {
  useStore();
  if (mode === 'monthly') return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="review" />
      <BackRow />
      <PageHeader title="Monthly journal" />
      <MonthlyReview month={date} />
    </div>
  );
  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="review" />
      <PageHeader title="Daily journal" actions={<a class="btn sm soft" href="#/review/monthly"><Icon name="file" size={15} />Monthly PDF</a>} />
      <DailyReview date={date} />
    </div>
  );
}
function BackRow() {
  return <a class="set-back" style={{ display: 'inline-flex' }} href="#/review"><Icon name="chevronLeft" size={18} />Daily journal</a>;
}

function useAutosave(coll, id, initial) {
  const rec = get(coll, id);
  const [state, setState] = useState(() => ({ ...initial, ...(rec || {}), id }));
  const [saved, setSaved] = useState(rec ? 'Saved' : '');
  const timer = useRef();
  useEffect(() => { const r = get(coll, id); setState({ ...initial, ...(r || {}), id }); setSaved(r ? 'Saved' : ''); }, [id]);
  const set = (ch) => {
    const n = { ...state, ...ch };
    setState(n);
    setSaved('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { put(coll, n); setSaved('Saved'); }, 450);
  };
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  // flush on unmount if pending
  const latest = useRef(state); latest.current = state;
  const pending = useRef(false); pending.current = saved === 'Saving…';
  useEffect(() => () => { if (pending.current) put(coll, latest.current); }, [id]);
  return [state, set, saved];
}

function DailyReview({ date }) {
  const t0 = today();
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : t0;
  const [r, set, saved] = useAutosave('dailyReviews', d, { journal: '' });
  const go = (iso) => navigate('/review?d=' + iso);
  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label="Previous day" onClick={() => go(addDays(d, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{relDay(d)}</div><div class="muted" style={{ fontSize: 13 }}>{fmtFull(d)}</div></div>
        <button class="icon-btn" aria-label="Next day" disabled={d >= t0} onClick={() => go(addDays(d, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="card journal-card">
        <div class="card-head"><div class="card-title">How was today?</div><span class="save-hint">{saved}</span></div>
        <TextArea id="dr-journal" value={r.journal} onInput={(v) => set({ journal: v })} placeholder="Write anything: what happened, how it felt, what you noticed." minRows={8} />
      </div>
    </>
  );
}

const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export function MonthlyReview({ month }) {
  useSync();
  const cur = today().slice(0, 7);
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : cur;
  const d = monthData(ym);
  const saved = (M.meta('driveExports', {}).months || {})[ym];
  const [busy, setBusy] = useState('');
  const go = (v) => navigate('/review/monthly?d=' + v);
  const download = async () => {
    setBusy('pdf');
    try { const pdf = await buildMonthlyPdf(ym); const r = await saveFile(pdf.name, pdf.blob, 'application/pdf'); const [msg, tone] = saveMessage(r, 'Saved ' + pdf.name); toast(msg, { tone }); }
    catch (e) { toast(e.message || 'Could not make the PDF.', { tone: 'warn' }); }
    setBusy('');
  };
  const toDrive = async () => {
    setBusy('drive');
    try { const r = await saveJournal(ym); toast('Saved to Google Drive · ' + r.path); }
    catch (e) { toast(e.message || 'Could not save to Google Drive.', { tone: 'warn', duration: 6000 }); }
    setBusy('');
  };

  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label="Previous month" onClick={() => go(addMonths(ym, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{monthLabel(ym)}</div><div class="muted" style={{ fontSize: 13 }}>{ym === cur ? 'This month' : ym === addMonths(cur, -1) ? 'Last month' : ''}</div></div>
        <button class="icon-btn" aria-label="Next month" disabled={ym >= cur} onClick={() => go(addMonths(ym, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Days written</div><div class="stat-value">{d.days.length}</div></div>
        <div class="stat"><div class="stat-label">Tasks done</div><div class="stat-value">{d.doneCount}</div></div>
        <div class="stat"><div class="stat-label">Uploads</div><div class="stat-value">{d.uploads}</div></div>
        <div class="stat"><div class="stat-label">Words written</div><div class="stat-value">{d.days.reduce((n, x) => n + ((x.review.journal || '').trim().match(/\S+/g) || []).length, 0).toLocaleString('id-ID')}</div></div>
      </div>
      <div class="card export-card">
        <div class="export-icon"><Icon name="file" size={22} /></div>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row-title">Daily Review - {monthLabel(ym)}.pdf</div>
          <div class="row-meta">{saved ? <>Saved to Drive {fmtAgo(saved.at)}{saved.url && <> · <a href={saved.url} target="_blank" rel="noopener">Open</a></>}</> : (d.days.length ? `${d.days.length} daily review${d.days.length === 1 ? '' : 's'} in one PDF` : 'No reviews yet') + ` · Saves to Daily Review / ${ym.slice(0, 4)} / ${monthLabel(ym).split(' ')[0]}`}</div>
        </div>
        <div class="export-actions">
          <button class="btn sm ghost" disabled={!!busy} onClick={download}><Icon name="download" size={15} />{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
          <button class="btn sm primary" disabled={!!busy || !d.days.length} onClick={() => (sync.user ? toDrive() : navigate('/settings/account'))}><Icon name="upload" size={15} />{busy === 'drive' ? 'Saving…' : saved ? 'Save again' : 'Save to Drive'}</button>
        </div>
      </div>
      {d.days.length ? (
        <div class="col gap-12">{d.days.map((x) => (
          <a class="card journal-day" href={'#/review?d=' + x.date}>
            <div class="row between gap-8"><div class="card-title">{fmtDay(x.date)}</div>{x.review.energy ? <span class="badge sm t-orange">{ENERGY[x.review.energy - 1]}</span> : null}</div>
            {x.review.journal && <div class="jd-line">{x.review.journal}</div>}
            {x.done.length > 0 && <div class="jd-line"><span class="jd-label">Done</span>{x.done.map((t) => t.title).join(', ')}</div>}
            {x.review.wins && <div class="jd-line"><span class="jd-label">Wins</span>{x.review.wins}</div>}
            {x.review.blockers && <div class="jd-line"><span class="jd-label">Blockers</span>{x.review.blockers}</div>}
            {x.review.lesson && <div class="jd-line"><span class="jd-label">Lesson</span>{x.review.lesson}</div>}
          </a>
        ))}</div>
      ) : <div class="card"><Empty icon="review" title="No journal entries this month">Write a few lines on Today or in Daily journal. Every entry this month lands here and in the PDF.</Empty></div>}
    </>
  );
}

function JournalNudge() {
  useSync();
  const ym = pendingJournal();
  const [busy, setBusy] = useState(false);
  if (!ym || !sync.user) return null;
  return (
    <div class="nudge blue">
      <Icon name="file" size={20} />
      <div class="grow" style={{ fontSize: 14 }}><b>{monthLabel(ym)} journal is ready.</b> <span class="muted">Save all of last month's daily reviews to Google Drive as one PDF.</span></div>
      <button class="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); try { await saveJournal(ym); toast(monthLabel(ym) + ' journal saved to Google Drive'); } catch (e) { toast(e.message || 'Could not save to Google Drive.', { tone: 'warn', duration: 6000 }); } setBusy(false); }}>{busy ? 'Saving…' : 'Save to Drive'}</button>
    </div>
  );
}

function SyncNudge() {
  const s = useSync();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('vz:hideSyncNudge') === '1'; } catch { return false; } });
  if (!s.ready || s.user || hidden) return null;
  return (
    <div class="nudge blue">
      <Icon name="restore" size={20} />
      <div class="grow" style={{ fontSize: 14 }}><b>Turn on sync.</b> <span class="muted">Sign in once so your data is backed up and shows on every device.</span></div>
      <button class="btn sm primary" onClick={() => navigate('/settings/account')}>Sign in</button>
      <button class="icon-btn ghost sm" aria-label="Hide" onClick={() => { setHidden(true); try { localStorage.setItem('vz:hideSyncNudge', '1'); } catch {} }}><Icon name="x" size={16} /></button>
    </div>
  );
}
