import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, Chips, Segmented, Progress, Ring, Empty, NumberInput } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { TaskRow, PageHeader, SubNav, DAILY_NAV, openTaskSheet, pickTask, togglePlan, catTone, Dot, ContentBadge, fmtAgo } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, addDays, diffDays, relDay, relDayLower, fmtDay, fmtLong, fmtShort, greeting, isoOf, startOfWeek, fmtFull, nowParts, fmtMinutes } from '../lib/date.js';
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
  const s = M.settings();
  const t0 = today();
  const tasks = M.liveTasks();
  const plan = M.validPlan(t0);
  const pinned = new Set([plan.main?.id, ...plan.keys.map((k) => k.id)].filter(Boolean));
  const openToday = M.sortTasks(tasks.filter((t) => M.isOpen(t) && t.dueDate === t0));
  const overdue = M.sortTasks(tasks.filter((t) => M.isOpen(t) && t.dueDate && t.dueDate < t0));
  const doneToday = tasks.filter((t) => M.taskDoneOn(t, t0));
  const inbox = tasks.filter((t) => M.isOpen(t) && !t.dueDate);
  const contentActs = M.contentActions(t0);
  const freelance = M.freelanceAgenda(t0, t0, true);
  const timed = openToday.filter((t) => t.dueTime && !pinned.has(t.id));
  const restToday = openToday.filter((t) => !pinned.has(t.id) && !t.dueTime);
  const next = [...overdue, ...openToday].find((t) => !pinned.has(t.id) && t.status !== 'in_progress') || null;
  const agendaCount = contentActs.length + freelance.length + timed.length;
  const remaining = openToday.length + contentActs.filter((a) => !a.overdue).length + freelance.filter((f) => !f.overdue).length;
  const rem = reminderState();
  const empty = !tasks.length && !M.liveContents().length && !M.liveProjects().length && !M.meta('onboarding', {}).done;
  const hasSample = tasks.some((t) => t.sample) || M.liveContents().some((c) => c.sample) || M.liveClients().some((c) => c.sample);
  const attention = overdue.length + freelance.filter((f) => f.overdue).length + contentActs.filter((a) => a.overdue).length;

  return (
    <div class="page">
      <div class="topbar">
        <button class="avatar" aria-label="Settings" onClick={() => navigate('/settings')}>{(s.name || 'D')[0].toUpperCase()}</button>
        <div class="topbar-text">
          <div class="hello">{greeting()}, {s.name}</div>
          <div class="hello-sub">{fmtDay(t0)} · {remaining ? `${remaining} thing${remaining === 1 ? '' : 's'} today` : 'Nothing scheduled'}</div>
        </div>
        <button class="icon-btn glass hide-desktop" aria-label="Search" onClick={openSearch}><Icon name="search" /></button>
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
      {rem.morning && <MorningBrief openToday={openToday} contentActs={contentActs} />}
      {rem.evening && (
        <div class="nudge blue">
          <Icon name="moonStars" size={22} />
          <div class="grow"><b>Time to close the day.</b> <span class="muted">Two minutes: wins, what's left, and tomorrow's main priority.</span></div>
          <button class="btn sm primary" onClick={() => { dismissReminder('evening'); navigate('/review'); }}>Review</button>
          <button class="icon-btn ghost sm" aria-label="Dismiss" onClick={() => dismissReminder('evening')}><Icon name="x" size={16} /></button>
        </div>
      )}

      <div class="hero">
        <HeroArt />
        <h1 class="hero-title">Your day,<br /><span class="soft">in focus.</span></h1>
        <Capture />
      </div>

      <div class="two-col">
        <div class="stack">
          <MainPriority plan={plan} />
          <KeyTasks plan={plan} />
          {next && (
            <div class="card tight">
              <div class="row gap-12">
                <span class="mini-ic t-accent" style={{ borderRadius: 12 }}><Icon name="play" size={16} /></span>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="eyebrow">Up next</div>
                  <div class="row-title ellipsis" style={{ cursor: 'pointer' }} onClick={() => openTaskSheet(next.id)}>{next.title}</div>
                </div>
                <button class="btn sm primary" onClick={() => M.startFocus(next.id)}>Start</button>
              </div>
            </div>
          )}

          <div class="section">
            <div class="section-head"><div class="section-title">Scheduled today</div><span class="section-link">{agendaCount ? `${agendaCount} scheduled` : ''}</span></div>
            {agendaCount === 0 && <div class="card"><Empty icon="calendar" title="No shoots, uploads or deadlines today">Content stages, shoot dates, deliveries and invoice due dates show up here on their day.</Empty></div>}
            {freelance.map((f) => <FreelanceEvent f={f} />)}
            {contentActs.map((a) => <ContentEvent a={a} />)}
            {timed.map((t) => (
              <div class="ev">
                <div class="ev-time">{t.dueTime}{t.estimate ? ` · ${fmtMinutes(t.estimate)}` : ''}</div>
                <div class="ev-title" onClick={() => openTaskSheet(t.id)} style={{ cursor: 'pointer' }}>{t.title}</div>
                <div class="ev-sub">Task · {t.category}</div>
                <button class="icon-btn dark ev-go" aria-label="Start focus" onClick={() => M.startFocus(t.id)}><Icon name="play" size={15} /></button>
                <div class="ev-foot"><span class="pill-time">Today / {t.dueTime}</span><button class="btn sm soft" onClick={() => { M.completeTask(t.id); toast('Task done'); }}><Icon name="check" size={15} />Done</button></div>
              </div>
            ))}
          </div>

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

          <div class="card">
            <div class="card-head">
              <div class="card-title">Today's tasks <span class="count">{restToday.length}</span></div>
              <button class="btn sm soft" onClick={() => openTaskSheet(null, { dueDate: t0 })}><Icon name="plus" size={16} />Task</button>
            </div>
            {restToday.length ? <div class="list">{restToday.map((t) => <TaskRow t={t} hideDate />)}</div> : <div class="muted" style={{ fontSize: 14, padding: '4px 2px 8px' }}>{openToday.length ? 'Everything left is in your priorities above.' : 'Nothing else due today.'}{inbox.length ? <> You have <a href="#/tasks?view=inbox">{inbox.length} in Inbox</a> to plan.</> : ''}</div>}
            {doneToday.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary class="muted" style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>Completed today ({doneToday.length})</summary>
                <div class="list">{doneToday.map((t) => <TaskRow t={t} hideDate />)}</div>
              </details>
            )}
          </div>
        </div>

        <div class="stack">
          <WeeklyGoals />
          <Upcoming />
          <Recent />
        </div>
      </div>
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

