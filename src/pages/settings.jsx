import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, TimeInput, NumberInput, Segmented, ListEditor, Empty } from '../ui/kit.jsx';
import { toast, confirmDialog, openMenu } from '../ui/overlay.jsx';
import { PageHeader, fmtAgo, ContentBadge } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore, persist, exportAll, importAll, wipeAll, counts, flush } from '../lib/db.js';
import { today, addDays, nowParts, startOfWeek, isoOf, fmtShort } from '../lib/date.js';
import { CURRENCIES } from '../lib/money.js';
import * as M from '../lib/model.js';
import { saveFile, saveMessage } from '../lib/files.js';
import { sync, signIn, signUp, signOut, syncNow, resetPassword, updatePassword, onSync } from '../lib/sync.js';
import { driveStatus, monthLabel } from '../lib/drive.js';
import { pushSupported, isIOS, isStandalone, pushFlag, pushStatus, enablePush, disablePush, testPush } from '../lib/push.js';

// ---------- theme ----------
export function getTheme() { try { return localStorage.getItem('vz:theme') || 'system'; } catch { return 'system'; } }
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else if (root.getAttribute('data-theme') && root.dataset.vzTheme) root.removeAttribute('data-theme');
  root.dataset.vzTheme = t;
}
export function useTheme() { useEffect(() => applyTheme(getTheme()), []); }

// ---------- reminders ----------
const toMin = (hhmm) => { const [h, m] = (hhmm || '00:00').split(':').map(Number); return h * 60 + m; };
export function reminderState() {
  const s = M.settings();
  const n = nowParts();
  const now = n.hour * 60 + n.minute;
  const seen = M.meta('reminders', {});
  const mT = s.reminders.morning.time, eT = s.reminders.evening.time;
  const morningDue = s.reminders.morning.enabled && now >= toMin(mT) && now < Math.min(toMin(eT), toMin(mT) + 300);
  const eveningDue = s.reminders.evening.enabled && now >= toMin(eT);
  return {
    morning: morningDue && seen.morning !== n.date, evening: eveningDue && seen.evening !== n.date && !(get('dailyReviews', n.date)?.journal || get('dailyReviews', n.date)?.wins),
    morningDue, eveningDue, morningTime: mT, eveningTime: eT,
  };
}
export function dismissReminder(kind) { const r = M.meta('reminders', { id: 'reminders' }); put('meta', { ...r, id: 'reminders', [kind]: today() }, { silent: true }); }
export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;
export function useReminders() {
  const [, tick] = useState(0);
  useEffect(() => {
    const check = () => {
      tick((x) => x + 1);
      const s = M.settings();
      const n = nowParts();
      const now = n.hour * 60 + n.minute;
      const fired = M.meta('reminders', { id: 'reminders' });
      for (const kind of ['morning', 'evening']) {
        const r = s.reminders[kind];
        if (!r.enabled || fired['fired_' + kind] === n.date || now < toMin(r.time) || now > toMin(r.time) + 30) continue;
        put('meta', { ...M.meta('reminders', { id: 'reminders' }), id: 'reminders', ['fired_' + kind]: n.date }, { silent: true });
        // When this device gets server push, the server sends the brief; don't double up.
        if (notifySupported() && Notification.permission === 'granted' && !pushFlag()) {
          const openToday = M.liveTasks().filter((t) => M.isOpen(t) && t.dueDate === n.date).length;
          const uploads = M.contentActions(n.date).filter((a) => a.stage.id === 'upload').length;
          const body = kind === 'morning' ? `${openToday} task(s) today${uploads ? `, ${uploads} upload(s) planned` : ''}.` : 'How was today? Write a few lines in your journal.';
          try { new Notification(kind === 'morning' ? 'Morning brief' : 'Time to close the day', { body, tag: 'vz-' + kind + '-' + n.date }); } catch {
            try { navigator.serviceWorker?.ready.then((reg) => reg.showNotification(kind === 'morning' ? 'Morning brief' : 'Time to close the day', { body, tag: 'vz-' + kind + '-' + n.date })); } catch {}
          }
        }
      }
    };
    check();
    const i = setInterval(check, 30000);
    const vis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, []);
}

async function downloadBlob(name, text, type, okText) {
  const r = await saveFile(name, text, type);
  const [msg, tone] = saveMessage(r, okText);
  toast(msg, { tone, duration: tone ? 5000 : 2600 });
}
function icsFile() {
  const s = M.settings();
  const d = today().replace(/-/g, '');
  const ev = (uidv, title, time, desc) => [
    'BEGIN:VEVENT', `UID:${uidv}@vandenizar`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Asia/Jakarta:${d}T${time.replace(':', '')}00`, `DURATION:PT10M`, 'RRULE:FREQ=DAILY', `SUMMARY:${title}`, `DESCRIPTION:${desc}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
  ];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vandenizar//Workspace//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Jakarta', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:WIB', 'END:STANDARD', 'END:VTIMEZONE'];
  if (s.reminders.morning.enabled) lines.push(...ev('morning', 'Vandenizar: morning brief', s.reminders.morning.time, 'Open Vandenizar: today\'s tasks, planned uploads and weekly goals.'));
  if (s.reminders.evening.enabled) lines.push(...ev('evening', 'Vandenizar: daily review', s.reminders.evening.time, 'Open Vandenizar: daily review and plan tomorrow.'));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// rename-aware list setter: keeps existing records in sync when an item is renamed
function renameAware(key, oldList, newList, migrate) {
  if (oldList.length === newList.length) {
    const diffs = oldList.map((o, i) => [o, newList[i]]).filter(([a, b]) => a !== b);
    if (diffs.length === 1 && !oldList.includes(diffs[0][1])) migrate(diffs[0][0], diffs[0][1]);
  }
  M.setSettings({ [key]: newList });
}

function PushRow({ lead, onLead }) {
  const [on, setOn] = useState(pushFlag());
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  useEffect(() => { pushStatus().then(setOn); return onSync(() => force((x) => x + 1)); }, []);
  const needsHome = isIOS() && !isStandalone();
  const blocked = !sync.user ? 'Sign in above to turn on notifications.' : needsHome ? 'On iPhone, open Vandenizar from your Home Screen, then turn this on there.' : !pushSupported() ? 'This browser does not support notifications.' : '';
  const toggle = async () => {
    if (busy || blocked) return;
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); toast('Notifications off on this device'); }
      else { await enablePush(); setOn(true); toast('Notifications on. Sending a test…'); testPush().catch(() => {}); }
    } catch (e) { toast(e.message || 'Could not change notifications.', { tone: 'warn', duration: 5000 }); }
    setBusy(false);
  };
  return (
    <>
      <div class="set-row">
        <div class="grow">
          <div>Notifications on this device</div>
          <div class="hint">{blocked || (on ? 'Tasks and content steps with a time, plus the morning brief and daily review. Works with the app closed.' : 'Get an alert for anything scheduled with a time, even when the app is closed.')}</div>
        </div>
        <button class={'toggle ' + (on ? 'on' : '')} role="switch" aria-checked={on} aria-label="Notifications on this device" disabled={!!blocked || busy} onClick={toggle} />
      </div>
      {on && (
        <>
          <Field label="Alert me"><Segmented class="full" options={[{ id: 0, label: 'On time' }, { id: 5, label: '5m early' }, { id: 15, label: '15m early' }, { id: 30, label: '30m early' }]} value={lead} onChange={(v) => onLead(+v)} /></Field>
          <div><button class="btn sm" onClick={async () => { try { const n = await testPush(); toast(n ? 'Test sent' : 'No device is subscribed yet', { tone: n ? '' : 'warn' }); } catch (e) { toast(e.message, { tone: 'warn' }); } }}><Icon name="bell" size={15} />Send test</button></div>
        </>
      )}
    </>
  );
}

