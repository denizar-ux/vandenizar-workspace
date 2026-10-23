import React from 'react'
import { Home, CalendarDays, AtSign, FolderOpen, Plus, Search, Settings as Gear, Archive, Lightbulb, Check, Loader, AlertCircle, CloudOff } from 'lucide-react'
import { Instagram } from './icons'
import { go, useRoute } from '../lib/router'
import { P, retrySave } from '../lib/store'
import { createInstagram, createThread } from '../lib/model'
import { openSheet } from './bus'
import { cx, IconBtn } from './kit'

export const TABS = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'threads', label: 'Threads', icon: AtSign },
  { id: 'resources', label: 'Resources', icon: FolderOpen },
] as const

export function tabOf(parts: string[]): string {
  const p = parts[0] || 'overview'
  if (p === 'ideas' || p === 'settings' || p === 'archive') return 'overview'
  if (p === 'batches') return 'calendar'
  if (p === 'content') return 'instagram'
  return p
}

export function fabAction(path: string, q: URLSearchParams) {
  const p = path.split('/').filter(Boolean)[0] || 'overview'
  if (p === 'instagram') { const c = createInstagram(); go(`/instagram/${c.id}?tab=write`); return }
  if (p === 'threads') { const c = createThread(); go(`/threads/${c.id}`); return }
  if (p === 'resources') { openSheet({ type: 'resource' }); return }
  if (p === 'calendar') {
    if (q.get('mode') === 'production') openSheet({ type: 'task', defaults: {} })
    else openSheet({ type: 'schedulePost', date: q.get('d') || undefined })
    return
  }
  openSheet({ type: 'capture' })
}

const FAB_LABEL: Record<string, string> = { overview: 'Tangkap ide', calendar: 'Tambah ke kalender', instagram: 'Draft Instagram baru', threads: 'Tulis thread baru', resources: 'Tambah bahan' }

export function Dock({ hidden }: { hidden?: boolean }) {
  const r = useRoute()
  const tab = tabOf(r.parts)
  if (hidden) return null
  return (
    <>
      <button className="fab" aria-label={FAB_LABEL[tab] || 'Tambah'} title={FAB_LABEL[tab]} onClick={() => fabAction(r.path, r.q)}><Plus size={26} /></button>
      <nav className="dock" aria-label="Navigasi utama">
        <div className="dock-inner">
          {TABS.map((t) => {
            const I = t.icon
            return (
              <button key={t.id} className={cx('dock-item', tab === t.id && 'on')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go('/' + t.id)}>
                <I size={21} strokeWidth={1.8} /><span>{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}

export function Sidebar() {
  const r = useRoute()
  const tab = tabOf(r.parts)
  return (
    <aside className="side" aria-label="Navigasi utama">
      <div className="side-brand">vandenizar <span>/ content OS</span></div>
      {TABS.map((t) => {
        const I = t.icon
        return (
          <button key={t.id} className={cx('side-item', tab === t.id && r.parts[0] !== 'settings' && r.parts[0] !== 'archive' && r.parts[0] !== 'ideas' && 'on')} onClick={() => go('/' + t.id)}>
            <I size={19} strokeWidth={1.8} />{t.label}
          </button>
        )
      })}
      <div className="side-sep" />
      <button className={cx('side-item', r.parts[0] === 'ideas' && 'on')} onClick={() => go('/ideas')}><Lightbulb size={19} strokeWidth={1.8} />Inbox ide</button>
      <button className="side-item" onClick={() => openSheet({ type: 'search' })}><Search size={19} strokeWidth={1.8} />Cari</button>
      <button className="btn btn-primary side-cta" onClick={() => fabAction(r.path, r.q)}><Plus size={18} />{FAB_LABEL[tab] || 'Tambah'}</button>
      <div className="side-foot">
        <button className={cx('side-item', r.parts[0] === 'archive' && 'on')} onClick={() => go('/archive')}><Archive size={19} strokeWidth={1.8} />Arsip</button>
        <button className={cx('side-item', r.parts[0] === 'settings' && 'on')} onClick={() => go('/settings')}><Gear size={19} strokeWidth={1.8} />Settings</button>
        <div className="mt8" style={{ padding: '0 12px' }}><SaveBadge /></div>
      </div>
    </aside>
  )
}

export function SaveBadge() {
  const s = P
  if (s.status === 'error') return (
    <span className="save err" role="alert"><AlertCircle size={15} />Gagal menyimpan <button className="linkbtn" style={{ color: 'inherit' }} onClick={retrySave}>Coba lagi</button></span>
  )
  if (s.status === 'saving') return <span className="save" aria-live="polite"><Loader size={14} />Menyimpan…</span>
  if (s.status === 'offline') return <span className="save" aria-live="polite"><CloudOff size={15} />Offline · tersimpan di perangkat ini</span>
  const where = s.mode === 'synced' ? 'Tersinkron' : s.mode === 'local' ? 'Tersimpan di perangkat ini' : 'Belum tersimpan'
  return <span className="save" aria-live="polite"><Check size={15} />{where}</span>
}

export function PageTop({ right }: { right?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div className="brand-mini grow">vandenizar <span>/ content OS</span></div>
      {right}
      <IconBtn label="Cari" onClick={() => openSheet({ type: 'search' })}><Search size={21} /></IconBtn>
      <IconBtn label="Settings" onClick={() => go('/settings')}><Gear size={21} /></IconBtn>
    </div>
  )
}