function MainPriority({ plan }) {
  const t0 = today();
  const t = plan.main;
  const pick = () => pickTask({ title: 'Main priority for today', onPick: (x) => togglePlan(x, 'main', t0) });
  const focusing = t && M.meta('focus', {}).taskId === t.id;
  return (
    <div class="card">
      <div class="card-head"><div class="card-title"><Icon name="target" size={18} style={{ color: 'var(--accent)' }} />Main priority</div>{t && <button class="icon-btn ghost sm" aria-label="Change main priority" onClick={(e) => openMenu(e, [{ label: 'Change', icon: 'edit', onSelect: pick }, { label: 'Clear', icon: 'x', onSelect: () => M.setDayPlan(t0, { mainTaskId: '' }) }])}><Icon name="more" /></button>}</div>
      {t ? (
        <div class={'priority ' + (t.status === 'done' ? 'done' : '')}>
          <Check checked={t.status === 'done'} onChange={(v) => (v ? (M.completeTask(t.id), toast('Main priority done. That was the big one.')) : M.reopenTask(t.id))} tone="accent" />
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="priority-title" onClick={() => openTaskSheet(t.id)} style={{ cursor: 'pointer' }}>{t.title}</div>
            <div class="task-meta" style={{ marginTop: 6 }}>
              {t.category && <span class="m"><Dot tone={catTone(t.category)} />{t.category}</span>}
              {t.estimate > 0 && <span class="m"><Icon name="clock" />{fmtMinutes(t.estimate)}</span>}
              {t.dueTime && <span class="m">{t.dueTime}</span>}
            </div>
          </div>
          {t.status !== 'done' && !focusing && <button class="icon-btn dark" aria-label="Start focus on main priority" onClick={() => M.startFocus(t.id)}><Icon name="arrow" size={18} /></button>}
        </div>
      ) : (
        <button class="slot-empty" onClick={pick}><Icon name="plus" size={18} />Choose the one thing that makes today a win</button>
      )}
    </div>
  );
}