// ---------- Settings: section hub ----------
const SECTIONS = [
  { id: 'account', label: 'Account & sync', icon: 'restore', tone: 't-blue' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', tone: 't-orange' },
  { id: 'general', label: 'Profile & appearance', icon: 'sun', tone: 't-yellow' },
  { id: 'daily', label: 'Daily system', icon: 'tasks', tone: 't-green' },
  { id: 'content', label: 'Content OS', icon: 'video', tone: 't-violet' },
  { id: 'freelance', label: 'Freelance & invoices', icon: 'briefcase', tone: 't-pink' },
  { id: 'drive', label: 'Google Drive', icon: 'upload', tone: 't-blue' },
  { id: 'data', label: 'Backup & data', icon: 'archive', tone: 't-grey' },
];

function sectionSummary(id, s) {
  const sy = sync;
  switch (id) {
    case 'account': return sy.user ? syncLabel(sy) : 'Not signed in';
    case 'notifications': return pushFlag() ? 'On for this device' : 'Off on this device';
    case 'general': return (s.name || 'You') + ' · ' + ({ system: 'Match device', light: 'Light', dark: 'Dark' }[getTheme()] || 'Match device');
    case 'daily': return s.categories.length + ' categories';
    case 'content': return s.platforms.join(', ');
    case 'freelance': return 'Next invoice ' + M.nextInvoiceNumber().num;
    case 'drive': return M.meta('driveStatus', {}).connected ? 'Connected' : 'Monthly review PDFs';
    case 'data': return 'Export, import, trash';
    default: return '';
  }
}

export function SettingsPage({ section }) {
  useStore();
  useSync();
  const s = M.settings();
  const valid = SECTIONS.some((x) => x.id === section);
  const cur = valid ? section : 'account';
  const meta = SECTIONS.find((x) => x.id === cur);
  return (
    <div class={'page settings-page ' + (valid ? 'has-section' : 'no-section')}>
      <div class="set-layout">
        <div class="set-hub">
          <PageHeader eyebrow="Workspace" title="Settings" />
          <div class="set-nav">
            {SECTIONS.map((x) => (
              <a href={'#/settings/' + x.id} class={'set-nav-item ' + (x.id === cur ? 'on' : '')}>
                <span class={'set-ico ' + x.tone}><Icon name={x.icon} size={18} /></span>
                <span class="grow"><span class="set-nav-label">{x.label}</span><span class="set-nav-sub">{sectionSummary(x.id, s)}</span></span>
                <Icon name="chevronRight" size={16} class="set-chev" />
              </a>
            ))}
          </div>
          <div class="set-foot">Vandenizar Creator Workspace · times in WIB (Asia/Jakarta)</div>
        </div>
        <div class="set-panel">
          <a href="#/settings" class="set-back"><Icon name="chevronLeft" size={18} />Settings</a>
          <h2 class="set-title">{meta.label}</h2>
          {cur === 'account' && <AccountCard />}
          {cur === 'notifications' && <NotificationsSection s={s} />}
          {cur === 'general' && <GeneralSection s={s} />}
          {cur === 'daily' && <DailySection s={s} />}
          {cur === 'content' && <ContentSection s={s} />}
          {cur === 'freelance' && <FreelanceSection s={s} />}
          {cur === 'drive' && <DriveSection />}
          {cur === 'data' && <DataSection />}
        </div>
      </div>
    </div>
  );
}

const set = (ch) => M.setSettings(ch);
const Group = ({ title, hint, children }) => (
  <div class="card set-card">
    {title && <div class="set-card-head"><div class="card-title">{title}</div>{hint && <div class="set-card-hint">{hint}</div>}</div>}
    <div class="set-group">{children}</div>
  </div>
);

// Chips you can tap to rename, x to remove, and + to add
function ChipsEditor({ items, onChange, placeholder = 'Add', min = 0 }) {
  const [edit, setEdit] = useState(-1);
  const [val, setVal] = useState('');
  const [adding, setAdding] = useState(false);
  const commitEdit = () => { const v = val.trim(); if (v && edit >= 0 && v !== items[edit] && !items.includes(v)) { const n = [...items]; n[edit] = v; onChange(n); } setEdit(-1); };
  const commitAdd = (keepOpen) => { const v = val.trim(); if (v && !items.includes(v)) onChange([...items, v]); setVal(''); if (!keepOpen) setAdding(false); };
  return (
    <div class="chip-editor">
      {items.map((t, i) => edit === i ? (
        <input class="chip-input" autoFocus value={val} onInput={(e) => setVal(e.currentTarget.value)} onBlur={commitEdit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') setEdit(-1); }} aria-label={'Rename ' + t} />
      ) : (
        <span class="chip ed">
          <button type="button" class="chip-name" onClick={() => { setEdit(i); setVal(t); }} title="Tap to rename">{t}</button>
          <button type="button" class="chip-x" aria-label={'Remove ' + t} disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
        </span>
      ))}
      {adding ? (
        <input class="chip-input" autoFocus value={val} placeholder={placeholder} onInput={(e) => setVal(e.currentTarget.value)} onBlur={() => commitAdd(false)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAdd(true); } if (e.key === 'Escape') { setVal(''); setAdding(false); } }} />
      ) : <button type="button" class="chip add" onClick={() => { setVal(''); setEdit(-1); setAdding(true); }}><Icon name="plus" size={14} />{placeholder}</button>}
    </div>
  );
}

