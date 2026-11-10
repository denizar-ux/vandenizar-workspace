// Threads: drafts edited in place, schedule chip, Copy, Posted with Undo, Posted tab.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Segmented, Empty, DateInput, TimeInput, Field } from '../ui/kit.jsx';
import { openOverlay, SheetHead, SheetBody, SheetFoot, toast } from '../ui/overlay.jsx';
import { navigate } from '../lib/router.js';
import { get, patch, useStore } from '../lib/db.js';
import { today, isoOf, fmtDay, relDay } from '../lib/date.js';
import * as C from '../content/model.js';

async function copy(text) {
  try { await navigator.clipboard.writeText(text || ''); toast('Copied'); } catch { toast('Copy failed', { tone: 'warn' }); }
}

export function ThreadsBody({ query = {} }) {
  useStore();
  const [tab, setTab] = useState('drafts');
  // a New thread link lands on the drafts tab so the composer exists to focus
  useEffect(() => { if (query.new) setTab('drafts'); }, [query.new]);
  const drafts = C.threadDrafts(), posted = C.threadPosted();
  const sched = drafts.filter((t) => t.date), loose = drafts.filter((t) => !t.date);
  return (
    <>
      <Segmented class="compact" options={[{ id: 'drafts', label: 'Drafts', count: drafts.length }, { id: 'posted', label: 'Posted', count: posted.length }]} value={tab} onChange={setTab} />
      {tab === 'drafts' ? (
        <>
          <Composer focusNew={!!query.new} />
          {drafts.length === 0 && <Empty icon="chat" title="No drafts" >Write it down while it is fresh. Give it a day and time to see it on Today, then copy it when you post.</Empty>}
          {sched.length > 0 && <Group label="Scheduled" items={sched} />}
          {loose.length > 0 && <Group label="Not scheduled" items={loose} />}
        </>
      ) : posted.length ? <Group label="" items={posted} /> : <Empty icon="chat" title="Nothing posted yet">Drafts you mark as posted show up here.</Empty>}
    </>
  );
}

function Group({ label, items }) {
  return (
    <section class="block">
      {label && <div class="group-label">{label}<span class="count">{items.length}</span></div>}
      <div class="thread-list">{items.map((t) => <ThreadCard key={t.id} t={t} />)}</div>
    </section>
  );
}

function Composer({ focusNew }) {
  const [text, setText] = useState('');
  const ref = useRef();
  useEffect(() => {
    if (!focusNew) return;
    if (ref.current) ref.current.focus();
    navigate('/content/threads', { replace: true });
  }, [focusNew]);
  const add = () => {
    if (!text.trim()) return;
    C.addThread(text.slice(0, C.THREADS_LIMIT));
    setText('');
  };
  return (
    <div class="thread-composer">
      <textarea ref={ref} id="thread-new" rows={2} class="thread-ta" value={text} placeholder="Write a draft" aria-label="New Thread draft"
        onInput={(e) => setText(e.currentTarget.value.slice(0, C.THREADS_LIMIT))}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
      <div class="row between gap-8">
        <span class="muted tnum">{text.length ? text.length + '/' + C.THREADS_LIMIT : ''}</span>
        <button type="button" class="btn sm primary" disabled={!text.trim()} onClick={add}>Add draft</button>
      </div>
    </div>
  );
}

function schedLabel(t) {
  if (!t.date) return 'Add day';
  const d = t.date === today() ? 'Today' : relDay(t.date) === 'Tomorrow' ? 'Tomorrow' : fmtDay(t.date);
  return d + (t.time ? ', ' + t.time : '');
}

function ThreadCard({ t }) {
  const posted = !!t.postedAt;
  const late = !posted && t.date && t.date < today();
  const fit = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
  const del = () => {
    C.trashItem(t.id);
    toast('Draft deleted', { action: { label: 'Undo', run: () => C.restoreItem(t.id) } });
  };
  const markPosted = () => { C.markPosted(t.id, true); toast('Thread posted', { action: { label: 'Undo', run: () => C.markPosted(t.id, false) } }); };
  return (
    <div class={'thread-card' + (posted ? ' posted' : '')}>
      <textarea class="thread-ta" rows={1} value={t.text || ''} aria-label="Thread text" ref={fit}
        onInput={(e) => { patch('cItems', t.id, { text: e.currentTarget.value.slice(0, C.THREADS_LIMIT) }); fit(e.currentTarget); }} />
      <div class="thread-foot">
        {posted
          ? <span class="pill sm t-sage"><Icon name="check" size={13} />Posted {fmtDay(isoOf(Date.parse(t.postedAt)))}</span>
          : <button type="button" class={'pill sm clickable ' + (late ? 't-rose' : t.date ? 't-butter' : 't-plain')} onClick={() => openSchedule(t.id)}><Icon name="calendar" size={13} />{schedLabel(t)}{late ? ' (late)' : ''}</button>}
        <button type="button" class="icon-btn ghost xs" aria-label="Delete draft" onClick={del}><Icon name="trash" size={15} /></button>
        <span class="grow" />
        {(t.text || '').length > 400 && <span class="muted tnum">{t.text.length}/{C.THREADS_LIMIT}</span>}
        <button type="button" class="btn xs outline" onClick={() => copy(t.text)}><Icon name="copy" size={14} />Copy</button>
        {posted
          ? <button type="button" class="btn xs ghost" onClick={() => { C.markPosted(t.id, false); toast('Back to drafts'); }}>Undo posted</button>
          : <button type="button" class="btn xs primary" onClick={markPosted}><Icon name="check" size={14} />Posted</button>}
      </div>
    </div>
  );
}

function openSchedule(id) { openOverlay((close) => <ScheduleSheet id={id} close={close} />, { kind: 'sheet' }); }
function ScheduleSheet({ id, close }) {
  useStore();
  const t = get('cItems', id) || {};
  return (
    <>
      <SheetHead title="Schedule Thread" onClose={close} />
      <SheetBody>
        <div class="form">
          <div class="field-pair">
            <Field label="Day" htmlFor="th-date"><DateInput id="th-date" value={t.date || ''} onChange={(v) => C.scheduleThread(id, v || null, v ? t.time || null : null)} /></Field>
            <Field label="Time (optional)" htmlFor="th-time"><TimeInput id="th-time" value={t.time || ''} onChange={(v) => C.scheduleThread(id, t.date || today(), v || null)} /></Field>
          </div>
        </div>
      </SheetBody>
      <SheetFoot>
        {t.date && <button type="button" class="btn ghost" onClick={() => { C.scheduleThread(id, null, null); close(); }}>Remove schedule</button>}
        <button type="button" class="btn primary" onClick={close}>Done</button>
      </SheetFoot>
    </>
  );
}
