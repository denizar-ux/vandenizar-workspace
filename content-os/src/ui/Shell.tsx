import React from 'react'
import { House, AtSign, Link2, CalendarDays, Settings as Gear, Check, Loader, AlertCircle, CloudOff, Plus } from 'lucide-react'
import { go, useRoute } from '../lib/router'
import { P, retrySave } from '../lib/store'
import { Instagram } from './IgIcon'
import { openNew, type NewKind } from './QuickAdd'
import { cx, IconBtn } from './kit'

export const TABS = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'threads', label: 'Threads', icon: AtSign },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'resources', label: 'Resources', icon: Link2 },
] as const

export function tabOf(parts: string[]): string {
  const p = parts[0] || 'today'
  return p === 'post' ? 'instagram' : p
}

/** What the + button creates on each screen. */
function kindFor(tab: string): NewKind {
  return tab === 'threads' ? 'thread' : tab === 'resources' ? 'link' : 'ig'
}

export function Dock({ hidden }: { hidden?: boolean }) {
  const r = useRoute()
  const tab = tabOf(r.parts)
  if (hidden) return null
  return (
    <nav className="dock" aria-label="Main">
      <div className="dock-inner">
        {TABS.map((t) => {
          const I = t.icon
          return (
            <button key={t.id} className={cx('dock-item', tab === t.id && 'on')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go('/' + t.id)}>
              <span className="dock-ic"><I size={21} /></span><span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function Sidebar() {
  const r = useRoute()
  const tab = tabOf(r.parts)
  return (
    <aside className="side" aria-label="Main">
      <div className="side-brand"><b>vandenizar</b><span>/ content</span></div>
      <button className="btn btn-primary side-new" onClick={() => openNew({ kind: kindFor(tab) })}><Plus size={18} /><span>New</span></button>
      {TABS.map((t) => {
        const I = t.icon
        return <button key={t.id} className={cx('side-item', tab === t.id && 'on')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go('/' + t.id)}><I size={19} />{t.label}</button>
      })}
      <div className="side-foot">
        <button className={cx('side-item', tab === 'settings' && 'on')} onClick={() => go('/settings')}><Gear size={19} />Settings</button>
        <div className="mt8" style={{ padding: '0 12px' }}><SaveBadge /></div>
      </div>
    </aside>
  )
}

/** Phone header on the main screens: brand, settings, and the one + button. */
export function PhoneTop() {
  const r = useRoute()
  const tab = tabOf(r.parts)
  return (
    <div className="phonetop only-phone">
      <div className="brand-mini grow">vandenizar <span>/ content</span></div>
      <IconBtn label="Settings" onClick={() => go('/settings')}><Gear size={21} /></IconBtn>
      <button className="plus" aria-label="New" onClick={() => openNew({ kind: kindFor(tab) })}><Plus size={24} /></button>
    </div>
  )
}

export function SaveBadge() {
  const s = P
  if (s.status === 'error') return <span className="save err" role="alert"><AlertCircle size={15} />Couldn't save <button className="linkbtn" style={{ color: 'inherit' }} onClick={retrySave}>Retry</button></span>
  if (s.status === 'saving') return <span className="save" aria-live="polite"><Loader size={14} />Saving…</span>
  if (s.status === 'offline') return <span className="save" aria-live="polite"><CloudOff size={15} />Offline, saved on this device</span>
  return <span className="save" aria-live="polite"><Check size={15} />{s.mode === 'synced' ? 'Synced' : 'Saved on this device'}</span>
}

/** Page header: small eyebrow + big light title like the Workspace. */
export function PageHead({ eyebrow, title, right }: { eyebrow?: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <header className="pagehead">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
      </div>
      {right && <div className="row gap4" style={{ flex: 'none' }}>{right}</div>}
    </header>
  )
}