const Row = ({ label, hint, children }) => (
  <div class="set-row"><div class="grow"><div>{label}</div>{hint && <div class="hint">{hint}</div>}</div>{children}</div>
);

function NotificationsSection({ s }) {
  const setRem = (kind, ch) => M.setSettings({ reminders: { ...s.reminders, [kind]: { ...s.reminders[kind], ...ch } } });
  return (
    <>
      <Group title="Push notifications" hint="Alerts for anything scheduled with a time, even when the app is closed. Turn on per device.">
        <PushRow lead={s.pushLead ?? 0} onLead={(v) => set({ pushLead: v })} />
      </Group>
      <Group title="Daily reminders">
        {[['morning', 'Morning brief', "Today's tasks and planned uploads"], ['evening', 'Daily review', 'How was today? A short journal entry']].map(([k, label, hint]) => (
          <Row label={label} hint={hint}>
            <div class="set-time"><TimeInput id={'s-rem-' + k} value={s.reminders[k].time} onChange={(v) => v && setRem(k, { time: v })} /></div>
            <button class={'toggle ' + (s.reminders[k].enabled ? 'on' : '')} role="switch" aria-checked={s.reminders[k].enabled} aria-label={label} onClick={() => setRem(k, { enabled: !s.reminders[k].enabled })} />
          </Row>
        ))}
        {!pushFlag() && <div class="field-hint">With notifications off, reminders show as a card on Today when you open the app. <button class="link-btn" onClick={() => downloadBlob('vandenizar-reminders.ics', icsFile(), 'text/calendar', 'Calendar file saved. Open it to add the daily alerts.')}>Add them to your calendar instead</button>.</div>}
      </Group>
    </>
  );
}

