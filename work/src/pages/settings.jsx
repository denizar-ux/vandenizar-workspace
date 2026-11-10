import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, TimeInput, NumberInput, Segmented, ListEditor, Empty, copyText, ColorDots } from '../ui/kit.jsx';
import { toast, confirmDialog, openMenu, openOverlay, SheetHead, SheetBody, SheetFoot } from '../ui/overlay.jsx';
import { PageHeader, fmtAgo, CategoryField, openCategorySheet } from '../ui/parts.jsx';
import { WorkflowPicker } from './projects.jsx';
import { Group, ContentSection } from './settings-content.jsx';
import { navigate } from '../lib/router.js';
import { all, patch, remove, useStore, exportAll, wipeAll, counts } from '../lib/db.js';
import * as C from '../content/model.js';
import { previewImport, importBackup } from '../combined/importOld.js';
import { today, addDays } from '../lib/date.js';
import { CURRENCIES } from '../lib/money.js';
import * as M from '../lib/model.js';
import { saveFile, saveMessage } from '../lib/files.js';
import { sync, LOCAL, signIn, signUp, signOut, syncNow, resetPassword, updatePassword, onSync } from '../lib/sync.js';
import { pushSupported, isIOS, isStandalone, pushFlag, pushStatus, enablePush, disablePush, testPush } from '../lib/push.js';
import { loadSampleData, removeSampleData, hasSample } from '../lib/sample.js';

// ---------- theme ----------
export function getTheme() { try { return localStorage.getItem('vz:theme') || 'system'; } catch { return 'system'; } }
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#141412' : '#f7f6f2'));
}
export function setTheme(t) { try { localStorage.setItem('vz:theme', t); } catch {} applyTheme(t); }

// ---------- sync ----------
// Subscribe, then re-render once: auth can finish before this effect runs (instant when signed out),
// and that update would otherwise be missed, leaving a blank screen.
export function useSync() {
  const [, force] = useState(0);
  useEffect(() => { const off = onSync(() => force((x) => x + 1)); force((x) => x + 1); return off; }, []);
  return sync;
}
export function syncLabel(s = sync) {
  if (LOCAL) return 'Saved on this device';
  if (!s.ready) return 'Starting…';
  if (!s.user) return 'Saved on this device';
  if (s.status === 'syncing') return 'Syncing…';
  if (s.status === 'offline') return 'Offline · will sync later';
  if (s.status === 'error') return 'Sync paused';
  return s.lastSyncAt ? 'Synced ' + fmtAgo(s.lastSyncAt) : 'Synced';
}

async function downloadBlob(name, text, type, okText) {
  const r = await saveFile(name, text, type);
  const [msg, tone] = saveMessage(r, okText);
  toast(msg, { tone, duration: tone ? 5000 : 2600 });
}

