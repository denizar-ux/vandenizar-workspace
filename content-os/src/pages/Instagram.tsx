import React from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { tz } from '../lib/store'
import { openGroups, postedItems, igItems, pillars, slotById, firstLine, slots, slotItem, extraItems, weekProgress, thisWeek } from '../lib/model'
import { fmtShort, dateKey, MONTHS, addDays } from '../lib/time'
import { go, useRoute, setQuery } from '../lib/router'
import { PageHead, PhoneTop } from '../ui/Shell'
import { Segmented, Chips, Empty, Button, IconBtn, cx } from '../ui/kit'
import { PostCard, SlotTile } from '../ui/parts'
import { weekName } from '../ui/SlotPicker'
import { openNew } from '../ui/QuickAdd'
import { Instagram as IgIcon } from '../ui/IgIcon'
import type { Item } from '../lib/types'

export default function Instagram() {
  const r = useRoute()
  const z = tz()
  const tab = r.q.get('tab') === 'posted' ? 'posted' : 'open'
  const pf = r.q.get('pillar') || 'all'
  const all = igItems()
  const usedPillars = pillars().filter((p) => all.some((i) => i.pillar === p.id))
  const showFilter = usedPillars.length > 1 && all.length > 5
  const keep = (i: Item) => pf === 'all' || i.pillar === pf
  const groups = openGroups().map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length)
  const posted = postedItems().filter(keep)
  const openCount = all.filter((i) => i.stage !== 'done').length

  // posted, grouped by month
  const months: { key: string; items: Item[] }[] = []
  for (const p of posted) {
    const k = (p.postedAt ? dateKey(p.postedAt, z) : p.date || '').slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.key === k) last.items.push(p); else months.push({ key: k, items: [p] })
  }

  return (
    <main className="main wide">
      <PhoneTop />
      <PageHead eyebrow="From idea to posted" title="Instagram." />
      <div className="stack-lg list-wrap">
        <div className="stack">
          <Segmented className="seg-fit" label="Show" value={tab} onChange={(v) => setQuery('tab', v === 'open' ? null : v)} options={[{ value: 'open', label: 'In progress', count: openCount }, { value: 'posted', label: 'Posted', count: all.length - openCount }]} />
          {showFilter && <Chips label="Pillar" scroll value={pf} onChange={(v) => setQuery('pillar', v === 'all' ? null : v)} options={[{ value: 'all', label: 'All pillars' }, ...usedPillars.map((p) => ({ value: p.id, label: p.name }))]} />}
        </div>

        {tab === 'open' && <WeekSlots week={r.q.get('w') || thisWeek()} />}

        {tab === 'open' && (groups.length ? <div className="groups">{groups.map((g) => (
          <section key={g.key} className="stack">
            <h2 className={cx('group-title', g.key === 'late' && 'late')}>{g.label} <span className="muted">{g.items.length}</span></h2>
            <div className="cards">{g.items.map((i) => <PostCard key={i.id} it={i} />)}</div>
          </section>
        ))}</div> : (
          <Empty icon={<IgIcon size={24} />} title={pf === 'all' ? 'Nothing in progress' : 'Nothing in progress for this pillar'} body="Plan a post for one of your weekly slots, or start from an idea." action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openNew({ kind: 'ig' })}>New post</Button>} />
        ))}

        {tab === 'posted' && (months.length ? months.map((m) => {
          const [y, mo] = m.key.split('-').map(Number)
          return (
            <section key={m.key} className="stack">
              <h2 className="group-title">{MONTHS[mo - 1]} {y} <span className="muted">{m.items.length}</span></h2>
              <div className="list">
                {m.items.map((i) => (
                  <button key={i.id} className="li" onClick={() => go('/post/' + i.id)}>
                    <span className={cx('pick-dot', 'bg-' + (slotById(i.slot)?.tint || 'none'))} />
                    <span className="li-main"><span className="li-title">{firstLine(i.title) || 'Untitled'}</span><span className="li-sub">{slotById(i.slot)?.name || 'No slot'}</span></span>
                    <span className="li-meta">{i.postedAt ? fmtShort(dateKey(i.postedAt, z), z) : i.date ? fmtShort(i.date, z) : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        }) : <Empty icon={<IgIcon size={24} />} title="Nothing posted yet" body="Posts land here when you mark them posted." />)}
      </div>
    </main>
  )
}

/** The weekly rhythm: one tile per slot. Tap an empty one to plan it. */
function WeekSlots({ week }: { week: string }) {
  const now = thisWeek()
  const { posted, total } = weekProgress(week)
  const extras = extraItems(week)
  return (
    <section className="stack" aria-label={weekName(week)}>
      <div className="section-head">
        <h2 className="h2 grow">{weekName(week)} <span className="muted h2-sub">{posted} of {total} posted</span></h2>
        {week !== now && <Button size="sm" variant="ghost" onClick={() => setQuery('w', null)}>This week</Button>}
        <IconBtn label="Previous week" onClick={() => setQuery('w', addDays(week, -7))}><ChevronLeft size={20} /></IconBtn>
        <IconBtn label="Next week" onClick={() => setQuery('w', addDays(week, 7))}><ChevronRight size={20} /></IconBtn>
      </div>
      <div className="tiles">
        {slots().map((s) => <SlotTile key={s.id} slot={s} week={week} date={addDays(week, s.day)} it={slotItem(week, s.id)} />)}
      </div>
      {extras.length > 0 && <p className="small muted">Also this week: {extras.map((i) => firstLine(i.title) || 'Untitled').join(', ')}</p>}
    </section>
  )
}