function GeneralSection({ s }) {
  const [theme, setTheme] = useState(getTheme());
  const standalone = typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  return (
    <>
      <Group title="Profile">
        <Field label="Your name" htmlFor="s-name"><TextInput id="s-name" value={s.name} onInput={(v) => set({ name: v })} /></Field>
        <Field label="Appearance"><Segmented options={[{ id: 'system', label: 'Match device' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={theme} onChange={(v) => { setTheme(v); try { localStorage.setItem('vz:theme', v); } catch {} if (v === 'system') document.documentElement.removeAttribute('data-theme'); applyTheme(v); }} /></Field>
      </Group>
      <Group title="iPhone home screen">
        {standalone ? <div class="row gap-8" style={{ fontSize: 14 }}><Icon name="check" size={18} style={{ color: 'var(--good)' }} /><span>You're using the installed app.</span></div> : (
          <ol class="install-steps">
            <li>Open this site in <b>Safari</b> on your iPhone.</li>
            <li>Tap <b>Share</b> <Icon name="share" size={15} style={{ display: 'inline', verticalAlign: '-2px' }} />, then <b>Add to Home Screen</b>.</li>
            <li>Open Vandenizar from the new icon and sign in.</li>
          </ol>
        )}
      </Group>
    </>
  );
}

function DailySection({ s }) {
  return (
    <>
      <Group title="Task categories" hint="Tap a category to rename it. Renaming updates existing tasks.">
        <ChipsEditor items={s.categories} min={1} placeholder="Add category" onChange={(v) => renameAware('categories', s.categories, v, (a, b) => all('tasks').filter((t) => t.category === a).forEach((t) => patch('tasks', t.id, { category: b })))} />
      </Group>
      <Group title="Defaults">
        <div class="form-row">
          <Field label="Default category" htmlFor="s-dcat"><Select id="s-dcat" value={s.defaultCategory} onChange={(v) => set({ defaultCategory: v })} options={s.categories} /></Field>
          <Field label="Default priority" htmlFor="s-dprio"><Select id="s-dprio" value={s.defaultPriority} onChange={(v) => set({ defaultPriority: v })} options={M.PRIORITIES} /></Field>
        </div>
        <div class="form-row">
          <Field label="Week starts on" htmlFor="s-ws"><Select id="s-ws" value={String(s.weekStart)} onChange={(v) => set({ weekStart: +v })} options={[{ id: '1', label: 'Monday' }, { id: '0', label: 'Sunday' }, { id: '6', label: 'Saturday' }]} /></Field>
          <Field label="Weekly goal limit" htmlFor="s-gl"><NumberInput id="s-gl" value={s.weeklyGoalLimit} min={1} onChange={(v) => set({ weeklyGoalLimit: Math.max(1, +v || 1) })} /></Field>
        </div>
      </Group>
    </>
  );
}

function ContentSection({ s }) {
  return (
    <>
      <Group title="Platforms" hint="Tap to rename. Renaming updates existing content.">
        <ChipsEditor items={s.platforms} min={1} placeholder="Add platform" onChange={(v) => renameAware('platforms', s.platforms, v, (a, b) => all('contents').filter((x) => (x.platforms || []).includes(a)).forEach((x) => patch('contents', x.id, { platforms: x.platforms.map((p) => (p === a ? b : p)) })))} />
      </Group>
      <Group title="Content pillars">
        <ChipsEditor items={s.pillars} placeholder="Add pillar" onChange={(v) => renameAware('pillars', s.pillars, v, (a, b) => all('contents').filter((x) => x.pillar === a).forEach((x) => patch('contents', x.id, { pillar: b })))} />
      </Group>
      <Group title="Formats">
        <ChipsEditor items={s.formats} placeholder="Add format" onChange={(v) => renameAware('formats', s.formats, v, (a, b) => all('contents').filter((x) => x.format === a).forEach((x) => patch('contents', x.id, { format: b })))} />
      </Group>
      <Group title="Threads" hint="Pillars for your Threads posts and how many you aim to post a day">
        <ChipsEditor items={s.threadsPillars} placeholder="Add pillar" onChange={(v) => renameAware('threadsPillars', s.threadsPillars, v, (x, y) => all('threads').filter((t) => t.pillar === x).forEach((t) => patch('threads', t.id, { pillar: y })))} />
        <Row label="Posts per day">
          <div class="set-num"><NumberInput id="s-thd" value={s.threadsDaily} min={1} onChange={(v) => set({ threadsDaily: Math.max(1, +v || 1) })} /></div>
        </Row>
      </Group>
      <Group>
        <Row label="Weekly upload target" hint="Shown on Content overview">
          <div class="set-num"><NumberInput id="s-wt" value={s.weeklyTarget} min={0} onChange={(v) => set({ weeklyTarget: Math.max(0, +v || 0) })} /></div>
        </Row>
      </Group>
    </>
  );
}

function FreelanceSection({ s }) {
  const setBiz = (ch) => M.setSettings({ business: { ...s.business, ...ch } });
  return (
    <>
      <Group title="Business details" hint="Printed on your invoices">
        <div class="form-row">
          <Field label="Business name" htmlFor="s-biz"><TextInput id="s-biz" value={s.business.name} onInput={(v) => setBiz({ name: v })} /></Field>
          <Field label="Your name" htmlFor="s-owner"><TextInput id="s-owner" value={s.business.owner} onInput={(v) => setBiz({ owner: v })} /></Field>
        </div>
        <div class="form-row">
          <Field label="Email" htmlFor="s-bemail"><TextInput id="s-bemail" type="email" value={s.business.email} onInput={(v) => setBiz({ email: v })} /></Field>
          <Field label="Phone / WhatsApp" htmlFor="s-bphone"><TextInput id="s-bphone" type="tel" value={s.business.phone} onInput={(v) => setBiz({ phone: v })} /></Field>
        </div>
        <div class="form-row">
          <Field label="Address" htmlFor="s-baddr"><TextInput id="s-baddr" value={s.business.address} onInput={(v) => setBiz({ address: v })} /></Field>
          <Field label="Website / portfolio" htmlFor="s-bweb"><TextInput id="s-bweb" value={s.business.website} onInput={(v) => setBiz({ website: v })} /></Field>
        </div>
      </Group>
      <Group title="Invoices">
        <Field label="Number format" htmlFor="s-ifmt" hint={<>Next number: <b>{M.nextInvoiceNumber().num}</b>. Use {'{YYYY}'}, {'{MM}'} and {'{####}'}.</>}><TextInput id="s-ifmt" value={s.invoiceFormat} onInput={(v) => set({ invoiceFormat: v })} /></Field>
        <div class="form-row">
          <Field label="Default currency" htmlFor="s-cur"><Select id="s-cur" value={s.defaultCurrency} onChange={(v) => set({ defaultCurrency: v })} options={Object.keys(CURRENCIES)} /></Field>
          <Field label="Payment terms (days)" htmlFor="s-terms"><NumberInput id="s-terms" value={s.defaultTermsDays} onChange={(v) => set({ defaultTermsDays: Math.max(0, +v || 0) })} /></Field>
        </div>
        <Field label="Payment instructions" htmlFor="s-payi" hint="Printed on new invoices."><TextArea id="s-payi" value={s.paymentInstructions} onInput={(v) => set({ paymentInstructions: v })} placeholder={'Bank BCA\nAccount name\nAccount number'} /></Field>
        <Field label="Terms text" htmlFor="s-ttext"><TextArea id="s-ttext" value={s.defaultTermsText} onInput={(v) => set({ defaultTermsText: v })} /></Field>
      </Group>
      <Group title="Project types">
        <ChipsEditor items={s.projectTypes} placeholder="Add type" onChange={(v) => renameAware('projectTypes', s.projectTypes, v, (a, b) => all('projects').filter((x) => x.type === a).forEach((x) => patch('projects', x.id, { type: b })))} />
      </Group>
      <Group title="Default deliverables" hint="Added to every new project">
        <ChipsEditor items={s.defaultDeliverables} placeholder="Add deliverable" onChange={(v) => set({ defaultDeliverables: v })} />
      </Group>
    </>
  );
}

function DriveSection() {
  const [st, setSt] = useState(M.meta('driveStatus', {}));
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { const r = await driveStatus(); setSt(r); put('meta', { id: 'driveStatus', ...r }, { silent: true }); }
    catch (e) { setSt({ connected: false, error: e.message }); }
    setBusy(false);
  };
  useEffect(() => { if (sync.user) check(); }, []);
  const exports = Object.entries(M.meta('driveExports', {}).months || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  return (
    <>
      <Group title="Connection">
        <Row label={st.connected ? 'Connected' : busy ? 'Checking…' : 'Not connected'} hint={st.connected ? <>Monthly reviews are saved to <b>Daily Review / year / month</b> in {st.email || 'your'} Google Drive.</> : !sync.user ? 'Sign in first.' : (st.error || 'Google Drive is not connected yet.')}>
          <span class={'badge sm ' + (st.connected ? 't-green' : 't-grey')}>{st.connected ? 'On' : 'Off'}</span>
        </Row>
        <div class="row gap-8 wrap">
          <button class="btn sm" disabled={busy || !sync.user} onClick={check}><Icon name="restore" size={15} />Check connection</button>
          <a class="btn sm soft" href="#/review/monthly">Open monthly review</a>
        </div>
      </Group>
      {exports.length > 0 && (
        <Group title="Saved to Drive">
          <div class="list">{exports.map(([m, x]) => (
            <a class="list-row clickable" href={x.url || '#/review/monthly?m=' + m} target={x.url ? '_blank' : undefined} rel="noopener">
              <div class="row-main"><div class="row-title">{monthLabel(m)}</div><div class="row-meta">Saved {fmtAgo(x.at)}</div></div>
              <Icon name="external" size={15} class="muted" />
            </a>
          ))}</div>
        </Group>
      )}
    </>
  );
}

function DataSection() {
  const fileRef = useRef();
  const c = counts();
  const sy = sync;
  const hasSample = M.liveTasks().some((t) => t.sample) || all('contents').some((x) => x.sample) || all('clients').some((x) => x.sample);
  const doExport = () => {
    const name = `vandenizar-backup-${today()}.json`;
    downloadBlob(name, JSON.stringify(exportAll(), null, 1), 'application/json', 'Backup saved: ' + name);
  };
  const doImport = async (file) => {
    try {
      const json = JSON.parse(await file.text());
      if (!(await confirmDialog({ title: 'Replace everything with this backup?', body: `Backup from ${json.exportedAt ? fmtShort(isoOf(Date.parse(json.exportedAt))) : 'unknown date'}. Data that isn't in the backup will be removed. Export first if you're unsure.`, confirmLabel: 'Restore backup', danger: true }))) return;
      const ok = await importAll(json);
      toast(ok ? 'Backup restored' : 'Restored in memory, but saving failed. Try again.', { tone: ok ? '' : 'warn' });
    } catch (e) { toast(e.message || 'That file could not be read.', { tone: 'warn' }); }
  };
  return (
    <>
      <Group title="Where your data lives">
        <div style={{ fontSize: 14 }}>{sy.user ? <>Saved on this device and synced to <b>{sy.user.email}</b>.</> : 'Saved on this device only. Sign in to back it up.'}</div>
        <div class="muted" style={{ fontSize: 13 }}>{c.tasks} tasks · {c.contents} content · {c.projects} projects · {c.clients} clients · {c.invoices} invoices · {c.dailyReviews} daily reviews</div>
      </Group>
      <Group title="Backup file" hint="A JSON copy of everything, for safekeeping">
        <div class="row gap-8 wrap">
          <button class="btn sm" onClick={doExport}><Icon name="download" size={15} />Export</button>
          <button class="btn sm" onClick={() => fileRef.current.click()}><Icon name="upload" size={15} />Import</button>
          <a class="btn sm" href="#/trash"><Icon name="trash" size={15} />Trash</a>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (f) doImport(f); }} />
        </div>
      </Group>
      <Group title="Reset">
        <div class="row gap-8 wrap">
          {hasSample ? <button class="btn sm soft" onClick={async () => { if (await confirmDialog({ title: 'Remove sample data?', body: 'Only records created by "Load sample data" are removed. Your own entries stay.', confirmLabel: 'Remove sample data' })) { removeSampleData(); toast('Sample data removed'); } }}>Remove sample data</button>
            : <button class="btn sm soft" onClick={() => { loadSampleData(); toast('Sample data loaded'); }}>Load sample data</button>}
          <button class="btn sm danger-soft" onClick={async () => { if (await confirmDialog({ title: 'Erase everything?', body: 'All tasks, content, projects, clients, invoices, payments, reviews and settings are deleted on this device and, if you are signed in, in your account too. Export a backup first if you might need them.', confirmLabel: 'Erase all data', danger: true })) { await wipeAll(); toast('All data erased'); navigate('/'); } }}>Erase all data</button>
        </div>
      </Group>
    </>
  );
}

