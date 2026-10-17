// Threads queue: a daily list of short text posts, plus an idea bank.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { TimeInput, Segmented, Empty, copyText } from '../ui/kit.jsx';
import { openMenu, toast, openOverlay, SheetHead, SheetBody } from '../ui/overlay.jsx';
import { PageHeader, SubNav, CONTENT_NAV } from '../ui/parts.jsx';
import { navigate } from '../lib/router.js';
import { patch, remove, put, useStore } from '../lib/db.js';
import { today, addDays, relDay, fmtFull } from '../lib/date.js';
import * as M from '../lib/model.js';
import { t as _t, tn as _tn } from '../lib/i18n.js';

const PILLAR_TONES = ['t-violet', 't-blue', 't-green', 't-pink', 't-yellow', 't-grey'];
const pillarClass = (p, list) => (p ? PILLAR_TONES[Math.max(0, list.indexOf(p)) % PILLAR_TONES.length] : '');
export const threadIntentUrl = (text) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text || '');

export function ThreadsPage({ query }) {
  useStore();
  const s = M.settings();
  const mode = query.view === 'ideas' ? 'ideas' : 'day';
  const t0 = today();
  const d = query.d && /^\d{4}-\d{2}-\d{2}$/.test(query.d) ? query.d : t0;
  const go = (p) => navigate('/content/threads' + p);
  const ideas = M.threadIdeas();
  return (
    <div class="page narrow">
      <SubNav items={CONTENT_NAV} active="threads" />
      <PageHeader title={_t('Threads')} actions={<Segmented options={[{ id: 'day', label: _t('Plan') }, { id: 'ideas', label: _t('Ideas'), count: ideas.length || undefined }]} value={mode} onChange={(v) => go(v === 'ideas' ? '?view=ideas' : '')} />} />
      {mode === 'ideas' ? <IdeasView s={s} ideas={ideas} /> : <DayView s={s} d={d} go={go} />}
    </div>
  );
}

function DayView({ s, d, go }) {
  const posts = M.threadsOn(d);
  const posted = posts.filter((p) => p.status === 'posted').length;
  const target = s.threadsDaily || 7;
  const pct = Math.min(100, Math.round((posted / target) * 100));
  const ideas = M.threadIdeas();
  return (
    <>
      <div class="row gap-8">
        <button class="icon-btn" aria-label={_t('Previous day')} onClick={() => go('?d=' + addDays(d, -1))}><Icon name="chevronLeft" /></button>
        <div class="grow" style={{ textAlign: 'center' }}><div class="card-title" style={{ justifyContent: 'center' }}>{relDay(d)}</div><div class="muted" style={{ fontSize: 13 }}>{fmtFull(d)}</div></div>
        <button class="icon-btn" aria-label={_t('Next day')} onClick={() => go('?d=' + addDays(d, 1))}><Icon name="chevronRight" /></button>
      </div>
      <div class="card th-progress">
        <div class="row between gap-8">
          <div><div class="stat-label">{_t('Posted')}</div><div class="th-count"><b>{posted}</b><span>/ {target}</span></div></div>
          <div class="muted" style={{ fontSize: 13, textAlign: 'right' }}>{posts.length < target ? _t('{0} slot{1} left to plan', [target - posts.length, target - posts.length === 1 ? '' : 's']) : posted >= target ? _t('Done for the day') : _t('{0} still to post', [posts.length - posted])}</div>
        </div>
        <div class="th-bar"><i style={{ width: pct + '%' }} /></div>
        {posts.length < target && ideas.length > 0 && <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => pickIdeas(d, target - posts.length)}><Icon name="bulb" size={15} />{_t('Fill from ideas')}</button>}
      </div>
      <Composer s={s} date={d} />
      {posts.length ? <div class="col gap-12">{posts.map((p) => <PostCard key={p.id} p={p} s={s} />)}</div>
        : <div class="card"><Empty icon="review" title={_t('Nothing planned for this day')}>{_t('Write a post above, or pull a few from your idea bank.')}</Empty></div>}
    </>
  );
}

function IdeasView({ s, ideas }) {
  const [f, setF] = useState('');
  const list = f ? ideas.filter((x) => x.pillar === f) : ideas;
  return (
    <>
      <Composer s={s} date="" />
      <div class="chips scroll">
        <button class={'chip ' + (!f ? 'on' : '')} onClick={() => setF('')}>{_t('All')}{' '}<span class="chip-count">{ideas.length}</span></button>
        {s.threadsPillars.map((p) => <button class={'chip ' + (f === p ? 'on' : '')} onClick={() => setF(f === p ? '' : p)}>{p} <span class="chip-count">{ideas.filter((x) => x.pillar === p).length}</span></button>)}
      </div>
      {list.length ? <div class="col gap-12">{list.map((p) => <PostCard key={p.id} p={p} s={s} idea />)}</div>
        : <div class="card"><Empty icon="bulb" title={_t('No ideas saved')}>{_t('Jot down anything that could become a post. Schedule it to a day when you\'re ready.')}</Empty></div>}
    </>
  );
}