const SECTIONS = [
  { id: 'general', label: 'General', icon: 'sun', tone: 'lavender' },
  { id: 'categories', label: 'Categories', icon: 'tag', tone: 'peach' },
  { id: 'content', label: 'Content', icon: 'image', tone: 'peach' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', tone: 'butter' },
  { id: 'freelance', label: 'Business & invoices', icon: 'file', tone: 'rose' },
  { id: 'data', label: 'Backup & data', icon: 'archive', tone: 'plain' },
  { id: 'account', label: 'Account', icon: 'restore', tone: 'cyan' },
];
// links from the old layout still land somewhere sensible
const SECTION_ALIAS = { tasks: 'general', projects: 'categories', shortcuts: 'general' };
function summary(id, s) {
  switch (id) {
    case 'general': return s.name + ' · ' + ({ system: 'Match device', light: 'Light', dark: 'Dark' }[getTheme()] || 'Match device') + ' · week starts ' + ({ 1: 'Monday', 6: 'Saturday', 0: 'Sunday' }[s.weekStart] || 'Monday');
    case 'categories': return M.categories().map((c) => c.name).join(', ');
    case 'content': return C.slots().length + ' slots · ' + C.pillars().length + ' pillars · ' + C.formats().length + ' formats';
    case 'notifications': return LOCAL ? 'Reminder times' : pushFlag() ? 'Push on for this device' : 'Push off on this device';
    case 'freelance': return 'Next invoice ' + M.nextInvoiceNumber().num;
    case 'data': return 'Export, import, sample data';
    case 'account': return LOCAL ? 'Cloud sync is off' : sync.user ? syncLabel() : 'Not signed in';
    default: return '';
  }
}

export function SettingsPage({ section }) {
  useStore(); useSync();
  const s = M.settings();
  const sec = SECTION_ALIAS[section] || section;
  const valid = SECTIONS.some((x) => x.id === sec);
  const cur = valid ? sec : 'general';
  const meta = SECTIONS.find((x) => x.id === cur);
  return (
    <div class={'page settings-page ' + (valid ? 'has-section' : 'no-section')}>
      <div class="set-layout">
        <div class="set-hub">
          <PageHeader title="Settings." />
          <nav class="set-nav">
            {SECTIONS.map((x) => (
              <a href={'#/settings/' + x.id} class={'set-nav-item ' + (x.id === cur ? 'on' : '')}>
                <span class={'set-ico t-' + x.tone}><Icon name={x.icon} size={18} /></span>
                <span class="grow"><span class="set-nav-label">{x.label}</span><span class="set-nav-sub">{summary(x.id, s)}</span></span>
                <Icon name="chevronRight" size={16} class="set-chev" />
              </a>
            ))}
            <a href="#/trash" class="set-nav-item"><span class="set-ico t-plain"><Icon name="trash" size={18} /></span><span class="grow"><span class="set-nav-label">Trash</span><span class="set-nav-sub">Deleted tasks and projects</span></span><Icon name="chevronRight" size={16} class="set-chev" /></a>
          </nav>
          <div class="quiet-note">Vandenizar · times in WIB (Asia/Jakarta)</div>
        </div>
        <div class="set-panel">
          <a href="#/settings" class="set-back"><Icon name="chevronLeft" size={18} />Settings</a>
          <h2 class="set-title">{meta.label}</h2>
          {cur === 'general' && <><GeneralSection s={s} /><TasksSection s={s} /><ShortcutsSection /></>}
          {cur === 'categories' && <><CategoriesSection /><ProjectsSection s={s} /></>}
          {cur === 'content' && <ContentSection />}
          {cur === 'notifications' && <NotificationsSection s={s} />}
          {cur === 'freelance' && <FreelanceSection s={s} />}
          {cur === 'data' && <DataSection />}
          {cur === 'account' && (LOCAL ? <LocalNote /> : <AccountCard />)}
        </div>
      </div>
    </div>
  );
}
const set = (ch) => M.setSettings(ch);

function GeneralSection({ s }) {
  const [theme, setT] = useState(getTheme());
  return (
    <>
      <Group title="Profile"><Field label="Your name" htmlFor="set-name"><TextInput id="set-name" value={s.name} onInput={(v) => set({ name: v })} /></Field></Group>
      <Group title="Appearance"><Segmented class="full" options={[{ id: 'system', label: 'Match device' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={theme} onChange={(v) => { setT(v); setTheme(v); }} /></Group>
    </>
  );
}
function TasksSection({ s }) {
  return (
    <Group title="Defaults" hint="Used when you write a new task">
      <div class="form-row">
        <Field label="Default estimate (minutes)" htmlFor="set-est"><NumberInput id="set-est" value={s.defaultEstimate || ''} onChange={(v) => set({ defaultEstimate: v ? +v : 0 })} step={15} placeholder="None" /></Field>
        <Field label="Week starts on" htmlFor="set-ws"><Select id="set-ws" value={String(s.weekStart)} onChange={(v) => set({ weekStart: +v })} options={[{ id: '1', label: 'Monday' }, { id: '6', label: 'Saturday' }, { id: '0', label: 'Sunday' }]} /></Field>
      </div>
    </Group>
  );
}
function ProjectsSection({ s }) {
  useStore();
  return (
    <>
      <Group title="Defaults" hint="Used when you start a new project">
        <CategoryField id="set-cat" label="Default category" value={s.defaultCategory} onChange={(v) => set({ defaultCategory: v })} />
        <div class="field-hint">Built in: In-house, Freelance, Personal, Learning. Billing is switched on per project.</div>
        <Field label="Default workflow"><WorkflowPicker value={s.defaultWorkflow || 'general'} onChange={(v) => set({ defaultWorkflow: v })} /></Field>
      </Group>
    </>
  );
}
function CategoriesSection() {
  useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('peach');
  const [showArch, setShowArch] = useState(false);
  const cats = M.categories({ includeArchived: true });
  const active = cats.filter((c) => !c.archived), archived = cats.filter((c) => c.archived);
  const add = () => {
    const n = name.trim();
    if (!n) return toast('Name the category first.', { tone: 'warn' });
    if (cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) return toast(n + ' already exists.', { tone: 'warn' });
    M.addCategory(n, color); setName(''); toast('Category added');
  };
  const pickColor = (c) => openOverlay((close) => <><SheetHead title="Change color" sub={c.name} onClose={close} /><SheetBody><ColorDots value={c.color} colors={M.CATEGORY_COLORS} onChange={(v) => { M.updateCategory(c.id, { color: v }); close(); }} /></SheetBody></>, { kind: 'sheet' });
  const menu = (e, c) => openMenu(e, [
    { label: 'Rename', icon: 'edit', onSelect: () => openCategorySheet({ cat: c }) },
    { label: 'Change color', icon: 'palette', onSelect: () => pickColor(c) },
    c.archived ? { label: 'Restore', icon: 'restore', onSelect: () => M.updateCategory(c.id, { archived: false }) }
      : { label: 'Archive', icon: 'archive', onSelect: () => {
        if (M.settings().defaultCategory === c.id) return toast('This is your default category. Pick another default first.', { tone: 'warn' });
        if (active.length <= 1) return toast('Keep at least one category.', { tone: 'warn' });
        M.updateCategory(c.id, { archived: true }); toast(c.name + ' archived. Its projects stay.', { action: { label: 'Undo', run: () => M.updateCategory(c.id, { archived: false }) } });
      } },
  ], { title: c.name });
  const Row = ({ c }) => {
    const n = M.categoryProjectCount(c.id);
    return <div class={'cat-row' + (c.archived ? ' archived' : '')}><span class={'cat-dot lg t-' + c.color} aria-hidden="true" /><div class="grow">{c.name}<div class="muted" style={{ fontSize: 13 }}>{n} project{n === 1 ? '' : 's'}</div></div><button class="icon-btn ghost sm" aria-label={'Actions for ' + c.name} onClick={(e) => menu(e, c)}><Icon name="more" /></button></div>;
  };
  return (
    <>
      <Group>{active.map((c) => <Row c={c} />)}</Group>
      <Group title="Add a category">
        <Field label="Name" htmlFor="cat-new"><TextInput id="cat-new" value={name} onInput={setName} placeholder="e.g. Experiment" onEnter={add} /></Field>
        <ColorDots value={color} onChange={setColor} colors={M.CATEGORY_COLORS} />
        <button class="btn primary block" onClick={add}>Add category</button>
        <div class="notice t-plain"><Icon name="info" size={17} />Archiving a category doesn't delete its projects.</div>
      </Group>
      {archived.length > 0 && <Group><button class="link-quiet" onClick={() => setShowArch(!showArch)}>{showArch ? 'Hide' : 'Show'} {archived.length} archived</button>{showArch && archived.map((c) => <Row c={c} />)}</Group>}
    </>
  );
}
function FreelanceSection({ s }) {
  const b = s.business;
  const setB = (ch) => set({ business: { ...b, ...ch } });
  return (
    <>
      <Group title="Business details" hint="Printed on your invoices">
        <div class="form-row"><Field label="Business name" htmlFor="b-name"><TextInput id="b-name" value={b.name} onInput={(v) => setB({ name: v })} /></Field><Field label="Your name" htmlFor="b-owner"><TextInput id="b-owner" value={b.owner} onInput={(v) => setB({ owner: v })} /></Field></div>
        <div class="form-row"><Field label="Email" htmlFor="b-email"><TextInput id="b-email" type="email" value={b.email} onInput={(v) => setB({ email: v })} /></Field><Field label="Phone / WhatsApp" htmlFor="b-phone"><TextInput id="b-phone" type="tel" value={b.phone} onInput={(v) => setB({ phone: v })} /></Field></div>
        <Field label="Address" htmlFor="b-addr"><TextArea id="b-addr" value={b.address} onInput={(v) => setB({ address: v })} minRows={2} /></Field>
        <Field label="Website / portfolio" htmlFor="b-web"><TextInput id="b-web" value={b.website} onInput={(v) => setB({ website: v })} /></Field>
      </Group>
      <Group title="Invoices">
        <Field label="Number format" htmlFor="i-fmt" hint={'Next number: ' + M.nextInvoiceNumber().num + '. Tokens: {YYYY} {YY} {MM} {####}'}><TextInput id="i-fmt" value={s.invoiceFormat} onInput={(v) => set({ invoiceFormat: v })} /></Field>
        <div class="form-row"><Field label="Default currency" htmlFor="i-cur"><Select id="i-cur" value={s.defaultCurrency} onChange={(v) => set({ defaultCurrency: v })} options={Object.keys(CURRENCIES)} /></Field><Field label="Payment terms (days)" htmlFor="i-days"><NumberInput id="i-days" value={s.defaultTermsDays} onChange={(v) => set({ defaultTermsDays: +v || 0 })} /></Field></div>
        <Field label="Terms text" htmlFor="i-terms"><TextArea id="i-terms" value={s.defaultTermsText} onInput={(v) => set({ defaultTermsText: v })} /></Field>
        <Field label="Payment instructions" htmlFor="i-pay" hint="Printed on new invoices."><TextArea id="i-pay" value={s.paymentInstructions} onInput={(v) => set({ paymentInstructions: v })} placeholder={'Bank BCA\nAccount name\nAccount number'} /></Field>
      </Group>
    </>
  );
}

function icsFile() {
  const t0 = today(), end = addDays(t0, 30);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const esc = (x) => String(x || '').replace(/[,;\\]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vandenizar//Project Manager//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Jakarta', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:WIB', 'END:STANDARD', 'END:VTIMEZONE'];
  const ev = (uid, title, date, time, mins, desc) => {
    const d = date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${uid}@vandenizar`, `DTSTAMP:${stamp}`);
    if (time) lines.push(`DTSTART;TZID=Asia/Jakarta:${d}T${time.replace(':', '')}00`, `DURATION:PT${Math.max(15, mins || 30)}M`);
    else lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, time ? 'TRIGGER:-PT10M' : 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
  };
  for (const t of M.liveTasks().filter(M.isOpen)) {
    if (t.workDate && t.workDate >= t0 && t.workDate <= end) ev('w-' + t.id + '-' + t.workDate, t.title, t.workDate, t.workTime, t.estimateMinutes, 'Work schedule' + (M.projectName(t.projectId) ? ' · ' + M.projectName(t.projectId) : ''));
    if (t.deadlineDate && t.deadlineDate >= t0 && t.deadlineDate <= end) ev('d-' + t.id, 'Deadline: ' + t.title, t.deadlineDate, t.deadlineTime, 15, 'Hard deadline');
  }
  for (const p of M.liveProjects().filter((x) => !x.archived)) {
    if (p.followUpDate && p.followUpDate >= t0 && p.followUpDate <= end && p.stage === 'client_review') ev('f-' + p.id, 'Follow up: ' + p.name, p.followUpDate, null, 0, 'Waiting for feedback');
    if (p.deadlineDate && p.deadlineDate >= t0 && p.deadlineDate <= end) ev('p-' + p.id, 'Project deadline: ' + p.name, p.deadlineDate, p.deadlineTime, 15, '');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function PushRow({ s }) {
  const [on, setOn] = useState(pushFlag());
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setOn); }, []);
  const needsHome = isIOS() && !isStandalone();
  const blocked = !sync.user ? 'Sign in under Account & sync first.' : needsHome ? 'On iPhone, add Vandenizar to your Home Screen, open it from there, then turn this on.' : !pushSupported() ? 'This browser does not support notifications.' : '';
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
        <div class="grow"><div>Notifications on this device</div><div class="hint">{blocked || 'Work schedule reminders, deadlines, project follow-ups and overdue invoices. Works with the app closed.'}</div></div>
        <button class={'toggle ' + (on ? 'on' : '')} role="switch" aria-checked={on} aria-label="Notifications on this device" disabled={!!blocked || busy} onClick={toggle} />
      </div>
      {on && <>
        <Field label="Remind me before scheduled work"><Segmented class="full" options={[{ id: 0, label: 'On time' }, { id: 5, label: '5m' }, { id: 15, label: '15m' }, { id: 30, label: '30m' }]} value={s.pushLead || 0} onChange={(v) => set({ pushLead: +v })} /></Field>
        <div><button class="btn sm outline" onClick={async () => { try { const n = await testPush(); toast(n ? 'Test sent' : 'No device is subscribed yet', { tone: n ? '' : 'warn' }); } catch (e) { toast(e.message, { tone: 'warn' }); } }}><Icon name="bell" size={15} />Send test</button></div>
      </>}
    </>
  );
}
function NotificationsSection({ s }) {
  useStore();
  const n = C.notifyPrefs();
  const tog = (on, label, onClick) => <button class={'toggle ' + (on ? 'on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />;
  return (
    <>
      {!LOCAL && <Group title="Push notifications" hint="Turn on per device"><PushRow s={s} /></Group>}
      <Group title="Work reminders" hint="When deadlines without a time, follow-ups and overdue invoices are announced">
        <Field label="Time (WIB)" htmlFor="set-rt"><TimeInput id="set-rt" value={s.reminderTime} onChange={(v) => set({ reminderTime: v || '09:00' })} /></Field>
      </Group>
      <Group title="Content reminders">
        <div class="set-row"><div class="grow"><div>Morning summary</div><div class="hint">What is on for the day: stage tasks, posts and Threads.</div></div>{tog(n.morning, 'Morning summary', () => C.setNotify({ morning: !n.morning }))}</div>
        {n.morning && <Field label="Morning summary time (WIB)" htmlFor="set-mt"><TimeInput id="set-mt" value={n.morningTime} onChange={(v) => C.setNotify({ morningTime: v || '08:00' })} /></Field>}
        <div class="set-row"><div class="grow"><div>Post reminder</div><div class="hint">A nudge on days a post is due.</div></div>{tog(n.postReminder, 'Post reminder', () => C.setNotify({ postReminder: !n.postReminder }))}</div>
        {n.postReminder && <Field label="Post reminder time (WIB)" htmlFor="set-pt"><TimeInput id="set-pt" value={n.postTime} onChange={(v) => C.setNotify({ postTime: v || '19:00' })} /></Field>}
      </Group>
      <Group title="Calendar file instead" hint="Works everywhere, no account needed">
        <div class="muted" style={{ fontSize: 14 }}>Exports the next 30 days of scheduled work, deadlines and follow-ups as an .ics file with alerts. Import it into Apple or Google Calendar. Export again after big changes.</div>
        <div><button class="btn sm outline" onClick={() => downloadBlob('vandenizar-' + today() + '.ics', icsFile(), 'text/calendar', 'Calendar file saved')}><Icon name="download" size={15} />Export .ics</button></div>
      </Group>
    </>
  );
}
function ShortcutsSection() {
  const base = location.origin + location.pathname;
  const links = [['New task', base + '#/?add=task'], ['Search', base + '#/?add=search'], ['Today', base + '#/']];
  return (
    <>
      <Group title="1. Put it on your Home Screen"><div class="muted" style={{ fontSize: 14 }}>Open this site in Safari on your iPhone. Tap Share, then Add to Home Screen. Open Vandenizar from the new icon and sign in.</div></Group>
      <Group title="2. Quick links" hint="Each link opens straight to a form or screen">
        {links.map(([label, url]) => <div class="set-row"><div class="grow"><div>{label}</div><div class="hint ellipsis">{url}</div></div><button class="btn sm outline" onClick={() => copyText(url, 'Link copied')}><Icon name="copy" size={14} />Copy</button></div>)}
      </Group>
      <Group title="3. Make an iPhone shortcut"><div class="muted" style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{'Open the Shortcuts app, tap +, then Add Action. Search for Open URLs and paste a link from above.\nName it, for example "New task". You can say "Hey Siri, new task", or set it on Back Tap or the Action Button.'}</div></Group>
    </>
  );
}
const COUNT_LABELS = [['tasks', 'task'], ['projects', 'project'], ['clients', 'client'], ['invoices', 'invoice'], ['posts', 'post'], ['threads', 'thread'], ['links', 'resource']];
const SOURCE_LABELS = { work: 'Vandenizar Work backup', pm: 'Project manager export', cos: 'Content OS export' };
function ImportSheet({ json, preview, close }) {
  const [busy, setBusy] = useState(false);
  const parts = COUNT_LABELS.filter(([k]) => preview.counts[k]).map(([k, w]) => preview.counts[k] + ' ' + w + (preview.counts[k] === 1 ? '' : 's'));
  const run = async () => {
    setBusy(true);
    try { const r = await importBackup(json); close(); toast('Imported ' + r.added + ' item' + (r.added === 1 ? '' : 's')); }
    catch (e) { setBusy(false); toast(e.message || 'Import failed.', { tone: 'warn', duration: 5000 }); }
  };
  return (
    <>
      <SheetHead title="Import backup" sub={SOURCE_LABELS[preview.source]} onClose={close} />
      <SheetBody>
        <div class="import-counts">{parts.length ? parts.join(', ') : 'No records in this file'}</div>
        {preview.already > 0 && <div class="notice t-butter"><Icon name="info" size={17} />Already imported: {preview.already} record{preview.already === 1 ? '' : 's'} are on this device and will be skipped.</div>}
        <div class="muted" style={{ fontSize: 13 }}>Nothing on this device is changed or overwritten.</div>
      </SheetBody>
      <SheetFoot>
        <button type="button" class="btn ghost" onClick={close}>Cancel</button>
        <button type="button" class="btn primary" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
      </SheetFoot>
    </>
  );
}
function DataSection() {
  useStore();
  const fileRef = useRef();
  const c = counts();
  const doExport = () => { const name = `vandenizar-work-${today()}.json`; downloadBlob(name, JSON.stringify(exportAll(), null, 1), 'application/json', 'Backup saved: ' + name); };
  const pick = async (file) => {
    let json;
    try { json = JSON.parse(await file.text()); } catch { return toast('That file could not be read.', { tone: 'warn' }); }
    try { const preview = previewImport(json); openOverlay((close) => <ImportSheet json={json} preview={preview} close={close} />, { kind: 'sheet' }); }
    catch (e) { toast(e.message || 'That file could not be read.', { tone: 'warn' }); }
  };
  return (
    <>
      <Group title="Where your data lives">
        <div style={{ fontSize: 14 }}>{sync.user ? <>Saved on this device and synced to <b>{sync.user.email}</b>.</> : 'Saved on this device only. Sign in to back it up.'}</div>
        <div class="muted" style={{ fontSize: 13 }}>{c.pmTasks} tasks · {c.pmProjects} projects · {c.clients} clients · {c.invoices} invoices · {C.igItems().length} posts</div>
      </Group>
      <Group title="Backup file" hint="Export saves everything. Import accepts this app's backup, a project manager export or a Content OS export, and never overwrites.">
        <div class="row gap-8 wrap">
          <button class="btn sm outline" onClick={doExport}><Icon name="download" size={15} />Export</button>
          <button class="btn sm outline" onClick={() => fileRef.current.click()}><Icon name="upload" size={15} />Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (f) pick(f); }} />
        </div>
      </Group>
      <Group title="Sample data">
        <div class="row gap-8 wrap">
          {hasSample() ? <button class="btn sm outline" onClick={async () => { if (await confirmDialog({ title: 'Remove sample data?', body: 'Only records made by "Load sample data" are removed. Your own entries stay.', confirmLabel: 'Remove sample data' })) { removeSampleData(); toast('Sample data removed'); } }}>Remove sample data</button>
            : <button class="btn sm outline" onClick={() => { loadSampleData(); toast('Sample data loaded'); navigate('/'); }}>Load sample data</button>}
        </div>
      </Group>
      <Group title="Reset">
        <div><button class="btn sm danger-soft" onClick={async () => { if (await confirmDialog({ title: 'Erase all work data?', body: 'All tasks, projects, clients, invoices, payments are deleted on this device and, if signed in, in your account. Export a backup first.', confirmLabel: 'Erase', danger: true })) { await wipeAll(); toast('Data erased'); navigate('/'); } }}>Erase all data</button></div>
      </Group>
    </>
  );
}

function LocalNote() {
  return <div class="quiet-note">Saved on this device. Cloud sync is off.</div>;
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
    <Group>
      <div class="row between gap-8"><div style={{ fontSize: 14, minWidth: 0 }}>Signed in as <b class="ellipsis">{s.user.email}</b></div><span class={'pill sm t-' + (s.status === 'error' ? 'rose' : s.status === 'synced' ? 'sage' : 'plain')}>{syncLabel(s)}</span></div>
      <div class="muted" style={{ fontSize: 14 }}>Changes save on this device first, then sync so your iPhone and laptop show the same data.</div>
      {s.status === 'error' && <div class="status-banner t-rose"><Icon name="alert" size={18} /><div class="grow">{s.error}. Your changes are safe on this device and sync when this clears.</div></div>}
      {s.recovery && (
        <div class="form">
          <Field label="Set a new password" htmlFor="acc-newpw"><TextInput id="acc-newpw" type="password" value={newPw} onInput={setNewPw} placeholder="At least 8 characters" /></Field>
          <button class="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || newPw.length < 8} onClick={() => run(async () => { await updatePassword(newPw); sync.recovery = false; setNewPw(''); toast('Password updated'); })}>Save new password</button>
        </div>
      )}
      <div class="row gap-8 wrap">
        <button class="btn outline" disabled={s.status === 'syncing'} onClick={() => syncNow()}><Icon name="restore" size={16} />Sync now</button>
        <button class="btn ghost" onClick={async () => { if (await confirmDialog({ title: 'Sign out?', body: 'Your data stays on this device and in your account.', confirmLabel: 'Sign out' })) { await signOut(); toast('Signed out'); } }}>Sign out</button>
      </div>
      {msg && <div class="field-hint bad">{msg}</div>}
    </Group>
  );
  return (
    <Group>
      <div class="muted" style={{ fontSize: 14 }}>Sign in to sync between your iPhone and laptop.</div>
      <form class="form" onSubmit={(e) => { e.preventDefault(); run(async () => {
        if (mode === 'signin') { await signIn(email, pw); toast('Signed in. Syncing your data…'); }
        else { const r = await signUp(email, pw); if (r.needsConfirm) setMsg('Check your email and tap the confirmation link, then sign in here.'); else toast('Account created. Syncing your data…'); }
      }); }}>
        <Field label="Email" htmlFor="acc-email"><TextInput id="acc-email" type="email" inputMode="email" value={email} onInput={setEmail} placeholder="you@email.com" /></Field>
        <Field label="Password" htmlFor="acc-pw" hint={mode === 'signup' ? 'At least 8 characters.' : null}><TextInput id="acc-pw" type="password" value={pw} onInput={setPw} /></Field>
        <div class="row gap-8 wrap">
          <button class="btn primary" type="submit" disabled={busy || !email || pw.length < (mode === 'signup' ? 8 : 1)}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          {mode === 'signin' && <button class="btn ghost" type="button" disabled={busy || !email} onClick={() => run(async () => { await resetPassword(email); setMsg('If that email has an account, a reset link is on its way.'); })}>Forgot password</button>}
          <button class="btn ghost" type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create account' : 'I have an account'}</button>
        </div>
      </form>
      {msg && <div class={'field-hint' + (msg.startsWith('Check') || msg.startsWith('If') ? '' : ' bad')}>{msg}</div>}
    </Group>
  );
}
// ---------- Sign-in gate (shown before the app when signed out) ----------
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const run = async (fn) => { setBusy(true); setMsg(''); setOk(false); try { await fn(); } catch (e) { setMsg(navigator.onLine === false ? "You're offline. Connect to sign in the first time." : friendly(e)); } finally { setBusy(false); } };
  return (
    <main class="main login" id="main">
      <div class="brand"><span class="brand-word">vandenizar</span><span class="brand-sub">projects</span></div>
      <h1 class="login-title">Sign in.</h1>
      <p class="muted" style={{ fontSize: 15 }}>Use your Vandenizar account. Your projects sync between your iPhone and Mac.</p>
      <form class="form" onSubmit={(e) => { e.preventDefault(); if (!email.trim() || !pw) { setMsg('Enter your email and password.'); return; } run(async () => { await signIn(email, pw); }); }} noValidate>
        <Field label="Email" htmlFor="l-email"><TextInput id="l-email" type="email" inputMode="email" value={email} onInput={setEmail} placeholder="you@email.com" autoComplete="email" /></Field>
        <Field label="Password" htmlFor="l-pw"><TextInput id="l-pw" type="password" value={pw} onInput={setPw} autoComplete="current-password" /></Field>
        {msg && <div class={'field-hint' + (ok ? '' : ' bad')}>{msg}</div>}
        <button class="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button class="btn ghost" type="button" disabled={busy} onClick={() => { if (!email.trim()) { setMsg('Type your email first.'); return; } run(async () => { await resetPassword(email); setOk(true); setMsg('If that email has an account, a reset link is on its way.'); }); }}>Forgot password</button>
      </form>
    </main>
  );
}

function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login/i.test(m)) return 'Email or password is wrong.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first, then sign in.';
  if (/signups? not allowed/i.test(m)) return 'New accounts are turned off.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Try again when you are online.';
  return m;
}

// ---------- Trash ----------
export function TrashPage() {
  useStore();
  const tasks = all('pmTasks').filter((t) => t.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const projects = all('pmProjects').filter((p) => p.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const empty = async () => {
    if (!(await confirmDialog({ title: 'Empty the trash?', body: 'This cannot be undone.', confirmLabel: 'Empty trash', danger: true }))) return;
    tasks.forEach((t) => remove('pmTasks', t.id)); projects.forEach((p) => remove('pmProjects', p.id)); toast('Trash emptied');
  };
  const Row = ({ coll, r, title }) => (
    <div class="list-row">
      <div class="row-main"><div class="row-title">{title}</div><div class="row-meta">Deleted {fmtAgo(r.deletedAt)}</div></div>
      <button class="btn xs outline" onClick={() => { patch(coll, r.id, { deletedAt: null }); toast('Restored'); }}>Restore</button>
      <button class="icon-btn ghost sm" aria-label="Delete forever" onClick={async () => { if (await confirmDialog({ title: 'Delete forever?', body: 'This cannot be undone.', confirmLabel: 'Delete forever', danger: true })) { remove(coll, r.id); toast('Deleted forever'); } }}><Icon name="trash" size={15} /></button>
    </div>
  );
  return (
    <div class="page narrow">
      <PageHeader title="Trash." actions={(tasks.length || projects.length) ? <button class="btn sm outline" onClick={empty}>Empty trash</button> : null} />
      {!tasks.length && !projects.length ? <Empty icon="trash" title="Trash is empty">Deleted tasks and projects wait here until you remove them for good.</Empty> : <>
        {projects.length > 0 && <section class="sheet-surface"><div class="group-label">Projects</div><div class="list">{projects.map((p) => <Row coll="pmProjects" r={p} title={p.name || 'Untitled project'} />)}</div></section>}
        {tasks.length > 0 && <section class="sheet-surface"><div class="group-label">Tasks</div><div class="list">{tasks.map((t) => <Row coll="pmTasks" r={t} title={t.title || 'Untitled task'} />)}</div></section>}
      </>}
    </div>
  );
}

// ---------- More (phones) ----------
export function MorePage() {
  useStore(); const s = useSync();
  const rows = [
    ['Clients', 'Freelance client list', 'users', '/clients'],
    ['Invoices', 'Create and track invoices', 'file', '/invoices'],
    ['Resources', 'Links, references and saved things', 'link', '/more/resources'],
    ['Settings', 'Account, notifications, defaults', 'settings', '/settings'],
    ['Trash', 'Deleted tasks and projects', 'trash', '/trash'],
  ];
  return (
    <div class="page narrow">
      <PageHeader title="More." />
      <nav class="more-list">
        {rows.map(([label, sub, icon, path]) => (
          <a class="more-row" href={'#' + path}><Icon name={icon} size={20} /><span class="grow"><span class="more-label">{label}</span><span class="more-sub">{sub}</span></span><Icon name="chevronRight" size={16} class="muted" /></a>
        ))}
      </nav>
      <div class="quiet-note center"><span class={'save-dot ' + (s.status === 'error' ? 'error' : '')} />{syncLabel(s)}</div>
    </div>
  );
}
