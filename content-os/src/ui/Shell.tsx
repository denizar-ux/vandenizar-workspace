import React from 'react'
import { CalendarDays, AtSign, Lightbulb, Settings as Gear, Check, Loader, AlertCircle, CloudOff } from 'lucide-react'
import { go, useRoute } from '../lib/router'
import { P, retrySave } from '../lib/store'
import { cx } from './kit'

export const TABS = [
  { id: 'week', label: 'Minggu ini', icon: CalendarDays },
  { id: 'threads', label: 'Threads', icon: AtSign },
  { id: 'ideas', label: 'Ide', icon: Lightbulb },
] as const

export function tabOf(parts: string[]): string {
  const p = parts[0] || 'week'
  return p === 'item' ? 'week' : p
}

export function Dock({ hidden }: { hidden?: boolean }) {
  const r = useRoute()
  const tab = tabOf(r.parts)
  if (hidden) return null
  return (
    <nav className="dock dock-3" aria-label="Navigasi utama">
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
    <aside className="side" aria-label="Navigasi utama">
      <div className="side-brand"><b>vandenizar</b><span>Content OS</span></div>
      {TABS.map((t) => {
        const I = t.icon
        return <button key={t.id} className={cx('side-item', tab === t.id && 'on')} onClick={() => go('/' + t.id)}><I size={19} />{t.label}</button>
      })}
      <div className="side-foot">
        <button className={cx('side-item', tab === 'settings' && 'on')} onClick={() => go('/settings')}><Gear size={19} />Settings</button>
        <div className="mt8" style={{ padding: '0 12px' }}><SaveBadge /></div>
      </div>
    </aside>
  )
}

export function SaveBadge() {
  const s = P
  if (s.status === 'error') return <span className="save err" role="alert"><AlertCircle size={15} />Gagal menyimpan <button className="linkbtn" style={{ color: 'inherit' }} onClick={retrySave}>Coba lagi</button></span>
  if (s.status === 'saving') return <span className="save" aria-live="polite"><Loader size={14} />Menyimpan…</span>
  if (s.status === 'offline') return <span className="save" aria-live="polite"><CloudOff size={15} />Offline, tersimpan di HP</span>
  return <span className="save" aria-live="polite"><Check size={15} />{s.mode === 'synced' ? 'Tersinkron' : 'Tersimpan di perangkat ini'}</span>
}

/** Page header: big light title like the Workspace, optional actions on the right. */
export function PageHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="pagehead">
      <div className="grow">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="muted mt8">{sub}</p>}
      </div>
      {right && <div className="row gap4" style={{ flex: 'none' }}>{right}</div>}
    </header>
  )
}
