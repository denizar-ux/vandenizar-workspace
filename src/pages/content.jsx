import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Check, Field, TextInput, TextArea, Select, DateInput, TimeInput, Chips, Segmented, Progress, Ring, Empty, ChecklistEditor, LinksEditor, ContentLinks, RichText, copyText, htmlToText, safeUrl, hostOf } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, SubNav, CONTENT_NAV, ContentBadge, CONTENT_TONE, pillarTone, BackBar, openTaskSheet, TaskRow, fmtAgo } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, addDays, diffDays, relDay, fmtDay, fmtShort, fmtMonth, startOfWeek, startOfMonth, addMonths, daysInMonth, dayNum, fmtWeekdayShort, isoOf, fmtFull } from '../lib/date.js';
import { dragHandlers, orderBetween } from '../lib/dnd.js';
import * as M from '../lib/model.js';
import { ThreadsTodayCard } from './threads.jsx';
import { t as _t, tn as _tn, locale as _locale } from '../lib/i18n.js';

export function createContentAndOpen(preset = {}) {
  const c = M.newContent(preset);
  navigate('/content/item/' + c.id + '?new=1');
  return c;
}
const statusLabel = (s) => M.CONTENT_STATUSES.find((x) => x.id === s)?.label || s;
const AddContentBtn = ({ preset, label = _t('Add new content') }) => <button class="btn primary" onClick={() => createContentAndOpen(preset)}><Icon name="plus" size={18} />{label}</button>;

