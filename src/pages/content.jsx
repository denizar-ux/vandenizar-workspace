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

export function createContentAndOpen(preset = {}) {
  const c = M.newContent(preset);
  navigate('/content/item/' + c.id + '?new=1');
  return c;
}
const statusLabel = (s) => M.CONTENT_STATUSES.find((x) => x.id === s)?.label || s;
const AddContentBtn = ({ preset, label = 'Add new content' }) => <button class="btn primary" onClick={() => createContentAndOpen(preset)}><Icon name="plus" size={18} />{label}</button>;

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
      <PageHeader eyebrow="Content OS" title={<>What to make <em>now</em></>} actions={<AddContentBtn />} />
      <div class="two-col">
        <div class="stack">
          {pr ? <PriorityContent c={pr} /> : (
            <div class="card"><Empty icon="video" title="No content yet" action={<AddContentBtn label="Add your first idea" />}>Ideas, drafts and scheduled posts live here, from first idea to published.</Empty></div>
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
              <div class="card-head"><div class="card-title">Due today <span class="count">{acts.length}</span></div></div>
              <div class="list">
                {acts.map((a) => (
                  <div class="list-row">
                    <Check checked={false} onChange={() => { M.completeStage(a.content, a.stage.id); toast(`${a.stage.label} done`); }} label={`Mark ${a.stage.label} done`} />
                    <a class="row-main" href={'#/content/item/' + a.content.id} style={{ textDecoration: 'none' }}><div class="row-title">{a.stage.verb}: {a.content.title}</div><div class="row-meta">{a.overdue ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>Overdue · {relDay(a.date)}</span> : (a.time || 'Today')}</div></a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">This week's target</div><a class="section-link" href="#/settings/content">Edit target</a></div>
            <div class="row gap-16">
              <Ring pct={pct} size={78} stroke={7} label={<span style={{ fontSize: 18 }}>{pubWeek.length}<span class="muted" style={{ fontSize: 12 }}>/{s.weeklyTarget}</span></span>} />
              <div class="grow" style={{ fontSize: 14 }}>
                <div style={{ fontWeight: 800 }}>{pubWeek.length >= s.weeklyTarget ? 'Target hit this week' : `${s.weeklyTarget - pubWeek.length} more to upload`}</div>
                <div class="muted">Week of {fmtShort(ws)}. {upcoming.filter((c) => c.schedule.upload.date <= addDays(ws, 6)).length} more scheduled before Sunday.</div>
              </div>
            </div>
            {pubWeek.length > 0 && <div class="col gap-4" style={{ marginTop: 12, fontSize: 13.5 }}>{pubWeek.map((c) => <a href={'#/content/item/' + c.id} class="row gap-8" style={{ textDecoration: 'none' }}><Icon name="check" size={15} style={{ color: 'var(--good)' }} /><span class="ellipsis">{c.title}</span></a>)}</div>}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Upcoming uploads</div><a class="section-link" href="#/content/calendar">Open calendar</a></div>
            {upcoming.length ? (
              <div class="list">
                {upcoming.slice(0, 7).map((c) => (
                  <a class="list-row clickable" href={'#/content/item/' + c.id}>
                    <div class="col" style={{ width: 46, alignItems: 'center', flex: 'none' }}><span class="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{fmtWeekdayShort(c.schedule.upload.date)}</span><span style={{ fontWeight: 800, fontSize: 20 }} class="tnum">{dayNum(c.schedule.upload.date)}</span></div>
                    <div class="row-main"><div class="row-title ellipsis">{c.title}</div><div class="row-meta">{c.schedule.upload.time || 'No time'} · {(c.platforms || []).join(', ') || 'No platform'}</div></div>
                    <ContentBadge status={c.status} sm />
                  </a>
                ))}
              </div>
            ) : <div class="muted" style={{ fontSize: 14 }}>Nothing scheduled in the next two weeks. Set an Upload date in a content item to see it here.</div>}
          </div>
          {trashCount > 0 && <a class="section-link" href="#/trash" style={{ paddingLeft: 4 }}><Icon name="trash" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {trashCount} in Trash</a>}
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
      <div class="row gap-8 wrap"><span class="eyebrow">Work on this now</span><ContentBadge status={c.status} sm />{c.pillar && <span class={'badge sm ' + pillarTone(c.pillar)}>{c.pillar}</span>}</div>
      <div class="row gap-12" style={{ alignItems: 'flex-start' }}>
        <a href={'#/content/item/' + c.id} class="grow" style={{ textDecoration: 'none', minWidth: 0 }}><h2 class="hero-title" style={{ fontSize: 34 }}>{c.title}</h2>{c.description && <div class="muted" style={{ marginTop: 6 }}>{c.description}</div>}</a>
        <a class="icon-btn dark" href={'#/content/item/' + c.id} aria-label="Open editor"><Icon name="arrow" size={18} /></a>
      </div>
      <div class="row gap-16 wrap" style={{ fontSize: 13 }}>
        {nx && <span class="pill-time">{nx.label} · {relDay(nx.date)}{nx.time ? ' ' + nx.time : ''}</span>}
        {sp != null && <span class="row gap-6" style={{ minWidth: 130 }}><span class="muted">Shotlist</span><Progress pct={sp} thin /><b class="tnum">{sp}%</b></span>}
      </div>
      {next && <div><button class="btn soft sm" onClick={() => { M.setContentStatus(c.id, next.to); toast(`Moved to ${statusLabel(next.to)}`); }}>{next.label}</button></div>}
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
      <button class="icon-btn ghost xs kcard-more" aria-label="Card actions" onClick={(e) => contentMenu(e, c)}><Icon name="more" size={16} /></button>
    </div>
  );
}
export function contentMenu(e, c) {
  openMenu(e, [
    { label: 'Open editor', icon: 'edit', onSelect: () => navigate('/content/item/' + c.id) },
    { heading: 'Move to' },
    ...M.CONTENT_STATUSES.map((st) => ({ label: st.label, active: c.status === st.id, onSelect: () => { M.setContentStatus(c.id, st.id); toast('Moved to ' + st.label); } })),
    { divider: true },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { M.duplicateContent(c.id); toast('Duplicated'); } },
    { label: 'Add a task for this', icon: 'tasks', onSelect: () => openTaskSheet(null, { contentId: c.id, title: '', category: 'Growth', dueDate: today() }) },
    { label: 'Move to Trash', icon: 'trash', danger: true, onSelect: () => trashContent(c) },
  ], { title: c.title });
}
export function trashContent(c) {
  patch('contents', c.id, { deletedAt: Date.now() });
  toast('Moved to Trash', { action: { label: 'Undo', run: () => patch('contents', c.id, { deletedAt: null }) } });
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
      <PageHeader title="Content board" actions={<>
        <Segmented options={[{ id: 'kanban', label: 'Kanban', icon: 'kanban' }, { id: 'list', label: 'List', icon: 'list' }]} value={view} onChange={(v) => M.setSettings({ boardView: v })} />
        <AddContentBtn preset={view === 'kanban' && !desktop ? { status: mobileCol } : {}} />
      </>} />
      <div class="row gap-8">
        <div class="search-box grow" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}><Icon name="search" size={17} class="muted" /><input id="board-q" value={q} placeholder="Search title, hook, script, pillar" onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn ghost xs" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}</div>
        <button class={'icon-btn ' + (filtersOn ? 'dark' : '')} aria-label="Filters" onClick={() => setFilters(!filters)}><Icon name="filter" size={18} /></button>
        {view === 'list' && <button class="icon-btn" aria-label="Sort" onClick={(e) => openMenu(e, [{ heading: 'Sort by' }, ...[['manual', 'Board order'], ['updated', 'Last updated'], ['upload', 'Upload date'], ['created', 'Newest'], ['title', 'Title A–Z']].map(([id, label]) => ({ label, active: sort === id, onSelect: () => setSort(id) }))])}><Icon name="sort" size={18} /></button>}
      </div>
      {filters && (
        <div class="card tight"><div class="form">
          <div class="form-row three">
            <Field label="Platform" htmlFor="cf-plat"><Select id="cf-plat" value={platform} onChange={setPlatform} placeholder="Any" options={s.platforms} /></Field>
            <Field label="Pillar" htmlFor="cf-pil"><Select id="cf-pil" value={pillar} onChange={setPillar} placeholder="Any" options={s.pillars} /></Field>
            <Field label="Format" htmlFor="cf-fmt"><Select id="cf-fmt" value={format} onChange={setFormat} placeholder="Any" options={s.formats} /></Field>
          </div>
          {view === 'list' && <Field label="Status"><Chips allowEmpty options={M.CONTENT_STATUSES} value={status} onChange={(v) => setStatus(v === status ? '' : v)} /></Field>}
          {filtersOn && <button class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => { setPlatform(''); setPillar(''); setFormat(''); setStatus(''); }}>Clear filters</button>}
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
                    <button class="icon-btn ghost xs" aria-label={'Add to ' + st.label} onClick={() => createContentAndOpen({ status: st.id })}><Icon name="plus" size={16} /></button></div>
                  <div class="col-list" data-drop={st.id} data-scroll-y>
                    {items.map((c) => <div {...dragHandlers(c.id, moveContent)}><ContentCard c={c} /></div>)}
                    {!items.length && <div class="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: '18px 8px' }}>Drop cards here</div>}
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
            {!list.some((c) => c.status === mobileCol) && <div class="card"><Empty icon="video" title={`Nothing in ${statusLabel(mobileCol)}`} action={<button class="btn sm soft" onClick={() => createContentAndOpen({ status: mobileCol })}><Icon name="plus" size={15} />Add here</button>}>{filtersOn || q ? 'Try clearing the search or filters.' : null}</Empty></div>}
            <div class="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Hold a card to drag it. Use ••• to move it to another status.</div>
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
  if (!sorted.length) return <div class="card"><Empty icon="search" title="No content matches" /></div>;
  const statusSel = (c) => (
    <select class={'inline-select ' + CONTENT_TONE[c.status]} value={c.status} onClick={(e) => e.stopPropagation()} onChange={(e) => { M.setContentStatus(c.id, e.currentTarget.value); toast('Status updated'); }} aria-label="Status">
      {M.CONTENT_STATUSES.map((s) => <option value={s.id}>{s.label}</option>)}
    </select>
  );
  if (desktop) return (
    <div class="card flush"><div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Title</th><th>Status</th><th>Pillar</th><th>Platforms</th><th>Format</th><th>Upload</th><th>Updated</th><th /></tr></thead>
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
              <td><button class="icon-btn ghost sm" aria-label="Actions" onClick={(e) => contentMenu(e, c)}><Icon name="more" /></button></td>
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
            <button class="icon-btn ghost sm" aria-label="Actions" onClick={(e) => contentMenu(e, c)}><Icon name="more" /></button>
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
  useEffect(() => { if (c && !c.deletedAt) M.touchRecent('content', id); if (isNew) navigate('/content/item/' + id, { replace: true }); }, [id]);
  if (!c) return <div class="page narrow"><BackBar onBack={() => back('/content/board')} /><div class="card"><Empty icon="video" title="This content item doesn't exist" action={<a class="btn primary sm" href="#/content/board">Go to board</a>}>It may have been deleted permanently.</Empty></div></div>;
  const set = (ch) => patch('contents', id, ch);
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
        <Field label="Platforms"><Chips multi options={platOpts} value={c.platforms || []} onChange={(v) => set({ platforms: v })} /></Field>
        <div class="form-row">
          <Field label="Content pillar" htmlFor="ce-pillar"><Select id="ce-pillar" value={c.pillar} onChange={(v) => set({ pillar: v })} placeholder="None" options={pillarOpts} /></Field>
          <Field label="Format" htmlFor="ce-format"><Select id="ce-format" value={c.format} onChange={(v) => set({ format: v })} placeholder="None" options={formatOpts} /></Field>
        </div>
        <Field label="Status" htmlFor="ce-status"><Select id="ce-status" value={c.status} onChange={(v) => { M.setContentStatus(id, v); }} options={M.CONTENT_STATUSES} /></Field>
      </div>
    </div>
  );
  const Cover = (
    <div class="card">
      <div class="card-head"><div class="card-title">Cover</div></div>
      <div class={'cover' + (c.cover ? '' : ' empty')} style={{ maxHeight: 360 }}>
        {c.cover ? <img src={c.cover} alt="Cover" /> : <button class="col gap-8" style={{ alignItems: 'center', color: 'var(--muted)', fontWeight: 700 }} onClick={() => fileRef.current.click()}><Icon name="image" size={26} />Add cover image</button>}
        {c.cover && <div class="cover-actions"><button class="btn sm" onClick={() => fileRef.current.click()}>Replace</button><button class="btn sm" onClick={() => set({ cover: '' })}>Remove</button></div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (!f) return; try { set({ cover: await fileToCover(f) }); toast('Cover updated'); } catch { toast('Could not read that image. Try a JPG or PNG.', { tone: 'warn' }); } }} />
    </div>
  );
  const Schedule = (
    <div class="card">
      <div class="card-head"><div class="card-title">Production schedule <span class="badge sm">WIB</span></div><a class="section-link" href="#/content/calendar">Calendar</a></div>
      <div class="sched">
        {M.STAGES.map((st) => {
          const v = c.schedule?.[st.id] || {};
          const done = M.stageIsDone(c, st.id);
          const late = v.date && !done && diffDays(v.date, today()) < 0;
          return (
            <div class="sched-row">
              <Check size="sm" checked={done} onChange={(x) => (x ? M.completeStage(c, st.id) : M.uncompleteStage(c, st.id))} label={(done ? 'Undo ' : 'Mark done: ') + st.label} />
              <div class="sched-name" style={late ? { color: 'var(--bad)' } : null}>{st.label}</div>
              <DateInput id={'ce-d-' + st.id} value={v.date} onChange={(d) => setSched(st.id, { date: d })} />
              <TimeInput id={'ce-t-' + st.id} value={v.time} onChange={(t) => setSched(st.id, { time: t })} />
            </div>
          );
        })}
      </div>
      <div class="field-hint" style={{ marginTop: 8 }}>Upload date drives the calendar and Upcoming. Ticking a stage also shows it as done on Today.</div>
    </div>
  );
  const Checklist = (
    <div class="card">
      <div class="card-head"><div class="card-title">Production checklist</div>{!(c.checklist || []).length && <button class="btn xs soft" onClick={() => set({ checklist: s.checklistTemplate.map((text) => ({ id: uid(), text, done: false })) })}>Use template</button>}</div>
      <ChecklistEditor items={c.checklist || []} onChange={(v) => set({ checklist: v })} placeholder="Add checklist item" idPrefix="ce-cl" />
    </div>
  );
  const Links = (
    <div class="card">
      <div class="card-head"><div class="card-title">Links</div></div>
      <ContentLinks links={c.links || []} onChange={(v) => set({ links: v })} idPrefix="ce-ln" />
    </div>
  );
  const Tasks = (
    <div class="card">
      <div class="card-head"><div class="card-title">Linked tasks <span class="count">{tasks.length}</span></div><button class="btn xs soft" onClick={() => openTaskSheet(null, { contentId: id, dueDate: today(), category: 'Growth' })}><Icon name="plus" size={14} />Task</button></div>
      {tasks.length ? <div class="list">{tasks.map((t) => <TaskRow t={t} />)}</div> : <div class="muted" style={{ fontSize: 13.5 }}>Only add a task if this needs something the schedule doesn't cover, like booking a location.</div>}
    </div>
  );

  return (
    <div class="page">
      <BackBar onBack={() => back('/content/board')} right={<>
        <span class="save-hint hide-mobile">Saved automatically · {fmtAgo(c.updatedAt)}</span>
        <button class="icon-btn" aria-label="More actions" onClick={(e) => openMenu(e, [
          { label: 'Duplicate', icon: 'copy', onSelect: () => { const d = M.duplicateContent(id); toast('Duplicated'); navigate('/content/item/' + d.id); } },
          { label: 'Copy caption', icon: 'copy', disabled: !c.caption, onSelect: () => copyText(c.caption, 'Caption copied') },
          { label: 'Move to Trash', icon: 'trash', danger: true, onSelect: () => { trashContent(c); back('/content/board'); } },
        ])}><Icon name="more" /></button>
      </>} />
      <div class="editor-head">
        <div class="status-flow">
          {M.CONTENT_STATUSES.map((st, i) => <button class={'status-step ' + (st.id === c.status ? 'on' : i < idx ? 'past' : '')} onClick={() => M.setContentStatus(id, st.id)}>{st.label}</button>)}
          {next && <button class="btn sm accent" style={{ marginLeft: 'auto' }} onClick={() => { M.setContentStatus(id, next.to); toast(`Moved to ${statusLabel(next.to)}`); }}>{next.label}<Icon name="chevronRight" size={16} /></button>}
        </div>
        <textarea class="input title-input" id="ce-title" rows={1} value={c.title} placeholder="Content title" aria-label="Title"
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; if (isNew && !el.dataset.f) { el.dataset.f = 1; setTimeout(() => { el.focus(); el.select(); }, 80); } } }}
          onInput={(e) => set({ title: e.currentTarget.value.replace(/\n/g, ' ') })} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} style={{ resize: 'none', overflow: 'hidden' }} />
        <TextArea id="ce-desc" value={c.description} onInput={(v) => set({ description: v })} placeholder="Short description" minRows={1} class="" />
      </div>
      <div class="two-col">
        <div class="stack">
          {!desktop && Details}
          <div class="card">
            <div class="card-head"><div class="card-title">Hook / angle</div></div>
            <TextArea id="ce-hook" value={c.hook} onInput={(v) => set({ hook: v })} placeholder="The opening line or idea that stops the scroll" />
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Script / voice over</div><span class="muted tnum" style={{ fontSize: 12 }}>{(htmlToText(c.script).trim().split(/\s+/).filter(Boolean).length)} words</span></div>
            <RichText id="ce-script" value={c.script} onChange={(v) => set({ script: v })} placeholder="Write the script or VO here" minHeight={160} />
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Shotlist</div></div>
            <ChecklistEditor items={c.shotlist || []} onChange={(v) => set({ shotlist: v })} placeholder="Add a shot, e.g. close-up hands on keyboard" idPrefix="ce-sl" withImages />
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Caption</div><button class="btn xs soft" disabled={!c.caption} onClick={() => copyText(c.caption, 'Caption copied')}><Icon name="copy" size={14} />Copy</button></div>
            <div class="caption-box"><TextArea id="ce-caption" value={c.caption} onInput={(v) => set({ caption: v })} placeholder="Final caption" minRows={3} /><span class="caption-count">{(c.caption || '').length} chars</span></div>
          </div>
          {!desktop && Links}
          {!desktop && Schedule}
          <div class="card">
            <div class="card-head"><div class="card-title">Notes</div></div>
            <RichText id="ce-notes" value={c.notes} onChange={(v) => set({ notes: v })} placeholder="Ideas, references, reminders" tools={['bold', 'checkbox']} minHeight={90} />
          </div>
          {!desktop && Tasks}
        </div>
        {desktop && <div class="stack">{Details}{Links}{Schedule}{Tasks}</div>}
      </div>
      <div class="muted" style={{ fontSize: 12, textAlign: 'center' }}>Created {fmtFull(isoOf(c.createdAt))} · Last change {fmtAgo(c.updatedAt)} · Saved automatically</div>
    </div>
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
      <SheetBody><div class="form-row"><Field label="Date" htmlFor="ds-d"><DateInput id="ds-d" value={d} onChange={setD} /></Field>{withTime && <Field label="Time" htmlFor="ds-t"><TimeInput id="ds-t" value={t} onChange={setT} /></Field>}</div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={() => { onSave(d, t); close(); }}>Save</button></SheetFoot>
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
      <PageHeader title="Calendar" children={<div class="muted" style={{ marginTop: 6, fontSize: 13 }}>All dates and times are WIB (Asia/Jakarta), whatever timezone your device is set to.</div>} actions={<><Segmented options={[{ id: 'upload', label: 'Upload calendar' }, { id: 'week', label: 'Weekly production' }]} value={tab} onChange={setTab} /><AddContentBtn /></>} />
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
  const reschedule = (c) => openDateSheet({ title: 'Upload date', sub: c.title, date: c.schedule.upload.date, time: c.schedule.upload.time, onSave: (d, t) => { patch('contents', c.id, { schedule: { ...c.schedule, upload: { date: d, time: t } } }); toast('Upload moved to ' + fmtShort(d)); } });
  const onDropDay = ({ id, to }) => {
    const c = get('contents', id);
    if (!c || !to.startsWith('day:')) return;
    const d = to.slice(4);
    patch('contents', id, { schedule: { ...c.schedule, upload: { ...(c.schedule?.upload || {}), date: d } } });
    toast('Upload moved to ' + fmtShort(d));
  };
  const agendaDays = Object.keys(byDate).filter((d) => d >= month && d < addMonths(month, 1)).sort();
  return (
    <>
      <div class="card">
        <div class="cal-head" style={{ marginBottom: 12 }}>
          <div class="row gap-8">
            <button class="icon-btn soft sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={18} /></button>
            <div class="cal-title" style={{ minWidth: 150, textAlign: 'center' }}>{fmtMonth(month)}</div>
            <button class="icon-btn soft sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={18} /></button>
          </div>
          <div class="row gap-6">
            <button class="btn sm soft" onClick={() => { setMonth(startOfMonth(t0)); setSel(t0); }}>Today</button>
            <Segmented options={[{ id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]} value={mode} onChange={setMode} />
          </div>
        </div>
        {mode === 'month' ? (
          <div class="month">
            {dows.map((d) => <div class="dow">{d}</div>)}
            {days.map((d) => {
              const its = byDate[d] || [];
              return (
                <div class={'day ' + (d.slice(0, 7) !== month.slice(0, 7) ? 'out ' : '') + (d === t0 ? 'today ' : '') + (!desktop && d === sel ? 'sel' : '')} data-drop={'day:' + d} data-drop-mode="cell" onClick={() => { if (!desktop) setSel(d); }} role="gridcell" aria-label={fmtFull(d) + (its.length ? `, ${its.length} upload(s)` : '')}>
                  <div class="row between" style={{ width: '100%' }}>
                    <span class="day-num">{dayNum(d)}</span>
                    {desktop && <button class="icon-btn ghost xs add-day" aria-label={'Add content on ' + fmtShort(d)} onClick={(e) => { e.stopPropagation(); createContentAndOpen({ schedule: { script: {}, shoot: {}, edit: {}, ready: {}, upload: { date: d, time: '' } } }); }} style={{ opacity: 0.5 }}><Icon name="plus" size={14} /></button>}
                  </div>
                  <div class="day-dots">{its.slice(0, 4).map((c) => <i class={c.status === 'published' ? 'pub' : ''} />)}</div>
                  <div class="day-items">
                    {its.slice(0, 3).map((c) => (
                      <div class={'cal-chip ' + (c.status === 'published' ? 'pub' : '')} {...dragHandlers(c.id, onDropDay, { accept: (k) => k.startsWith('day:') })} onClick={(e) => { e.stopPropagation(); navigate('/content/item/' + c.id); }} title={c.title}>
                        {c.schedule.upload.time && <span class="t">{c.schedule.upload.time}</span>}<span>{c.title}</span>
                      </div>
                    ))}
                    {its.length > 3 && <div class="day-more">+{its.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="col gap-12">
            {agendaDays.length ? agendaDays.map((d) => (
              <div>
                <div class="result-label" style={d === t0 ? { color: 'var(--accent-text)' } : null}>{fmtDay(d)}{d === t0 ? ' · Today' : ''}</div>
                <div class="list">{byDate[d].map((c) => <UploadRow c={c} onMove={() => reschedule(c)} />)}</div>
              </div>
            )) : <Empty icon="calendar" title={`No uploads in ${fmtMonth(month)}`} />}
          </div>
        )}
        {desktop && mode === 'month' && <div class="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Drag a post to another day to move its upload date. Click a post to open it.</div>}
      </div>
      {!desktop && mode === 'month' && (
        <div class="card">
          <div class="card-head"><div class="card-title">{relDay(sel)}<span class="count">{fmtShort(sel)}</span></div><button class="btn xs soft" onClick={() => createContentAndOpen({ schedule: { script: {}, shoot: {}, edit: {}, ready: {}, upload: { date: sel, time: '' } } })}><Icon name="plus" size={14} />Add</button></div>
          {(byDate[sel] || []).length ? <div class="list">{byDate[sel].map((c) => <UploadRow c={c} onMove={() => reschedule(c)} />)}</div> : <div class="muted" style={{ fontSize: 14 }}>No uploads planned for this day.</div>}
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
      <button class="icon-btn ghost sm" aria-label="Change upload date" onClick={onMove}><Icon name="calendar" size={17} /></button>
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
    toast(`${M.STAGES.find((x) => x.id === stage).label} moved to ${fmtShort(d)}`);
  };
  const itemMenu = (e, it) => openMenu(e, [
    { label: 'Open content', icon: 'edit', onSelect: () => navigate('/content/item/' + it.c.id) },
    { label: 'Change date…', icon: 'calendar', onSelect: () => openDateSheet({ title: `${it.st.label} date`, sub: it.c.title, date: it.date, time: it.time, onSave: (d, t) => { const c = get('contents', it.c.id); patch('contents', c.id, { schedule: { ...c.schedule, [it.st.id]: { date: d, time: t } } }); toast('Date updated'); } }) },
    it.done ? { label: 'Mark not done', icon: 'restore', onSelect: () => M.uncompleteStage(it.c, it.st.id) } : { label: `Mark ${it.st.label.toLowerCase()} done`, icon: 'check', onSelect: () => M.completeStage(it.c, it.st.id) },
  ], { title: `${it.st.label}: ${it.c.title}` });
  return (
    <>
      <div class="cal-head">
        <div class="row gap-8">
          <button class="icon-btn" aria-label="Previous week" onClick={() => setWs(addDays(ws, -7))}><Icon name="chevronLeft" size={18} /></button>
          <div style={{ textAlign: 'center', minWidth: 150 }}><div class="cal-title" style={{ fontSize: 24 }}>{fmtShort(ws)} – {fmtShort(days[6])}</div></div>
          <button class="icon-btn" aria-label="Next week" onClick={() => setWs(addDays(ws, 7))}><Icon name="chevronRight" size={18} /></button>
        </div>
        <div class="row gap-8 wrap">
          {ws !== startOfWeek(t0, s.weekStart) && <button class="btn sm soft" onClick={() => setWs(startOfWeek(t0, s.weekStart))}>This week</button>}
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
              <div class="wday-head"><b>{dayNum(d)}</b><span>{fmtWeekdayShort(d)}</span>{d === t0 && <span class="badge sm t-accent" style={{ marginLeft: 'auto' }}>Today</span>}</div>
              {its.map((it) => (
                <div class={`cal-chip st-${it.st.id} ${it.done ? 'done' : ''}`} {...dragHandlers(it.c.id + '|' + it.st.id, onDrop, { accept: (k) => k.startsWith('wday:') })} onClick={(e) => itemMenu(e, it)} title={`${it.st.label}: ${it.c.title}`}>
                  <span class="t">{it.time || it.st.label}</span><span>{it.c.title}</span>
                </div>
              ))}
              {!its.length && <div class="wday-empty">Nothing planned</div>}
            </div>
          );
        })}
      </div>
      <div class="muted" style={{ fontSize: 12.5 }}>Tap an item to open it, change its date or mark the stage done. Drag to another day to reschedule{' '}<span class="hide-desktop">(hold first), or swipe left and right to change weeks</span>.</div>
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
    if (!url.trim()) return toast('Paste a URL first.', { tone: 'warn' });
    const max = list.length ? Math.max(...list.map((r) => r.order || 0)) : 0;
    put('resources', { id: uid(), name: name.trim() || hostOf(url) || url.trim(), url: url.trim(), order: max + 1 });
    setName(''); setUrl('');
    toast('Resource added');
  };
  const onDrop = ({ id, to, before, after }) => {
    if (to !== 'resources') return;
    const p = after && get('resources', after), n = before && get('resources', before);
    patch('resources', id, { order: orderBetween(p?.order, n?.order) });
  };
  const del = (r) => { remove('resources', r.id); toast('Resource deleted', { action: { label: 'Undo', run: () => put('resources', r) } }); };
  return (
    <div class="page narrow">
      <SubNav items={CONTENT_NAV} active="resources" />
      <PageHeader title="Resources" actions={<AddContentBtn />}>
        <div class="muted" style={{ marginTop: 6 }}>Links you use across many posts: music libraries, LUTs, templates, references. Links for a single post live inside that post.</div>
      </PageHeader>
      <div class="card">
        <div class="form">
          <div class="form-row">
            <Field label="Name" htmlFor="res-name"><TextInput id="res-name" value={name} onInput={setName} placeholder="e.g. Artlist music" /></Field>
            <Field label="URL" htmlFor="res-url"><TextInput id="res-url" value={url} onInput={setUrl} placeholder="https://" inputMode="url" onEnter={add} /></Field>
          </div>
          <button class="btn primary" style={{ alignSelf: 'flex-start' }} onClick={add}><Icon name="plus" size={16} />Add resource</button>
        </div>
      </div>
      {list.length ? (
        <div class="card">
          <div class="list" data-drop="resources">
            {list.map((r) => <ResourceRow r={r} onDelete={() => del(r)} onDrop={onDrop} />)}
          </div>
        </div>
      ) : <div class="card"><Empty icon="link" title="No resources yet">Add the links you keep reaching for.</Empty></div>}
    </div>
  );
}
function ResourceRow({ r, onDelete, onDrop }) {
  const [edit, setEdit] = useState(false);
  const href = safeUrl(r.url);
  return (
    <div class="list-row" {...dragHandlers(r.id, onDrop, { accept: (k) => k === 'resources' })} style={{ background: 'var(--surface)' }}>
      <span class="grip" data-drag-handle aria-label="Drag to reorder"><Icon name="grip" size={16} /></span>
      {edit ? (
        <div class="row-main" style={{ gap: 6 }}>
          <input class="input mini" id={'res-n-' + r.id} value={r.name} onInput={(e) => patch('resources', r.id, { name: e.currentTarget.value })} aria-label="Name" />
          <input class="input mini url" id={'res-u-' + r.id} value={r.url} onInput={(e) => patch('resources', r.id, { url: e.currentTarget.value })} aria-label="URL" />
        </div>
      ) : (
        <div class="row-main"><div class="row-title">{r.name}</div><div class="row-meta ellipsis">{hostOf(r.url) || r.url}</div></div>
      )}
      <div class="row-right">
        {href && !edit && <a class="icon-btn soft sm" href={href} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + r.name}><Icon name="external" size={15} /></a>}
        <button class="icon-btn ghost sm" aria-label={edit ? 'Done editing' : 'Edit'} onClick={() => setEdit(!edit)}><Icon name={edit ? 'check' : 'edit'} size={15} /></button>
        <button class="icon-btn ghost sm" aria-label="Delete" onClick={onDelete}><Icon name="trash" size={15} /></button>
      </div>
    </div>
  );
}