// ---------- Trash ----------
export function TrashPage() {
  useStore();
  const contents = all('contents').filter((c) => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const tasks = all('tasks').filter((t) => t.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const forever = async (coll, rec, label) => {
    if (!(await confirmDialog({ title: `Delete “${label}” forever?`, body: 'This cannot be undone.', confirmLabel: 'Delete forever', danger: true }))) return;
    if (coll === 'contents') all('tasks').filter((t) => t.contentId === rec.id).forEach((t) => patch('tasks', t.id, { contentId: '' }));
    remove(coll, rec.id);
    toast('Deleted forever');
  };
  const empty = async () => {
    if (!(await confirmDialog({ title: 'Empty the trash?', body: `${contents.length + tasks.length} item(s) will be deleted forever.`, confirmLabel: 'Empty trash', danger: true }))) return;
    contents.forEach((c) => { all('tasks').filter((t) => t.contentId === c.id).forEach((t) => patch('tasks', t.id, { contentId: '' })); remove('contents', c.id); });
    tasks.forEach((t) => remove('tasks', t.id));
    toast('Trash emptied');
  };
  return (
    <div class="page narrow">
      <PageHeader eyebrow="Workspace" title="Trash" actions={(contents.length + tasks.length) > 0 && <button class="btn danger-soft" onClick={empty}><Icon name="trash" size={16} />Empty trash</button>}>
        <div class="muted" style={{ marginTop: 6 }}>Deleted content and tasks wait here. They don't count anywhere until restored.</div>
      </PageHeader>
      {!contents.length && !tasks.length && <div class="card"><Empty icon="trash" title="Trash is empty" /></div>}
      {contents.length > 0 && (
        <div class="card"><div class="card-head"><div class="card-title">Content <span class="count">{contents.length}</span></div></div>
          <div class="list">{contents.map((c) => (
            <div class="list-row">
              <div class="row-main"><div class="row-title">{c.title}</div><div class="row-meta">Deleted {fmtAgo(c.deletedAt)}</div></div>
              <ContentBadge status={c.status} sm />
              <button class="btn xs soft" onClick={() => { patch('contents', c.id, { deletedAt: null }); toast('Restored'); }}>Restore</button>
              <button class="icon-btn ghost sm" aria-label="Delete forever" onClick={() => forever('contents', c, c.title)}><Icon name="trash" size={15} /></button>
            </div>))}</div>
        </div>
      )}
      {tasks.length > 0 && (
        <div class="card"><div class="card-head"><div class="card-title">Tasks <span class="count">{tasks.length}</span></div></div>
          <div class="list">{tasks.map((t) => (
            <div class="list-row">
              <div class="row-main"><div class="row-title">{t.title}</div><div class="row-meta">Deleted {fmtAgo(t.deletedAt)}</div></div>
              <button class="btn xs soft" onClick={() => { patch('tasks', t.id, { deletedAt: null }); toast('Restored'); }}>Restore</button>
              <button class="icon-btn ghost sm" aria-label="Delete forever" onClick={() => forever('tasks', t, t.title)}><Icon name="trash" size={15} /></button>
            </div>))}</div>
        </div>
      )}
    </div>
  );
}

// ---------- sample data ----------
export function loadSampleData() {
  const t0 = today();
  const d = (n) => addDays(t0, n);
  const S = { sample: true };
  const beforeActivity = new Set(all('activity').map((a) => a.id));
  const hadPlan = !!get('days', t0);
  put('meta', { id: 'onboarding', done: true });
  const cl = [
    put('clients', { id: uid(), name: 'Sample · Lumière Beauty', pic: 'Rara', email: 'rara@example.com', phone: '0812000111', address: 'Jakarta Selatan', notes: 'Likes soft, warm grading. Wants vertical cuts for TikTok.', archived: false, ...S }),
    put('clients', { id: uid(), name: 'Sample · Atelier Sora', pic: 'Dimas', email: 'dimas@example.com', phone: '0813000222', address: '', notes: '', archived: false, ...S }),
    put('clients', { id: uid(), name: 'Sample · Kopi Teduh', pic: 'Nadia', email: '', phone: '0815000333', address: '', notes: 'Event client, quick turnaround.', archived: false, ...S }),
  ];
  const IDR = (n) => n; // IDR has no minor units
  const pr = [
    M.newProject({ name: 'Raya lookbook film', clientId: cl[1].id, type: 'Fashion Campaign', fee: IDR(12000000), stage: 'Editing', shootDate: d(-6), deadline: d(2), location: 'Studio Kemang', deliverables: [{ id: uid(), text: 'Main Video', done: false }, { id: uid(), text: 'Social Cut', done: true }, { id: uid(), text: 'Behind The Scenes', done: false }], ...S }),
    M.newProject({ name: 'Serum launch reels', clientId: cl[0].id, type: 'Beauty Reel', fee: IDR(7500000), stage: 'Booked', shootDate: d(3), deadline: d(10), location: 'Lumière HQ', deliverables: [{ id: uid(), text: '3x Reels 30s', done: false }, { id: uid(), text: 'Photo Documentation', done: false }], ...S }),
    M.newProject({ name: 'Grand opening recap', clientId: cl[2].id, type: 'Event Reel', fee: IDR(3500000), stage: 'Delivered', shootDate: d(-12), deadline: d(-5), deliverables: [{ id: uid(), text: 'Recap reel 45s', done: true }], ...S }),
    M.newProject({ name: 'Holiday campaign', clientId: cl[0].id, type: 'Fashion Campaign', fee: IDR(18000000), stage: 'Negotiation', ...S }),
    M.newProject({ name: 'Menu content day', clientId: cl[2].id, type: 'Product Video', fee: IDR(2500000), stage: 'Lead', ...S }),
  ];
  patch('projects', pr[3].id, { stageChangedAt: Date.now() - 7 * 86400000 });
  const inv1 = M.newInvoice({ projectId: pr[0].id, date: d(-20), dueDate: d(-6), ...S });
  M.markSent(get('invoices', inv1.id));
  M.recordPayment(get('invoices', inv1.id), { amount: 6000000, date: d(-10) < t0.slice(0, 8) + '01' ? t0.slice(0, 8) + '01' : d(-10), method: 'Bank transfer', kind: 'DP / deposit', reference: 'BCA transfer' });
  const inv2 = M.newInvoice({ projectId: pr[2].id, date: d(-5), dueDate: d(9), ...S });
  M.markSent(get('invoices', inv2.id));
  const inv3 = M.newInvoice({ projectId: pr[1].id, date: t0, dueDate: d(14), items: [{ id: uid(), desc: 'DP 50% — Serum launch reels', qty: 1, rate: 3750000 }], ...S });
  all('payments').forEach((p) => { if ([inv1.id, inv2.id, inv3.id].includes(p.invoiceId)) patch('payments', p.id, S); });
  all('activity').forEach((a) => { if (!beforeActivity.has(a.id)) patch('activity', a.id, S); });
  const sched = (o) => ({ script: {}, shoot: {}, edit: {}, ready: {}, upload: {}, ...o });
  const cs = [
    M.newContent({ title: 'My WFH desk at 6 AM', description: 'Calm morning setup tour, warm light', status: 'filming', platforms: ['Instagram', 'TikTok'], pillar: 'Desk Setup', format: 'Voice Over', hook: 'This corner is why I actually wake up early now.', shotlist: [{ id: uid(), text: 'Wide of desk, lights off', done: true }, { id: uid(), text: 'Lamp switch on, close-up', done: true }, { id: uid(), text: 'Coffee pour', done: false }, { id: uid(), text: 'Hands on keyboard', done: false }], schedule: sched({ shoot: { date: t0, time: '06:30' }, edit: { date: d(1) }, upload: { date: d(2), time: '19:00' } }), stageDone: { script: true }, ...S }),
    M.newContent({ title: 'Shot vs setup: Raya lookbook', description: 'Before/after of the lighting setup', status: 'ready', platforms: ['Instagram'], pillar: 'Videographer Life', format: 'Music + Text', schedule: sched({ upload: { date: t0, time: '18:00' } }), ...S }),
    M.newContent({ title: '3 gear mistakes I made in 2025', description: '', status: 'idea', platforms: ['Threads'], pillar: 'Creator Thoughts', format: 'Talking Head', ...S }),
    M.newContent({ title: 'Pocket 4 vs A7C II for reels', description: '', status: 'idea', platforms: ['TikTok', 'Instagram'], pillar: 'Gear', format: 'Talking Head', schedule: sched({ script: { date: d(1) }, shoot: { date: d(3) } }), ...S }),
    M.newContent({ title: 'Desk light I use every day', description: 'Affiliate pick, honest take', status: 'published', platforms: ['Instagram'], pillar: 'Affiliate', format: 'Voice Over', publishedAt: Date.now() - 86400000, schedule: sched({ upload: { date: d(-1), time: '19:00' } }), ...S }),
  ];
  const g1 = put('goals', { id: uid(), title: 'Publish 4 posts this week', description: '4 posts live on Instagram or TikTok', period: 'weekly', startDate: startOfWeek(t0, M.settings().weekStart), endDate: addDays(startOfWeek(t0, M.settings().weekStart), 6), method: 'numeric', target: 4, current: 1, unit: 'posts', status: 'active', ...S });
  const g2 = put('goals', { id: uid(), title: 'Finish Raya lookbook delivery', description: 'Main video and BTS sent to client', period: 'weekly', startDate: startOfWeek(t0, M.settings().weekStart), endDate: addDays(startOfWeek(t0, M.settings().weekStart), 6), method: 'tasks', status: 'active', ...S });
  const tk = [
    M.newTask({ title: 'Color grade Raya main video', category: 'Freelance', priority: 'high', dueDate: t0, estimate: 120, projectId: pr[0].id, goalId: g2.id, ...S }),
    M.newTask({ title: 'Export BTS cut and upload to Drive', category: 'Freelance', dueDate: d(1), projectId: pr[0].id, goalId: g2.id, ...S }),
    M.newTask({ title: 'Follow up DP for serum reels', category: 'Freelance', dueDate: t0, dueTime: '10:00', projectId: pr[1].id, ...S }),
    M.newTask({ title: 'Gym: push day', category: 'Personal', dueDate: t0, recurrence: { freq: 'weekly', interval: 1 }, ...S }),
    M.newTask({ title: 'Review Ainayya campaign shotlist', category: 'Work', dueDate: d(-1), ...S }),
    M.newTask({ title: 'Read one chapter on lighting', category: 'Growth', dueDate: '', ...S }),
    M.newTask({ title: 'Plan next week content', category: 'Growth', dueDate: d(2), ...S }),
  ];
  if (!hadPlan) { M.setDayPlan(t0, { mainTaskId: tk[0].id, keyTaskIds: [tk[2].id] }); patch('days', t0, S); }
  put('resources', { id: uid(), name: 'Artlist music library', url: 'https://artlist.io', order: 1, ...S });
  put('resources', { id: uid(), name: 'Reels safe-zone guide', url: 'https://www.instagram.com', order: 2, ...S });
  put('templates', { id: uid(), kind: 'project', name: 'Fashion campaign, half day', archived: false, data: { type: 'Fashion Campaign', fee: 8000000, currency: 'IDR', deliverables: ['Main Video', 'Social Cut', 'Behind The Scenes'], tasks: ['Send moodboard', 'Confirm call sheet', 'Deliver first cut'] }, ...S });
  put('templates', { id: uid(), kind: 'items', name: 'Reel package', archived: false, data: { currency: 'IDR', items: [{ id: uid(), desc: 'Reel 30s, shoot + edit', qty: 3, rate: 2000000 }, { id: uid(), desc: 'Revision round', qty: 1, rate: 500000 }] }, ...S });
  put('templates', { id: uid(), kind: 'terms', name: '50% DP terms', archived: false, data: { terms: '50% down payment to book the date. Remaining 50% due within 7 days of delivery.', notes: 'Thank you for working with me.' }, ...S });
  M.touchRecent('content', cs[0].id); M.touchRecent('project', pr[0].id); M.touchRecent('invoice', inv1.id);
}
export function removeSampleData() {
  for (const coll of ['tasks', 'goals', 'contents', 'resources', 'clients', 'projects', 'invoices', 'payments', 'templates', 'activity', 'days']) {
    all(coll).filter((r) => r.sample).forEach((r) => remove(coll, r.id));
  }
  all('payments').filter((p) => !get('invoices', p.invoiceId)).forEach((p) => remove('payments', p.id));
  all('activity').filter((a) => a.refId && !get(a.refType === 'invoice' ? 'invoices' : a.refType === 'project' ? 'projects' : 'clients', a.refId)).forEach((a) => remove('activity', a.id));
  const r = M.meta('recent', null);
  if (r) put('meta', { ...r, items: (r.items || []).filter((x) => get({ content: 'contents', project: 'projects', client: 'clients', invoice: 'invoices' }[x.type], x.id)) });
}

export function useSync() {
  const [, force] = useState(0);
  useEffect(() => onSync(() => force((x) => x + 1)), []);
  return sync;
}
export function syncLabel(s = sync) {
  if (!s.ready) return 'Starting…';
  if (!s.user) return 'Not signed in';
  if (s.status === 'syncing') return 'Syncing…';
  if (s.status === 'offline') return 'Offline, will sync later';
  if (s.status === 'error') return 'Sync paused';
  return s.lastSyncAt ? 'Synced ' + fmtAgo(s.lastSyncAt) : 'Synced';
}
function AccountCard() {
  const s = useSync();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [newPw, setNewPw] = useState('');
  const run = async (fn) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg(friendly(e)); } finally { setBusy(false); } };
  if (s.user) return (
    <div class="card set-card" id="account"><div class="set-group">
      <div class="row between gap-8"><div style={{ fontSize: 14, minWidth: 0 }}>Signed in as <b class="ellipsis">{s.user.email}</b></div><span class={'badge sm ' + (s.status === 'error' ? 't-red' : s.status === 'synced' ? 't-green' : 't-grey')}>{syncLabel(s)}</span></div>
      <div class="muted" style={{ fontSize: 13.5 }}>Changes save on this device first, then sync so your iPhone and laptop show the same data.</div>
      {s.status === 'error' && <div class="banner"><Icon name="alert" size={18} /><div>{s.error}. Your changes are safe on this device and will sync when this clears.</div></div>}
      {s.recovery && (
        <div class="form">
          <Field label="Set a new password" htmlFor="acc-newpw"><TextInput id="acc-newpw" type="password" value={newPw} onInput={setNewPw} placeholder="At least 8 characters" /></Field>
          <button class="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || newPw.length < 8} onClick={() => run(async () => { await updatePassword(newPw); sync.recovery = false; setNewPw(''); toast('Password updated'); })}>Save new password</button>
        </div>
      )}
      <div class="row gap-8 wrap">
        <button class="btn" disabled={s.status === 'syncing'} onClick={() => syncNow()}><Icon name="restore" size={16} />Sync now</button>
        <button class="btn ghost" onClick={async () => { if (await confirmDialog({ title: 'Sign out?', body: 'Your data stays on this device and in your account. Sign back in any time to keep syncing.', confirmLabel: 'Sign out' })) { await signOut(); toast('Signed out'); } }}>Sign out</button>
      </div>
      {msg && <div class="field-hint" style={{ color: 'var(--bad)' }}>{msg}</div>}
    </div></div>
  );
  return (
    <div class="card set-card" id="account"><div class="set-group">
      <div class="muted" style={{ fontSize: 14 }}>Sign in to sync your workspace between your iPhone and laptop.</div>
      <form class="form" onSubmit={(e) => { e.preventDefault(); run(async () => {
        if (mode === 'signin') { await signIn(email, pw); toast('Signed in. Syncing your data…'); }
        else { const r = await signUp(email, pw); if (r.needsConfirm) setMsg('Check your email and tap the confirmation link, then sign in here.'); else toast('Account created. Syncing your data…'); }
      }); }}>
        <Field label="Email" htmlFor="acc-email"><TextInput id="acc-email" type="email" inputMode="email" value={email} onInput={setEmail} placeholder="you@email.com" /></Field>
        <Field label="Password" htmlFor="acc-pw" hint={mode === 'signup' ? 'At least 8 characters.' : null}><TextInput id="acc-pw" type="password" value={pw} onInput={setPw} /></Field>
        <div class="row gap-8 wrap">
          <button class="btn primary" type="submit" disabled={busy || !email || pw.length < (mode === 'signup' ? 8 : 1)}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          {mode === 'signin' && <button class="btn ghost" type="button" disabled={busy || !email} onClick={() => run(async () => { await resetPassword(email); setMsg('If that email has an account, a reset link is on its way.'); })}>Forgot password</button>}
        </div>
      </form>
      {msg && <div class="field-hint" style={{ color: msg.startsWith('Check') || msg.startsWith('If') ? 'var(--ink-2)' : 'var(--bad)' }}>{msg}</div>}
    </div></div>
  );
}
function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login/i.test(m)) return 'Email or password is wrong.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent, then sign in.';
  if (/signups? not allowed|Signups not allowed/i.test(m)) return 'New accounts are turned off for this workspace.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Try again when you are online.';
  return m;
}
