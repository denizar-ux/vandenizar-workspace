import React, { useState } from 'react'
import { AtSign, Plus, Search } from 'lucide-react'
import { threadDrafts, threadPosted } from '../lib/model'
import { useRoute, setQuery } from '../lib/router'
import { PageHead, PhoneTop } from '../ui/Shell'
import { Segmented, Empty, Button } from '../ui/kit'
import { DraftCard } from '../ui/parts'
import { openNew } from '../ui/QuickAdd'

export default function Threads() {
  const r = useRoute()
  const tab = r.q.get('tab') === 'posted' ? 'posted' : 'drafts'
  const [q, setQ] = useState('')
  const drafts = threadDrafts(), posted = threadPosted()
  const base = tab === 'drafts' ? drafts : posted
  const list = q.trim() ? base.filter((t) => (t.text || '').toLowerCase().includes(q.trim().toLowerCase())) : base

  return (
    <main className="main">
      <PhoneTop />
      <PageHead eyebrow="Write, schedule, post" title="Threads." />
      <div className="stack">
        <Segmented className="seg-fit" label="Show" value={tab} onChange={(v) => setQuery('tab', v === 'drafts' ? null : v)} options={[{ value: 'drafts', label: 'Drafts', count: drafts.length }, { value: 'posted', label: 'Posted', count: posted.length }]} />
        {base.length > 8 && (
          <label className="search"><Search size={18} /><input className="input" placeholder={tab === 'drafts' ? 'Search drafts' : 'Search posted'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
        )}
        {tab === 'drafts' && !q.trim() ? (
          <>
            {list.some((t) => t.date) && <h2 className="group-title mt8">Scheduled</h2>}
            {list.filter((t) => t.date).map((t) => <DraftCard key={t.id} it={t} />)}
            {list.some((t) => t.date) && list.some((t) => !t.date) && <h2 className="group-title mt8">Not scheduled</h2>}
            {list.filter((t) => !t.date).map((t) => <DraftCard key={t.id} it={t} />)}
          </>
        ) : list.map((t) => <DraftCard key={t.id} it={t} />)}
        {!list.length && (q.trim()
          ? <Empty title="No matches" body={`Nothing with “${q.trim()}”.`} />
          : tab === 'drafts'
            ? <Empty icon={<AtSign size={24} />} title="No drafts" body="Write it down while it's fresh. Give it a day and time if you want it on Today, then copy it when you post." action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openNew({ kind: 'thread' })}>Write a draft</Button>} />
            : <Empty icon={<AtSign size={24} />} title="Nothing posted yet" body="Drafts you mark as posted show up here." />)}
      </div>
    </main>
  )
}
