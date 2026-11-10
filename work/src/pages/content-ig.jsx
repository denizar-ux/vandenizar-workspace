// Content tab: Instagram (week strip, in-progress groups, posted by month). Threads lives in content-threads.jsx.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Segmented, Empty } from '../ui/kit.jsx';
import { PageHeader, AddBtn } from '../ui/parts.jsx';
import { SegBar } from '../ui/polish.jsx';
import { SlotTile, PostStagePill, NextButton } from '../ui/slotTile.jsx';
import { navigate } from '../lib/router.js';
import { useStore } from '../lib/db.js';
import { addDays, isoOf, fmtShort } from '../lib/date.js';
import { weekRange, MONTHS } from '../content/time.js';
import * as C from '../content/model.js';
import { ThreadsBody } from './content-threads.jsx';
import { newPost, newThread } from '../App.jsx';

export function ContentPage({ tab, query = {} }) {
  useStore();
  const t = tab === 'threads' ? 'threads' : 'ig';
  return (
    <div class="page content-page">
      <PageHeader title="Content." actions={<AddBtn label={t === 'ig' ? 'New post' : 'New Thread'} onClick={() => (t === 'ig' ? newPost() : newThread())} />} />
      <Segmented class="full" options={[{ id: 'ig', label: 'Instagram' }, { id: 'threads', label: 'Threads' }]} value={t} onChange={(id) => navigate('/content/' + id)} />
      {t === 'ig' ? <InstagramBody /> : <ThreadsBody query={query} />}
    </div>
  );
}

function InstagramBody() {
  const [week, setWeek] = useState(C.thisWeek());
  const now = C.thisWeek();
  const { posted, total } = C.weekProgress(week);
  const extras = C.extraItems(week);
  const groups = C.openGroups();
  const done = C.postedItems();

  return (
    <>
      <section class="block" aria-label="Week">
        <div class="block-head week-head">
          <h2 class="block-title">{week === now ? 'This week' : weekRange(week)}<span class="muted week-sub">{week === now ? weekRange(week) + ' · ' : ' · '}{posted} of {total} posted</span></h2>
          <span class="row gap-6">
            {week !== now && <button type="button" class="btn xs outline" onClick={() => setWeek(now)}>This week</button>}
            <button type="button" class="icon-btn soft sm" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><Icon name="chevronLeft" size={18} /></button>
            <button type="button" class="icon-btn soft sm" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevronRight" size={18} /></button>
          </span>
        </div>
        <div class="slot-grid">
          {C.slots().map((s) => <SlotTile key={s.id + week} week={week} slot={s} />)}
        </div>
        {extras.length > 0 && <p class="quiet-note">Also this week: {extras.map((i) => C.firstLine(i.title) || 'Untitled').join(', ')}</p>}
      </section>

      <section class="block" aria-label="In progress">
        <div class="block-head"><h2 class="block-title">In progress</h2></div>
        {groups.length ? groups.map((g) => (
          <div key={g.key}>
            <div class={'group-label' + (g.key === 'late' ? ' late' : '')}>{g.label}<span class="count">{g.items.length}</span></div>
            <div class="post-list">{g.items.map((i) => <PostCard key={i.id} it={i} />)}</div>
          </div>
        )) : (
          <Empty icon="image" title="Nothing in progress" action={<button type="button" class="btn primary sm" onClick={newPost}><Icon name="plus" size={16} />New post</button>}>
            Tap an empty slot above, or start from an idea.
          </Empty>
        )}
      </section>

      <PostedSection items={done} />
    </>
  );
}

export function PostCard({ it }) {
  const slot = C.slotById(it.slot);
  const late = C.isLate(it);
  const when = it.date ? fmtShort(it.date) : 'Not scheduled';
  return (
    <div class={'post-card ' + (slot ? 't-' + slot.tint : 't-plain')}>
      <a class="pc-main" href={'#/post/' + it.id}>
        <span class="pc-top"><span class="pc-title">{C.firstLine(it.title) || 'Untitled post'}</span><PostStagePill stage={it.stage} /></span>
        <span class={'pc-sub' + (late ? ' bad' : '')}>{[slot && slot.name, late ? 'Late, was ' + when : when].filter(Boolean).join(' · ')}</span>
      </a>
      <span class="pc-foot"><SegBar done={C.stageIndex(it.stage)} total={C.STAGES.length - 1} /><NextButton it={it} /></span>
    </div>
  );
}

function PostedSection({ items }) {
  const [open, setOpen] = useState({});
  const months = [];
  for (const p of items) {
    const k = (p.postedAt ? isoOf(Date.parse(p.postedAt)) : p.date || '').slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === k) last.items.push(p); else months.push({ key: k, items: [p] });
  }
  return (
    <section class="block" aria-label="Posted">
      <div class="block-head"><h2 class="block-title">Posted</h2>{items.length > 0 && <span class="muted overview-note">{items.length}</span>}</div>
      {months.length ? months.map((m, i) => {
        const isOpen = open[m.key] ?? i === 0;
        const [y, mo] = m.key.split('-').map(Number);
        return (
          <div key={m.key}>
            <button type="button" class="group-label month-toggle" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [m.key]: !isOpen })}>
              {mo ? MONTHS[mo - 1] + ' ' + y : 'Undated'}<span class="count">{m.items.length}</span><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
            {isOpen && m.items.map((it) => {
              const slot = C.slotById(it.slot);
              return (
                <a key={it.id} class="prow posted-row" href={'#/post/' + it.id}>
                  <span class={'cat-dot ' + (slot ? 't-' + slot.tint : 't-plain')} aria-hidden="true" />
                  <span class="prow-main"><span class="prow-title">{C.firstLine(it.title) || 'Untitled post'}</span><span class="prow-sub">{slot ? slot.name : 'No slot'}</span></span>
                  <span class="muted tnum">{it.postedAt ? fmtShort(isoOf(Date.parse(it.postedAt))) : it.date ? fmtShort(it.date) : ''}</span>
                </a>
              );
            })}
          </div>
        );
      }) : <div class="quiet-note">Posts land here when you mark them posted.</div>}
    </section>
  );
}