function shotProgress(c) {
  const sl = c.shotlist || [];
  return sl.length ? Math.round((sl.filter((x) => x.done).length / sl.length) * 100) : null;
}
function nextStage(c) {
  for (const st of M.STAGES) if (c.schedule?.[st.id]?.date && !M.stageIsDone(c, st.id)) return { ...st, date: c.schedule[st.id].date, time: c.schedule[st.id].time };
  return null;
}
function loadPref(k, d) { try { const v = localStorage.getItem('vz:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem('vz:' + k, JSON.stringify(v)); } catch {} }

// =====================================================================
// OVERVIEW
// =====================================================================
export function ContentOverview() {
  useStore();
  const s = M.settings();
  const t0 = today();
  const list = M.liveContents();
  const counts = Object.fromEntries(M.CONTENT_STATUSES.map((st) => [st.id, list.filter((c) => c.status === st.id).length]));
  const pr = M.priorityContent();
  const ws = startOfWeek(t0, s.weekStart);
  const pubWeek = M.publishedInWeek(ws);
  const pct = s.weeklyTarget ? Math.min(100, Math.round((pubWeek.length / s.weeklyTarget) * 100)) : 0;
  const upcoming = M.upcomingUploads(t0, 14);
  const acts = M.contentActions(t0);
  const trashCount = all('contents').filter((c) => c.deletedAt).length;
  return (
    <div class="page">
      <SubNav items={CONTENT_NAV} active="overview" />
      <PageHeader eyebrow={_t('Content OS')} title={<>{_t('What to make')}{' '}<em>{_t('now')}</em></>} actions={<AddContentBtn />} />
      <div class="two-col">
        <div class="stack">
          {pr ? <PriorityContent c={pr} /> : (
            <div class="card"><Empty icon="video" title={_t('No content yet')} action={<AddContentBtn label={_t('Add your first idea')} />}>{_t('Ideas, drafts and scheduled posts live here, from first idea to published.')}</Empty></div>
          )}
          <div class="stats six">
            {M.CONTENT_STATUSES.map((st) => (
              <a class="stat" href={`#/content/board?status=${st.id}`}>
                <span class="stat-label"><span class={'cat-dot'} style={{ background: `var(--${CONTENT_TONE[st.id]})` }} />{st.label}</span>
                <span class="stat-value">{counts[st.id]}</span>
              </a>
            ))}
          </div>
          {acts.length > 0 && (
            <div class="card">
              <div class="card-head"><div class="card-title">{_t('Due today')}{' '}<span class="count">{acts.length}</span></div></div>
              <div class="list">
                {acts.map((a) => (
                  <div class="list-row">
                    <Check checked={false} onChange={() => { M.completeStage(a.content, a.stage.id); toast(_t('{0} done', [a.stage.label])); }} label={_t('Mark {0} done', [a.stage.label])} />
                    <a class="row-main" href={'#/content/item/' + a.content.id} style={{ textDecoration: 'none' }}><div class="row-title">{a.stage.verb}: {a.content.title}</div><div class="row-meta">{a.overdue ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{_t('Overdue ·')}{' '}{relDay(a.date)}</span> : (a.time || _t('Today'))}</div></a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div class="stack">
          <ThreadsTodayCard />
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('This week\'s target')}</div><a class="section-link" href="#/settings/content">{_t('Edit target')}</a></div>
            <div class="row gap-16">
              <Ring pct={pct} size={78} stroke={7} label={<span style={{ fontSize: 18 }}>{pubWeek.length}<span class="muted" style={{ fontSize: 12 }}>/{s.weeklyTarget}</span></span>} />
              <div class="grow" style={{ fontSize: 14 }}>
                <div style={{ fontWeight: 800 }}>{pubWeek.length >= s.weeklyTarget ? _t('Target hit this week') : _t('{0} more to upload', [s.weeklyTarget - pubWeek.length])}</div>
                <div class="muted">{_t('Week of')}{' '}{fmtShort(ws)}. {upcoming.filter((c) => c.schedule.upload.date <= addDays(ws, 6)).length}{' '}{_t('more scheduled before Sunday.')}</div>
              </div>
            </div>
            {pubWeek.length > 0 && <div class="col gap-4" style={{ marginTop: 12, fontSize: 13.5 }}>{pubWeek.map((c) => <a href={'#/content/item/' + c.id} class="row gap-8" style={{ textDecoration: 'none' }}><Icon name="check" size={15} style={{ color: 'var(--good)' }} /><span class="ellipsis">{c.title}</span></a>)}</div>}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('Upcoming uploads')}</div><a class="section-link" href="#/content/calendar">{_t('Open calendar')}</a></div>
            {upcoming.length ? (
              <div class="list">
                {upcoming.slice(0, 7).map((c) => (
                  <a class="list-row clickable" href={'#/content/item/' + c.id}>
                    <div class="col" style={{ width: 46, alignItems: 'center', flex: 'none' }}><span class="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{fmtWeekdayShort(c.schedule.upload.date)}</span><span style={{ fontWeight: 800, fontSize: 20 }} class="tnum">{dayNum(c.schedule.upload.date)}</span></div>
                    <div class="row-main"><div class="row-title ellipsis">{c.title}</div><div class="row-meta">{c.schedule.upload.time || _t('No time')} · {(c.platforms || []).join(', ') || _t('No platform')}</div></div>
                    <ContentBadge status={c.status} sm />
                  </a>
                ))}
              </div>
            ) : <div class="muted" style={{ fontSize: 14 }}>{_t('Nothing scheduled in the next two weeks. Set an Upload date in a content item to see it here.')}</div>}
          </div>
          {trashCount > 0 && <a class="section-link" href="#/trash" style={{ paddingLeft: 4 }}><Icon name="trash" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {trashCount}{' '}{_t('in Trash')}</a>}
        </div>
      </div>
    </div>
  );
}

function PriorityContent({ c }) {
  const nx = nextStage(c);
  const sp = shotProgress(c);
  const next = M.CONTENT_NEXT[c.status];
  return (
    <div class="hero" style={{ gap: 12 }}>
      <div class="row gap-8 wrap"><span class="eyebrow">{_t('Work on this now')}</span><ContentBadge status={c.status} sm />{c.pillar && <span class={'badge sm ' + pillarTone(c.pillar)}>{c.pillar}</span>}</div>
      <div class="row gap-12" style={{ alignItems: 'flex-start' }}>
        <a href={'#/content/item/' + c.id} class="grow" style={{ textDecoration: 'none', minWidth: 0 }}><h2 class="hero-title" style={{ fontSize: 34 }}>{c.title}</h2>{c.description && <div class="muted" style={{ marginTop: 6 }}>{c.description}</div>}</a>
        <a class="icon-btn dark" href={'#/content/item/' + c.id} aria-label={_t('Open editor')}><Icon name="arrow" size={18} /></a>
      </div>
      <div class="row gap-16 wrap" style={{ fontSize: 13 }}>
        {nx && <span class="pill-time">{nx.label} · {relDay(nx.date)}{nx.time ? ' ' + nx.time : ''}</span>}
        {sp != null && <span class="row gap-6" style={{ minWidth: 130 }}><span class="muted">{_t('Shotlist')}</span><Progress pct={sp} thin /><b class="tnum">{sp}%</b></span>}
      </div>
      {next && <div><button class="btn soft sm" onClick={() => { M.setContentStatus(c.id, next.to); toast(_t('Moved to {0}', [statusLabel(next.to)])); }}>{next.label}</button></div>}
    </div>
  );
}

// =====================================================================
// BOARD
// =====================================================================
function ContentCard({ c, compact }) {
  const sp = shotProgress(c);
  const up = c.schedule?.upload?.date;
  return (
    <div class="kcard" onClick={() => navigate('/content/item/' + c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('/content/item/' + c.id)}>
      <div class="kcard-title">{c.title}</div>
      {c.description && <div class="kcard-desc clamp2">{c.description}</div>}
      <div class="kcard-foot">
        {c.pillar && <span class={'badge sm ' + pillarTone(c.pillar)}>{c.pillar}</span>}
        {(c.platforms || []).map((p) => <span class="badge sm">{p}</span>)}
        {up && <span class={'badge sm ' + (diffDays(up, today()) < 0 && c.status !== 'published' ? 't-red' : 't-accent')}><Icon name="calendar" />{relDay(up)}</span>}
        {sp != null && <span class="row gap-4" style={{ marginLeft: 'auto' }}><Icon name="video" size={13} />{sp}%</span>}
      </div>
      <button class="icon-btn ghost xs kcard-more" aria-label={_t('Card actions')} onClick={(e) => contentMenu(e, c)}><Icon name="more" size={16} /></button>
    </div>
  );
}
export function contentMenu(e, c) {
  openMenu(e, [
    { label: _t('Open editor'), icon: 'edit', onSelect: () => navigate('/content/item/' + c.id) },
    { heading: _t('Move to') },
    ...M.CONTENT_STATUSES.map((st) => ({ label: st.label, active: c.status === st.id, onSelect: () => { M.setContentStatus(c.id, st.id); toast(_t('Moved to {0}', [st.label])); } })),
    { divider: true },
    { label: _t('Duplicate'), icon: 'copy', onSelect: () => { M.duplicateContent(c.id); toast(_t('Duplicated')); } },
    { label: _t('Add a task for this'), icon: 'tasks', onSelect: () => openTaskSheet(null, { contentId: c.id, title: '', category: 'Growth', dueDate: today() }) },
    { label: _t('Move to Trash'), icon: 'trash', danger: true, onSelect: () => trashContent(c) },
  ], { title: c.title });
}
export function trashContent(c) {
  patch('contents', c.id, { deletedAt: Date.now() });
  toast(_t('Moved to Trash'), { action: { label: _t('Undo'), run: () => patch('contents', c.id, { deletedAt: null }) } });
}
function moveContent({ id, to, before, after }) {
  const c = get('contents', id);
  if (!c || !M.CONTENT_STATUSES.some((s) => s.id === to)) return;
  const prev = after && get('contents', after), nxt = before && get('contents', before);
  const ch = { order: orderBetween(prev?.order, nxt?.order) };
  if (c.status !== to) { ch.status = to; ch.publishedAt = to === 'published' ? c.publishedAt || Date.now() : null; }
  patch('contents', id, ch);
}

export function ContentBoard({ query }) {
  useStore();
  const s = M.settings();
  const desktop = useMedia(DESKTOP_Q);
  const view = s.boardView || 'kanban';
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [pillar, setPillar] = useState('');
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState(query.status || '');
  const [mobileCol, setMobileCol] = useState(query.status || loadPref('boardCol', 'idea'));
  const [sort, setSort] = useState('manual');
  const [filters, setFilters] = useState(false);
  useEffect(() => { if (query.status) { setStatus(query.status); setMobileCol(query.status); } }, [query.status]);
  useEffect(() => savePref('boardCol', mobileCol), [mobileCol]);
  let list = M.liveContents();
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter((c) => [c.title, c.description, c.hook, htmlToText(c.script), c.pillar, c.caption].some((x) => (x || '').toLowerCase().includes(t))); }
  if (platform) list = list.filter((c) => (c.platforms || []).includes(platform));
  if (pillar) list = list.filter((c) => c.pillar === pillar);
  if (format) list = list.filter((c) => c.format === format);
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || b.updatedAt - a.updatedAt;
  const filtersOn = platform || pillar || format || (view === 'list' && status);
  return (
    <div class="page">
      <SubNav items={CONTENT_NAV} active="board" />
      <PageHeader title={_t('Content board')} actions={<>
        <Segmented options={[{ id: 'kanban', label: _t('Kanban'), icon: 'kanban' }, { id: 'list', label: _t('List'), icon: 'list' }]} value={view} onChange={(v) => M.setSettings({ boardView: v })} />
        <AddContentBtn preset={view === 'kanban' && !desktop ? { status: mobileCol } : {}} />
      </>} />
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="board-q" value={q} placeholder={_t('Search title, hook, script, pillar')} onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label={_t('Clear')} onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (filtersOn ? 'dark' : '')} aria-label={_t('Filters')} onClick={() => setFilters(!filters)}><Icon name="filter" size={18} /></button>
        {view === 'list' && <button class="icon-btn" aria-label={_t('Sort')} onClick={(e) => openMenu(e, [{ heading: _t('Sort by') }, ...[['manual', _t('Board order')], ['updated', _t('Last updated')], ['upload', _t('Upload date')], ['created', _t('Newest')], ['title', _t('Title A–Z')]].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>}
      </div>
      {filters && (
        <div class="card tight"><div class="form">
          <div class="form-row three">
            <Field label={_t('Platform')} htmlFor="cf-plat"><Select id="cf-plat" value={platform} onChange={setPlatform} placeholder={_t('Any')} options={s.platforms} /></Field>
            <Field label={_t('Pillar')} htmlFor="cf-pil"><Select id="cf-pil" value={pillar} onChange={setPillar} placeholder={_t('Any')} options={s.pillars} /></Field>
            <Field label={_t('Format')} htmlFor="cf-fmt"><Select id="cf-fmt" value={format} onChange={setFormat} placeholder={_t('Any')} options={s.formats} /></Field>
          </div>
          {view === 'list' && <Field label={_t('Status')}><Chips allowEmpty options={M.CONTENT_STATUSES} value={status} onChange={(v) => setStatus(v === status ? '' : v)} /></Field>}
          {filtersOn && <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => { setPlatform(''); setPillar(''); setFormat(''); setStatus(''); }}>{_t('Clear filters')}</button>}
        </div></div>
      )}
      {view === 'kanban' ? (
        desktop ? (
          <div class="board" data-scroll-x>
            {M.CONTENT_STATUSES.map((st) => {
              const items = list.filter((c) => c.status === st.id).sort(byOrder);
              return (
                <div class="col-k">
                  <div class="col-head"><div class="col-name"><span class="cat-dot" style={{ background: `var(--${CONTENT_TONE[st.id]})` }} />{st.label}<span class="col-count">{items.length}</span></div>
                    <button class="icon-btn ghost xs" aria-label={_t('Add to {0}', [st.label])} onClick={() => createContentAndOpen({ status: st.id })}><Icon name="plus" size={16} /></button></div>
                  <div class="col-list" data-drop={st.id} data-scroll-y>
                    {items.map((c) => <div {...dragHandlers(c.id, moveContent)}><ContentCard c={c} /></div>)}
                    {!items.length && <div class="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: '18px 8px' }}>{_t('Drop cards here')}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div class="status-tabs"><Segmented class="block" options={M.CONTENT_STATUSES.map((st) => ({ id: st.id, label: st.label, count: list.filter((c) => c.status === st.id).length }))} value={mobileCol} onChange={setMobileCol} /></div>
            <div class="col gap-8" data-drop={mobileCol}>
              {list.filter((c) => c.status === mobileCol).sort(byOrder).map((c) => <div {...dragHandlers(c.id, moveContent, { accept: (k) => k === mobileCol })}><ContentCard c={c} /></div>)}
            </div>
            {!list.some((c) => c.status === mobileCol) && <div class="card"><Empty icon="video" title={_t('Nothing in {0}', [statusLabel(mobileCol)])} action={<button class="btn sm soft" onClick={() => createContentAndOpen({ status: mobileCol })}><Icon name="plus" size={15} />{_t('Add here')}</button>}>{filtersOn || q ? _t('Try clearing the search or filters.') : null}</Empty></div>}
            <div class="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>{_t('Hold a card to drag it. Use ••• to move it to another status.')}</div>
          </>
        )
      ) : (
        <ContentList list={status ? list.filter((c) => c.status === status) : list} sort={sort} desktop={desktop} />
      )}
    </div>
  );
}

function ContentList({ list, sort, desktop }) {
  const sorted = [...list].sort((a, b) => {
    if (sort === 'updated') return b.updatedAt - a.updatedAt;
    if (sort === 'upload') return (a.schedule?.upload?.date || '9999').localeCompare(b.schedule?.upload?.date || '9999');
    if (sort === 'created') return b.createdAt - a.createdAt;
    if (sort === 'title') return a.title.localeCompare(b.title);
    return M.CONTENT_STATUSES.findIndex((s) => s.id === a.status) - M.CONTENT_STATUSES.findIndex((s) => s.id === b.status) || (a.order || 0) - (b.order || 0);
  });
  if (!sorted.length) return <div class="card"><Empty icon="search" title={_t('No content matches')} /></div>;
  const statusSel = (c) => (
    <select class={'inline-select ' + CONTENT_TONE[c.status]} value={c.status} onClick={(e) => e.stopPropagation()} onChange={(e) => { M.setContentStatus(c.id, e.currentTarget.value); toast(_t('Status updated')); }} aria-label={_t('Status')}>
      {M.CONTENT_STATUSES.map((s) => <option value={s.id}>{s.label}</option>)}
    </select>
  );
  if (desktop) return (
    <div class="card flush"><div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>{_t('Title')}</th><th>{_t('Status')}</th><th>{_t('Pillar')}</th><th>{_t('Platforms')}</th><th>{_t('Format')}</th><th>{_t('Upload')}</th><th>{_t('Updated')}</th><th /></tr></thead>
        <tbody>
          {sorted.map((c) => (
            <tr class="clickable" onClick={() => navigate('/content/item/' + c.id)}>
              <td style={{ maxWidth: 320 }}><div style={{ fontWeight: 800 }} class="ellipsis">{c.title}</div>{c.description && <div class="muted ellipsis" style={{ fontSize: 12.5 }}>{c.description}</div>}</td>
              <td>{statusSel(c)}</td>
              <td>{c.pillar && <span class={'badge sm ' + pillarTone(c.pillar)}>{c.pillar}</span>}</td>
              <td class="muted">{(c.platforms || []).join(', ')}</td>
              <td class="muted">{c.format}</td>
              <td class="muted" style={{ whiteSpace: 'nowrap' }}>{c.schedule?.upload?.date ? fmtShort(c.schedule.upload.date) + (c.schedule.upload.time ? ' ' + c.schedule.upload.time : '') : '—'}</td>
              <td class="muted" style={{ whiteSpace: 'nowrap' }}>{fmtAgo(c.updatedAt)}</td>
              <td><button class="icon-btn ghost sm" aria-label={_t('Actions')} onClick={(e) => contentMenu(e, c)}><Icon name="more" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
  return (
    <div class="card">
      <div class="list">
        {sorted.map((c) => (
          <div class="list-row clickable" onClick={() => navigate('/content/item/' + c.id)}>
            <div class="row-main"><div class="row-title">{c.title}</div><div class="row-meta">{[c.pillar, (c.platforms || []).join(', '), c.schedule?.upload?.date ? 'Upload ' + relDay(c.schedule.upload.date) : ''].filter(Boolean).join(' · ')}</div></div>
            {statusSel(c)}
            <button class="icon-btn ghost sm" aria-label={_t('Actions')} onClick={(e) => contentMenu(e, c)}><Icon name="more" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// EDITOR
// =====================================================================
async function fileToCover(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.82);
}

export function ContentEditor({ id }) {
  useStore();
  const c = get('contents', id);
  const s = M.settings();
  const desktop = useMedia(DESKTOP_Q);
  const isNew = location.hash.includes('new=1');
  const fileRef = useRef();
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('vz:ce-tab') || 'write'; } catch { return 'write'; } });
  useEffect(() => { if (c && !c.deletedAt) M.touchRecent('content', id); if (isNew) navigate('/content/item/' + id, { replace: true }); }, [id]);
  if (!c) return <div class="page narrow"><BackBar onBack={() => back('/content/board')} /><div class="card"><Empty icon="video" title={_t('This content item doesn\'t exist')} action={<a class="btn primary sm" href="#/content/board">{_t('Go to board')}</a>}>{_t('It may have been deleted permanently.')}</Empty></div></div>;
  const set = (ch) => patch('contents', id, ch);
  // Writing fields keep a history: before the first edit of an editing session (10 min gap), save what was there.
  const setText = (ch) => {
    const vs = c.versions || [];
    const last = vs[0];
    const has = (c.hook || '').trim() || htmlToText(c.script || '').trim() || (c.caption || '').trim();
    const same = last && last.hook === (c.hook || '') && last.script === (c.script || '') && last.caption === (c.caption || '');
    if (has && !same && (!last || Date.now() - last.at > 10 * 60 * 1000)) {
      set({ ...ch, versions: [{ at: Date.now(), hook: c.hook || '', script: c.script || '', caption: c.caption || '' }, ...vs].slice(0, 30) });
    } else set(ch);
  };
  const pickTab = (t) => { setTab(t); try { sessionStorage.setItem('vz:ce-tab', t); } catch {} window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const setSched = (stage, ch) => set({ schedule: { ...(c.schedule || {}), [stage]: { ...(c.schedule?.[stage] || {}), ...ch } } });
  const next = M.CONTENT_NEXT[c.status];
  const idx = M.CONTENT_STATUSES.findIndex((x) => x.id === c.status);
  const tasks = M.sortTasks(all('tasks').filter((t) => t.contentId === id && !t.deletedAt && !t.archived));
  const pillarOpts = [...new Set([...s.pillars, ...(c.pillar && !s.pillars.includes(c.pillar) ? [c.pillar] : [])])];
  const platOpts = [...new Set([...s.platforms, ...(c.platforms || [])])];
  const formatOpts = [...new Set([...s.formats, ...(c.format && !s.formats.includes(c.format) ? [c.format] : [])])];

  const Details = (
    <div class="card">
      <div class="form">
        <Field label={_t('Platforms')}><Chips multi options={platOpts} value={c.platforms || []} onChange={(v) => set({ platforms: v })} /></Field>
        <div class="form-row">
          <Field label={_t('Content pillar')} htmlFor="ce-pillar"><Select id="ce-pillar" value={c.pillar} onChange={(v) => set({ pillar: v })} placeholder={_t('None')} options={pillarOpts} /></Field>
          <Field label={_t('Format')} htmlFor="ce-format"><Select id="ce-format" value={c.format} onChange={(v) => set({ format: v })} placeholder={_t('None')} options={formatOpts} /></Field>
        </div>
        <Field label={_t('Status')} htmlFor="ce-status"><Select id="ce-status" value={c.status} onChange={(v) => { M.setContentStatus(id, v); }} options={M.CONTENT_STATUSES} /></Field>
      </div>
    </div>
  );
  const Cover = (
    <div class="card">
      <div class="card-head"><div class="card-title">{_t('Cover')}</div></div>
      <div class={'cover' + (c.cover ? '' : ' empty')} style={{ maxHeight: 360 }}>
        {c.cover ? <img src={c.cover} alt="Cover" /> : <button class="col gap-8" style={{ alignItems: 'center', color: 'var(--muted)', fontWeight: 700 }} onClick={() => fileRef.current.click()}><Icon name="image" size={26} />{_t('Add cover image')}</button>}
        {c.cover && <div class="cover-actions"><button class="btn sm" onClick={() => fileRef.current.click()}>{_t('Replace')}</button><button class="btn sm" onClick={() => set({ cover: '' })}>{_t('Remove')}</button></div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (!f) return; try { set({ cover: await fileToCover(f) }); toast(_t('Cover updated')); } catch { toast(_t('Could not read that image. Try a JPG or PNG.'), { tone: 'warn' }); } }} />
    </div>
  );
  const Schedule = (
    <div class="card">
      <div class="card-head"><div class="card-title">{_t('Production schedule')}{' '}<span class="badge sm">{_t('WIB')}</span></div><a class="section-link" href="#/content/calendar">{_t('Calendar')}</a></div>
      <div class="sched">
        {M.STAGES.map((st) => {
          const v = c.schedule?.[st.id] || {};
          const done = M.stageIsDone(c, st.id);
          const late = v.date && !done && diffDays(v.date, today()) < 0;
          return (
            <div class="sched-row">
              <Check size="sm" checked={done} onChange={(x) => (x ? M.completeStage(c, st.id) : M.uncompleteStage(c, st.id))} label={(done ? _t('Undo {0}', [st.label]) : _t('Mark done: {0}', [st.label]))} />
              <div class="sched-name" style={late ? { color: 'var(--bad)' } : null}>{st.label}</div>
              <DateInput id={'ce-d-' + st.id} value={v.date} onChange={(d) => setSched(st.id, { date: d })} />
              <TimeInput id={'ce-t-' + st.id} value={v.time} onChange={(t) => setSched(st.id, { time: t })} />
            </div>
          );
        })}
      </div>
      <div class="field-hint" style={{ marginTop: 8 }}>{_t('Upload date drives the calendar and Upcoming. Ticking a stage also shows it as done on Today.')}</div>
    </div>
  );
  const Checklist = (
    <div class="card">
      <div class="card-head"><div class="card-title">{_t('Production checklist')}</div>{!(c.checklist || []).length && <button class="btn xs soft" onClick={() => set({ checklist: s.checklistTemplate.map((text) => ({ id: uid(), text, done: false })) })}>{_t('Use template')}</button>}</div>
      <ChecklistEditor items={c.checklist || []} onChange={(v) => set({ checklist: v })} placeholder={_t('Add checklist item')} idPrefix="ce-cl" />
    </div>
  );
  const Links = (
    <div class="card">
      <div class="card-head"><div class="card-title">{_t('Links')}</div></div>
      <ContentLinks links={c.links || []} onChange={(v) => set({ links: v })} idPrefix="ce-ln" />
    </div>
  );
  const Tasks = (
    <div class="card">
      <div class="card-head"><div class="card-title">{_t('Linked tasks')}{' '}<span class="count">{tasks.length}</span></div><button class="btn xs soft" onClick={() => openTaskSheet(null, { contentId: id, dueDate: today(), category: 'Growth' })}><Icon name="plus" size={14} />{_t('Task')}</button></div>
      {tasks.length ? <div class="list">{tasks.map((t) => <TaskRow t={t} />)}</div> : <div class="muted" style={{ fontSize: 13.5 }}>{_t('Only add a task if this needs something the schedule doesn\'t cover, like booking a location.')}</div>}
    </div>
  );

  return (
    <div class="page">
      <BackBar onBack={() => back('/content/board')} right={<>
        <span class="save-hint hide-mobile">{_t('Saved automatically ·')}{' '}{fmtAgo(c.updatedAt)}</span>
        <button class="icon-btn" aria-label={_t('More actions')} onClick={(e) => openMenu(e, [
          { label: _t('Duplicate'), icon: 'copy', onSelect: () => { const d = M.duplicateContent(id); toast(_t('Duplicated')); navigate('/content/item/' + d.id); } },
          { label: _t('Copy caption'), icon: 'copy', disabled: !c.caption, onSelect: () => copyText(c.caption, _t('Caption copied')) },
          { label: _t('Move to Trash'), icon: 'trash', danger: true, onSelect: () => { trashContent(c); back('/content/board'); } },
        ])}><Icon name="more" /></button>
      </>} />
      <div class="editor-head">
        <div class="status-bar">
          <div class="status-scroll" ref={(el) => { const on = el && el.querySelector('.status-step.on'); if (on && (on.offsetLeft + on.offsetWidth > el.clientWidth + el.scrollLeft || on.offsetLeft < el.scrollLeft)) el.scrollLeft = on.offsetLeft - 24; }}>
            <div class="status-track lg">
              {M.CONTENT_STATUSES.map((st, i) => <button class={'status-step ' + (st.id === c.status ? 'on' : i < idx ? 'past' : '')} aria-pressed={st.id === c.status} onClick={() => M.setContentStatus(id, st.id)}>{st.label}</button>)}
            </div>
          </div>
          {next && <button class="btn sm accent status-next" onClick={() => { M.setContentStatus(id, next.to); toast(_t('Moved to {0}', [statusLabel(next.to)])); }}>{next.label}<Icon name="chevronRight" size={16} /></button>}
        </div>
        <textarea class="input title-input" id="ce-title" rows={1} value={c.title} placeholder={_t('Content title')} aria-label={_t('Title')}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; if (isNew && !el.dataset.f) { el.dataset.f = 1; setTimeout(() => { el.focus(); el.select(); }, 80); } } }}
          onInput={(e) => set({ title: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} style={{ resize: 'none', overflow: 'hidden' }} />
        <TextArea id="ce-desc" value={c.description} onInput={(v) => set({ description: v })} placeholder={_t('Short description')} minRows={1} class="" />
      </div>
      {(() => {
        const Hook = (
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('Hook / angle')}</div></div>
            <TextArea id="ce-hook" value={c.hook} onInput={(v) => setText({ hook: v })} placeholder={_t('The opening line or idea that stops the scroll')} />
          </div>
        );
        const Script = (
          <div class="card">
            <div class="card-head">
              <div class="card-title">{_t('Script / voice over')}</div>
              <div class="row gap-8">
                <span class="muted tnum" style={{ fontSize: 12 }}>{(htmlToText(c.script).trim().split(/\s+/).filter(Boolean).length)}{' '}{_t('words')}</span>
                <button class="btn xs soft" onClick={() => openVersions(c)}><Icon name="restore" size={14} />{_t('History')}{(c.versions || []).length ? ` · ${(c.versions || []).length}` : ''}</button>
              </div>
            </div>
            <RichText id="ce-script" value={c.script} onChange={(v) => setText({ script: v })} placeholder={_t('Write the script or VO here')} minHeight={160} />
          </div>
        );
        const Shotlist = (
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('Shotlist')}</div></div>
            <ChecklistEditor items={c.shotlist || []} onChange={(v) => set({ shotlist: v })} placeholder={_t('Add a shot, e.g. close-up hands on keyboard')} idPrefix="ce-sl" withImages />
          </div>
        );
        const Caption = (
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('Caption')}</div><button class="btn xs soft" disabled={!c.caption} onClick={() => copyText(c.caption, _t('Caption copied'))}><Icon name="copy" size={14} />{_t('Copy')}</button></div>
            <div class="caption-box"><TextArea id="ce-caption" value={c.caption} onInput={(v) => setText({ caption: v })} placeholder={_t('Final caption')} minRows={3} /><span class="caption-count">{(c.caption || '').length}{' '}{_t('chars')}</span></div>
          </div>
        );
        const Notes = (
          <div class="card">
            <div class="card-head"><div class="card-title">{_t('Notes')}</div></div>
            <RichText id="ce-notes" value={c.notes} onChange={(v) => set({ notes: v })} placeholder={_t('Ideas, references, reminders')} tools={['bold', 'checkbox']} minHeight={90} />
          </div>
        );
        if (desktop) return (
          <div class="two-col">
            <div class="stack">{Hook}{Script}{Shotlist}{Caption}{Notes}</div>
            <div class="stack">{Details}{Links}{Schedule}{Tasks}</div>
          </div>
        );
        const shots = (c.shotlist || []).length;
        return (
          <>
            <div class="ce-tabs"><Segmented class="full" value={tab} onChange={pickTab} options={[{ id: 'write', label: _t('Write') }, { id: 'prod', label: _t('Production'), count: shots || undefined }, { id: 'details', label: _t('Details') }]} /></div>
            <div class="stack">
              {tab === 'write' && <>{Hook}{Script}{Caption}</>}
              {tab === 'prod' && <>{Shotlist}{Schedule}{Links}{Tasks}</>}
              {tab === 'details' && <>{Details}{Notes}</>}
            </div>
          </>
        );
      })()}
      <div class="muted" style={{ fontSize: 12, textAlign: 'center' }}>{_t('Created')}{' '}{fmtFull(isoOf(c.createdAt))}{' '}{_t('· Last change')}{' '}{fmtAgo(c.updatedAt)}{' '}{_t('· Saved automatically')}</div>
    </div>
  );
}

// ---------- script history ----------
function openVersions(c) { openOverlay((close) => <VersionsSheet id={c.id} close={close} />, { kind: 'sheet' }); }
function VersionsSheet({ id, close }) {
  useStore();
  const c = get('contents', id);
  const [pick, setPick] = useState(null);
  if (!c) return null;
  const vs = c.versions || [];
  const words = (h) => htmlToText(h || '').trim().split(/\s+/).filter(Boolean).length;
  const when = (t) => { const d = isoOf(t); const hm = new Date(t).toLocaleTimeString(_locale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); return `${relDay(d)} · ${hm}`; };
  const restore = (v) => {
    const cur = { at: Date.now(), hook: c.hook || '', script: c.script || '', caption: c.caption || '' };
    patch('contents', id, { hook: v.hook, script: v.script, caption: v.caption, versions: [cur, ...vs].slice(0, 30) });
    toast(_t('Version restored. The text you had is saved in History too.'));
    close();
  };
  if (pick) return (
    <>
      <SheetHead title={when(pick.at)} sub={_t('{0} words', [words(pick.script)])} onClose={close} />
      <SheetBody>
        <div class="col gap-12">
          {pick.hook && <div><div class="eyebrow">{_t('Hook')}</div><div class="ver-text">{pick.hook}</div></div>}
          <div><div class="eyebrow">{_t('Script')}</div><div class="ver-text rich" dangerouslySetInnerHTML={{ __html: pick.script || '<p class="muted">Empty</p>' }} /></div>
          {pick.caption && <div><div class="eyebrow">{_t('Caption')}</div><div class="ver-text">{pick.caption}</div></div>}
        </div>
      </SheetBody>
      <SheetFoot><button class="btn ghost" onClick={() => setPick(null)}>{_t('Back')}</button><button class="btn primary" onClick={() => restore(pick)}><Icon name="restore" size={16} />{_t('Restore this version')}</button></SheetFoot>
    </>
  );
  return (
    <>
      <SheetHead title={_t('History')} sub={_t('Hook, script and caption are saved before each editing session')} onClose={close} />
      <SheetBody>
        {vs.length ? <div class="list">{vs.map((v) => (
          <button class="list-row clickable" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(v)}>
            <div class="row-main"><div class="row-title">{when(v.at)}</div><div class="row-meta ellipsis">{words(v.script)}{' '}{_t('words ·')}{' '}{htmlToText(v.script || '').trim().slice(0, 80) || v.hook || v.caption || _t('Empty')}</div></div>
            <Icon name="chevronRight" size={16} class="muted" />
          </button>
        ))}</div> : <Empty icon="restore" title={_t('No earlier versions yet')}>{_t('Once you edit this script again later, the previous text is kept here.')}</Empty>}
      </SheetBody>
    </>
  );
}

// =====================================================================
// CALENDAR
// =====================================================================
function openDateSheet({ title, sub, date, time, onSave, withTime = true }) {
  openOverlay((close) => <DateSheet {...{ title, sub, date, time, onSave, withTime, close }} />, { kind: 'sheet' });
}
function DateSheet({ title, sub, date, time, onSave, withTime, close }) {
  const [d, setD] = useState(date || today());
  const [t, setT] = useState(time || '');
  return (
    <>
      <SheetHead title={title} sub={sub} onClose={close} />
      <SheetBody><div class="form-row"><Field label={_t('Date')} htmlFor="ds-d"><DateInput id="ds-d" value={d} onChange={setD} /></Field>{withTime && <Field label={_t('Time')} htmlFor="ds-t"><TimeInput id="ds-t" value={t} onChange={setT} /></Field>}</div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>{_t('Cancel')}</button><button class="btn primary" onClick={() => { onSave(d, t); close(); }}>{_t('Save')}</button></SheetFoot>
    </>
  );
}

export function ContentCalendar({ query }) {
  useStore();
  const [tab, setTab] = useState(query.tab === 'week' ? 'week' : loadPref('calTab', 'upload'));
  useEffect(() => savePref('calTab', tab), [tab]);
  return (
    <div class="page">
      <SubNav items={CONTENT_NAV} active="calendar" />
      <PageHeader title={_t('Calendar')} children={<div class="muted" style={{ marginTop: 6, fontSize: 13 }}>{_t('All dates and times are WIB (Asia/Jakarta), whatever timezone your device is set to.')}</div>} actions={<><Segmented options={[{ id: 'upload', label: _t('Upload calendar') }, { id: 'week', label: _t('Weekly production') }]} value={tab} onChange={setTab} /><AddContentBtn /></>} />
      {tab === 'upload' ? <UploadCalendar /> : <WeeklyProduction />}
    </div>
  );
}

function UploadCalendar() {
  const s = M.settings();
  const t0 = today();
  const desktop = useMedia(DESKTOP_Q);
  const [month, setMonth] = useState(startOfMonth(t0));
  const [sel, setSel] = useState(t0);
  const [mode, setMode] = useState(loadPref('calMode', 'month'));
  useEffect(() => savePref('calMode', mode), [mode]);
  const items = M.liveContents().filter((c) => c.schedule?.upload?.date);
  const byDate = {};
  items.forEach((c) => { (byDate[c.schedule.upload.date] = byDate[c.schedule.upload.date] || []).push(c); });
  Object.values(byDate).forEach((arr) => arr.sort((a, b) => (a.schedule.upload.time || '99').localeCompare(b.schedule.upload.time || '99')));
  const gridStart = startOfWeek(month, s.weekStart);
  const totalDays = Math.ceil((diffDays(month, gridStart) + daysInMonth(month)) / 7) * 7;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  const dows = Array.from({ length: 7 }, (_, i) => fmtWeekdayShort(addDays(gridStart, i)));
  const reschedule = (c) => openDateSheet({ title: _t('Upload date'), sub: c.title, date: c.schedule.upload.date, time: c.schedule.upload.time, onSave: (d, t) => { patch('contents', c.id, { schedule: { ...c.schedule, upload: { date: d, time: t } } }); toast(_t('Upload moved to {0}', [fmtShort(d)])); } });
  const onDropDay = ({ id, to }) => {
    const c = get('contents', id);
    if (!c || !to.startsWith('day:')) return;
    const d = to.slice(4);
    patch('contents', id, { schedule: { ...c.schedule, upload: { ...(c.schedule?.upload || {}), date: d } } });
    toast(_t('Upload moved to {0}', [fmtShort(d)]));
  };
  const agendaDays = Object.keys(byDate).filter((d) => d >= month && d < addMonths(month, 1)).sort();
  return (
    <>
      <div class="card">
        <div class="cal-head" style={{ marginBottom: 12 }}>
          <div class="row gap-8">
            <button class="icon-btn soft sm" aria-label={_t('Previous month')} onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={18} /></button>
            <div class="cal-title" style={{ minWidth: 150, textAlign: 'center' }}>{fmtMonth(month)}</div>
            <button class="icon-btn soft sm" aria-label={_t('Next month')} onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={18} /></button>
          </div>
          <div class="row gap-6">
            <button class="btn sm soft" onClick={() => { setMonth(startOfMonth(t0)); setSel(t0); }}>{_t('Today')}</button>
            <Segmented options={[{ id: 'month', label: _t('Month') }, { id: 'agenda', label: _t('Agenda') }]} value={mode} onChange={setMode} />
          </div>
        </div>
        {mode === 'month' ? (
          <div class="month">
            {dows.map((d) => <div class="dow">{d}</div>)}
            {days.map((d) => {
              const its = byDate[d] || [];
              return (
                <div class={'day ' + (d.slice(0, 7) !== month.slice(0, 7) ? 'out ' : '') + (d === t0 ? 'today ' : '') + (!desktop && d === sel ? 'sel' : '')} data-drop={'day:' + d} data-drop-mode="cell" onClick={() => { if (!desktop) setSel(d); }} role="gridcell" aria-label={fmtFull(d) + (its.length ? _t(', {0} upload(s)', [its.length]) : '')}>
                  <div class="row between" style={{ width: '100%' }}>
                    <span class="day-num">{dayNum(d)}</span>
                    {desktop && <button class="icon-btn ghost xs add-day" aria-label={_t('Add content on {0}', [fmtShort(d)])} onClick={(e) => { e.stopPropagation(); createContentAndOpen({ schedule: { script: {}, shoot: {}, edit: {}, ready: {}, upload: { date: d, time: '' } } }); }} style={{ opacity: 0.5 }}><Icon name="plus" size={14} /></button>}
                  </div>
                  <div class="day-dots">{its.slice(0, 4).map((c) => <i class={c.status === 'published' ? 'pub' : ''} />)}</div>
                  <div class="day-items">
                    {its.slice(0, 3).map((c) => (
                      <div class={'cal-chip ' + (c.status === 'published' ? 'pub' : '')} {...dragHandlers(c.id, onDropDay, { accept: (k) => k.startsWith('day:') })} onClick={(e) => { e.stopPropagation(); navigate('/content/item/' + c.id); }} title={c.title}>
                        {c.schedule.upload.time && <span class="t">{c.schedule.upload.time}</span>}<span>{c.title}</span>
                      </div>
                    ))}
                    {its.length > 3 && <div class="day-more">+{its.length - 3}{' '}{_t('more')}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="col gap-12">
            {agendaDays.length ? agendaDays.map((d) => (
              <div>
                <div class="result-label" style={d === t0 ? { color: 'var(--accent-text)' } : null}>{fmtDay(d)}{d === t0 ? _t(' · Today') : ''}</div>
                <div class="list">{byDate[d].map((c) => <UploadRow c={c} onMove={() => reschedule(c)} />)}</div>
              </div>
            )) : <Empty icon="calendar" title={_t('No uploads in {0}', [fmtMonth(month)])} />}
          </div>
        )}
        {desktop && mode === 'month' && <div class="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{_t('Drag a post to another day to move its upload date. Click a post to open it.')}</div>}
      </div>
      {!desktop && mode === 'month' && (
        <div class="card">
          <div class="card-head"><div class="card-title">{relDay(sel)}<span class="count">{fmtShort(sel)}</span></div><button class="btn xs soft" onClick={() => createContentAndOpen({ schedule: { script: {}, shoot: {}, edit: {}, ready: {}, upload: { date: sel, time: '' } } })}><Icon name="plus" size={14} />{_t('Add')}</button></div>
          {(byDate[sel] || []).length ? <div class="list">{byDate[sel].map((c) => <UploadRow c={c} onMove={() => reschedule(c)} />)}</div> : <div class="muted" style={{ fontSize: 14 }}>{_t('No uploads planned for this day.')}</div>}
        </div>
      )}
    </>
  );
}
function UploadRow({ c, onMove }) {
  return (
    <div class="list-row">
      <span class="tnum" style={{ fontWeight: 800, width: 46, flex: 'none', fontSize: 13 }}>{c.schedule.upload.time || '—'}</span>
      <a class="row-main" href={'#/content/item/' + c.id} style={{ textDecoration: 'none' }}><div class="row-title">{c.title}</div><div class="row-meta">{(c.platforms || []).join(', ')}{c.pillar ? ' · ' + c.pillar : ''}</div></a>
      <ContentBadge status={c.status} sm />
      <button class="icon-btn ghost sm" aria-label={_t('Change upload date')} onClick={onMove}><Icon name="calendar" size={17} /></button>
    </div>
  );
}

function WeeklyProduction() {
  const s = M.settings();
  const t0 = today();
  const [ws, setWs] = useState(startOfWeek(t0, s.weekStart));
  const swipe = useRef(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const stages = M.STAGES.filter((x) => x.id !== 'upload');
  const items = [];
  for (const c of M.liveContents()) for (const st of stages) {
    const d = c.schedule?.[st.id]?.date;
    if (d && d >= ws && d <= days[6]) items.push({ c, st, date: d, time: c.schedule[st.id].time || '', done: M.stageIsDone(c, st.id) });
  }
  items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const onDrop = ({ id, to }) => {
    if (!to.startsWith('wday:')) return;
    const [cid, stage] = id.split('|');
    const c = get('contents', cid);
    if (!c) return;
    const d = to.slice(5);
    patch('contents', cid, { schedule: { ...c.schedule, [stage]: { ...(c.schedule?.[stage] || {}), date: d } } });
    toast(_t('{0} moved to {1}', [M.STAGES.find((x) => x.id === stage).label, fmtShort(d)]));
  };
  const itemMenu = (e, it) => openMenu(e, [
    { label: _t('Open content'), icon: 'edit', onSelect: () => navigate('/content/item/' + it.c.id) },
    { label: _t('Change date…'), icon: 'calendar', onSelect: () => openDateSheet({ title: _t('{0} date', [it.st.label]), sub: it.c.title, date: it.date, time: it.time, onSave: (d, t) => { const c = get('contents', it.c.id); patch('contents', c.id, { schedule: { ...c.schedule, [it.st.id]: { date: d, time: t } } }); toast(_t('Date updated')); } }) },
    it.done ? { label: _t('Mark not done'), icon: 'restore', onSelect: () => M.uncompleteStage(it.c, it.st.id) } : { label: _t('Mark {0} done', [it.st.label.toLowerCase()]), icon: 'check', onSelect: () => M.completeStage(it.c, it.st.id) },
  ], { title: `${it.st.label}: ${it.c.title}` });
  return (
    <>
      <div class="cal-head">
        <div class="row gap-8">
          <button class="icon-btn" aria-label={_t('Previous week')} onClick={() => setWs(addDays(ws, -7))}><Icon name="chevronLeft" size={18} /></button>
          <div style={{ textAlign: 'center', minWidth: 150 }}><div class="cal-title" style={{ fontSize: 24 }}>{fmtShort(ws)} – {fmtShort(days[6])}</div></div>
          <button class="icon-btn" aria-label={_t('Next week')} onClick={() => setWs(addDays(ws, 7))}><Icon name="chevronRight" size={18} /></button>
        </div>
        <div class="row gap-8 wrap">
          {ws !== startOfWeek(t0, s.weekStart) && <button class="btn sm soft" onClick={() => setWs(startOfWeek(t0, s.weekStart))}>{_t('This week')}</button>}
          <div class="legend">{stages.map((st) => <span><i style={{ background: `var(--${{ script: 't-violet', shoot: 't-orange', edit: 't-blue', ready: 't-green' }[st.id]})` }} />{st.label}</span>)}</div>
        </div>
      </div>
      <div class="week"
        onTouchStart={(e) => { if (e.target.closest('[data-drag-id]')) return; swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => { const sw = swipe.current; swipe.current = null; if (!sw) return; const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) setWs(addDays(ws, dx < 0 ? 7 : -7)); }}>
        {days.map((d) => {
          const its = items.filter((x) => x.date === d);
          return (
            <div class={'wday ' + (d === t0 ? 'today' : '')} data-drop={'wday:' + d} data-drop-mode="cell">
              <div class="wday-head"><b>{dayNum(d)}</b><span>{fmtWeekdayShort(d)}</span>{d === t0 && <span class="badge sm t-accent" style={{ marginLeft: 'auto' }}>{_t('Today')}</span>}</div>
              {its.map((it) => (
                <div class={`cal-chip st-${it.st.id} ${it.done ? 'done' : ''}`} {...dragHandlers(it.c.id + '|' + it.st.id, onDrop, { accept: (k) => k.startsWith('wday:') })} onClick={(e) => itemMenu(e, it)} title={`${it.st.label}: ${it.c.title}`}>
                  <span class="t">{it.time || it.st.label}</span><span>{it.c.title}</span>
                </div>
              ))}
              {!its.length && <div class="wday-empty">{_t('Nothing planned')}</div>}
            </div>
          );
        })}
      </div>
      <div class="muted" style={{ fontSize: 12.5 }}>{_t('Tap an item to open it, change its date or mark the stage done. Drag to another day to reschedule')}{' '}<span class="hide-desktop">{_t('(hold first), or swipe left and right to change weeks')}</span>.</div>
    </>
  );
}

// =====================================================================
// RESOURCES
// =====================================================================
export function ResourcesPage() {
  useStore();
  const list = all('resources').filter((r) => !r.deletedAt).sort((a, b) => (a.order || 0) - (b.order || 0));
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const add = () => {
    if (!url.trim()) return toast(_t('Paste a URL first.'), { tone: 'warn' });
    const max = list.length ? Math.max(...list.map((r) => r.order || 0)) : 0;
    put('resources', { id: uid(), name: name.trim() || hostOf(url) || url.trim(), url: url.trim(), order: max + 1 });
    setName(''); setUrl('');
    toast(_t('Resource added'));
  };
  const onDrop = ({ id, to, before, after }) => {
    if (to !== 'resources') return;
    const p = after && get('resources', after), n = before && get('resources', before);
    patch('resources', id, { order: orderBetween(p?.order, n?.order) });
  };
  const del = (r) => { remove('resources', r.id); toast(_t('Resource deleted'), { action: { label: _t('Undo'), run: () => put('resources', r) } }); };
  return (
    <div class="page narrow">
      <SubNav items={CONTENT_NAV} active="resources" />
      <PageHeader title={_t('Resources')} actions={<AddContentBtn />}>
        <div class="muted" style={{ marginTop: 6 }}>{_t('Links you use across many posts: music libraries, LUTs, templates, references. Links for a single post live inside that post.')}</div>
      </PageHeader>
      <div class="card">
        <div class="form">
          <div class="form-row">
            <Field label={_t('Name')} htmlFor="res-name"><TextInput id="res-name" value={name} onInput={setName} placeholder={_t('e.g. Artlist music')} /></Field>
            <Field label={_t('URL')} htmlFor="res-url"><TextInput id="res-url" value={url} onInput={setUrl} placeholder={_t('https://')} inputMode="url" onEnter={add} /></Field>
          </div>
          <button class="btn primary" style={{ alignSelf: 'flex-start' }} onClick={add}><Icon name="plus" size={16} />{_t('Add resource')}</button>
        </div>
      </div>
      {list.length ? (
        <div class="card">
          <div class="list" data-drop="resources">
            {list.map((r) => <ResourceRow r={r} onDelete={() => del(r)} onDrop={onDrop} />)}
          </div>
        </div>
      ) : <div class="card"><Empty icon="link" title={_t('No resources yet')}>{_t('Add the links you keep reaching for.')}</Empty></div>}
    </div>
  );
}
function ResourceRow({ r, onDelete, onDrop }) {
  const [edit, setEdit] = useState(false);
  const href = safeUrl(r.url);
  return (
    <div class="list-row" {...dragHandlers(r.id, onDrop, { accept: (k) => k === 'resources' })} style={{ background: 'var(--surface)' }}>
      <span class="grip" data-drag-handle aria-label={_t('Drag to reorder')}><Icon name="grip" size={16} /></span>
      {edit ? (
        <div class="row-main" style={{ gap: 6 }}>
          <input class="input mini" id={'res-n-' + r.id} value={r.name} onInput={(e) => patch('resources', r.id, { name: e.currentTarget.value })} aria-label={_t('Name')} />
          <input class="input mini url" id={'res-u-' + r.id} value={r.url} onInput={(e) => patch('resources', r.id, { url: e.currentTarget.value })} aria-label={_t('URL')} />
        </div>
      ) : (
        <div class="row-main"><div class="row-title">{r.name}</div><div class="row-meta ellipsis">{hostOf(r.url) || r.url}</div></div>
      )}
      <div class="row-right">
        {href && !edit && <a class="icon-btn soft sm" href={href} target="_blank" rel="noopener noreferrer" aria-label={_t('Open {0}', [r.name])}><Icon name="external" size={15} /></a>}
        <button class="icon-btn ghost sm" aria-label={edit ? _t('Done editing') : _t('Edit')} onClick={() => setEdit(!edit)}><Icon name={edit ? 'check' : 'edit'} size={15} /></button>
        <button class="icon-btn ghost sm" aria-label={_t('Delete')} onClick={onDelete}><Icon name="trash" size={15} /></button>
      </div>
    </div>
  );
}