function Composer({ s, date }) {
  const [text, setText] = useState('');
  const [pillar, setPillar] = useState('');
  const [time, setTime] = useState('');
  const ref = useRef();
  const fit = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } };
  const add = () => {
    const v = text.trim(); if (!v) return;
    M.newThread({ text: v, date, time: date ? time : '', pillar });
    setText(''); setTime(''); setTimeout(fit, 0);
    toast(date ? _t('Added to {0}', [relDay(date).toLowerCase()]) : _t('Saved to ideas'));
  };
  const over = text.length > M.THREADS_LIMIT;
  return (
    <div class="card th-composer">
      <textarea ref={ref} class="th-input" rows={2} value={text} placeholder={date ? _t('Write a post…') : _t('Save an idea…')} onInput={(e) => { setText(e.currentTarget.value); fit(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
      <div class="th-pillars">{s.threadsPillars.map((p) => <button type="button" class={'chip sm ' + (pillar === p ? 'on' : '')} onClick={() => setPillar(pillar === p ? '' : p)}>{p}</button>)}</div>
      <div class="row gap-8 between wrap">
        <div class="row gap-8">
          {date && <div class="th-time"><TimeInput id="th-new-time" value={time} onChange={setTime} /></div>}
          <span class={'th-len ' + (over ? 'over' : '')}>{text.length}/{M.THREADS_LIMIT}</span>
        </div>
        <button class="btn sm primary" disabled={!text.trim()} onClick={add}><Icon name="plus" size={15} />{date ? _t('Add post') : _t('Save idea')}</button>
      </div>
    </div>
  );
}

function PostCard({ p, s, idea }) {
  const [text, setText] = useState(p.text);
  const ref = useRef();
  const timer = useRef();
  const posted = p.status === 'posted';
  useEffect(() => { if (document.activeElement !== ref.current) setText(p.text); }, [p.text]);
  const fit = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } };
  useEffect(fit, [text]);
  const save = (v) => { clearTimeout(timer.current); timer.current = setTimeout(() => patch('threads', p.id, { text: v }), 400); };
  const post = () => {
    const v = ref.current ? ref.current.value : p.text;
    window.open(threadIntentUrl(v), '_blank', 'noopener');
    if (!posted) toast(_t('Posted it?'), { action: { label: _t('Mark posted'), run: () => M.markThreadPosted(p.id, true) }, duration: 8000 });
  };
  const menu = (e) => openMenu(e, [
    ...(idea ? [
      { label: _t('Schedule for today'), icon: 'calendar', onSelect: () => { patch('threads', p.id, { date: today() }); toast(_t('Added to today')); } },
      { label: _t('Schedule for tomorrow'), icon: 'calendar', onSelect: () => { patch('threads', p.id, { date: addDays(today(), 1) }); toast(_t('Added to tomorrow')); } },
    ] : [
      { label: _t('Move to tomorrow'), icon: 'chevronRight', onSelect: () => { patch('threads', p.id, { date: addDays(p.date, 1), status: 'draft', postedAt: null }); toast(_t('Moved to {0}', [relDay(addDays(p.date, 1)).toLowerCase()])); } },
      { label: _t('Back to ideas'), icon: 'bulb', onSelect: () => { patch('threads', p.id, { date: '', time: '', status: 'draft', postedAt: null }); toast(_t('Moved to ideas')); } },
    ]),
    { heading: _t('Pillar') },
    ...s.threadsPillars.map((x) => ({ label: x, active: p.pillar === x, onSelect: () => patch('threads', p.id, { pillar: p.pillar === x ? '' : x }) })),
    { divider: true },
    { label: _t('Duplicate'), icon: 'copy', onSelect: () => { M.newThread({ text: p.text, pillar: p.pillar, date: p.date, time: '' }); toast(_t('Duplicated')); } },
    { label: _t('Delete'), icon: 'trash', danger: true, onSelect: () => { const copy = { ...p }; remove('threads', p.id); toast(_t('Deleted'), { action: { label: _t('Undo'), run: () => put('threads', copy) } }); } },
  ], { title: _t('Post') });
  return (
    <div class={'card th-post ' + (posted ? 'is-posted' : '')}>
      <div class="row gap-8 wrap th-meta">
        {!idea && <div class="th-time"><TimeInput id={'th-t-' + p.id} value={p.time} onChange={(v) => patch('threads', p.id, { time: v })} /></div>}
        {p.pillar && <span class={'badge sm th-pill ' + pillarClass(p.pillar, s.threadsPillars)}>{p.pillar}</span>}
        {posted && <span class="badge sm t-green"><Icon name="check" size={12} />{_t('Posted')}</span>}
        <button class="icon-btn ghost sm" style={{ marginLeft: 'auto' }} aria-label={_t('More')} onClick={menu}><Icon name="more" size={18} /></button>
      </div>
      <textarea ref={ref} class="th-input th-text" rows={1} value={text} onInput={(e) => { setText(e.currentTarget.value); save(e.currentTarget.value); }} onBlur={(e) => { clearTimeout(timer.current); if (e.currentTarget.value !== p.text) patch('threads', p.id, { text: e.currentTarget.value }); }} aria-label={_t('Post text')} />
      <div class="row gap-8 wrap th-actions">
        <span class={'th-len ' + (text.length > M.THREADS_LIMIT ? 'over' : '')}>{text.length}/{M.THREADS_LIMIT}</span>
        <span class="grow" />
        <button class="btn xs ghost" onClick={() => copyText(ref.current ? ref.current.value : p.text, _t('Copied'))}><Icon name="copy" size={14} />{_t('Copy')}</button>
        {idea ? <button class="btn xs soft" onClick={() => { patch('threads', p.id, { date: today() }); toast(_t('Added to today')); }}>{_t('Use today')}</button> : (
          <>
            <button class="btn xs soft" onClick={post}><Icon name="external" size={14} />{_t('Post')}</button>
            <button class={'btn xs ' + (posted ? 'soft' : 'primary')} onClick={() => M.markThreadPosted(p.id, !posted)}>{posted ? _t('Undo') : <><Icon name="check" size={14} />{_t('Done')}</>}</button>
          </>
        )}
      </div>
    </div>
  );
}

