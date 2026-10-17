import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, Chips, Segmented, Progress, Ring, Empty, NumberInput } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { TaskRow, PageHeader, SubNav, DAILY_NAV, openTaskSheet, pickTask, catTone, Dot, ContentBadge, fmtAgo } from '../ui/parts.jsx';
import { agendaItems, AgendaList } from './calendar.jsx';
import { ThreadsTodayCard } from './threads.jsx';
import { HabitsTodayCard } from './habits.jsx';
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
import { t as _t, tn as _tn } from '../lib/i18n.js';

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
      <SubNav items={DAILY_NAV} active="today" />
      <div class="topbar">
        <button class="avatar" aria-label={_t('Settings')} onClick={() => navigate('/settings')}>{(s.name || 'D')[0].toUpperCase()}</button>
        <div class="topbar-text">
          <div class="hello">{greeting()}, {s.name}</div>
          <div class="hello-sub">{fmtDay(t0)} · {remaining ? _t('{0} thing{1} today', [remaining, remaining === 1 ? '' : 's']) : _t('Nothing scheduled')}</div>
        </div>
        <button class="icon-btn glass" aria-label={_t('Attention and reminders')} onClick={() => openAttention()}>
          <Icon name="bell" />{(attention > 0 || rem.morning || rem.evening) && <span class="notif-dot" />}
        </button>
      </div>

      {empty && <Welcome />}
      <SyncNudge />
      <JournalNudge />
      {hasSample && (
        <div class="nudge blue">
          <Icon name="info" size={20} />
          <div class="grow" style={{ fontSize: 14 }}>{_t('You\'re looking at')}{' '}<b>{_t('sample data')}</b>{_t('. Remove it any time in Settings, your own entries stay.')}</div>
          <button class="btn sm" onClick={() => navigate('/settings/data')}>{_t('Settings')}</button>
        </div>
      )}
      {rem.morning && <MorningBrief openToday={openToday} contentActs={contentActs} freelance={freelance} />}
      {rem.evening && (
        <div class="nudge blue">
          <Icon name="moonStars" size={22} />
          <div class="grow"><b>{_t('Time to close the day.')}</b> <span class="muted">{_t('How was today?')}</span></div>
          <button class="btn sm primary" onClick={() => { dismissReminder('evening'); const el = document.getElementById('today-journal'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus(), 350); } }}>{_t('Write')}</button>
          <button class="icon-btn ghost sm" aria-label={_t('Dismiss')} onClick={() => dismissReminder('evening')}><Icon name="x" size={16} /></button>
        </div>
      )}

      <div class="hero today-hero">
        <HeroArt />
        <h1 class="hero-title">{_t('Your day,')}<br /><span class="soft">{_t('in focus.')}</span></h1>
        <Capture />
      </div>

      <WeekStrip />

      <div class="two-col">
        <div class="stack">
          <TodayTasks openToday={openToday} doneToday={doneToday} />
          <HabitsTodayCard />
          {overdue.length > 0 && (
            <div class="card">
              <div class="card-head">
                <div class="card-title" style={{ color: 'var(--bad)' }}>{_t('Overdue')}{' '}<span class="count">{overdue.length}</span></div>
                <button class="btn sm soft" onClick={() => { overdue.forEach((t) => patch('tasks', t.id, { dueDate: t0 })); toast(_t('Moved {0} to today', [overdue.length])); }}>{_t('Move all to today')}</button>
              </div>
              <div class="list">{overdue.slice(0, 8).map((t) => <TaskRow t={t} />)}</div>
              {overdue.length > 8 && <a class="section-link" href="#/tasks?view=overdue">{_t('See all')}{' '}{overdue.length}</a>}
            </div>
          )}
          {desktop && journal}
        </div>

        <div class="stack">
          <Schedule />
          <ThreadsTodayCard />
          {!desktop && journal}
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
    <nav class="wstrip" aria-label={_t('This week')}>
      {days.map((d) => {
        const a = agendaItems(d);
        const its = [...a.allDay, ...a.timed].filter((i) => !i.done);
        const kinds = ['task', 'content', 'freelance'].filter((k) => its.some((i) => i.kind === k));
        return (
          <a class={'ws-day' + (d === t0 ? ' today' : '') + (d < t0 ? ' past' : '')} href={'#/calendar?d=' + d + '&v=day'} aria-label={fmtDay(d) + (its.length ? _t(', {0} planned', [its.length]) : '')}>
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
  const planInbox = () => pickTask({ title: _t('Plan for today'), filter: (t) => !t.dueDate, allowNew: false, onPick: (t) => { patch('tasks', t.id, { dueDate: t0 }); toast(_t('Added to today')); } });
  return (
    <div class="card">
      <div class="card-head">
        <div class="card-title">{_t('Today')}{' '}<span class="count">{openToday.length}</span></div>
        <button class="btn sm soft" onClick={() => openTaskSheet(null, { dueDate: t0 })}><Icon name="plus" size={16} />{_t('Task')}</button>
      </div>
      {total > 0 && (
        <div class="today-progress">
          <div class="th-bar grow"><i style={{ width: pct + '%' }} /></div>
          <span class="tnum">{doneToday.length}{' '}{_t('of')}{' '}{total}{' '}{_t('done')}</span>
        </div>
      )}
      {openToday.length ? <div class="list">{openToday.map((t) => <TaskRow t={t} hideDate />)}</div> : (
        <div class="today-empty">
          <span class={'mini-ic ' + (doneToday.length ? 't-green' : 't-accent')}><Icon name={doneToday.length ? 'check' : 'sun'} size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">{doneToday.length ? _t('All done for today') : _t('Nothing due today')}</div>
            <div class="row-meta">{inbox.length ? _t('{0} task{1} in Inbox without a date.', [inbox.length, inbox.length === 1 ? '' : 's']) : _t('Type one in the box above, or block time in Calendar.')}</div>
          </div>
          {inbox.length > 0 && <button class="btn sm soft" onClick={planInbox}>{_t('Plan from Inbox')}</button>}
        </div>
      )}
      {doneToday.length > 0 && (
        <details class="done-today">
          <summary>{_t('Completed today (')}{doneToday.length})</summary>
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
    ...M.freelanceAgenda(t0, t0, true).filter((f) => f.overdue).map((f) => ({ kind: 'freelance', id: 'late:' + f.kind + (f.project?.id || f.invoice?.id), f, tone: 't-red', overdue: true, timeLabel: _t('Late'),
      title: f.kind === 'invoice' ? _t('Follow up {0}', [f.invoice.number]) : f.project.name, sub: f.kind === 'invoice' ? _t('{0} · {1} unpaid since {2}', [M.clientName(f.invoice.clientId), fmtMoney(f.calc.balance, f.invoice.currency), fmtShort(f.date)]) : _t('Delivery was due {0}', [relDayLower(f.date)]) })),
    ...M.contentActions(t0).filter((a) => a.overdue).map((a) => ({ kind: 'content', id: 'late:' + a.content.id + a.stage.id, c: a.content, stage: a.stage.id, tone: 't-red', overdue: true, timeLabel: _t('Late'),
      title: `${a.stage.verb}: ${a.content.title}`, sub: _t('Content · was due {0}', [relDayLower(a.date)]) })),
  ];
  const n = late.length + allDay.length + timed.length;
  return (
    <div class="card">
      <div class="card-head">
        <div class="card-title">{_t('Schedule')}{' '}{n > 0 && <span class="count">{n}</span>}</div>
        <a class="section-link" href={'#/calendar?d=' + t0 + '&v=day'}>{_t('Calendar')}</a>
      </div>
      {n ? <AgendaList d={t0} allDay={[...late, ...allDay]} timed={timed} /> : (
        <div class="today-empty">
          <span class="mini-ic t-violet"><Icon name="calendar" size={18} /></span>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">{_t('Nothing on the clock')}</div>
            <div class="row-meta">{_t('Give a task a time, or plan a shoot or upload. It lines up here.')}</div>
          </div>
          <a class="btn sm soft" href={'#/calendar?d=' + t0 + '&v=day'}>{_t('Open')}</a>
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
        <div class="card-title"><Icon name="review" size={18} style={{ color: 'var(--accent)' }} />{_t('How was today?')}</div>
        {saved ? <span class="save-hint">{saved}</span> : <a class="section-link" href="#/review">{_t('Journal')}</a>}
      </div>
      <TextArea id="today-journal" value={r.journal} onInput={(v) => set({ journal: v })} placeholder={_t('A few lines about today. It goes into your journal and the monthly PDF.')} minRows={3} />
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
    toast(dest === 'today' ? _t('Added to today') : _t('Added to Inbox'));
  };
  return (
    <div class="capture">
      <button class="icon-btn" aria-label={_t('Create something else')} onClick={openQuickAdd}><Icon name="plus" size={20} /></button>
      <button class="capture-dest" onClick={() => setDest(dest === 'today' ? 'inbox' : 'today')} aria-label={_t('Switch where new tasks go')} title={_t('Tap to switch')}>{dest === 'today' ? _t('Today') : _t('Inbox')}<Icon name="chevronDown" size={14} /></button>
      <input id="capture" value={text} placeholder={dest === 'today' ? _t('Add a task') : _t('Capture for later')} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} enterKeyHint="done" />
      <button class="icon-btn accent" aria-label={_t('Add task')} onClick={add}><Icon name="send" size={18} /></button>
    </div>
  );
}

function Recent() {
  const rows = (M.meta('recent', { items: [] }).items || []).map(recentRow).filter(Boolean).slice(0, 8);
  if (!rows.length) return null;
  return (
    <div class="section">
      <div class="section-head"><div class="section-title">{_t('Recently visited')}</div></div>
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
  bits.push(_tn(openToday.length, '{n} task today', '{n} tasks today') + (timed.length ? _t(', first at {0}', [timed[0].dueTime]) : '') + '.');
  const shoots = [...today_.filter((a) => a.stage.id === 'shoot'), ...freelance.filter((f) => f.kind === 'shoot')];
  const uploads = today_.filter((a) => a.stage.id === 'upload');
  if (shoots.length) bits.push(shoots.length === 1 ? _t('A shoot planned.') : _t('{0} shoots planned.', [shoots.length]));
  if (uploads.length) bits.push(_tn(uploads.length, '{n} upload', '{n} uploads') + (uploads[0].time ? _t(' at {0}', [uploads[0].time]) : '') + '.');
  return (
    <div class="nudge">
      <Icon name="coffee" size={22} />
      <div class="grow" style={{ fontSize: 14 }}><b>{_t('Morning brief.')}</b> {bits.join(' ')}</div>
      <button class="icon-btn ghost sm" aria-label={_t('Dismiss')} onClick={() => dismissReminder('morning')}><Icon name="x" size={16} /></button>
    </div>
  );
}

function Welcome() {
  return (
    <div class="card" style={{ background: 'var(--surface)' }}>
      <div class="row gap-12" style={{ alignItems: 'flex-start' }}>
        <span class="mini-ic t-accent" style={{ borderRadius: 12 }}><Icon name="spark" size={18} /></span>
        <div class="grow">
          <div class="card-title">{_t('Welcome,')}{' '}{M.settings().name}</div>
          <div class="muted" style={{ fontSize: 14, marginTop: 4 }}>{_t('Everything here is saved on this device. Want to look around with example data first? It is labeled as sample and you can remove it in one tap from Settings.')}</div>
          <div class="row gap-8 wrap" style={{ marginTop: 12 }}>
            <button class="btn sm primary" onClick={() => { loadSampleData(); toast(_t('Sample data loaded')); }}>{_t('Load sample data')}</button>
            <button class="btn sm soft" onClick={() => put('meta', { id: 'onboarding', done: true })}>{_t('Start empty')}</button>
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
      <SheetHead title={_t('Needs attention')} onClose={close} />
      <SheetBody>
        <div class="col gap-12">
          {rem.morningDue && <div class="nudge"><Icon name="coffee" size={20} /><div class="grow">{_t('Morning brief at')}{' '}{rem.morningTime}{_t('. Check today\'s tasks and uploads.')}</div></div>}
          {rem.eveningDue && <div class="nudge blue"><Icon name="moonStars" size={20} /><div class="grow">{_t('Daily review is open from')}{' '}{rem.eveningTime}.</div><button class="btn sm primary" onClick={() => { dismissReminder('evening'); go('/review'); }}>{_t('Review')}</button></div>}
          {!overdue.length && !fl.length && !ca.length && <Empty icon="check" title={_t('All clear')}>{_t('Nothing overdue and nothing waiting on you right now.')}</Empty>}
          {overdue.length > 0 && <div class="card soft tight"><div class="card-title" style={{ marginBottom: 6 }}>{overdue.length}{' '}{_t('overdue task')}{overdue.length === 1 ? '' : 's'}</div><div class="list">{overdue.slice(0, 6).map((t) => <TaskRow t={t} />)}</div></div>}
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
          <div class="muted" style={{ fontSize: 12.5 }}>{_t('Reminders show inside the app at')}{' '}{rem.morningTime}{' '}{_t('and')}{' '}{rem.eveningTime}{_t('. Change them in Settings.')}</div>
        </div>
      </SheetBody>
    </>
  );
}

// =====================================================================
// TASKS
// =====================================================================
const VIEWS = [{ id: 'today', get label() { return _t('Today'); } }, { id: 'upcoming', get label() { return _t('Upcoming'); } }, { id: 'inbox', get label() { return _t('Inbox'); } }, { id: 'overdue', get label() { return _t('Overdue'); } }, { id: 'all', get label() { return _t('All open'); } }, { id: 'done', get label() { return _t('Done'); } }, { id: 'other', get label() { return _t('Deferred & cancelled'); } }, { id: 'archived', get label() { return _t('Archived'); } }];
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
      <PageHeader title={_t('Tasks')} actions={<button class="btn primary" onClick={() => openTaskSheet(null, { dueDate: view === 'today' ? t0 : '', category: cat || s.defaultCategory })}><Icon name="plus" size={18} />{_t('New task')}</button>} />
      <div class="chips scroll">
        {VIEWS.map((v) => <button class={'chip ' + (view === v.id ? 'on' : '')} onClick={() => setView(v.id)}>{v.label}{counts[v.id] != null && counts[v.id] > 0 && <span class="chip-count">{counts[v.id]}</span>}</button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="task-q" value={q} placeholder={_t('Search tasks')} onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label={_t('Clear search')} onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (filtersOn && !q ? 'dark' : '')} aria-label={_t('Filters')} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="filter" size={18} /></button>
        <button class="icon-btn" aria-label={_t('Sort')} onClick={(e) => openMenu(e, [{ heading: _t('Sort by') }, ...[['smart', _t('Smart (status, date, priority)')], ['due', _t('Due date')], ['priority', _t('Priority')], ['manual', _t('Manual (drag to reorder)')], ['created', _t('Newest first')], ['title', _t('Title A–Z')]].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>
      </div>
      {showFilters && (
        <div class="card tight">
          <div class="form">
            <Field label={_t('Category')}><Chips allowEmpty options={s.categories.map((c) => ({ id: c, label: c, dot: `var(--${catTone(c)})` }))} value={cat} onChange={(v) => setCat(v === cat ? '' : v)} /></Field>
            <div class="form-row">
              <Field label={_t('Priority')} htmlFor="f-prio"><Select id="f-prio" value={prio} onChange={setPrio} placeholder={_t('Any')} options={M.PRIORITIES} /></Field>
              <Field label={_t('Linked to')} htmlFor="f-link"><Select id="f-link" value={link} onChange={setLink} placeholder={_t('Anything')} options={[{ id: 'goal', label: _t('Any goal') }, { id: 'content', label: _t('Any content') }, { id: 'project', label: _t('Any project') }, { id: 'invoice', label: _t('Any invoice') }, { id: 'none', label: _t('Not linked') }, ...M.activeGoals().map((g) => ({ id: 'g:' + g.id, label: _t('Goal: {0}', [g.title]) })), ...M.liveProjects().filter((p) => !p.archived).map((p) => ({ id: 'p:' + p.id, label: _t('Project: {0}', [p.name]) }))]} /></Field>
            </div>
            {filtersOn && <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => { setCat(''); setPrio(''); setLink(''); setQ(''); }}>{_t('Clear filters')}</button>}
          </div>
        </div>
      )}
      <div class="card">
        {!['done', 'other', 'archived', 'overdue'].includes(view) && (
          <div class="cl-add" style={{ padding: '0 4px 8px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <Icon name="plus" size={18} class="muted" />
            <input class="cl-text" id="task-quick" value={draft} placeholder={view === 'inbox' ? _t('Capture to Inbox') : view === 'today' ? _t('Add a task for today') : view === 'upcoming' ? _t('Add a task for tomorrow') : _t('Add a task')} onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addQuick(); } }} />
            {draft.trim() && <button class="btn sm primary" onClick={addQuick}>{_t('Add')}</button>}
          </div>
        )}
        {list.length === 0 ? (
          <Empty icon={view === 'inbox' ? 'inbox' : 'check'} title={filtersOn ? _t('No tasks match these filters') : view === 'today' ? _t('Nothing due today') : view === 'inbox' ? _t('Inbox is empty') : view === 'overdue' ? _t('Nothing overdue') : _t('No tasks here')}>
            {view === 'inbox' && !filtersOn ? _t('Things you capture without a date land here until you plan them.') : null}
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
      {view === 'archived' && list.length > 0 && <div class="muted" style={{ fontSize: 13 }}>{_t('Archived tasks stay out of every list. Open one and use the menu to reopen it, or restore below.')}</div>}
      {view === 'archived' && list.map((t) => null)}
      {view === 'archived' && list.length > 0 && <button class="btn soft" onClick={() => { list.forEach((t) => patch('tasks', t.id, { archived: false })); toast(_t('Restored')); }}>{_t('Restore all archived')}</button>}
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
      <PageHeader title={_t('Goals')} actions={<button class="btn primary" onClick={() => openGoalSheet()}><Icon name="plus" size={18} />{_t('New goal')}</button>}>
        <div class="muted" style={{ marginTop: 6 }}>{_t('Week of')}{' '}{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}{_t('. Keep it to')}{' '}{s.weeklyGoalLimit}{' '}{_t('weekly goals or fewer.')}</div>
      </PageHeader>
      <Segmented options={[{ id: 'active', label: _t('Active'), count: all('goals').filter((g) => g.status === 'active' && !g.deletedAt).length }, { id: 'completed', label: _t('Completed') }, { id: 'archived', label: _t('Archived') }]} value={tab} onChange={setTab} />
      {activeWeekly.length > s.weeklyGoalLimit && tab === 'active' && <div class="nudge"><Icon name="bulb" size={20} /><div>{_t('You have')}{' '}{activeWeekly.length}{' '}{_t('weekly goals. Fewer goals usually means more of them get done.')}</div></div>}
      {!goals.length && <div class="card"><Empty icon="target" title={tab === 'active' ? _t('No active goals') : (tab === 'weekly' ? _t('No weekly goals yet') : tab === 'monthly' ? _t('No monthly goals yet') : _t('No goals yet'))} action={tab === 'active' && <button class="btn primary sm" onClick={() => openGoalSheet()}>{_t('Set a weekly goal')}</button>}>{tab === 'active' ? _t('Pick one to three outcomes for this week, then turn each into a few tasks.') : null}</Empty></div>}
      {weekly.length > 0 && <div class="section"><div class="section-head"><div class="section-title">{_t('Weekly')}</div></div>{weekly.map((g) => <GoalCard g={g} />)}</div>}
      {longer.length > 0 && <div class="section"><div class="section-head"><div class="section-title">{_t('Monthly & longer')}</div></div>{longer.map((g) => <GoalCard g={g} />)}</div>}
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
          <div class="row gap-6 wrap"><span class="badge sm t-yellow">{g.period === 'weekly' ? _t('Weekly') : g.period === 'monthly' ? _t('Monthly') : _t('Custom')}</span>{ended && <span class="badge sm t-red">{_t('Period ended')}</span>}{g.status === 'completed' && <span class="badge sm t-green">{_t('Completed')}</span>}</div>
          <div class="card-title" style={{ marginTop: 6, fontSize: 17 }}>{g.title}</div>
          {g.description && <div class="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{g.description}</div>}
          <div class="row-meta" style={{ marginTop: 4 }}>{p.label}{g.startDate ? ` · ${fmtShort(g.startDate)} – ${fmtShort(g.endDate)}` : ''}</div>
        </div>
        <button class="icon-btn ghost sm" aria-label={_t('Goal actions')} onClick={(e) => openMenu(e, [
          { label: _t('Edit'), icon: 'edit', onSelect: () => openGoalSheet(g.id) },
          g.status !== 'completed' && { label: _t('Mark completed'), icon: 'check', onSelect: () => { patch('goals', g.id, { status: 'completed', completedAt: Date.now() }); toast(_t('Goal completed')); } },
          g.status !== 'active' && { label: _t('Make active again'), icon: 'restore', onSelect: () => patch('goals', g.id, { status: 'active' }) },
          g.status !== 'archived' && { label: _t('Archive'), icon: 'archive', onSelect: () => patch('goals', g.id, { status: 'archived' }) },
          { label: _t('Delete'), icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: _t('Delete this goal?'), body: _t('Linked tasks stay, they just lose the link.'), confirmLabel: _t('Delete'), danger: true })) { all('tasks').filter((t) => t.goalId === g.id).forEach((t) => patch('tasks', t.id, { goalId: '' })); remove('goals', g.id); toast(_t('Goal deleted')); } } },
        ], { title: g.title })}><Icon name="more" /></button>
      </div>
      {g.method === 'numeric' && g.status === 'active' && (
        <div class="row gap-8" style={{ marginTop: 14 }}>
          <button class="icon-btn soft sm" aria-label={_t('Decrease')} onClick={() => patch('goals', g.id, { current: Math.max(0, (+g.current || 0) - 1) })}><span style={{ fontWeight: 800, fontSize: 18 }}>−</span></button>
          <Progress pct={p.pct} />
          <button class="icon-btn dark sm" aria-label={_t('Increase')} onClick={() => patch('goals', g.id, { current: (+g.current || 0) + 1 })}><Icon name="plus" size={16} /></button>
        </div>
      )}
      {g.method === 'manual' && g.status === 'active' && (
        <div class="row gap-10" style={{ marginTop: 14 }}>
          <input type="range" min="0" max="100" step="5" value={+g.manual || 0} onInput={(e) => patch('goals', g.id, { manual: +e.currentTarget.value })} style={{ flex: 1, accentColor: 'var(--accent)' }} aria-label={_t('Progress percent')} />
          <span class="tnum" style={{ fontWeight: 800, width: 42, textAlign: 'right' }}>{+g.manual || 0}%</span>
        </div>
      )}
      {g.method === 'tasks' && (
        <div style={{ marginTop: 12 }}>
          {tasks.length > 0 && <button class="section-link" style={{ fontWeight: 700 }} onClick={() => setOpen(!open)}>{open ? _t('Hide tasks') : _t('Show {0} task{1}', [tasks.length, tasks.length === 1 ? '' : 's'])}</button>}
          {open && <div class="list">{tasks.map((t) => <TaskRow t={t} />)}</div>}
          {g.status === 'active' && (
            <div class="row gap-8 wrap" style={{ marginTop: 8 }}>
              <button class="btn sm soft" onClick={() => openTaskSheet(null, { goalId: g.id, dueDate: today() })}><Icon name="plus" size={15} />{_t('New task')}</button>
              <button class="btn sm ghost" onClick={() => pickTask({ title: _t('Link a task'), filter: (t) => t.goalId !== g.id, allowNew: false, onPick: (t) => { patch('tasks', t.id, { goalId: g.id }); toast(_t('Linked to goal')); } })}><Icon name="link" size={15} />{_t('Link existing')}</button>
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
    if (!g.title.trim()) return toast(_t('Name the goal first.'), { tone: 'warn' });
    if (g.endDate && g.startDate && g.endDate < g.startDate) return toast(_t('End date is before the start date.'), { tone: 'warn' });
    put('goals', { ...g, id: ex?.id || uid(), title: g.title.trim() });
    toast(ex ? _t('Goal saved') : _t('Goal added'));
    close();
  };
  return (
    <>
      <SheetHead title={ex ? _t('Edit goal') : _t('New goal')} onClose={close} />
      <SheetBody>
        <div class="form">
          <Field label={_t('Goal')} htmlFor="g-title"><TextInput id="g-title" value={g.title} onInput={(v) => set({ title: v })} placeholder={_t('e.g. Publish 4 Reels')} autoFocus={!ex} /></Field>
          <Field label={_t('Definition of done')} htmlFor="g-desc"><TextArea id="g-desc" value={g.description} onInput={(v) => set({ description: v })} placeholder={_t('How will you know it\'s done?')} /></Field>
          <Field label={_t('Period')}><Chips options={[{ id: 'weekly', label: _t('This week') }, { id: 'monthly', label: _t('This month') }, { id: 'custom', label: _t('Custom') }]} value={g.period} onChange={(v) => set({ period: v, ...(v !== 'custom' ? periodDates(v) : {}) })} /></Field>
          <div class="form-row">
            <Field label={_t('Start')} htmlFor="g-start"><DateInput id="g-start" value={g.startDate} onChange={(v) => set({ startDate: v, period: 'custom' })} clearable={false} /></Field>
            <Field label={_t('End')} htmlFor="g-end"><DateInput id="g-end" value={g.endDate} onChange={(v) => set({ endDate: v, period: 'custom' })} clearable={false} /></Field>
          </div>
          <Field label={_t('Track progress by')}><Segmented options={[{ id: 'tasks', label: _t('Linked tasks') }, { id: 'numeric', label: _t('A number') }, { id: 'manual', label: _t('Manual %') }]} value={g.method} onChange={(v) => set({ method: v })} /></Field>
          {g.method === 'numeric' && (
            <div class="form-row three">
              <Field label={_t('Target')} htmlFor="g-target"><NumberInput id="g-target" value={g.target} onChange={(v) => set({ target: v })} placeholder="4" /></Field>
              <Field label={_t('Current')} htmlFor="g-cur"><NumberInput id="g-cur" value={g.current} onChange={(v) => set({ current: v })} /></Field>
              <Field label={_t('Unit')} htmlFor="g-unit"><TextInput id="g-unit" value={g.unit} onInput={(v) => set({ unit: v })} placeholder={_t('posts')} /></Field>
            </div>
          )}
          {g.method === 'tasks' && <div class="field-hint">{_t('Progress counts each linked task once, when it\'s done. Add tasks from the goal card after saving.')}</div>}
          <Field label={_t('Notes / review')} htmlFor="g-notes"><TextArea id="g-notes" value={g.notes} onInput={(v) => set({ notes: v })} placeholder={_t('What helped, what got in the way')} /></Field>
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>{_t('Cancel')}</button><button class="btn primary" onClick={save}>{ex ? _t('Save') : _t('Add goal')}</button></SheetFoot>
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
      <PageHeader title={_t('Monthly journal')} />
      <MonthlyReview month={date} />
    </div>
  );
  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="review" />
      <PageHeader title={_t('Daily journal')} actions={<a class="btn sm soft" href="#/review/monthly"><Icon name="file" size={15} />{_t('Monthly PDF')}</a>} />
      <DailyReview date={date} />
    </div>
  );
}
function BackRow() {
  return <a class="set-back" style={{ display: 'inline-flex' }} href="#/review"><Icon name="chevronLeft" size={18} />{_t('Daily journal')}</a>;
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
        <button class="icon-btn" aria-label={_t('Previous day')} onClick={() => go(addDays(d, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{relDay(d)}</div><div class="muted" style={{ fontSize: 13 }}>{fmtFull(d)}</div></div>
        <button class="icon-btn" aria-label={_t('Next day')} disabled={d >= t0} onClick={() => go(addDays(d, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="card journal-card">
        <div class="card-head"><div class="card-title">{_t('How was today?')}</div><span class="save-hint">{saved}</span></div>
        <TextArea id="dr-journal" value={r.journal} onInput={(v) => set({ journal: v })} placeholder={_t('Write anything: what happened, how it felt, what you noticed.')} minRows={8} />
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
    catch (e) { toast(e.message || _t('Could not make the PDF.'), { tone: 'warn' }); }
    setBusy('');
  };
  const toDrive = async () => {
    setBusy('drive');
    try { const r = await saveJournal(ym); toast(_t('Saved to Google Drive · {0}', [r.path])); }
    catch (e) { toast(e.message || _t('Could not save to Google Drive.'), { tone: 'warn', duration: 6000 }); }
    setBusy('');
  };

  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label={_t('Previous month')} onClick={() => go(addMonths(ym, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{monthLabel(ym)}</div><div class="muted" style={{ fontSize: 13 }}>{ym === cur ? _t('This month') : ym === addMonths(cur, -1) ? _t('Last month') : ''}</div></div>
        <button class="icon-btn" aria-label={_t('Next month')} disabled={ym >= cur} onClick={() => go(addMonths(ym, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">{_t('Days written')}</div><div class="stat-value">{d.days.length}</div></div>
        <div class="stat"><div class="stat-label">{_t('Tasks done')}</div><div class="stat-value">{d.doneCount}</div></div>
        <div class="stat"><div class="stat-label">{_t('Uploads')}</div><div class="stat-value">{d.uploads}</div></div>
        <div class="stat"><div class="stat-label">{_t('Words written')}</div><div class="stat-value">{d.days.reduce((n, x) => n + ((x.review.journal || '').trim().match(/\S+/g) || []).length, 0).toLocaleString('id-ID')}</div></div>
      </div>
      <div class="card export-card">
        <div class="export-icon"><Icon name="file" size={22} /></div>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row-title">{_t('Daily Review -')}{' '}{monthLabel(ym)}{_t('.pdf')}</div>
          <div class="row-meta">{saved ? <>{_t('Saved to Drive')}{' '}{fmtAgo(saved.at)}{saved.url && <> · <a href={saved.url} target="_blank" rel="noopener">{_t('Open')}</a></>}</> : (d.days.length ? (d.habits.length ? _t('{0} daily review(s) + habits in one PDF', [d.days.length]) : _t('{0} daily review(s) in one PDF', [d.days.length])) : d.habits.length ? _t('Habit recap in one PDF') : _t('No reviews yet')) + ` · Saves to Daily Review / ${ym.slice(0, 4)} / ${monthLabel(ym).split(' ')[0]}`}</div>
        </div>
        <div class="export-actions">
          <button class="btn sm ghost" disabled={!!busy} onClick={download}><Icon name="download" size={15} />{busy === 'pdf' ? _t('Making…') : _t('PDF')}</button>
          <button class="btn sm primary" disabled={!!busy || (!d.days.length && !d.habits.length)} onClick={() => (sync.user ? toDrive() : navigate('/settings/account'))}><Icon name="upload" size={15} />{busy === 'drive' ? _t('Saving…') : saved ? _t('Save again') : _t('Save to Drive')}</button>
        </div>
      </div>
      {d.habits.length > 0 && (
        <a class="card hb-review-link" href={'#/habits?view=month' + (ym !== cur ? '&m=' + ym : '')}>
          <div class="export-icon"><Icon name="habit" size={22} /></div>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="row-title">{_t('Habits ·')}{' '}{d.habitPct}{_t('% consistent')}</div>
            <div class="row-meta">{d.habits.map((x) => x.h.title + ' ' + x.r.pct + '%').join(' · ')}</div>
          </div>
          <Icon name="chevronRight" size={18} />
        </a>
      )}
      {d.days.length ? (
        <div class="col gap-12">{d.days.map((x) => (
          <a class="card journal-day" href={'#/review?d=' + x.date}>
            <div class="row between gap-8"><div class="card-title">{fmtDay(x.date)}</div>{x.review.energy ? <span class="badge sm t-orange">{ENERGY[x.review.energy - 1]}</span> : null}</div>
            {x.review.journal && <div class="jd-line">{x.review.journal}</div>}
            {x.done.length > 0 && <div class="jd-line"><span class="jd-label">{_t('Done')}</span>{x.done.map((t) => t.title).join(', ')}</div>}
            {x.review.wins && <div class="jd-line"><span class="jd-label">{_t('Wins')}</span>{x.review.wins}</div>}
            {x.review.blockers && <div class="jd-line"><span class="jd-label">{_t('Blockers')}</span>{x.review.blockers}</div>}
            {x.review.lesson && <div class="jd-line"><span class="jd-label">{_t('Lesson')}</span>{x.review.lesson}</div>}
          </a>
        ))}</div>
      ) : <div class="card"><Empty icon="review" title={_t('No journal entries this month')}>{_t('Write a few lines on Today or in Daily journal. Every entry this month lands here and in the PDF.')}</Empty></div>}
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
      <div class="grow" style={{ fontSize: 14 }}><b>{monthLabel(ym)}{' '}{_t('journal is ready.')}</b> <span class="muted">{_t('Save all of last month\'s daily reviews to Google Drive as one PDF.')}</span></div>
      <button class="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); try { await saveJournal(ym); toast(_t('{0} journal saved to Google Drive', [monthLabel(ym)])); } catch (e) { toast(e.message || _t('Could not save to Google Drive.'), { tone: 'warn', duration: 6000 }); } setBusy(false); }}>{busy ? _t('Saving…') : _t('Save to Drive')}</button>
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
      <div class="grow" style={{ fontSize: 14 }}><b>{_t('Turn on sync.')}</b> <span class="muted">{_t('Sign in once so your data is backed up and shows on every device.')}</span></div>
      <button class="btn sm primary" onClick={() => navigate('/settings/account')}>{_t('Sign in')}</button>
      <button class="icon-btn ghost sm" aria-label={_t('Hide')} onClick={() => { setHidden(true); try { localStorage.setItem('vz:hideSyncNudge', '1'); } catch {} }}><Icon name="x" size={16} /></button>
    </div>
  );
}