function KeyTasks({ plan }) {
  const t0 = today();
  const keys = plan.keys;
  const pick = () => pickTask({ title: 'Add a key task', filter: (x) => x.id !== plan.main?.id && !keys.some((k) => k.id === x.id), onPick: (x) => togglePlan(x, 'key', t0) });
  return (
    <div class="card">
      <div class="card-head"><div class="card-title">Key tasks <span class="count">{keys.length}/3</span></div></div>
      <div class="list">
        {keys.map((t) => <TaskRow t={t} hideDate />)}
      </div>
      {keys.length < 3 && <button class="slot-empty" style={{ marginTop: keys.length ? 8 : 0 }} onClick={pick}><Icon name="plus" size={18} />{keys.length ? 'Add another key task' : 'Pick up to 3 key tasks'}</button>}
    </div>
  );
}

function ContentEvent({ a }) {
  const c = a.content;
  const time = a.time || '';
  return (
    <div class={'ev ' + (a.overdue ? 'over' : '')}>
      <div class="ev-time">{a.overdue ? <span style={{ color: 'var(--bad)' }}>Overdue · {relDay(a.date)}</span> : time || 'Any time today'}</div>
      <div class="ev-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/content/item/' + c.id)}>{a.stage.verb}: {c.title}</div>
      <div class="ev-sub">Content{c.pillar ? ' · ' + c.pillar : ''}{(c.platforms || []).length ? ' · ' + c.platforms.join(', ') : ''}</div>
      <button class="icon-btn dark ev-go" aria-label="Open content" onClick={() => navigate('/content/item/' + c.id)}><Icon name="arrow" size={16} /></button>
      <div class="ev-foot">
        <span class="pill-time">{a.overdue ? fmtShort(a.date) : 'Today'} / {a.stage.label}</span>
        <button class="btn sm soft" onClick={() => { M.completeStage(c, a.stage.id); toast(a.stage.id === 'upload' ? 'Marked uploaded' : `${a.stage.label} done`); }}><Icon name="check" size={15} />{a.stage.id === 'upload' ? 'Uploaded' : 'Done'}</button>
      </div>
    </div>
  );
}

function FreelanceEvent({ f }) {
  if (f.kind === 'invoice') {
    const i = f.invoice;
    return (
      <div class={'ev ' + (f.overdue ? 'over' : '')}>
        <div class="ev-time">{f.overdue ? <span style={{ color: 'var(--bad)' }}>Overdue since {fmtShort(i.dueDate)}</span> : 'Due today'}</div>
        <div class="ev-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/freelance/invoices/' + i.id)}>Follow up {i.number}</div>
        <div class="ev-sub">{M.clientName(i.clientId)} · {fmtMoney(f.calc.balance, i.currency)} unpaid</div>
        <button class="icon-btn dark ev-go" aria-label="Open invoice" onClick={() => navigate('/freelance/invoices/' + i.id)}><Icon name="arrow" size={16} /></button>
        <div class="ev-foot"><span class="pill-time">{f.label}</span>
          <button class="btn sm soft" onClick={() => openTaskSheet(null, { title: `Follow up ${i.number} with ${M.clientName(i.clientId)}`, invoiceId: i.id, projectId: i.projectId || '', category: 'Freelance', dueDate: today() })}><Icon name="plus" size={15} />Task</button>
        </div>
      </div>
    );
  }
  const p = f.project;
  return (
    <div class={'ev ' + (f.overdue ? 'over' : '')}>
      <div class="ev-time">{f.overdue ? <span style={{ color: 'var(--bad)' }}>Was due {relDay(f.date)}</span> : f.kind === 'shoot' ? 'Shoot day' : 'Delivery due today'}{p.location ? ' · ' + p.location : ''}</div>
      <div class="ev-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/freelance/projects/' + p.id)}>{p.name}</div>
      <div class="ev-sub">{M.clientName(p.clientId)}{p.type ? ' · ' + p.type : ''}</div>
      <button class="icon-btn dark ev-go" aria-label="Open project" onClick={() => navigate('/freelance/projects/' + p.id)}><Icon name="arrow" size={16} /></button>
      <div class="ev-foot"><span class="pill-time">Today / {f.label}</span><span class="badge sm">{p.stage}</span></div>
    </div>
  );
}