function pickIdeas(date, slots) {
  openOverlay((close) => <IdeaPicker date={date} slots={slots} close={close} />, { kind: 'sheet' });
}
function IdeaPicker({ date, slots, close }) {
  useStore();
  const ideas = M.threadIdeas();
  const [sel, setSel] = useState([]);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const add = () => { sel.forEach((id, i) => patch('threads', id, { date, order: Date.now() + i })); toast(_t('{0} added to {1}', [sel.length, relDay(date).toLowerCase()])); close(); };
  return (
    <>
      <SheetHead title={_t('Pick from ideas')} sub={_t('{0} slot{1} open for {2}', [slots, slots === 1 ? '' : 's', relDay(date).toLowerCase()])} onClose={close} />
      <SheetBody>
        <div class="col gap-8">
          {ideas.map((p) => (
            <button class={'th-pick ' + (sel.includes(p.id) ? 'on' : '')} onClick={() => toggle(p.id)}>
              <span class={'check ' + (sel.includes(p.id) ? 'on accent' : '')}>{sel.includes(p.id) && <Icon name="check" size={14} />}</span>
              <span class="grow"><span class="th-pick-text">{p.text}</span>{p.pillar && <span class="th-pick-meta">{p.pillar}</span>}</span>
            </button>
          ))}
        </div>
        <div class="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button class="btn primary" disabled={!sel.length} onClick={add}>{_t('Add')}{' '}{sel.length || ''}{' '}{_t('to')}{' '}{relDay(date).toLowerCase()}</button></div>
      </SheetBody>
    </>
  );
}

// Small summary for Content overview
export function ThreadsTodayCard() {
  const s = M.settings();
  const posts = M.threadsOn(today());
  const posted = posts.filter((p) => p.status === 'posted').length;
  const target = s.threadsDaily || 7;
  const next = posts.find((p) => p.status !== 'posted');
  return (
    <a class="card th-mini" href="#/content/threads">
      <div class="row between gap-8"><div class="card-title"><Icon name="at" size={18} />{_t('Threads today')}</div><span class="th-count sm"><b>{posted}</b><span>/ {target}</span></span></div>
      <div class="th-bar"><i style={{ width: Math.min(100, Math.round((posted / target) * 100)) + '%' }} /></div>
      <div class="muted ellipsis" style={{ fontSize: 13 }}>{next ? _t('Next{0}: {1}', [next.time ? ' ' + next.time : '', next.text]) : posts.length ? _t('All planned posts are out.') : _t('Nothing planned yet. Tap to plan today.')}</div>
    </a>
  );
}
