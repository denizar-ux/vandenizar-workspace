// Post detail (#/post/:id): title, stage, schedule dates, references, hook, script, caption, notes, details.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextArea, Select, DateInput, Segmented, Empty } from '../ui/kit.jsx';
import { openMenu, openOverlay, SheetHead, SheetBody, toast, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { BackBar } from '../ui/parts.jsx';
import { PostStagePill, NextButton } from '../ui/slotTile.jsx';
import { navigate, back } from '../lib/router.js';
import { get, put, remove, useStore, persist } from '../lib/db.js';
import { addDays, isoOf, fmtShort } from '../lib/date.js';
import { weekRange } from '../content/time.js';
import * as C from '../content/model.js';

async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text || ''); toast(ok); } catch { toast('Copy failed', { tone: 'warn' }); }
}

export function PostDetail({ id }) {
  useStore();
  const it = get('cItems', id);
  const desktop = useMedia(DESKTOP_Q);
  const [errors, setErrors] = useState({});
  const [refDraft, setRefDraft] = useState('');
  if (!it || it.kind !== 'ig') return <div class="page narrow"><BackBar onBack={() => back('/content/ig')} /><Empty icon="image" title="This post is gone" action={<a class="btn primary sm" href="#/content/ig">All posts</a>}>It may have been deleted.</Empty></div>;

  const set = (ch) => put('cItems', { ...get('cItems', id), ...ch });
  const slot = C.slotById(it.slot);
  const done = it.stage === 'done';
  const late = C.isLate(it);
  const conflicts = C.dateConflicts(it);
  const canPlan = !!it.date && !done && C.TASKS.slice(0, 3).some((t) => !C.isTaskDone(it, t) && !it[t.field]);
  const saveState = persist.status === 'error' ? 'Not saved' : persist.status === 'saving' ? 'Saving…' : 'Saved';
  const refs = it.refs || [];

  const setDate = (t, v) => {
    const r = C.setStageDate(id, t.field, v || null);
    setErrors(r.ok ? {} : { [t.field]: r.error });
  };
  const addRef = () => {
    if (!refDraft.trim()) return;
    if (!C.addRef(id, refDraft)) { toast("That doesn't look like a link.", { tone: 'warn' }); return; }
    setRefDraft('');
  };
  const del = () => {
    const snap = { ...get('cItems', id) };
    remove('cItems', id);
    back('/content/ig');
    toast('Post deleted', { action: { label: 'Undo', run: () => { put('cItems', snap); navigate('/post/' + id); } } });
  };
  const menu = (e) => openMenu(e, [
    { label: it.week ? 'Change slot' : 'Schedule in a slot', icon: 'calendar', onSelect: () => openSlotSheet(id) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { const d = C.duplicatePost(id); if (d) { navigate('/post/' + d.id); toast('Duplicated, not scheduled yet'); } } },
    { divider: true },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
  ], { title: 'Post' });

  const finalUrl = C.normalizeUrl(it.finalUrl || '');
  const summary = [it.finalUrl && it.finalUrl.trim() ? 'Video added' : null, C.formatName(it.format), C.pillarName(it.pillar)].filter(Boolean).join(' · ');

  return (
    <div class="page narrow task-detail post-detail">
      <BackBar onBack={() => back('/content/ig')} right={<>
        <span class={'save-chip ' + persist.status}><Icon name={persist.status === 'error' ? 'alert' : 'check'} size={14} />{saveState}</span>
        <button type="button" class="icon-btn ghost" aria-label="Post menu" onClick={menu}><Icon name="more" size={22} /></button>
      </>} />
      <textarea class="title-input" rows={1} value={it.title} aria-label="Post title" placeholder="Untitled post" autoFocus={!it.title}
        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
        onInput={(e) => set({ title: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
      <div class="row gap-8 wrap">
        <PostStagePill stage={it.stage} />
        {slot && <span class={'pill sm t-' + slot.tint}>{slot.name}</span>}
        {late && <span class="pill sm t-rose">Late</span>}
      </div>
      <Segmented class="full compact" options={C.STAGES.map((s) => ({ id: s.id, label: s.label }))} value={it.stage || 'idea'} onChange={(s) => C.setStage(id, s)} />

      <section class="block">
        <div class="block-head">
          <h2 class="block-title">Schedule</h2>
          {(canPlan || conflicts.length > 0) && <button type="button" class="btn xs outline" onClick={() => { C.planBackwards(id); setErrors({}); toast(conflicts.length ? 'Dates fixed' : 'Planned back from the post date'); }}><Icon name="spark" size={14} />{conflicts.length ? 'Fix dates' : 'Fill from post date'}</button>}
        </div>
        {conflicts.length > 0 && <div class="status-banner t-rose" role="alert"><Icon name="alert" size={18} /><span class="grow">{conflicts.join('. ')}.</span></div>}
        <div class="sched-grid">
          {C.TASKS.map((t) => {
            const isDone = C.isTaskDone(it, t);
            return (
              <Field key={t.key} label={<>{t.label}{isDone && <span class="sched-done"><Icon name="check" size={12} stroke={2.4} />Done</span>}</>} htmlFor={'pd-' + t.key}>
                <DateInput id={'pd-' + t.key} value={it[t.field] || ''} onChange={(v) => setDate(t, v)} />
                {errors[t.field] && <span class="field-error" role="alert">{errors[t.field]}</span>}
              </Field>
            );
          })}
        </div>
        <button type="button" class="slot-row" onClick={() => openSlotSheet(id)}>
          <span class={'cat-dot ' + (slot ? 't-' + slot.tint : 't-plain')} aria-hidden="true" />
          <span class="grow">{slot && it.week ? slot.name + ' slot, week of ' + fmtShort(it.week) : it.date ? 'No slot on this day' : 'Not in a slot'}</span>
          <span class="muted">Change</span>
        </button>
      </section>

      <section class="block">
        <div class="block-head"><h2 class="block-title">References</h2></div>
        {refs.map((r) => (
          <div class="ref-row" key={r.id}>
            <a class="ref-link" href={r.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} /><span class="ellipsis">{C.linkLabel(r.url)}</span></a>
            <input class="step-text" value={r.note || ''} placeholder="Note" aria-label={'Note for ' + C.linkLabel(r.url)} onInput={(e) => C.updateRef(id, r.id, { note: e.currentTarget.value })} />
            <button type="button" class="icon-btn ghost xs" aria-label={'Remove ' + C.linkLabel(r.url)} onClick={() => C.removeRef(id, r.id)}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <div class="step-add"><Icon name="plus" size={16} /><input value={refDraft} inputMode="url" autoCapitalize="off" placeholder="Paste a link" aria-label="Add reference link" onInput={(e) => setRefDraft(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addRef(); } }} />{refDraft.trim() && <button type="button" class="btn xs primary" onClick={addRef}>Add</button>}</div>
      </section>

      <Field label="Hook" htmlFor="pd-hook"><TextArea id="pd-hook" value={it.hook} onInput={(v) => set({ hook: v })} placeholder="The first 2 seconds. Why would someone stop?" minRows={2} /></Field>
      <Field label="Script" htmlFor="pd-script"><TextArea id="pd-script" value={it.script} onInput={(v) => set({ script: v })} placeholder="What happens, shot by shot or line by line." minRows={5} /></Field>
      <section class="block">
        <div class="block-head"><h2 class="field-label">Caption</h2>{it.caption && it.caption.trim() && <button type="button" class="btn xs outline" onClick={() => copy(it.caption, 'Caption copied')}><Icon name="copy" size={14} />Copy</button>}</div>
        <TextArea id="pd-caption" value={it.caption} onInput={(v) => set({ caption: v })} placeholder="What goes under the post." minRows={3} />
      </section>
      <Field label="Notes" htmlFor="pd-notes"><TextArea id="pd-notes" value={it.notes} onInput={(v) => set({ notes: v })} placeholder="Shot ideas, gear, links, anything." minRows={2} /></Field>

      <details class="more-details">
        <summary>Details{summary && <span class="muted details-sum">{summary}</span>}<Icon name="chevronDown" size={16} /></summary>
        <div class="form" style={{ marginTop: 12 }}>
          <Field label="Final video link" htmlFor="pd-final" hint={it.finalUrl && it.finalUrl.trim() && !finalUrl ? "That doesn't look like a link." : null}>
            <input id="pd-final" class="input" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="Drive, Frame.io, Dropbox" value={it.finalUrl || ''} onInput={(e) => set({ finalUrl: e.currentTarget.value })} />
          </Field>
          {finalUrl && <div class="row gap-8"><a class="btn xs outline" href={finalUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />Open</a><button type="button" class="btn xs ghost" onClick={() => copy(finalUrl, 'Link copied')}><Icon name="copy" size={14} />Copy link</button></div>}
          <div class="field-pair">
            <Field label="Pillar" htmlFor="pd-pillar"><Select id="pd-pillar" value={it.pillar || ''} onChange={(v) => set({ pillar: v || null })} placeholder="None" options={C.pillars().map((p) => ({ id: p.id, label: p.name }))} /></Field>
            <Field label="Format" htmlFor="pd-format"><Select id="pd-format" value={it.format || ''} onChange={(v) => set({ format: v || null })} placeholder="None" options={C.formats().map((p) => ({ id: p.id, label: p.name }))} /></Field>
          </div>
        </div>
      </details>

      <div class={'action-bar' + (desktop ? ' inline' : '')}>
        {done
          ? <><span class="grow row gap-8 posted-note"><Icon name="check" size={17} />Posted{it.postedAt ? ' ' + fmtShort(isoOf(Date.parse(it.postedAt))) : ''}</span><button type="button" class="btn outline lg" onClick={() => C.setStage(id, 'ready')}>Not posted yet</button></>
          : <NextButton it={it} size="lg grow" />}
      </div>
    </div>
  );
}

// Pick the week and slot for a post. A slot taken by another post is shown but disabled.
function openSlotSheet(id) { openOverlay((close) => <SlotSheet id={id} close={close} />, { kind: 'sheet' }); }
function SlotSheet({ id, close }) {
  useStore();
  const it = get('cItems', id) || {};
  const [week, setWeek] = useState(it.week || C.thisWeek());
  const pick = (s) => { C.schedule(id, week, s ? s.id : null); close(); toast(s ? 'Moved to ' + s.name : 'Unscheduled'); };
  return (
    <>
      <SheetHead title="Slot" onClose={close} />
      <SheetBody>
        <div class="week-pick">
          <button type="button" class="icon-btn soft sm" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><Icon name="chevronLeft" size={18} /></button>
          <span class="grow">{week === C.thisWeek() ? 'This week' : weekRange(week)}<span class="muted"> · {weekRange(week)}</span></span>
          <button type="button" class="icon-btn soft sm" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevronRight" size={18} /></button>
        </div>
        <div class="form">
          {C.slots().map((s) => {
            const free = C.isSlotFree(week, s.id, id);
            const cur = it.week === week && it.slot === s.id;
            return (
              <button key={s.id} type="button" class={'slot-opt t-' + s.tint + (cur ? ' on' : '')} disabled={!free} onClick={() => pick(s)}>
                <span class="grow"><b>{s.name}</b><span class="muted"> · {fmtShort(addDays(week, s.day))}</span></span>
                {!free ? <span class="muted">Taken</span> : cur ? <Icon name="check" size={16} /> : null}
              </button>
            );
          })}
          <button type="button" class="btn outline" onClick={() => pick(null)}>Not in a slot</button>
        </div>
      </SheetBody>
    </>
  );
}
