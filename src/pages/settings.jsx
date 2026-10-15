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
    morning: morningDue && seen.morning !== n.date, evening: eveningDue && seen.evening !== n.date && !get('dailyReviews', n.date)?.wins,
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
          const body = kind === 'morning' ? `${openToday} task(s) today${uploads ? `, ${uploads} upload(s) planned` : ''}. Pick your main priority.` : 'Two-minute review: wins, what is left, and tomorrow\'s main priority.';
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
        <div class="set-row wrap">
          <div class="grow"><div>Alert me</div></div>
          <Segmented options={[{ id: 0, label: 'On time' }, { id: 5, label: '5m early' }, { id: 15, label: '15m early' }, { id: 30, label: '30m early' }]} value={lead} onChange={(v) => onLead(+v)} />
          <button class="btn sm ghost" onClick={async () => { try { const n = await testPush(); toast(n ? 'Test sent' : 'No device is subscribed yet', { tone: n ? '' : 'warn' }); } catch (e) { toast(e.message, { tone: 'warn' }); } }}>Send test</button>
        </div>
      )}
    </>
  );
}

export function SettingsPage() {
  useStore();
  const s = M.settings();
  const [theme, setTheme] = useState(getTheme());
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : 'unsupported');
  const fileRef = useRef();
  const set = (ch) => M.setSettings(ch);
  const setBiz = (ch) => M.setSettings({ business: { ...s.business, ...ch } });
  const setRem = (kind, ch) => M.setSettings({ reminders: { ...s.reminders, [kind]: { ...s.reminders[kind], ...ch } } });
  const c = counts();
  const hasSample = M.liveTasks().some((t) => t.sample) || all('contents').some((x) => x.sample) || all('clients').some((x) => x.sample);
  const standalone = typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  const preview = M.formatInvoiceNumber(s.invoiceFormat, (M.meta('counters', {}).seq ? 1 : 1));
  const doExport = () => {
    const name = `vandenizar-backup-${today()}.json`;
    downloadBlob(name, JSON.stringify(exportAll(), null, 1), 'application/json', 'Backup saved: ' + name);
  };
  const doImport = async (file) => {
    try {
      const json = JSON.parse(await file.text());
      if (!(await confirmDialog({ title: 'Replace everything with this backup?', body: `Backup from ${json.exportedAt ? fmtShort(isoOf(Date.parse(json.exportedAt))) : 'unknown date'}. Data on this device that isn't in the backup will be removed. Export first if you're unsure.`, confirmLabel: 'Restore backup', danger: true }))) return;
      const ok = await importAll(json);
      toast(ok ? 'Backup restored' : 'Restored in memory, but saving failed. Try again.', { tone: ok ? '' : 'warn' });
    } catch (e) { toast(e.message || 'That file could not be read.', { tone: 'warn' }); }
  };
  return (
    <div class="page narrow">
      <PageHeader eyebrow="Workspace" title="Settings" />
      <AccountCard />

      <div class="card"><div class="set-group">
        <div class="card-title">You</div>
        <Field label="Your name" htmlFor="s-name"><TextInput id="s-name" value={s.name} onInput={(v) => set({ name: v })} /></Field>
        <Field label="Appearance"><Segmented options={[{ id: 'system', label: 'Match device' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={theme} onChange={(v) => { setTheme(v); try { localStorage.setItem('vz:theme', v); } catch {} if (v === 'system') document.documentElement.removeAttribute('data-theme'); applyTheme(v); }} /></Field>
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Daily system</div>
        <Field label="Task categories" hint="Renaming a category updates existing tasks. Removing one keeps it on old tasks."><ListEditor items={s.categories} min={1} idPrefix="s-cat" placeholder="Add category" onChange={(v) => renameAware('categories', s.categories, v, (a, b) => all('tasks').filter((t) => t.category === a).forEach((t) => patch('tasks', t.id, { category: b })))} /></Field>
        <div class="form-row">
          <Field label="Default category" htmlFor="s-dcat"><Select id="s-dcat" value={s.defaultCategory} onChange={(v) => set({ defaultCategory: v })} options={s.categories} /></Field>
          <Field label="Default priority" htmlFor="s-dprio"><Select id="s-dprio" value={s.defaultPriority} onChange={(v) => set({ defaultPriority: v })} options={M.PRIORITIES} /></Field>
        </div>
        <div class="form-row">
          <Field label="Week starts on" htmlFor="s-ws"><Select id="s-ws" value={String(s.weekStart)} onChange={(v) => set({ weekStart: +v })} options={[{ id: '1', label: 'Monday' }, { id: '0', label: 'Sunday' }, { id: '6', label: 'Saturday' }]} /></Field>
          <Field label="Weekly goal limit" htmlFor="s-gl" hint="A gentle nudge, not a hard cap"><NumberInput id="s-gl" value={s.weeklyGoalLimit} min={1} onChange={(v) => set({ weeklyGoalLimit: Math.max(1, +v || 1) })} /></Field>
        </div>
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Reminders</div>
        <PushRow lead={s.pushLead ?? 0} onLead={(v) => set({ pushLead: v })} />
        {[['morning', 'Morning brief', "Today's tasks, planned uploads and weekly goals"], ['evening', 'Daily review', 'Review the day and plan tomorrow']].map(([k, label, hint]) => (
          <div class="set-row">
            <div class="grow"><div>{label}</div><div class="hint">{hint}</div></div>
            <div style={{ width: 128 }}><TimeInput id={'s-rem-' + k} value={s.reminders[k].time} onChange={(v) => v && setRem(k, { time: v })} /></div>
            <button class={'toggle ' + (s.reminders[k].enabled ? 'on' : '')} role="switch" aria-checked={s.reminders[k].enabled} aria-label={label} onClick={() => setRem(k, { enabled: !s.reminders[k].enabled })} />
          </div>
        ))}
        {!pushFlag() && <div class="banner info"><Icon name="info" size={18} /><div>
          <b>How reminders work here.</b> When you open the app after a reminder time, a card shows on Today. {perm === 'granted' ? 'This browser will also pop a notification if the app is open at that time.' : perm === 'unsupported' ? 'This browser can\'t show notifications from a website without a server, so nothing is sent to your lock screen.' : 'You can also allow notifications while the app is open.'} For a reliable phone alert, add both reminders to your calendar.
          <div class="row gap-8 wrap" style={{ marginTop: 10 }}>
            {perm === 'default' && <button class="btn sm" onClick={async () => { try { const p = await Notification.requestPermission(); setPerm(p); toast(p === 'granted' ? 'Notifications allowed while the app is open' : 'Notifications not allowed'); } catch { toast('This browser blocked the request.', { tone: 'warn' }); } }}>Allow notifications</button>}
            <button class="btn sm" onClick={() => downloadBlob('vandenizar-reminders.ics', icsFile(), 'text/calendar', 'Calendar file saved. Open it to add the daily alerts.')}><Icon name="calendar" size={15} />Add to calendar (.ics)</button>
          </div>
        </div></div>}
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Content OS</div>
        <Field label="Platforms" hint="Renaming updates existing content."><ListEditor items={s.platforms} min={1} idPrefix="s-plat" placeholder="Add platform" onChange={(v) => renameAware('platforms', s.platforms, v, (a, b) => all('contents').filter((x) => (x.platforms || []).includes(a)).forEach((x) => patch('contents', x.id, { platforms: x.platforms.map((p) => (p === a ? b : p)) })))} /></Field>
        <Field label="Content pillars" hint="Removing a pillar keeps it on existing content."><ListEditor items={s.pillars} idPrefix="s-pil" placeholder="Add pillar" onChange={(v) => renameAware('pillars', s.pillars, v, (a, b) => all('contents').filter((x) => x.pillar === a).forEach((x) => patch('contents', x.id, { pillar: b })))} /></Field>
        <Field label="Formats"><ListEditor items={s.formats} idPrefix="s-fmt" placeholder="Add format" onChange={(v) => renameAware('formats', s.formats, v, (a, b) => all('contents').filter((x) => x.format === a).forEach((x) => patch('contents', x.id, { format: b })))} /></Field>
        <Field label="Weekly publishing target" htmlFor="s-wt"><NumberInput id="s-wt" value={s.weeklyTarget} min={0} onChange={(v) => set({ weeklyTarget: Math.max(0, +v || 0) })} /></Field>
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Freelance & invoices</div>
        <div class="form-row">
          <Field label="Business name on invoices" htmlFor="s-biz"><TextInput id="s-biz" value={s.business.name} onInput={(v) => setBiz({ name: v })} /></Field>
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
        <Field label="Invoice number format" htmlFor="s-ifmt" hint={<>Use {'{YYYY}'}, {'{YY}'}, {'{MM}'} and {'{####}'} for the counter. Next number: <b>{M.nextInvoiceNumber().num}</b>. Numbers are never reused.</>}><TextInput id="s-ifmt" value={s.invoiceFormat} onInput={(v) => set({ invoiceFormat: v })} /></Field>
        <div class="form-row">
          <Field label="Default currency" htmlFor="s-cur"><Select id="s-cur" value={s.defaultCurrency} onChange={(v) => set({ defaultCurrency: v })} options={Object.keys(CURRENCIES)} /></Field>
          <Field label="Payment terms (days)" htmlFor="s-terms"><NumberInput id="s-terms" value={s.defaultTermsDays} onChange={(v) => set({ defaultTermsDays: Math.max(0, +v || 0) })} /></Field>
        </div>
        <Field label="Default terms text" htmlFor="s-ttext"><TextArea id="s-ttext" value={s.defaultTermsText} onInput={(v) => set({ defaultTermsText: v })} /></Field>
        <Field label="Payment instructions" htmlFor="s-payi" hint="Printed on new invoices. Sent invoices keep what they had."><TextArea id="s-payi" value={s.paymentInstructions} onInput={(v) => set({ paymentInstructions: v })} placeholder={'Bank BCA\nAccount name\nAccount number'} /></Field>
        <Field label="Project types"><ListEditor items={s.projectTypes} idPrefix="s-pt" placeholder="Add project type" onChange={(v) => renameAware('projectTypes', s.projectTypes, v, (a, b) => all('projects').filter((x) => x.type === a).forEach((x) => patch('projects', x.id, { type: b })))} /></Field>
        <Field label="Default deliverables for new projects"><ListEditor items={s.defaultDeliverables} idPrefix="s-dd" placeholder="Add deliverable" onChange={(v) => set({ defaultDeliverables: v })} /></Field>
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Add to iPhone home screen</div>
        {standalone ? <div class="row gap-8"><Icon name="check" size={18} style={{ color: 'var(--good)' }} /><span>You're using the installed app.</span></div> : (
          <ol class="install-steps">
            <li>Open this site in <b>Safari</b> on your iPhone.</li>
            <li>Tap the <b>Share</b> button <Icon name="share" size={15} style={{ display: 'inline', verticalAlign: '-2px' }} /> at the bottom.</li>
            <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open Vandenizar from the new icon. It runs full screen, like an app.</li>
          </ol>
        )}
        <div class="field-hint">The home screen app keeps its own storage, separate from Safari tabs. If you started in Safari, export a backup there and import it inside the installed app.</div>
      </div></div>

      <div class="card"><div class="set-group">
        <div class="card-title">Your data</div>
        <div class="row gap-10" style={{ fontSize: 14 }}>
          <span class={'save-state ' + persist.status} style={{ padding: 0 }}><span class="save-dot" /></span>
          <div class="grow">{persist.mode === 'idb' ? 'Saved in this browser\'s database on this device.' : persist.mode === 'local' ? 'Saved in basic browser storage on this device.' : 'This browser blocks storage. Changes are lost when you close the page.'} {persist.lastSaved ? `Last save ${fmtAgo(persist.lastSaved)}.` : ''}</div>
        </div>
        <div class="muted" style={{ fontSize: 13 }}>{c.tasks} tasks · {c.contents} content · {c.projects} projects · {c.clients} clients · {c.invoices} invoices · {c.payments} payments · {c.goals} goals</div>
        <div class="banner info"><Icon name="info" size={18} /><div>Nothing is uploaded anywhere yet. Data lives only on this device and browser, so export a backup now and then until cloud sync is set up.</div></div>
        <div class="row gap-8 wrap">
          <a class="btn" href="#/trash"><Icon name="trash" size={16} />Trash</a>
          <button class="btn" onClick={doExport}><Icon name="download" size={16} />Export backup</button>
          <button class="btn" onClick={() => fileRef.current.click()}><Icon name="upload" size={16} />Import backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (f) doImport(f); }} />
        </div>
        <hr class="div" />
        <div class="row gap-8 wrap">
          {hasSample ? <button class="btn soft" onClick={async () => { if (await confirmDialog({ title: 'Remove sample data?', body: 'Only records created by "Load sample data" are removed. Your own entries stay.', confirmLabel: 'Remove sample data' })) { removeSampleData(); toast('Sample data removed'); } }}>Remove sample data</button>
            : <button class="btn soft" onClick={() => { loadSampleData(); toast('Sample data loaded'); }}>Load sample data</button>}
          <button class="btn danger-soft" onClick={async () => { if (await confirmDialog({ title: 'Erase everything on this device?', body: 'All tasks, content, projects, clients, invoices, payments, reviews and settings are deleted, on this device and, if you are signed in, in your account too. Export a backup first if you might need them.', confirmLabel: 'Erase all data', danger: true })) { await wipeAll(); toast('All data erased'); navigate('/'); } }}>Erase all data</button>
        </div>
      </div></div>
      <div class="muted" style={{ fontSize: 12, textAlign: 'center', paddingBottom: 12 }}>Vandenizar Creator Workspace · local build · times in WIB (Asia/Jakarta)</div>
    </div>
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
    <div class="card" id="account"><div class="set-group">
      <div class="row between"><div class="card-title">Account & sync</div><span class={'badge sm ' + (s.status === 'error' ? 't-red' : s.status === 'synced' ? 't-green' : 't-grey')}>{syncLabel(s)}</span></div>
      <div style={{ fontSize: 14 }}>Signed in as <b>{s.user.email}</b>. Everything you change here is saved on this device first, then synced to your account so your iPhone and laptop show the same data.</div>
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
    <div class="card" id="account"><div class="set-group">
      <div class="card-title">Account & sync</div>
      <div class="muted" style={{ fontSize: 14 }}>Sign in to back up your data and use the same workspace on your iPhone and laptop. Without an account, everything stays on this device only.</div>
      <Segmented options={[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Create account' }]} value={mode} onChange={(v) => { setMode(v); setMsg(''); }} />
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
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Try again when you are online.';
  return m;
}