function WeeklyGoals() {
  const goals = M.activeGoals().sort((a, b) => (a.endDate || '9').localeCompare(b.endDate || '9'));
  return (
    <div class="card">
      <div class="card-head"><div class="card-title">Goals <span class="count">{goals.length}</span></div><a class="section-link" href="#/goals">All goals</a></div>
      {goals.length ? (
        <div class="col gap-12">
          {goals.slice(0, 5).map((g) => {
            const p = M.goalProgress(g);
            return (
              <a href="#/goals" class="row gap-12" style={{ textDecoration: 'none' }}>
                <Ring pct={p.pct} size={42} />
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="row-title ellipsis">{g.title}</div>
                  <div class="row-meta">{p.label}{g.endDate ? ' · ends ' + relDayLower(g.endDate) : ''}</div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <button class="slot-empty" onClick={() => navigate('/goals?new=1')}><Icon name="plus" size={18} />Set a goal for this week</button>
      )}
    </div>
  );
}

function Upcoming() {
  const t0 = today();
  const end = addDays(t0, 7);
  const items = [];
  for (const f of M.freelanceAgenda(addDays(t0, 1), end)) items.push({ date: f.date, title: f.kind === 'invoice' ? `${f.invoice.number} due` : f.project.name, sub: f.kind === 'invoice' ? M.clientName(f.invoice.clientId) : `${f.label} · ${M.clientName(f.project.clientId)}`, icon: f.kind === 'invoice' ? 'file' : 'briefcase', tone: f.kind === 'invoice' ? 't-green' : 't-orange', path: f.kind === 'invoice' ? '/freelance/invoices/' + f.invoice.id : '/freelance/projects/' + f.project.id });
  for (const c of M.upcomingUploads(addDays(t0, 1), 7)) items.push({ date: c.schedule.upload.date, title: c.title, sub: `Upload${c.schedule.upload.time ? ' ' + c.schedule.upload.time : ''} · ${(c.platforms || []).join(', ')}`, icon: 'video', tone: 't-violet', path: '/content/item/' + c.id });
  for (const t of M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate > t0 && t.dueDate <= end && (t.priority === 'high' || t.dueTime))) items.push({ date: t.dueDate, title: t.title, sub: `Task${t.dueTime ? ' · ' + t.dueTime : ''}`, icon: 'tasks', tone: 't-blue', task: t.id });
  items.sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div class="card">
      <div class="card-head"><div class="card-title">Next 7 days</div><a class="section-link" href="#/content/calendar">Calendar</a></div>
      {items.length ? (
        <div class="list">
          {items.slice(0, 8).map((it) => (
            <button class="list-row clickable" onClick={() => (it.task ? openTaskSheet(it.task) : navigate(it.path))}>
              <span class={'mini-ic ' + it.tone}><Icon name={it.icon} size={16} /></span>
              <div class="row-main"><div class="row-title ellipsis">{it.title}</div><div class="row-meta">{it.sub}</div></div>
              <span class="badge sm">{relDay(it.date)}</span>
            </button>
          ))}
        </div>
      ) : <div class="muted" style={{ fontSize: 14 }}>A quiet week ahead. Uploads, shoots, deliveries and invoice dates appear here.</div>}
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

function MorningBrief({ openToday, contentActs }) {
  const goals = M.activeGoals();
  const uploads = contentActs.filter((a) => a.stage.id === 'upload');
  return (
    <div class="nudge">
      <Icon name="coffee" size={22} />
      <div class="grow" style={{ fontSize: 14 }}>
        <b>Morning brief.</b> {openToday.length} task{openToday.length === 1 ? '' : 's'} today{uploads.length ? `, ${uploads.length} upload${uploads.length === 1 ? '' : 's'} planned` : ''}{goals.length ? `, ${goals.length} active goal${goals.length === 1 ? '' : 's'}` : ''}. {M.validPlan(today()).main ? '' : 'Pick a main priority below.'}
      </div>
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
          {rem.morningDue && <div class="nudge"><Icon name="coffee" size={20} /><div class="grow">Morning brief at {rem.morningTime}. Plan your main priority and check today's uploads.</div></div>}
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
  return (
    <div class="page narrow">
      <SubNav items={DAILY_NAV} active="review" />
      <PageHeader title={mode === 'weekly' ? 'Weekly review' : mode === 'monthly' ? 'Monthly journal' : 'Daily review'} actions={<Segmented options={[{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }]} value={mode} onChange={(v) => navigate(v === 'daily' ? '/review' : '/review/' + v)} />} />
      {mode === 'weekly' ? <WeeklyReview start={date} /> : mode === 'monthly' ? <MonthlyReview month={date} /> : <DailyReview date={date} />}
    </div>
  );
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
  const [r, set, saved] = useAutosave('dailyReviews', d, { wins: '', unfinishedNote: '', blockers: '', lesson: '', energy: 0 });
  const tomorrow = addDays(d, 1);
  const done = M.liveTasks().filter((t) => M.taskDoneOn(t, d));
  const unfinished = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate && t.dueDate <= d);
  const published = M.liveContents().filter((c) => c.status === 'published' && c.publishedAt && isoOf(c.publishedAt) === d);
  const payments = all('payments').filter((p) => !p.voided && p.date === d);
  const planT = M.validPlan(tomorrow);
  const past = all('dailyReviews').filter((x) => x.id !== d).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10);
  const go = (iso) => navigate('/review?d=' + iso);
  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label="Previous day" onClick={() => go(addDays(d, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{relDay(d)}</div><div class="muted" style={{ fontSize: 13 }}>{fmtFull(d)}</div></div>
        <button class="icon-btn" aria-label="Next day" disabled={d >= t0} onClick={() => go(addDays(d, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">What got done</div><span class="save-hint">{saved}</span></div>
        {done.length || published.length || payments.length ? (
          <div class="col gap-6" style={{ fontSize: 14 }}>
            {done.map((t) => <div class="row gap-8"><Icon name="check" size={16} style={{ color: 'var(--good)' }} /><span>{t.title}</span></div>)}
            {published.map((c) => <div class="row gap-8"><Icon name="video" size={16} style={{ color: 'var(--t-violet)' }} /><span>Uploaded: {c.title}</span></div>)}
            {payments.map((p) => { const i = get('invoices', p.invoiceId); return <div class="row gap-8"><Icon name="money" size={16} style={{ color: 'var(--good)' }} /><span>Payment {fmtMoney(p.amount, i?.currency)} for {i?.number}</span></div>; })}
          </div>
        ) : <div class="muted" style={{ fontSize: 14 }}>No completed tasks recorded for this day yet.</div>}
        <div style={{ marginTop: 14 }}><Field label="Wins" htmlFor="dr-wins"><TextArea id="dr-wins" value={r.wins} onInput={(v) => set({ wins: v })} placeholder="What went well, even small things" /></Field></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Left unfinished <span class="count">{unfinished.length}</span></div></div>
        {unfinished.length ? <div class="list">{unfinished.map((t) => (
          <div class="list-row">
            <Dot tone={catTone(t.category)} />
            <div class="row-main"><div class="row-title">{t.title}</div><div class="row-meta">{relDay(t.dueDate)}</div></div>
            <button class="btn xs soft" onClick={() => togglePlan(t, 'main', tomorrow)}>{planT.main?.id === t.id ? 'Main ✓' : 'Main'}</button>
            <button class="btn xs soft" onClick={() => togglePlan(t, 'key', tomorrow)}>{planT.keys.some((k) => k.id === t.id) ? 'Key ✓' : 'Key'}</button>
          </div>
        ))}</div> : <div class="muted" style={{ fontSize: 14 }}>Nothing left over. Nice.</div>}
        <div class="form" style={{ marginTop: 14 }}>
          <Field label="Blockers or observations" htmlFor="dr-block"><TextArea id="dr-block" value={r.blockers} onInput={(v) => set({ blockers: v })} placeholder="What slowed you down?" /></Field>
          <Field label="One lesson or note" htmlFor="dr-lesson"><TextArea id="dr-lesson" value={r.lesson} onInput={(v) => set({ lesson: v })} minRows={1} placeholder="Something to remember" /></Field>
          <Field label="Energy">
            <div class="chips">{[1, 2, 3, 4, 5].map((n) => <button class={'chip ' + (r.energy === n ? 'on' : '')} onClick={() => set({ energy: r.energy === n ? 0 : n })} aria-label={'Energy ' + n}>{['Drained', 'Low', 'Okay', 'Good', 'Great'][n - 1]}</button>)}</div>
          </Field>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Plan {relDayLower(tomorrow)}</div></div>
        <div class="col gap-10">
          <div>
            <div class="eyebrow" style={{ marginBottom: 6 }}>Main priority</div>
            {planT.main ? (
              <div class="row gap-8"><div class="priority-title grow" style={{ fontSize: 22 }}>{planT.main.title}</div><button class="btn xs soft" onClick={() => M.setDayPlan(tomorrow, { mainTaskId: '' })}>Clear</button></div>
            ) : <button class="slot-empty" onClick={() => pickTask({ title: 'Main priority for ' + relDayLower(tomorrow), newPreset: { dueDate: tomorrow }, onPick: (t) => togglePlan(t, 'main', tomorrow) })}><Icon name="target" size={18} />Choose tomorrow's main priority</button>}
          </div>
          <div>
            <div class="eyebrow" style={{ marginBottom: 6 }}>Key tasks ({planT.keys.length}/3)</div>
            {planT.keys.map((t) => <div class="list-row"><div class="row-main"><div class="row-title">{t.title}</div></div><button class="icon-btn ghost sm" aria-label="Remove" onClick={() => togglePlan(t, 'key', tomorrow)}><Icon name="x" size={15} /></button></div>)}
            {planT.keys.length < 3 && <button class="slot-empty" onClick={() => pickTask({ title: 'Key task for ' + relDayLower(tomorrow), newPreset: { dueDate: tomorrow }, filter: (t) => t.id !== planT.main?.id && !planT.keys.some((k) => k.id === t.id), onPick: (t) => togglePlan(t, 'key', tomorrow) })}><Icon name="plus" size={18} />Add a key task</button>}
          </div>
          <div class="field-hint">Picking a task here moves its due date to {relDayLower(tomorrow)}. It stays one task, no copies.</div>
        </div>
      </div>
      {past.length > 0 && (
        <div class="card">
          <div class="card-head"><div class="card-title">Past reviews</div></div>
          <div class="list">{past.map((p) => <a class="list-row clickable" href={'#/review?d=' + p.id}><div class="row-main"><div class="row-title">{fmtDay(p.id)}</div><div class="row-meta ellipsis">{p.wins || p.lesson || 'No notes'}</div></div><Icon name="chevronRight" size={16} class="muted" /></a>)}</div>
        </div>
      )}
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
        <div class="stat"><div class="stat-label">Days reviewed</div><div class="stat-value">{d.days.length}</div></div>
        <div class="stat"><div class="stat-label">Tasks done</div><div class="stat-value">{d.doneCount}</div></div>
        <div class="stat"><div class="stat-label">Uploads</div><div class="stat-value">{d.uploads}</div></div>
        <div class="stat"><div class="stat-label">Avg energy</div><div class="stat-value" style={{ fontSize: d.avgEnergy ? 22 : undefined }}>{d.avgEnergy ? ENERGY[Math.round(d.avgEnergy) - 1] : '–'}</div></div>
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
            {x.done.length > 0 && <div class="jd-line"><span class="jd-label">Done</span>{x.done.map((t) => t.title).join(', ')}</div>}
            {x.review.wins && <div class="jd-line"><span class="jd-label">Wins</span>{x.review.wins}</div>}
            {x.review.blockers && <div class="jd-line"><span class="jd-label">Blockers</span>{x.review.blockers}</div>}
            {x.review.lesson && <div class="jd-line"><span class="jd-label">Lesson</span>{x.review.lesson}</div>}
          </a>
        ))}</div>
      ) : <div class="card"><Empty icon="review" title="No daily reviews this month">Write one in Daily review. Every review this month lands here and in the PDF.</Empty></div>}
    </>
  );
}

function WeeklyReview({ start }) {
  const s = M.settings();
  const t0 = today();
  const ws = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? startOfWeek(start, s.weekStart) : startOfWeek(t0, s.weekStart);
  const we = addDays(ws, 6);
  const [r, set, saved] = useAutosave('weeklyReviews', ws, { worked: '', change: '', notes: '' });
  const inWeek = (ts) => { if (!ts) return false; const d = isoOf(ts); return d >= ws && d <= we; };
  const goals = all('goals').filter((g) => !g.deletedAt && g.status !== 'archived' && (!g.startDate || g.startDate <= we) && (!g.endDate || g.endDate >= ws));
  const completed = M.liveTasks().filter((t) => inWeek(t.completedAt) || (t.completions || []).some((c) => inWeek(c.at)));
  const carried = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate && t.dueDate <= we);
  const published = M.publishedInWeek(ws);
  const milestones = all('activity').filter((a) => inWeek(a.at) && (a.stage === 'Delivered' || a.stage === 'Paid' || a.amount)).sort((a, b) => a.at - b.at);
  const go = (iso) => navigate('/review/weekly?d=' + iso);
  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label="Previous week" onClick={() => go(addDays(ws, -7))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{fmtShort(ws)} – {fmtShort(we)}</div><div class="muted" style={{ fontSize: 13 }}>{ws <= t0 && t0 <= we ? 'This week' : diffDays(ws, t0) < 0 ? `${Math.round(-diffDays(ws, startOfWeek(t0, s.weekStart)) / 7)} week(s) ago` : 'Upcoming'}</div></div>
        <button class="icon-btn" aria-label="Next week" disabled={we >= t0} onClick={() => go(addDays(ws, 7))}><Icon name="chevronRight" /></button>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Tasks done</div><div class="stat-value">{completed.length}</div></div>
        <div class="stat"><div class="stat-label">Carried forward</div><div class="stat-value">{carried.length}</div></div>
        <div class="stat"><div class="stat-label">Uploaded</div><div class="stat-value">{published.length}<span class="muted" style={{ fontSize: 14 }}> / {s.weeklyTarget}</span></div></div>
        <div class="stat"><div class="stat-label">Freelance milestones</div><div class="stat-value">{milestones.length}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Goals this week</div></div>
        {goals.length ? <div class="col gap-12">{goals.map((g) => { const p = M.goalProgress(g); return <div class="row gap-12"><Ring pct={p.pct} size={40} /><div class="grow"><div class="row-title">{g.title}</div><div class="row-meta">{p.label} · {g.status}</div></div></div>; })}</div> : <div class="muted" style={{ fontSize: 14 }}>No goals covered this week.</div>}
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><div class="card-title">Completed <span class="count">{completed.length}</span></div></div>
          {completed.length ? <div class="col gap-6" style={{ fontSize: 14 }}>{completed.slice(0, 20).map((t) => <div class="row gap-8"><Icon name="check" size={15} style={{ color: 'var(--good)' }} /><span class="ellipsis">{t.title}</span></div>)}</div> : <div class="muted" style={{ fontSize: 14 }}>None yet.</div>}
        </div>
        <div class="card"><div class="card-head"><div class="card-title">Carried forward <span class="count">{carried.length}</span></div></div>
          {carried.length ? <div class="col gap-6" style={{ fontSize: 14 }}>{carried.slice(0, 20).map((t) => <button class="row gap-8" style={{ textAlign: 'left' }} onClick={() => openTaskSheet(t.id)}><Dot tone={catTone(t.category)} /><span class="ellipsis grow">{t.title}</span><span class="muted" style={{ fontSize: 12 }}>{relDay(t.dueDate)}</span></button>)}</div> : <div class="muted" style={{ fontSize: 14 }}>Clean slate.</div>}
        </div>
        <div class="card"><div class="card-head"><div class="card-title">Content uploaded</div></div>
          {published.length ? <div class="list">{published.map((c) => <a class="list-row clickable" href={'#/content/item/' + c.id}><div class="row-main"><div class="row-title">{c.title}</div><div class="row-meta">{(c.platforms || []).join(', ')}{c.pillar ? ' · ' + c.pillar : ''}</div></div></a>)}</div> : <div class="muted" style={{ fontSize: 14 }}>Nothing uploaded this week.</div>}
        </div>
        <div class="card"><div class="card-head"><div class="card-title">Freelance milestones</div></div>
          {milestones.length ? <div class="timeline">{milestones.map((a) => <div class="tl-item"><div><div>{a.text}{a.amount ? ` · ${fmtMoney(a.amount, a.currency)}` : ''}</div><div class="tl-time">{fmtDay(isoOf(a.at))}</div></div></div>)}</div> : <div class="muted" style={{ fontSize: 14 }}>No deliveries or payments this week.</div>}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Reflect</div><span class="save-hint">{saved}</span></div>
        <div class="form">
          <Field label="What worked" htmlFor="wr-worked"><TextArea id="wr-worked" value={r.worked} onInput={(v) => set({ worked: v })} placeholder="Keep doing this" /></Field>
          <Field label="What to change next week" htmlFor="wr-change"><TextArea id="wr-change" value={r.change} onInput={(v) => set({ change: v })} placeholder="One or two adjustments" /></Field>
          <Field label="Other notes" htmlFor="wr-notes"><TextArea id="wr-notes" value={r.notes} onInput={(v) => set({ notes: v })} /></Field>
        </div>
      </div>
      <button class="btn soft" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/goals?new=1')}><Icon name="target" size={16} />Set next week's goals</button>
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
